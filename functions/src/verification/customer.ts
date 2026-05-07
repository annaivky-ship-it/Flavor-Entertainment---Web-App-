/**
 * Customer-side verification callables.
 *
 * Public surface (callable functions, region australia-southeast1):
 *   - sendSmsOtp({ bookingId, phoneE164 })
 *   - verifySmsOtp({ bookingId, code })
 *   - submitLivenessCheck({ bookingId, embedding, livenessScore, ageEstimate })
 *   - getCustomerVerificationStatus({ bookingId })
 *
 * Customer trust tiers:
 *   - 'unverified': never booked successfully — must clear OTP + (premium) liveness + PayID
 *   - 'verified':   1+ successful booking — must clear OTP + PayID
 *   - 'trusted':    5+ successful bookings within 12 months — only PayID match required
 *
 * Each successful signal writes a verificationRecord. The orchestrator updates
 * the booking's `verification_status` field reactively (see triggers/verification.ts).
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  REGION, getDb, normalizePhoneE164, hashPhone, hashEmail, normalizeEmail,
  hashFaceEmbedding, hmacSha256, randomDigits, rateLimit, requireAppCheck,
  writeAudit, isOnDoNotServeList, HASH_SECRET,
} from '../utils/shared';
import { sendTwilioSms, fetchCarrierType, TWILIO_SECRETS } from '../integrations/twilio';
import { renderTemplate } from '../messaging/templates';

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 10 * 60;
const OTP_SEND_MAX_PER_WINDOW = 3;
const OTP_SEND_WINDOW_SECONDS = 15 * 60;
const OTP_VERIFY_MAX_PER_WINDOW = 5;
const OTP_VERIFY_WINDOW_SECONDS = 15 * 60;

const PREMIUM_TIER_TOTAL_CENTS = 50_000; // bookings >= AUD$500 require liveness

// --- sendSmsOtp ---

export const sendSmsOtp = onCall(
  {
    region: REGION,
    secrets: [HASH_SECRET, ...TWILIO_SECRETS],
  },
  async (req) => {
    requireAppCheck(req as any);

    const { bookingId, phoneE164: rawPhone } = req.data || {};
    if (!bookingId || !rawPhone) {
      throw new HttpsError('invalid-argument', 'bookingId and phoneE164 are required.');
    }
    const phoneE164 = normalizePhoneE164(rawPhone);
    if (!/^\+\d{8,15}$/.test(phoneE164)) {
      throw new HttpsError('invalid-argument', 'Invalid phone number.');
    }

    const phoneHash = hashPhone(phoneE164);

    // DNS check — silent fail.
    const dns = await isOnDoNotServeList({ phoneHash });
    if (dns.matched) {
      // Audit silently and return a generic success response so the caller
      // can't distinguish a DNS hit from a real OTP send.
      await writeAudit({
        actorUid: 'system',
        actorRole: 'system',
        action: 'CUSTOMER_DENIED',
        subjectType: 'booking',
        subjectId: bookingId,
        bookingId,
        meta: { reason: 'dns_match', severity: dns.severity },
      });
      return { success: true, expiresInSeconds: OTP_TTL_SECONDS };
    }

    // Rate limit.
    const rl = await rateLimit({
      bucket: 'otp_send',
      key: phoneHash,
      max: OTP_SEND_MAX_PER_WINDOW,
      windowSeconds: OTP_SEND_WINDOW_SECONDS,
    });
    if (!rl.allowed) {
      await writeAudit({
        actorUid: 'system',
        actorRole: 'system',
        action: 'OTP_RATE_LIMITED',
        subjectType: 'booking',
        subjectId: bookingId,
        bookingId,
        meta: { phoneHash },
      });
      throw new HttpsError('resource-exhausted', 'Too many code requests. Try again in 15 minutes.');
    }

    // Issue code.
    const code = randomDigits(OTP_LENGTH);
    const codeHash = hmacSha256(`otp:${code}`);
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_SECONDS * 1000);

    await getDb().collection('otpAttempts').add({
      phoneHash,
      bookingId,
      codeHash,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      consumed: false,
      attempts: 0,
    });

    // Optional carrier signal (used by triggers/verification later).
    fetchCarrierType(phoneE164).then(async (carrier) => {
      await getDb().collection('riskSignals').add({
        subjectId: phoneHash,
        subjectType: 'phone',
        kind: 'twilio_carrier_type',
        value: carrier,
        bookingId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }).catch(() => { /* non-blocking */ });

    await sendTwilioSms(phoneE164, renderTemplate('OTP_CLIENT', { otpCode: code }));

    await writeAudit({
      actorUid: 'system',
      actorRole: 'system',
      action: 'OTP_SENT',
      subjectType: 'booking',
      subjectId: bookingId,
      bookingId,
      meta: { phoneHash },
    });

    return { success: true, expiresInSeconds: OTP_TTL_SECONDS };
  }
);

// --- verifySmsOtp ---

export const verifySmsOtp = onCall(
  { region: REGION, secrets: [HASH_SECRET] },
  async (req) => {
    requireAppCheck(req as any);

    const { bookingId, code } = req.data || {};
    if (!bookingId || !code) {
      throw new HttpsError('invalid-argument', 'bookingId and code are required.');
    }
    if (!/^\d{6}$/.test(code)) {
      throw new HttpsError('invalid-argument', 'Code must be 6 digits.');
    }

    const db = getDb();
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    if (!bookingDoc.exists) {
      throw new HttpsError('not-found', 'Booking not found.');
    }
    const booking = bookingDoc.data()!;

    const phoneE164 = normalizePhoneE164(booking.client_phone || '');
    const phoneHash = hashPhone(phoneE164);

    // Rate limit verify attempts to prevent brute force.
    const rl = await rateLimit({
      bucket: 'otp_verify',
      key: phoneHash,
      max: OTP_VERIFY_MAX_PER_WINDOW,
      windowSeconds: OTP_VERIFY_WINDOW_SECONDS,
    });
    if (!rl.allowed) {
      throw new HttpsError('resource-exhausted', 'Too many verification attempts.');
    }

    const codeHash = hmacSha256(`otp:${code}`);

    // Find a non-consumed, non-expired attempt for this phone+booking with matching codeHash.
    const otpQ = await db.collection('otpAttempts')
      .where('phoneHash', '==', phoneHash)
      .where('bookingId', '==', bookingId)
      .where('consumed', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    const now = admin.firestore.Timestamp.now();
    const match = otpQ.docs.find(d => {
      const data = d.data();
      if (data.codeHash !== codeHash) return false;
      if (data.expiresAt && data.expiresAt.toMillis() < now.toMillis()) return false;
      return true;
    });

    if (!match) {
      await writeAudit({
        actorUid: 'system',
        actorRole: 'customer',
        action: 'OTP_FAILED',
        subjectType: 'booking',
        subjectId: bookingId,
        bookingId,
      });
      throw new HttpsError('invalid-argument', 'Invalid or expired code.');
    }

    await match.ref.update({
      consumed: true,
      consumedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('verificationRecords').add({
      subjectType: 'customer',
      subjectId: booking.customerId || null,
      bookingId,
      signal: 'sms_otp',
      result: 'pass',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: null,
      subjectPhoneHash: phoneHash,
      meta: {},
    });

    await db.collection('bookings').doc(bookingId).update({
      smsOtpVerified: true,
      smsOtpVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await writeAudit({
      actorUid: 'system',
      actorRole: 'customer',
      action: 'OTP_VERIFIED',
      subjectType: 'booking',
      subjectId: bookingId,
      bookingId,
    });

    return { success: true };
  }
);

// --- submitLivenessCheck ---

export const submitLivenessCheck = onCall(
  { region: REGION, secrets: [HASH_SECRET] },
  async (req) => {
    requireAppCheck(req as any);

    const { bookingId, embedding, livenessScore, ageEstimate } = req.data || {};

    if (!bookingId || !Array.isArray(embedding) || embedding.length !== 128) {
      throw new HttpsError('invalid-argument', 'bookingId and 128-dim embedding required.');
    }
    if (typeof livenessScore !== 'number' || livenessScore < 0 || livenessScore > 1) {
      throw new HttpsError('invalid-argument', 'Invalid livenessScore.');
    }
    if (typeof ageEstimate !== 'number' || ageEstimate < 0 || ageEstimate > 120) {
      throw new HttpsError('invalid-argument', 'Invalid ageEstimate.');
    }

    const db = getDb();
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    if (!bookingDoc.exists) {
      throw new HttpsError('not-found', 'Booking not found.');
    }
    const booking = bookingDoc.data()!;

    const LIVENESS_THRESHOLD = 0.6;
    const MIN_AGE = 18;
    const passed = livenessScore >= LIVENESS_THRESHOLD && ageEstimate >= MIN_AGE;

    // DNS face-hash check (e.g. previously flagged liveness session).
    const faceHash = hashFaceEmbedding(embedding);
    const dns = await isOnDoNotServeList({ faceHash });

    let result: 'pass' | 'fail' | 'review' = passed ? 'pass' : 'fail';
    if (dns.matched) {
      result = 'fail';
    }

    await db.collection('verificationRecords').add({
      subjectType: 'customer',
      subjectId: booking.customerId || null,
      bookingId,
      signal: 'liveness',
      result,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: null,
      meta: {
        livenessScore,
        ageEstimate,
        threshold: LIVENESS_THRESHOLD,
        dnsMatched: dns.matched,
      },
    });

    if (result === 'pass') {
      // Persist the embedding (NOT the image) for later cross-checks
      // (e.g. flag reuse across multiple booking emails).
      await db.collection('faceEmbeddings').add({
        subjectType: 'customer',
        subjectId: booking.customerId || null,
        bookingId,
        embedding,
        faceHash,
        livenessScore,
        ageEstimate,
        capturedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('bookings').doc(bookingId).update({
        livenessVerified: true,
        livenessVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await writeAudit({
        actorUid: 'system',
        actorRole: 'customer',
        action: 'LIVENESS_SUBMITTED',
        subjectType: 'booking',
        subjectId: bookingId,
        bookingId,
        meta: { livenessScore, ageEstimate, faceHash },
      });

      return { success: true };
    }

    await writeAudit({
      actorUid: 'system',
      actorRole: 'customer',
      action: 'LIVENESS_REJECTED',
      subjectType: 'booking',
      subjectId: bookingId,
      bookingId,
      meta: {
        livenessScore,
        ageEstimate,
        reason: ageEstimate < MIN_AGE ? 'under_age' : (livenessScore < LIVENESS_THRESHOLD ? 'low_liveness' : 'dns_face'),
      },
    });

    throw new HttpsError(
      'failed-precondition',
      ageEstimate < MIN_AGE ? 'Age verification failed.' : 'Liveness check failed.'
    );
  }
);

// --- getCustomerVerificationStatus ---

export const getCustomerVerificationStatus = onCall(
  { region: REGION, secrets: [HASH_SECRET] },
  async (req) => {
    requireAppCheck(req as any);

    const { bookingId } = req.data || {};
    if (!bookingId) {
      throw new HttpsError('invalid-argument', 'bookingId is required.');
    }

    const db = getDb();
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    if (!bookingDoc.exists) {
      throw new HttpsError('not-found', 'Booking not found.');
    }
    const booking = bookingDoc.data()!;

    const phoneE164 = normalizePhoneE164(booking.client_phone || '');
    const emailNorm = normalizeEmail(booking.client_email || '');
    const phoneHash = hashPhone(phoneE164);
    const emailHash = hashEmail(emailNorm);

    // Lookup or imply trust tier.
    const tier = await resolveTrustTier(phoneHash, emailHash);

    const totalCents = Math.round((booking.amount_total_due || booking.amount_deposit || 0) * 100);
    const requiresLiveness = tier === 'unverified' && totalCents >= PREMIUM_TIER_TOTAL_CENTS;

    return {
      trustTier: tier,
      requiredSignals: {
        smsOtp: tier !== 'trusted',
        liveness: requiresLiveness,
        payIdMatch: true,
      },
      signalsCleared: {
        smsOtp: !!booking.smsOtpVerified,
        liveness: !!booking.livenessVerified,
        payIdMatch: !!booking.payIdMatched,
      },
      verificationStatus: booking.verification_status || 'pending',
    };
  }
);

async function resolveTrustTier(phoneHash: string, emailHash: string): Promise<'unverified' | 'verified' | 'trusted'> {
  const db = getDb();
  // Find existing customer doc by hash.
  const byPhone = await db.collection('customers').where('phoneHash', '==', phoneHash).limit(1).get();
  if (!byPhone.empty) return byPhone.docs[0].data().trustTier || 'unverified';

  const byEmail = await db.collection('customers').where('emailHash', '==', emailHash).limit(1).get();
  if (!byEmail.empty) return byEmail.docs[0].data().trustTier || 'unverified';

  return 'unverified';
}
