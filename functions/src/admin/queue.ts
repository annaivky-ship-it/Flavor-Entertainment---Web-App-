/**
 * Admin callables for the manual review queue, ID review, and DNS list.
 *
 * All callables enforce App Check + admin role.
 *
 * Public callables (region australia-southeast1):
 *   - adminGetIdImageReviewUrl({ queueId })   → 5-minute signed read URL
 *   - adminReviewId({ queueId, decision })    → mark approved/rejected
 *   - adminApproveBooking({ bookingId, notes })
 *   - adminDeclineBooking({ bookingId, addToDns, dnsReason, notes })
 *   - adminAddDnsEntry({ matchType, value, reason, severity, expiresAt? })
 *   - adminListDnsEntries({ activeOnly?, limit? })
 *   - adminExpireDnsEntry({ entryId })
 *   - adminActivatePerformer({ performerId })
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  REGION, getDb, requireAppCheck, requireAdmin, writeAudit, HASH_SECRET,
} from '../utils/shared';

const ID_UPLOAD_BUCKET = 'studio-4495412314-3b1ce-id-uploads';
const ID_REVIEW_URL_TTL_MS = 5 * 60 * 1000;

// --- adminGetIdImageReviewUrl ---

export const adminGetIdImageReviewUrl = onCall(
  { region: REGION },
  async (req) => {
    requireAppCheck(req as any);
    const auth = await requireAdmin(req as any);

    const { queueId } = req.data || {};
    if (!queueId) throw new HttpsError('invalid-argument', 'queueId is required.');

    const db = getDb();
    const queueDoc = await db.collection('idReviewQueue').doc(queueId).get();
    if (!queueDoc.exists) throw new HttpsError('not-found', 'Queue entry not found.');
    const data = queueDoc.data()!;
    if (data.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Queue entry already decided.');
    }

    const file = admin.storage().bucket(ID_UPLOAD_BUCKET).file(data.storagePath);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + ID_REVIEW_URL_TTL_MS,
    });

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'admin',
      action: 'ID_IMAGE_VIEWED',
      subjectType: 'performer',
      subjectId: data.performerId,
      meta: { queueId, storagePath: data.storagePath },
    });

    return { signedUrl, expiresInSeconds: Math.floor(ID_REVIEW_URL_TTL_MS / 1000) };
  }
);

// --- adminReviewId ---

export const adminReviewId = onCall(
  { region: REGION },
  async (req) => {
    requireAppCheck(req as any);
    const auth = await requireAdmin(req as any);

    const { queueId, decision } = req.data || {};
    if (!queueId) throw new HttpsError('invalid-argument', 'queueId is required.');
    if (!decision || typeof decision !== 'object') {
      throw new HttpsError('invalid-argument', 'decision object is required.');
    }
    const { nameMatches, photoMatches, documentType, age18Plus, action, notes } = decision;
    if (typeof nameMatches !== 'boolean' || typeof photoMatches !== 'boolean' || typeof age18Plus !== 'boolean') {
      throw new HttpsError('invalid-argument', 'decision flags must be booleans.');
    }
    if (action !== 'approve' && action !== 'reject') {
      throw new HttpsError('invalid-argument', 'action must be "approve" or "reject".');
    }

    const db = getDb();
    const queueRef = db.collection('idReviewQueue').doc(queueId);
    const doc = await queueRef.get();
    if (!doc.exists) throw new HttpsError('not-found', 'Queue entry not found.');
    if (doc.data()!.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Already decided.');
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    await queueRef.update({
      status,
      decidedBy: auth.uid,
      decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      decision: { nameMatches, photoMatches, documentType: documentType || null, age18Plus, notes: notes || null },
    });

    // The image is force-deleted by the onIdReviewDecision trigger.

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'admin',
      action: 'PERFORMER_ID_REVIEWED',
      subjectType: 'performer',
      subjectId: doc.data()!.performerId,
      meta: { queueId, action, nameMatches, photoMatches, age18Plus, documentType: documentType || null },
    });

    return { success: true };
  }
);

// --- adminApproveBooking ---

export const adminApproveBooking = onCall(
  { region: REGION, secrets: [HASH_SECRET] },
  async (req) => {
    requireAppCheck(req as any);
    const auth = await requireAdmin(req as any);

    const { bookingId, notes } = req.data || {};
    if (!bookingId) throw new HttpsError('invalid-argument', 'bookingId is required.');

    const db = getDb();
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) throw new HttpsError('not-found', 'Booking not found.');

    await bookingRef.update({
      status: 'CONFIRMED',
      verification_status: 'cleared',
      adminApprovedBy: auth.uid,
      adminApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
      adminNotes: notes || null,
    });

    const queueRef = db.collection('manualReviewQueue').doc(bookingId);
    if ((await queueRef.get()).exists) {
      await queueRef.update({
        status: 'approved',
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
        decidedBy: auth.uid,
        decidedNotes: notes || null,
      });
    }

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'admin',
      action: 'ADMIN_REVIEW_DECISION',
      subjectType: 'booking',
      subjectId: bookingId,
      bookingId,
      meta: { decision: 'approve', notes: notes || null },
    });

    return { success: true };
  }
);

// --- adminDeclineBooking ---

export const adminDeclineBooking = onCall(
  { region: REGION, secrets: [HASH_SECRET] },
  async (req) => {
    requireAppCheck(req as any);
    const auth = await requireAdmin(req as any);

    const { bookingId, addToDns, dnsReason, notes } = req.data || {};
    if (!bookingId) throw new HttpsError('invalid-argument', 'bookingId is required.');

    const db = getDb();
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) throw new HttpsError('not-found', 'Booking not found.');
    const booking = bookingDoc.data()!;

    await bookingRef.update({
      status: 'DENIED',
      verification_status: 'denied',
      adminDeclinedBy: auth.uid,
      adminDeclinedAt: admin.firestore.FieldValue.serverTimestamp(),
      adminNotes: notes || null,
    });

    const queueRef = db.collection('manualReviewQueue').doc(bookingId);
    if ((await queueRef.get()).exists) {
      await queueRef.update({
        status: 'declined',
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
        decidedBy: auth.uid,
        decidedNotes: notes || null,
      });
    }

    if (addToDns === true) {
      const reason = dnsReason || 'Admin-declined booking';
      const phoneHash = booking.client_phone_hash || null;
      const emailHash = booking.client_email_hash || null;

      const adds: Promise<any>[] = [];
      if (phoneHash) {
        adds.push(db.collection('doNotServeList').add({
          matchType: 'phone_hash', value: phoneHash, reason, severity: 'silent',
          addedBy: auth.uid, addedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: null, active: true, bookingId,
        }));
      }
      if (emailHash) {
        adds.push(db.collection('doNotServeList').add({
          matchType: 'email_hash', value: emailHash, reason, severity: 'silent',
          addedBy: auth.uid, addedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: null, active: true, bookingId,
        }));
      }
      await Promise.all(adds);

      await writeAudit({
        actorUid: auth.uid,
        actorRole: 'admin',
        action: 'DNS_ADDED',
        subjectType: 'booking',
        subjectId: bookingId,
        bookingId,
        meta: { reason, phoneHash: !!phoneHash, emailHash: !!emailHash },
      });
    }

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'admin',
      action: 'ADMIN_REVIEW_DECISION',
      subjectType: 'booking',
      subjectId: bookingId,
      bookingId,
      meta: { decision: 'decline', addToDns: !!addToDns, notes: notes || null },
    });

    return { success: true };
  }
);

// --- adminAddDnsEntry ---

export const adminAddDnsEntry = onCall(
  { region: REGION, secrets: [HASH_SECRET] },
  async (req) => {
    requireAppCheck(req as any);
    const auth = await requireAdmin(req as any);

    const { matchType, value, reason, severity, expiresAt, notes } = req.data || {};
    if (!['phone_hash', 'email_hash', 'face_hash'].includes(matchType)) {
      throw new HttpsError('invalid-argument', 'Invalid matchType.');
    }
    if (!value || typeof value !== 'string') {
      throw new HttpsError('invalid-argument', 'value is required.');
    }
    if (!reason || typeof reason !== 'string') {
      throw new HttpsError('invalid-argument', 'reason is required.');
    }
    if (!['silent', 'explicit'].includes(severity)) {
      throw new HttpsError('invalid-argument', 'severity must be silent or explicit.');
    }

    const db = getDb();
    const ref = await db.collection('doNotServeList').add({
      matchType,
      value,
      reason,
      severity,
      notes: notes || null,
      addedBy: auth.uid,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAt ? admin.firestore.Timestamp.fromMillis(expiresAt) : null,
      active: true,
    });

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'admin',
      action: 'DNS_ADDED',
      subjectType: 'dns_entry',
      subjectId: ref.id,
      meta: { matchType, severity, reason },
    });

    return { success: true, entryId: ref.id };
  }
);

// --- adminListDnsEntries ---

export const adminListDnsEntries = onCall(
  { region: REGION },
  async (req) => {
    requireAppCheck(req as any);
    await requireAdmin(req as any);

    const { activeOnly = true, limit = 200 } = req.data || {};
    let q: any = getDb().collection('doNotServeList');
    if (activeOnly) q = q.where('active', '==', true);
    q = q.orderBy('addedAt', 'desc').limit(Math.min(limit, 500));
    const snap = await q.get();
    return {
      entries: snap.docs.map((d: any) => ({
        id: d.id,
        ...d.data(),
        addedAt: d.data().addedAt?.toMillis?.() || null,
        expiresAt: d.data().expiresAt?.toMillis?.() || null,
      })),
    };
  }
);

// --- adminExpireDnsEntry ---

export const adminExpireDnsEntry = onCall(
  { region: REGION },
  async (req) => {
    requireAppCheck(req as any);
    const auth = await requireAdmin(req as any);

    const { entryId } = req.data || {};
    if (!entryId) throw new HttpsError('invalid-argument', 'entryId is required.');

    const db = getDb();
    const ref = db.collection('doNotServeList').doc(entryId);
    const doc = await ref.get();
    if (!doc.exists) throw new HttpsError('not-found', 'Entry not found.');

    await ref.update({
      active: false,
      expiredAt: admin.firestore.FieldValue.serverTimestamp(),
      expiredBy: auth.uid,
    });

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'admin',
      action: 'DNS_EXPIRED',
      subjectType: 'dns_entry',
      subjectId: entryId,
    });

    return { success: true };
  }
);

// --- adminActivatePerformer ---

export const adminActivatePerformer = onCall(
  { region: REGION },
  async (req) => {
    requireAppCheck(req as any);
    const auth = await requireAdmin(req as any);

    const { performerId } = req.data || {};
    if (!performerId) throw new HttpsError('invalid-argument', 'performerId is required.');

    const db = getDb();
    const ref = db.collection('performers').doc(performerId);
    const doc = await ref.get();
    if (!doc.exists) throw new HttpsError('not-found', 'Performer not found.');
    const data = doc.data()!;
    if (data.status !== 'awaiting_activation') {
      throw new HttpsError('failed-precondition', `Performer is in ${data.status}, not awaiting_activation.`);
    }

    await ref.update({
      status: 'active',
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      activatedBy: auth.uid,
    });

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'admin',
      action: 'PERFORMER_ACTIVATED',
      subjectType: 'performer',
      subjectId: performerId,
    });

    return { success: true };
  }
);
