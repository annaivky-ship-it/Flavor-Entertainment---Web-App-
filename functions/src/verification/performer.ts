/**
 * Performer-side verification callables.
 *
 * Onboarding flow (sub-routes match this state machine):
 *
 *   apply → awaiting_id → awaiting_id_review → awaiting_liveness →
 *   awaiting_banking → awaiting_portfolio →
 *   awaiting_safety → awaiting_contract → awaiting_activation → active
 *
 * Banking is self-attested: the performer enters BSB + account number + name,
 * we store them directly in `performers/{uid}.banking` (admin-read only). No
 * automated penny-drop verification — admin confirms during ID review or
 * payout time. This trades the cryptographic "performer owns this account"
 * proof for operational simplicity. See docs/basiq-integration-plan.md for
 * the upgrade path.
 *
 * Public callables (region australia-southeast1):
 *   - performerApply({ stageName, contactPhoneE164, contactEmail, ... })
 *   - performerRequestIdUploadUrl({ })             — returns a signed PUT URL
 *   - performerNotifyIdUploaded({ storagePath })   — enqueues admin review
 *   - performerSubmitLiveness({ embedding, livenessScore, ageEstimate })
 *   - performerAddBankAccount({ bsb, accountNumber, accountName })
 *   - performerSubmitPortfolio({ photos, videoIntroUrl, services })
 *   - performerAcknowledgeSafetyBriefing({ acknowledged })
 *   - performerSignContract({ signature, signedAt })
 *   - performerFlagCustomer({ bookingId, reason, notes })
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  REGION, getDb, normalizePhoneE164, normalizeEmail, hashPhone, hashEmail,
  randomCode, requireAppCheck, requireAuth, writeAudit, HASH_SECRET,
} from '../utils/shared';

const ID_UPLOAD_BUCKET = 'studio-4495412314-3b1ce-id-uploads';
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;     // 15 min for performer uploads
const ID_REVIEW_URL_TTL_MS = 5 * 60 * 1000;   // 5 min for admin viewing

const FLAG_REASONS = new Set([
  'no_show',
  'breached_no_touch',
  'intoxicated_aggressive',
  'refused_payment',
  'safety_concern',
  'other',
]);

// --- Helpers ---

async function getPerformerDoc(uid: string) {
  const db = getDb();
  const q = await db.collection('performers').where('authUid', '==', uid).limit(1).get();
  if (!q.empty) return q.docs[0];
  return db.collection('performers').doc(uid).get();
}

async function setPerformerOnboardingStatus(performerId: string, status: string, extras: Record<string, any> = {}) {
  await getDb().collection('performers').doc(performerId).set(
    {
      status,
      onboarding: {
        ...extras,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// --- performerApply ---

export const performerApply = onCall(
  { region: REGION, secrets: [HASH_SECRET] },
  async (req) => {
    requireAppCheck(req as any);
    const auth = requireAuth(req as any);

    const { stageName, contactPhoneE164, contactEmail, legalName } = req.data || {};
    if (!stageName || !contactPhoneE164 || !contactEmail) {
      throw new HttpsError('invalid-argument', 'stageName, contactPhoneE164, contactEmail are required.');
    }

    const phoneE164 = normalizePhoneE164(contactPhoneE164);
    const emailNorm = normalizeEmail(contactEmail);

    const db = getDb();
    const ref = db.collection('performers').doc(auth.uid);
    await ref.set(
      {
        authUid: auth.uid,
        stageName,
        legalName: legalName || stageName,
        contactPhoneE164: phoneE164,
        contactEmail: emailNorm,
        contactPhoneHash: hashPhone(phoneE164),
        contactEmailHash: hashEmail(emailNorm),
        status: 'awaiting_id',
        onboarding: {
          appliedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'performer',
      action: 'PERFORMER_APPLIED',
      subjectType: 'performer',
      subjectId: auth.uid,
      meta: { stageName },
    });

    return { success: true, performerId: auth.uid, status: 'awaiting_id' };
  }
);

// --- performerRequestIdUploadUrl ---
// Returns a 15-minute signed PUT URL the client uses to upload directly to GCS.
// The object lands at pending-review/{performerId}/{filename} and is
// auto-deleted by Storage lifecycle if not actioned within 1 day, OR force-
// deleted by triggers/verification.ts:onIdReviewDecision once an admin reviews it.

export const performerRequestIdUploadUrl = onCall(
  { region: REGION },
  async (req) => {
    requireAppCheck(req as any);
    const auth = requireAuth(req as any);

    const { contentType } = req.data || {};
    if (!['image/jpeg', 'image/png'].includes(contentType)) {
      throw new HttpsError('invalid-argument', 'contentType must be image/jpeg or image/png.');
    }

    const filename = `${Date.now()}-${randomCode(6).toLowerCase()}.${contentType === 'image/png' ? 'png' : 'jpg'}`;
    const storagePath = `pending-review/${auth.uid}/${filename}`;

    const file = admin.storage().bucket(ID_UPLOAD_BUCKET).file(storagePath);
    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + SIGNED_URL_TTL_MS,
      contentType,
    });

    return { uploadUrl, storagePath, expiresInSeconds: Math.floor(SIGNED_URL_TTL_MS / 1000) };
  }
);

// --- performerNotifyIdUploaded ---

export const performerNotifyIdUploaded = onCall(
  { region: REGION },
  async (req) => {
    requireAppCheck(req as any);
    const auth = requireAuth(req as any);

    const { storagePath } = req.data || {};
    if (typeof storagePath !== 'string' || !storagePath.startsWith(`pending-review/${auth.uid}/`)) {
      throw new HttpsError('invalid-argument', 'Invalid storagePath.');
    }

    const db = getDb();
    const queueRef = db.collection('idReviewQueue').doc();
    await queueRef.set({
      performerId: auth.uid,
      storagePath,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      decidedAt: null,
      decidedBy: null,
      decision: null,
    });

    await setPerformerOnboardingStatus(auth.uid, 'awaiting_id_review', {
      idUploadedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'performer',
      action: 'PERFORMER_ID_UPLOADED',
      subjectType: 'performer',
      subjectId: auth.uid,
      meta: { queueId: queueRef.id },
    });

    return { success: true, queueId: queueRef.id };
  }
);

// --- performerSubmitLiveness ---

export const performerSubmitLiveness = onCall(
  { region: REGION, secrets: [HASH_SECRET] },
  async (req) => {
    requireAppCheck(req as any);
    const auth = requireAuth(req as any);

    const { embedding, livenessScore, ageEstimate } = req.data || {};
    if (!Array.isArray(embedding) || embedding.length !== 128) {
      throw new HttpsError('invalid-argument', '128-dim embedding required.');
    }
    if (typeof livenessScore !== 'number' || livenessScore < 0 || livenessScore > 1) {
      throw new HttpsError('invalid-argument', 'Invalid livenessScore.');
    }
    if (typeof ageEstimate !== 'number' || ageEstimate < 18) {
      throw new HttpsError('failed-precondition', 'Age verification failed (must be 18+).');
    }
    if (livenessScore < 0.6) {
      throw new HttpsError('failed-precondition', 'Liveness check failed.');
    }

    const db = getDb();

    await db.collection('faceEmbeddings').doc(auth.uid).set({
      subjectType: 'performer',
      subjectId: auth.uid,
      embedding,
      livenessScore,
      ageEstimate,
      capturedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('verificationRecords').add({
      subjectType: 'performer',
      subjectId: auth.uid,
      bookingId: null,
      signal: 'liveness',
      result: 'pass',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      meta: { livenessScore, ageEstimate },
    });

    await setPerformerOnboardingStatus(auth.uid, 'awaiting_banking', {
      livenessAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'performer',
      action: 'PERFORMER_LIVENESS_DONE',
      subjectType: 'performer',
      subjectId: auth.uid,
    });

    return { success: true };
  }
);

// --- performerAddBankAccount ---
// Self-attested. BSB+account+name go directly into the performer doc under
// `banking.{...}`. Firestore rules restrict reads of this subobject to the
// performer themselves and admin. No tokenisation, no penny drop. After
// submission the performer advances directly to 'awaiting_portfolio'.
//
// Trade-off accepted: we carry banking data, increasing breach impact in
// exchange for skipping the Monoova/PSP dependency. See
// docs/basiq-integration-plan.md for the upgrade path that adds
// "performer-owns-this-account" proof later.

export const performerAddBankAccount = onCall(
  { region: REGION },
  async (req) => {
    requireAppCheck(req as any);
    const auth = requireAuth(req as any);

    const { bsb, accountNumber, accountName } = req.data || {};
    if (!/^\d{3}-?\d{3}$/.test(bsb || '')) throw new HttpsError('invalid-argument', 'Invalid BSB.');
    if (!/^\d{6,9}$/.test(accountNumber || '')) throw new HttpsError('invalid-argument', 'Invalid account number.');
    if (!accountName) throw new HttpsError('invalid-argument', 'accountName is required.');

    const cleanBsb = (bsb as string).replace('-', '');

    await getDb().collection('performers').doc(auth.uid).set(
      {
        banking: {
          bsb: cleanBsb,
          accountNumber: accountNumber,
          accountName: accountName,
          attestedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        status: 'awaiting_portfolio',
        onboarding: {
          bankingAddedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'performer',
      action: 'PERFORMER_BANKING_ADDED',
      subjectType: 'performer',
      subjectId: auth.uid,
      meta: { selfAttested: true },
    });

    return { success: true };
  }
);

// --- performerSubmitPortfolio ---

export const performerSubmitPortfolio = onCall(
  { region: REGION },
  async (req) => {
    requireAppCheck(req as any);
    const auth = requireAuth(req as any);

    const { photos, videoIntroUrl, services } = req.data || {};
    if (!Array.isArray(photos) || photos.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one portfolio photo is required.');
    }
    if (!Array.isArray(services) || services.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one service must be selected.');
    }

    await getDb().collection('performers').doc(auth.uid).set(
      {
        portfolioPhotos: photos,
        videoIntroUrl: videoIntroUrl || null,
        servicesOffered: services,
        status: 'awaiting_safety',
        onboarding: {
          portfolioAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'performer',
      action: 'PERFORMER_PORTFOLIO_SUBMITTED',
      subjectType: 'performer',
      subjectId: auth.uid,
    });

    return { success: true };
  }
);

// --- performerAcknowledgeSafetyBriefing ---

export const performerAcknowledgeSafetyBriefing = onCall(
  { region: REGION },
  async (req) => {
    requireAppCheck(req as any);
    const auth = requireAuth(req as any);

    const { acknowledged } = req.data || {};
    if (acknowledged !== true) {
      throw new HttpsError('failed-precondition', 'Safety briefing must be acknowledged.');
    }

    await setPerformerOnboardingStatus(auth.uid, 'awaiting_contract', {
      safetyBriefingAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'performer',
      action: 'PERFORMER_SAFETY_ACK',
      subjectType: 'performer',
      subjectId: auth.uid,
    });

    return { success: true };
  }
);

// --- performerSignContract ---

export const performerSignContract = onCall(
  { region: REGION },
  async (req) => {
    requireAppCheck(req as any);
    const auth = requireAuth(req as any);

    const { signature } = req.data || {};
    if (!signature || typeof signature !== 'string' || signature.length < 2) {
      throw new HttpsError('invalid-argument', 'Signature is required.');
    }

    await getDb().collection('performers').doc(auth.uid).set(
      {
        contractSignature: signature,
        contractSignedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'awaiting_activation',
        onboarding: {
          contractSignedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'performer',
      action: 'PERFORMER_CONTRACT_SIGNED',
      subjectType: 'performer',
      subjectId: auth.uid,
    });

    return { success: true };
  }
);

// --- performerFlagCustomer ---

export const performerFlagCustomer = onCall(
  { region: REGION, secrets: [HASH_SECRET] },
  async (req) => {
    requireAppCheck(req as any);
    const auth = requireAuth(req as any);

    const { bookingId, reason, notes } = req.data || {};
    if (!bookingId) throw new HttpsError('invalid-argument', 'bookingId is required.');
    if (!FLAG_REASONS.has(reason)) throw new HttpsError('invalid-argument', 'Invalid reason.');

    const db = getDb();
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    if (!bookingDoc.exists) throw new HttpsError('not-found', 'Booking not found.');
    const booking = bookingDoc.data()!;

    // Performers can only flag bookings they were assigned to.
    if (booking.performer_id && String(booking.performer_id) !== auth.uid && booking.performerAuthUid !== auth.uid) {
      throw new HttpsError('permission-denied', 'You can only flag your own bookings.');
    }

    const phoneE164 = normalizePhoneE164(booking.client_phone || '');
    const emailNorm = normalizeEmail(booking.client_email || '');
    const phoneHash = hashPhone(phoneE164);
    const emailHash = hashEmail(emailNorm);

    // Add to DNS list with severity proportional to reason.
    const severeReasons = new Set(['breached_no_touch', 'intoxicated_aggressive', 'safety_concern']);
    const severity: 'silent' | 'explicit' = severeReasons.has(reason) ? 'silent' : 'silent';

    await db.collection('doNotServeList').add({
      matchType: 'phone_hash',
      value: phoneHash,
      reason,
      notes: notes || null,
      severity,
      addedBy: auth.uid,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: null,
      active: true,
      bookingId,
    });
    await db.collection('doNotServeList').add({
      matchType: 'email_hash',
      value: emailHash,
      reason,
      notes: notes || null,
      severity,
      addedBy: auth.uid,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: null,
      active: true,
      bookingId,
    });

    // Demote the customer's trust tier if a doc exists for them.
    if (booking.customerId) {
      await db.collection('customers').doc(booking.customerId).set(
        {
          trustTier: 'unverified',
          flagCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await writeAudit({
      actorUid: auth.uid,
      actorRole: 'performer',
      action: 'PERFORMER_FLAGGED_CUSTOMER',
      subjectType: 'booking',
      subjectId: bookingId,
      bookingId,
      meta: { reason, severity, notes: notes || null },
    });

    return { success: true };
  }
);
