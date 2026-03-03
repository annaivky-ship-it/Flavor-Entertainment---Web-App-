/**
 * otp.ts — OTP generation, hashing, session management
 *
 * Sessions are stored in `otp_sessions/{sessionId}` and are:
 * - Single-use (consumed_at + booking_ref prevent replay)
 * - Time-limited (OTP_EXPIRY_MINUTES)
 * - Attempt-limited (OTP_MAX_ATTEMPTS)
 * - Identity-bound (email_hash + phone_hash must match at every step)
 */

import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { sendSms } from '../twilio';

const db = admin.firestore();

// Re-use the same pepper as the DNS hash so all hashes are consistent.
const PEPPER = process.env.DNS_HASH_PEPPER || 'default-secret-pepper-change-me-in-prod';

export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
// Max new OTP sessions per email hash within a 10-minute rolling window.
export const OTP_RATE_LIMIT_PER_WINDOW = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure 6-digit OTP string.
 * Uses 4 random bytes mapped to [100000, 999999].
 */
export function generateOtp(): string {
  const bytes = crypto.randomBytes(4);
  const num = (bytes.readUInt32BE(0) % 900000) + 100000;
  return num.toString();
}

/**
 * Hash an OTP with the PEPPER so stored values cannot be reversed if the DB
 * is compromised. Uses the same sha256+pepper pattern as the DNS hashes.
 */
export function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp.trim() + PEPPER).digest('hex');
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

/**
 * Create an otp_sessions document and send the OTP via SMS.
 * Returns the Firestore document ID (otpSessionId).
 *
 * Callers must enforce rate limiting BEFORE calling this function.
 */
export async function createOtpSession(
  emailHash: string,
  phoneHash: string,
  phoneE164: string
): Promise<string> {
  const otp = generateOtp();
  const otpHash = hashOtp(otp);

  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
  );

  const sessionRef = db.collection('otp_sessions').doc();

  await sessionRef.set({
    email_hash: emailHash,
    phone_hash: phoneHash,
    otp_hash: otpHash,
    expires_at: expiresAt,
    attempts: 0,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    consumed_at: null,
    verified: false,
    // Set to a bookingId when the OTP session is claimed during booking creation.
    // Prevents a single verified session from being used for multiple bookings.
    booking_ref: null,
  });

  // --- SMS delivery ---
  // Wrapped in try/catch so a misconfigured Twilio env never breaks the session
  // creation.  In production, configure via:
  //   firebase functions:config:set twilio.sid="AC..." twilio.token="..." twilio.sms_from="+61..."
  try {
    await sendSms(
      phoneE164,
      `Your Flavor Entertainers verification code is: ${otp}. ` +
        `Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`
    );
  } catch (err) {
    // TODO: Remove this log in production once Twilio is confirmed working.
    console.warn(
      `[OTP] SMS delivery failed — check Twilio config. ` +
        `Session: ${sessionRef.id} | Dev OTP: ${otp}`,
      err
    );
  }

  return sessionRef.id;
}

// ---------------------------------------------------------------------------
// Session verification
// ---------------------------------------------------------------------------

export interface OtpVerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Atomically verify an OTP session:
 * - Increment attempts on every wrong code.
 * - Mark verified + consumed_at on success.
 * - Never reveal whether the *identity* is known (identity mismatch returns
 *   the same shape as "invalid code" to prevent enumeration).
 */
export async function verifyOtpSession(
  sessionId: string,
  otp: string,
  emailHash: string,
  phoneHash: string
): Promise<OtpVerifyResult> {
  const sessionRef = db.collection('otp_sessions').doc(sessionId);
  let result: OtpVerifyResult = { valid: false, reason: 'Unknown error' };

  await db.runTransaction(async (t) => {
    const doc = await t.get(sessionRef);

    if (!doc.exists) {
      result = { valid: false, reason: 'Session not found' };
      return;
    }

    const session = doc.data()!;

    // --- Identity binding (anti-spoofing) ---
    // Return a generic failure so callers can't enumerate which identities exist.
    if (session.email_hash !== emailHash || session.phone_hash !== phoneHash) {
      result = { valid: false, reason: 'Verification failed' };
      return;
    }

    if (session.verified === true || session.consumed_at !== null) {
      result = { valid: false, reason: 'Session already consumed' };
      return;
    }

    const now = admin.firestore.Timestamp.now();
    if (session.expires_at.toMillis() < now.toMillis()) {
      result = { valid: false, reason: 'OTP expired' };
      return;
    }

    if (session.attempts >= OTP_MAX_ATTEMPTS) {
      result = { valid: false, reason: 'Too many attempts' };
      return;
    }

    const providedHash = hashOtp(otp.trim());

    if (providedHash !== session.otp_hash) {
      t.update(sessionRef, {
        attempts: admin.firestore.FieldValue.increment(1),
      });
      result = { valid: false, reason: 'Invalid code' };
      return;
    }

    // --- Success: atomically mark as verified ---
    t.update(sessionRef, {
      verified: true,
      consumed_at: now,
    });
    result = { valid: true };
  });

  return result;
}
