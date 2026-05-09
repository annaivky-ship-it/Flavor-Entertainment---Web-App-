/**
 * Verification triggers.
 *
 * Firestore + Pub/Sub triggers that:
 *   1. onIdReviewDecision: when admin marks an idReviewQueue entry approved/rejected,
 *      force-delete the GCS object so the ID image never lingers.
 *   2. forceDeleteStaleIdUploads: scheduled every 5 min, deletes any pending-review/*
 *      object older than 1 hour with no decision (belt-and-braces alongside the
 *      bucket lifecycle rule).
 *   3. onVerificationRecordCreated: when a new pass record lands for a customer,
 *      recompute the booking's verification_status. If all required signals are
 *      cleared, auto-approve to status='CONFIRMED'.
 *   4. onBookingCompleted: when a booking transitions to 'completed', increment
 *      the customer's successfulBookings counter and promote trust tier when
 *      thresholds are crossed.
 */

import * as admin from 'firebase-admin';
import { onDocumentWritten, onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { REGION, writeAudit } from '../utils/shared';

const ID_UPLOAD_BUCKET = 'studio-4495412314-3b1ce-id-uploads';

const getDb = () => getFirestore('default');

// --- 1. Force-delete ID image after admin decision ---

export const onIdReviewDecision = onDocumentWritten(
  { region: REGION, document: 'idReviewQueue/{queueId}' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;

    const beforeStatus = before?.status;
    const afterStatus = after.status;
    if (beforeStatus === afterStatus) return;
    if (afterStatus !== 'approved' && afterStatus !== 'rejected') return;

    if (after.storagePath) {
      try {
        await admin.storage().bucket(ID_UPLOAD_BUCKET).file(after.storagePath).delete();
        await writeAudit({
          actorUid: 'system',
          actorRole: 'system',
          action: 'ID_IMAGE_DELETED',
          subjectType: 'performer',
          subjectId: after.performerId,
          meta: { storagePath: after.storagePath, queueId: event.params.queueId },
        });
      } catch (err) {
        console.error('Failed to delete ID upload:', err);
      }
    }

    // Advance the performer's onboarding state on approval.
    if (afterStatus === 'approved' && after.performerId) {
      await getDb().collection('performers').doc(after.performerId).set(
        {
          status: 'awaiting_liveness',
          onboarding: {
            idDecidedAt: admin.firestore.FieldValue.serverTimestamp(),
            idDecidedBy: after.decidedBy || null,
            idDecision: after.decision || null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else if (afterStatus === 'rejected' && after.performerId) {
      await getDb().collection('performers').doc(after.performerId).set(
        {
          status: 'rejected',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await writeAudit({
        actorUid: 'system',
        actorRole: 'system',
        action: 'PERFORMER_REJECTED',
        subjectType: 'performer',
        subjectId: after.performerId,
        meta: { queueId: event.params.queueId },
      });
    }
  }
);

// --- 2. Scheduled stale-ID cleanup ---

export const forceDeleteStaleIdUploads = onSchedule(
  { region: REGION, schedule: 'every 5 minutes', timeZone: 'Australia/Perth' },
  async () => {
    const oneHourAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
    const staleQ = await getDb().collection('idReviewQueue')
      .where('status', '==', 'pending')
      .where('uploadedAt', '<', oneHourAgo)
      .limit(50)
      .get();

    if (staleQ.empty) return;

    for (const doc of staleQ.docs) {
      const data = doc.data();
      if (data.storagePath) {
        try {
          await admin.storage().bucket(ID_UPLOAD_BUCKET).file(data.storagePath).delete();
        } catch (err) {
          console.warn('Failed to delete stale ID:', err);
        }
      }
      await doc.ref.update({
        status: 'expired',
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
        decidedBy: 'system',
      });
      await writeAudit({
        actorUid: 'system',
        actorRole: 'system',
        action: 'ID_IMAGE_DELETED',
        subjectType: 'performer',
        subjectId: data.performerId,
        meta: { storagePath: data.storagePath, reason: 'stale_no_decision' },
      });
    }
  }
);

// --- 3. Recompute booking verification_status when signals land ---

export const onVerificationRecordCreated = onDocumentCreated(
  { region: REGION, document: 'verificationRecords/{recordId}' },
  async (event) => {
    const record = event.data?.data();
    if (!record) return;
    if (record.subjectType !== 'customer') return;
    if (!record.bookingId) return;

    const db = getDb();
    const bookingRef = db.collection('bookings').doc(record.bookingId);
    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) return;
    const booking = bookingDoc.data()!;

    // What signals does this booking need?
    const tier = booking.trustTier || 'unverified';
    const totalCents = Math.round((booking.amount_total_due || booking.amount_deposit || 0) * 100);
    const needsSmsOtp = tier !== 'trusted';
    const needsLiveness = tier === 'unverified' && totalCents >= 50_000;
    const needsPayId = true;

    const haveSmsOtp = !!booking.smsOtpVerified;
    const haveLiveness = !!booking.livenessVerified;
    const havePayId = !!booking.payIdMatched;

    const allCleared =
      (!needsSmsOtp || haveSmsOtp) &&
      (!needsLiveness || haveLiveness) &&
      (!needsPayId || havePayId);

    if (allCleared && booking.verification_status !== 'cleared') {
      await bookingRef.update({
        verification_status: 'cleared',
        status: booking.status === 'PENDING' ? 'CONFIRMED' : booking.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await writeAudit({
        actorUid: 'system',
        actorRole: 'system',
        action: 'CUSTOMER_VERIFIED',
        subjectType: 'booking',
        subjectId: record.bookingId,
        bookingId: record.bookingId,
        meta: { tier, signalsRequired: { needsSmsOtp, needsLiveness, needsPayId } },
      });
    }
  }
);

// --- 4. Trust tier auto-promotion ---

const TRUST_PROMOTE_THRESHOLDS = {
  verified: 1,
  trusted: 5,
};

export const onBookingCompleted = onDocumentWritten(
  { region: REGION, document: 'bookings/{bookingId}' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;

    const beforeStatus = (before?.status || '').toLowerCase();
    const afterStatus = (after.status || '').toLowerCase();

    if (beforeStatus === afterStatus) return;
    if (afterStatus !== 'completed' && afterStatus !== 'confirmed') return;
    // Only count once: only promote on the transition into completed/confirmed.
    if (beforeStatus === 'completed' || beforeStatus === 'confirmed') return;

    const customerId: string | undefined = after.customerId;
    if (!customerId) return;

    const db = getDb();
    const customerRef = db.collection('customers').doc(customerId);

    await db.runTransaction(async (t) => {
      const doc = await t.get(customerRef);
      const data = doc.exists ? doc.data()! : { trustTier: 'unverified', successfulBookings: 0, flagCount: 0 };
      const successfulBookings = (data.successfulBookings || 0) + 1;
      const flagCount = data.flagCount || 0;
      let newTier = data.trustTier || 'unverified';

      if (flagCount === 0) {
        if (successfulBookings >= TRUST_PROMOTE_THRESHOLDS.trusted) newTier = 'trusted';
        else if (successfulBookings >= TRUST_PROMOTE_THRESHOLDS.verified) newTier = 'verified';
      }

      const promoted = newTier !== (data.trustTier || 'unverified');

      t.set(customerRef, {
        successfulBookings,
        trustTier: newTier,
        lastBookingAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      if (promoted) {
        // schedule audit outside of transaction
        setTimeout(() => {
          writeAudit({
            actorUid: 'system',
            actorRole: 'system',
            action: 'TRUST_TIER_PROMOTED',
            subjectType: 'customer',
            subjectId: customerId,
            meta: { from: data.trustTier || 'unverified', to: newTier, successfulBookings },
          }).catch(() => { /* swallow */ });
        }, 0);
      }
    });
  }
);

// --- 5. Auto-promote performer to active after admin sets status='active' ---
// Manual: admin clicks "activate" in the admin UI which writes status='active'.
// This trigger just records the audit log entry.

export const onPerformerActivated = onDocumentWritten(
  { region: REGION, document: 'performers/{performerId}' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;
    if (before?.status === after.status) return;
    if (after.status !== 'active') return;

    await writeAudit({
      actorUid: 'system',
      actorRole: 'system',
      action: 'PERFORMER_ACTIVATED',
      subjectType: 'performer',
      subjectId: event.params.performerId,
      meta: { activatedAt: new Date().toISOString() },
    });
  }
);
