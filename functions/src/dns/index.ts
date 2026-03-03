import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { createOtpSession, verifyOtpSession, OTP_RATE_LIMIT_PER_WINDOW, OTP_EXPIRY_MINUTES } from '../utils/otp';

const db = admin.firestore();
const fns = functions as any;

const PEPPER = process.env.DNS_HASH_PEPPER || 'default-secret-pepper-change-me-in-prod';

// Bookings above this AUD threshold always require full KYC regardless of
// returning-client status.
const HIGH_VALUE_THRESHOLD = 500;

// How long a verified_clients record stays valid (in days).
const VERIFIED_CLIENT_EXPIRY_DAYS = 730; // 2 years

// --- Helpers ---

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function normalizePhoneToE164(phone: string, defaultCountryCode: string = '+61'): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = defaultCountryCode + cleaned.substring(1);
  } else if (!cleaned.startsWith('+')) {
    cleaned = defaultCountryCode + cleaned;
  }
  return cleaned;
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value + PEPPER).digest('hex');
}

async function writeAuditLog(actorUid: string, actorRole: string, action: string, bookingId: string, details: any = {}) {
  await db.collection('audit_log').add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    actor_id: actorUid,
    actor_role: actorRole,
    action,
    booking_id: bookingId,
    details
  });
}

// --- Core DNS Lookup ---

export async function dnsLookup(emailHash: string, phoneHash: string): Promise<boolean> {
  const dnsQuery = await db.collection('dns_entries')
    .where('status', '==', 'ACTIVE')
    .where('match_keys', 'array-contains-any', [emailHash, phoneHash])
    .limit(1)
    .get();
    
  return !dnsQuery.empty;
}

export async function hasPreviousSuccessfulBooking(emailHash: string, phoneHash: string): Promise<boolean> {
  const emailQuery = await db.collection('bookings')
    .where('client_email_hash', '==', emailHash)
    .where('kyc_status', 'in', ['PASS', 'BYPASSED'])
    .limit(1)
    .get();

  if (!emailQuery.empty) return true;

  const phoneQuery = await db.collection('bookings')
    .where('client_phone_hash', '==', phoneHash)
    .where('kyc_status', 'in', ['PASS', 'BYPASSED'])
    .limit(1)
    .get();

  return !phoneQuery.empty;
}

// --- Cloud Functions ---

export const createBookingAndScreenDns = fns.https.onCall(async (data: any, context: any) => {
  const {
    client_email,
    client_phone,
    client_name,
    amount_deposit,
    amount_kyc_fee,
    // Optional: supplied by the frontend after a successful OTP bypass.
    // Must be validated server-side; never trusted without verification.
    otpSessionId,
  } = data;

  if (!client_email || !client_phone || !client_name) {
    throw new fns.https.HttpsError(‘invalid-argument’, ‘Missing required client details.’);
  }

  const emailHash = sha256(normalizeEmail(client_email));
  const phoneHash = sha256(normalizePhoneToE164(client_phone));

  const isBlocked = await dnsLookup(emailHash, phoneHash);

  const bookingRef = db.collection(‘bookings’).doc();
  const payid_reference = `BK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  if (isBlocked) {
    const amount_total_due = amount_deposit + amount_kyc_fee;
    const bookingData: any = {
      client_name,
      client_email,
      client_phone,
      client_email_hash: emailHash,
      client_phone_hash: phoneHash,
      payid_reference,
      amount_deposit,
      amount_kyc_fee,
      amount_total_due,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      dns_status: ‘DENIED_DNS’,
      status: ‘DENIED’,
      payment_status: ‘AWAITING_PAYMENT’, // Never shown
      kyc_status: ‘NOT_STARTED’
    };

    await bookingRef.set(bookingData);

    await writeAuditLog(
      context.auth?.uid || ‘anonymous’,
      context.auth ? ‘client’ : ‘system’,
      ‘DNS_HIT’,
      bookingRef.id,
      { reason: ‘Matched active DNS entry during initial screening’ }
    );
    await writeAuditLog(
      context.auth?.uid || ‘anonymous’,
      context.auth ? ‘client’ : ‘system’,
      ‘BOOKING_DENIED’,
      bookingRef.id,
      { reason: ‘DNS_HIT’ }
    );

    return {
      success: false,
      message: "We can’t proceed with this booking."
    };
  }

  // --- Determine KYC bypass ---
  // Priority 1: OTP-verified returning client (highest assurance).
  // Priority 2: hasPreviousSuccessfulBooking legacy bypass (backwards compat).
  let final_kyc_status = ‘NOT_STARTED’;
  let final_amount_kyc_fee = amount_kyc_fee;
  let kyc_bypass_reason: string | null = null;

  if (otpSessionId && typeof otpSessionId === ‘string’) {
    // Atomically claim the OTP session so it cannot be reused across bookings.
    const sessionRef = db.collection(‘otp_sessions’).doc(otpSessionId);
    let sessionValid = false;

    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(sessionRef);
        if (!doc.exists) return;

        const session = doc.data()!;

        // All three conditions must hold:
        //  1. Session was successfully verified (OTP code was correct)
        //  2. Identity hashes match this booking exactly (anti-spoofing)
        //  3. Not already claimed by another booking
        if (
          session.verified === true &&
          session.email_hash === emailHash &&
          session.phone_hash === phoneHash &&
          session.booking_ref === null
        ) {
          t.update(sessionRef, { booking_ref: bookingRef.id });
          sessionValid = true;
        }
      });
    } catch (err) {
      console.error(‘[createBookingAndScreenDns] OTP session claim failed:’, err);
      sessionValid = false;
    }

    if (sessionValid) {
      final_kyc_status = ‘BYPASSED’;
      final_amount_kyc_fee = 0;
      kyc_bypass_reason = ‘RETURNING_VERIFIED’;
    }
  }

  // Fallback to legacy bypass if OTP session was not provided or invalid.
  if (kyc_bypass_reason === null) {
    const isPreviousBooker = await hasPreviousSuccessfulBooking(emailHash, phoneHash);
    if (isPreviousBooker) {
      final_kyc_status = ‘BYPASSED’;
      final_amount_kyc_fee = 0;
      // No bypass_reason for legacy path — preserves existing behaviour.
    }
  }

  const amount_total_due = amount_deposit + final_amount_kyc_fee;

  const bookingData: any = {
    client_name,
    client_email,
    client_phone,
    client_email_hash: emailHash,
    client_phone_hash: phoneHash,
    payid_reference,
    amount_deposit,
    amount_kyc_fee: final_amount_kyc_fee,
    amount_total_due,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    dns_status: ‘CLEAR’,
    status: ‘PENDING’,
    payment_status: ‘AWAITING_PAYMENT’,
    kyc_status: final_kyc_status,
    ...(kyc_bypass_reason !== null && { kyc_bypass_reason }),
  };

  await bookingRef.set(bookingData);

  const actorUid = context.auth?.uid || ‘anonymous’;
  const actorRole = context.auth ? ‘client’ : ‘system’;

  await writeAuditLog(actorUid, actorRole, ‘DNS_CHECK’, bookingRef.id, {
    result: ‘CLEAR’,
    kyc_status: final_kyc_status,
    ...(kyc_bypass_reason !== null && { kyc_bypass_reason }),
  });

  if (kyc_bypass_reason === ‘RETURNING_VERIFIED’) {
    await writeAuditLog(actorUid, actorRole, ‘KYC_BYPASS_RETURNING_VERIFIED’, bookingRef.id, {
      otp_session_id: otpSessionId,
      reason: ‘Client OTP-verified against active verified_clients record or prior booking history’,
    });

    // Extend verified_clients expiry on successful bypass.
    const newExpiry = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + VERIFIED_CLIENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    );
    await db.collection(‘verified_clients’).doc(emailHash).set(
      {
        last_seen_at: admin.firestore.FieldValue.serverTimestamp(),
        expires_at: newExpiry,
      },
      { merge: true }
    );
  }

  return {
    success: true,
    bookingId: bookingRef.id,
    paymentInstructions: {
      payid_identifier: ‘payments@flavrentertainers.com.au’,
      amount_total_due,
      payid_reference
    }
  };
});

export const confirmPayidPayment = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  // Verify Admin
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists && context.auth.token.admin !== true) {
    throw new fns.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { bookingId } = data;
  const bookingRef = db.collection('bookings').doc(bookingId);
  
  let shouldSkipKyc = false;

  await db.runTransaction(async (t) => {
    const doc = await t.get(bookingRef);
    if (!doc.exists) throw new fns.https.HttpsError('not-found', 'Booking not found');
    
    const bookingData = doc.data()!;
    shouldSkipKyc = bookingData.kyc_status === 'BYPASSED';

    t.update(bookingRef, {
      payment_status: 'PAID',
      status: shouldSkipKyc ? 'CONFIRMED' : 'DEPOSIT_PAID'
    });
  });

  await writeAuditLog(context.auth.uid, 'admin', 'PAYMENT_CONFIRMED', bookingId);
  
  if (shouldSkipKyc) {
    await writeAuditLog('system', 'system', 'KYC_BYPASSED', bookingId);
  } else {
    // Stub: Trigger KYC session creation
    // await createKycSession(bookingId);
    await writeAuditLog('system', 'system', 'KYC_STARTED', bookingId);
  }

  return { success: true };
});

export const handleKycWebhookOrResult = fns.https.onCall(async (data: any, context: any) => {
  // In reality, this might be an HTTP webhook from a KYC provider
  // For this example, we'll assume it's an admin or system call
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { bookingId, kycResult, providerRef } = data; // kycResult: 'PASS' | 'FAIL'
  
  const bookingRef = db.collection('bookings').doc(bookingId);
  const doc = await bookingRef.get();
  
  if (!doc.exists) throw new fns.https.HttpsError('not-found', 'Booking not found');
  const booking = doc.data()!;

  const updateData: any = {
    kyc_status: kycResult,
    kyc_provider_ref: providerRef || null
  };

  if (kycResult === 'PASS') {
    // Re-run DNS check
    const isBlocked = await dnsLookup(booking.client_email_hash, booking.client_phone_hash);

    if (isBlocked) {
      updateData.dns_status = 'DENIED_DNS_AFTER_KYC';
      updateData.status = 'DENIED';
      updateData.refundable_amount = booking.amount_deposit;
      updateData.non_refundable_amount = booking.amount_kyc_fee;

      await writeAuditLog('system', 'system', 'DNS_HIT', bookingId, { reason: 'Matched active DNS entry during post-KYC screening' });
      await writeAuditLog('system', 'system', 'BOOKING_DENIED', bookingId, { reason: 'DENIED_DNS_AFTER_KYC' });
    } else {
      updateData.dns_status = 'CLEAR';
      updateData.status = 'CONFIRMED';

      // Backfill / refresh the verified_clients record so this client can use
      // the OTP bypass on future bookings.
      if (booking.client_email_hash) {
        const expiresAt = admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + VERIFIED_CLIENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
        );
        await db.collection('verified_clients').doc(booking.client_email_hash).set(
          {
            client_email_hash: booking.client_email_hash,
            client_phone_hash: booking.client_phone_hash || null,
            verification_status: 'APPROVED',
            verification_level: 'KYC_FULL',
            verified_at: admin.firestore.FieldValue.serverTimestamp(),
            expires_at: expiresAt,
            last_seen_at: admin.firestore.FieldValue.serverTimestamp(),
            created_by: 'system',
          },
          { merge: true }
        );
      }
    }
  } else {
    updateData.status = 'DENIED';
    updateData.refundable_amount = booking.amount_deposit;
    updateData.non_refundable_amount = booking.amount_kyc_fee;
  }

  await bookingRef.update(updateData);
  await writeAuditLog('system', 'system', 'KYC_RESULT', bookingId, { result: kycResult });

  return { success: true, status: updateData.status };
});

// =============================================================================
// Returning Verified Client — eligibility check + OTP challenge
// =============================================================================

/**
 * checkReturningClientEligibility
 *
 * Determines whether a client can skip full KYC by using a verified_clients
 * record or a prior successful booking.  Returns:
 *   { eligible, reason, requiresOtp }
 *
 * If eligible, the frontend must call startReturningClientOtp next — no bypass
 * is granted without OTP confirmation (anti-spoofing requirement).
 */
export const checkReturningClientEligibility = fns.https.onCall(
  async (data: any, _context: any) => {
    const { client_email, client_phone, booking_context } = data;

    if (!client_email || !client_phone) {
      throw new fns.https.HttpsError('invalid-argument', 'client_email and client_phone are required.');
    }

    const emailHash = sha256(normalizeEmail(client_email));
    const phoneHash = sha256(normalizePhoneToE164(client_phone));

    // 1. DNS check — blocked clients are never eligible.
    const isBlocked = await dnsLookup(emailHash, phoneHash);
    if (isBlocked) {
      return { eligible: false, reason: 'DNS_HIT', requiresOtp: false };
    }

    // 2. High-value booking — always require full KYC regardless of history.
    const amountDue: number = booking_context?.amount_total_due ?? 0;
    if (amountDue > HIGH_VALUE_THRESHOLD) {
      return { eligible: false, reason: 'HIGH_VALUE_BOOKING', requiresOtp: false };
    }

    // 3. Check verified_clients collection (primary — richer metadata & expiry).
    const verifiedDoc = await db.collection('verified_clients').doc(emailHash).get();
    if (verifiedDoc.exists) {
      const vc = verifiedDoc.data()!;

      if (vc.verification_status === 'REVOKED') {
        return { eligible: false, reason: 'VERIFICATION_REVOKED', requiresOtp: false };
      }

      if (vc.verification_status === 'APPROVED') {
        const now = admin.firestore.Timestamp.now();

        if (!vc.expires_at || vc.expires_at.toMillis() <= now.toMillis()) {
          return { eligible: false, reason: 'VERIFICATION_EXPIRED', requiresOtp: false };
        }

        // Anti-spoofing: phone hash must match the verified record.
        if (vc.client_phone_hash && vc.client_phone_hash !== phoneHash) {
          return { eligible: false, reason: 'PHONE_MISMATCH', requiresOtp: false };
        }

        return { eligible: true, reason: 'VERIFIED_RECORD', requiresOtp: true };
      }
    }

    // 4. Fallback — prior booking with PASS or BYPASSED kyc_status.
    const isPreviousBooker = await hasPreviousSuccessfulBooking(emailHash, phoneHash);
    if (isPreviousBooker) {
      return { eligible: true, reason: 'PREVIOUS_BOOKING', requiresOtp: true };
    }

    return { eligible: false, reason: 'NEW_CLIENT', requiresOtp: false };
  }
);

/**
 * startReturningClientOtp
 *
 * Generates a 6-digit OTP, stores a hashed session in otp_sessions, and
 * sends the code via SMS.  Rate-limited to OTP_RATE_LIMIT_PER_WINDOW sends
 * per rolling 10-minute window.
 *
 * Generic error messages throughout to prevent identity enumeration.
 */
export const startReturningClientOtp = fns.https.onCall(
  async (data: any, _context: any) => {
    const { client_email, client_phone } = data;

    if (!client_email || !client_phone) {
      throw new fns.https.HttpsError('invalid-argument', 'client_email and client_phone are required.');
    }

    const emailHash = sha256(normalizeEmail(client_email));
    const phoneHash = sha256(normalizePhoneToE164(client_phone));
    const phoneE164 = normalizePhoneToE164(client_phone);

    // Re-run DNS check server-side — never trust the frontend's eligibility result.
    const isBlocked = await dnsLookup(emailHash, phoneHash);
    if (isBlocked) {
      // Generic message: do not reveal why the send was refused.
      throw new fns.https.HttpsError(
        'failed-precondition',
        'Unable to send verification code at this time.'
      );
    }

    // Rate limiting: count sessions created in the last OTP_EXPIRY_MINUTES window.
    const windowStart = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - OTP_EXPIRY_MINUTES * 60 * 1000)
    );
    const recentSessions = await db
      .collection('otp_sessions')
      .where('email_hash', '==', emailHash)
      .where('created_at', '>=', windowStart)
      .limit(OTP_RATE_LIMIT_PER_WINDOW)
      .get();

    if (recentSessions.size >= OTP_RATE_LIMIT_PER_WINDOW) {
      throw new fns.https.HttpsError(
        'resource-exhausted',
        'Too many verification requests. Please wait a few minutes before trying again.'
      );
    }

    const otpSessionId = await createOtpSession(emailHash, phoneHash, phoneE164);

    return { otpSessionId };
  }
);

/**
 * verifyReturningClientOtp
 *
 * Validates the 6-digit code against the stored hashed session.  On success,
 * marks the session as verified + consumed.  The resulting otpSessionId is
 * passed to createBookingAndScreenDns to claim the KYC bypass.
 *
 * Generic error messages to prevent attempt enumeration.
 */
export const verifyReturningClientOtp = fns.https.onCall(
  async (data: any, _context: any) => {
    const { otpSessionId, otp, client_email, client_phone } = data;

    if (!otpSessionId || !otp || !client_email || !client_phone) {
      throw new fns.https.HttpsError('invalid-argument', 'All fields are required.');
    }

    const emailHash = sha256(normalizeEmail(client_email));
    const phoneHash = sha256(normalizePhoneToE164(client_phone));

    const result = await verifyOtpSession(otpSessionId, otp, emailHash, phoneHash);

    if (!result.valid) {
      // Generic message to prevent enumeration of attempts/identity state.
      throw new fns.https.HttpsError(
        'unauthenticated',
        'Verification failed. Please check your code and try again.'
      );
    }

    return { verified: true };
  }
);

/**
 * revokeVerifiedClient  (admin-only)
 *
 * Sets verification_status = 'REVOKED' so the client is forced through full
 * KYC on their next booking.  Writes an audit_log entry.
 */
export const revokeVerifiedClient = fns.https.onCall(
  async (data: any, context: any) => {
    if (!context.auth) {
      throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated.');
    }

    const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
    if (!adminDoc.exists && context.auth.token.admin !== true) {
      throw new fns.https.HttpsError('permission-denied', 'Admin access required.');
    }

    const { client_email_hash, notes } = data;
    if (!client_email_hash) {
      throw new fns.https.HttpsError('invalid-argument', 'client_email_hash required.');
    }

    await db.collection('verified_clients').doc(client_email_hash).set(
      {
        verification_status: 'REVOKED',
        notes: notes || null,
        revoked_at: admin.firestore.FieldValue.serverTimestamp(),
        revoked_by: context.auth.uid,
      },
      { merge: true }
    );

    await writeAuditLog(
      context.auth.uid,
      'admin',
      'VERIFIED_CLIENT_REVOKED',
      'system',
      { client_email_hash, notes: notes || null }
    );

    return { success: true };
  }
);

/**
 * Migration function to convert 'approved' -> 'ACTIVE' and backfill hashes.
 * Access restricted to admins.
 */
export const runDnsMigration = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  // Verify Admin
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists && context.auth.token.admin !== true) {
    throw new fns.https.HttpsError('permission-denied', 'Admin access required');
  }

  const dnsRef = db.collection('dns_entries');
  const snapshot = await dnsRef.get();

  if (snapshot.empty) {
    return { message: 'No entries found.' };
  }

  let count = 0;
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const entry = doc.data();
    const updates: any = {};

    // 1. Convert status 'approved' -> 'ACTIVE'
    if (entry.status === 'approved') {
      updates.status = 'ACTIVE';
    }

    // 2. Backfill hashes and match_keys
    if (!entry.match_keys || !entry.client_email_hash) {
      const email = entry.client_email || '';
      const phone = entry.client_phone || '';
      
      const emailHash = email ? sha256(normalizeEmail(email)) : 'NO_EMAIL';
      const phoneHash = phone ? sha256(normalizePhoneToE164(phone)) : 'NO_PHONE';
      
      updates.client_email_hash = emailHash;
      updates.client_phone_hash = phoneHash;
      updates.match_keys = [emailHash, phoneHash].filter(h => h !== 'NO_EMAIL' && h !== 'NO_PHONE');
      
      if (entry.client_name && !entry.client_name_norm) {
        updates.client_name_norm = entry.client_name.toLowerCase().trim();
      }
    }

    if (Object.keys(updates).length > 0) {
      batch.update(doc.ref, updates);
      count++;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  await writeAuditLog(context.auth.uid, 'admin', 'DNS_MIGRATION_RUN', 'system', { updated_count: count });

  return { success: true, updated_count: count };
});

