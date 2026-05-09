/**
 * Shared utilities for the self-hosted verification system.
 *
 * Centralises:
 *   - HMAC hashing (phone, email, face embedding) using HASH_SECRET
 *   - PII normalisation (E.164 phones, lower-cased emails)
 *   - Append-only audit log writer (writes to `auditLog`)
 *   - Rate limiter using Firestore counter docs
 *   - Auth + App Check guards for callables
 *   - Common error helpers
 *
 * NOTE: HASH_SECRET is a Firebase Functions secret. Rotation procedure is in
 * docs/secrets-rotation.md; the rotation script is at scripts/rotate-hash-secret.ts.
 */

import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';

export const HASH_SECRET = defineSecret('HASH_SECRET');

// --- Region (mandatory per task brief) ---
export const REGION = 'australia-southeast1' as const;

// --- DB accessor ---
const getDb = () => getFirestore('default');

// --- PII normalisation ---

export function normalizeEmail(email: string): string {
  return (email || '').toLowerCase().trim();
}

export function normalizePhoneE164(phone: string, defaultCountryCode: string = '+61'): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = defaultCountryCode + cleaned.substring(1);
  } else if (!cleaned.startsWith('+')) {
    cleaned = defaultCountryCode + cleaned;
  }
  return cleaned;
}

// --- HMAC hashing ---

/**
 * Read HASH_SECRET at call time. Throws in production if unset.
 * In emulator we fall back to a fixed dev value so tests are deterministic.
 */
function getHashSecret(): string {
  const secret = HASH_SECRET.value();
  if (secret) return secret;
  if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'test') {
    return 'emulator-only-hash-secret-do-not-use-in-prod';
  }
  throw new Error('HASH_SECRET is not configured');
}

export function hmacSha256(value: string): string {
  return crypto.createHmac('sha256', getHashSecret()).update(value).digest('hex');
}

export function hashPhone(phoneE164: string): string {
  return hmacSha256(`phone:${phoneE164}`);
}

export function hashEmail(emailNorm: string): string {
  return hmacSha256(`email:${emailNorm}`);
}

/**
 * Hash a 128-dim face embedding for DNS list comparison. We can't hash the
 * embedding directly (cosine similarity matters, exact bytes don't). Instead
 * we quantise each component to one of 8 buckets (≈ 0.25 stddev resolution)
 * and hash the resulting fixed-length string. Two faces from the same person
 * should land in the same bucket pattern most of the time; a hash collision
 * on chance is astronomically unlikely.
 */
export function hashFaceEmbedding(embedding: number[]): string {
  const quantised = embedding.map(v => {
    const clipped = Math.max(-1, Math.min(1, v));
    return Math.round((clipped + 1) * 4); // 0..8
  }).join(',');
  return hmacSha256(`face:${quantised}`);
}

// --- App Check + auth guards ---

interface CallableContext {
  auth?: { uid: string; token: any } | null;
  app?: { appId: string; token: any } | null;
  rawRequest?: any;
}

const APP_CHECK_REQUIRED = process.env.APP_CHECK_REQUIRED !== 'false';

export function requireAppCheck(ctx: CallableContext): void {
  if (!APP_CHECK_REQUIRED) return;
  if (!ctx.app) {
    throw new HttpsError('failed-precondition', 'App Check token missing or invalid.');
  }
}

export function requireAuth(ctx: CallableContext): { uid: string; token: any } {
  if (!ctx.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  return ctx.auth;
}

export async function requireAdmin(ctx: CallableContext): Promise<{ uid: string; token: any }> {
  const auth = requireAuth(ctx);
  if (auth.token?.admin === true) return auth;
  const adminDoc = await getDb().collection('admins').doc(auth.uid).get();
  if (adminDoc.exists) return auth;
  throw new HttpsError('permission-denied', 'Admin access required.');
}

// --- Audit log ---

export type AuditAction =
  | 'OTP_SENT' | 'OTP_VERIFIED' | 'OTP_FAILED' | 'OTP_RATE_LIMITED'
  | 'LIVENESS_SUBMITTED' | 'LIVENESS_REJECTED'
  | 'PAYID_MATCHED' | 'PAYID_MISMATCH' | 'PAYID_DEPOSIT_CONFIRMED'
  | 'CUSTOMER_VERIFIED' | 'CUSTOMER_DENIED' | 'CUSTOMER_QUEUED'
  | 'TRUST_TIER_PROMOTED' | 'TRUST_TIER_DEMOTED'
  | 'PERFORMER_APPLIED' | 'PERFORMER_ID_UPLOADED' | 'PERFORMER_ID_REVIEWED'
  | 'PERFORMER_LIVENESS_DONE' | 'PERFORMER_BANKING_ADDED'
  | 'PERFORMER_PENNY_DROP_INITIATED' | 'PERFORMER_PENNY_DROP_CONFIRMED'
  | 'PERFORMER_PORTFOLIO_SUBMITTED' | 'PERFORMER_SAFETY_ACK'
  | 'PERFORMER_CONTRACT_SIGNED' | 'PERFORMER_ACTIVATED' | 'PERFORMER_REJECTED'
  | 'ID_IMAGE_VIEWED' | 'ID_IMAGE_DELETED'
  | 'DNS_ADDED' | 'DNS_EXPIRED'
  | 'PERFORMER_FLAGGED_CUSTOMER'
  | 'ADMIN_REVIEW_DECISION'
  | 'HASH_SECRET_ROTATED';

export async function writeAudit(params: {
  actorUid: string;
  actorRole: 'system' | 'admin' | 'customer' | 'performer';
  action: AuditAction | string;
  subjectType?: 'customer' | 'performer' | 'booking' | 'dns_entry' | 'system';
  subjectId?: string;
  bookingId?: string;
  meta?: Record<string, any>;
}): Promise<void> {
  await getDb().collection('auditLog').add({
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    action: params.action,
    subjectType: params.subjectType || null,
    subjectId: params.subjectId || null,
    bookingId: params.bookingId || null,
    meta: params.meta || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// --- Rate limiter ---

/**
 * Increment a Firestore counter doc and reject if it exceeds `max` within
 * `windowSeconds`. Used to throttle OTP sends per phone.
 *
 * The doc shape:
 *   { count: number, windowStart: Timestamp }
 *
 * If now > windowStart + windowSeconds, the window resets.
 */
export async function rateLimit(params: {
  bucket: string;        // e.g. "otp_send", "otp_verify"
  key: string;           // e.g. phoneHash
  max: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; remaining: number }> {
  const ref = getDb().collection('rateLimits').doc(`${params.bucket}_${params.key}`);
  const now = admin.firestore.Timestamp.now();
  const windowMs = params.windowSeconds * 1000;

  return getDb().runTransaction(async (t) => {
    const doc = await t.get(ref);
    if (!doc.exists) {
      t.set(ref, { count: 1, windowStart: now });
      return { allowed: true, remaining: params.max - 1 };
    }
    const data = doc.data()!;
    const windowStartMs = data.windowStart.toMillis();
    const elapsedMs = now.toMillis() - windowStartMs;

    if (elapsedMs > windowMs) {
      t.set(ref, { count: 1, windowStart: now });
      return { allowed: true, remaining: params.max - 1 };
    }

    if (data.count >= params.max) {
      return { allowed: false, remaining: 0 };
    }

    t.update(ref, { count: data.count + 1 });
    return { allowed: true, remaining: params.max - (data.count + 1) };
  });
}

// --- Random helpers ---

export function randomDigits(length: number): string {
  const buf = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += (buf[i] % 10).toString();
  return out;
}

export function randomCode(length: number): string {
  // A-Z + 0-9 minus visually ambiguous (0/O, 1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

// --- DNS list lookup helpers ---

export async function isOnDoNotServeList(params: {
  phoneHash?: string;
  emailHash?: string;
  faceHash?: string;
}): Promise<{ matched: boolean; severity: 'silent' | 'explicit' | null; reason: string | null }> {
  const db = getDb();
  const checks: { matchType: string; value: string }[] = [];
  if (params.phoneHash) checks.push({ matchType: 'phone_hash', value: params.phoneHash });
  if (params.emailHash) checks.push({ matchType: 'email_hash', value: params.emailHash });
  if (params.faceHash) checks.push({ matchType: 'face_hash', value: params.faceHash });

  for (const c of checks) {
    const q = await db.collection('doNotServeList')
      .where('matchType', '==', c.matchType)
      .where('value', '==', c.value)
      .where('active', '==', true)
      .limit(1)
      .get();
    if (!q.empty) {
      const data = q.docs[0].data();
      return {
        matched: true,
        severity: data.severity || 'silent',
        reason: data.reason || 'Matched DNS register',
      };
    }
  }
  return { matched: false, severity: null, reason: null };
}

// Re-export for convenience
export { getDb };
