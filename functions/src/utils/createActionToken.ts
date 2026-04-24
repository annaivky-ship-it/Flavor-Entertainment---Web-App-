import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

export type BookingAction = 'accept' | 'decline';

const TOKENS_COLLECTION = 'booking_action_tokens';
const TOKEN_TTL_HOURS = 24;

export interface BookingActionToken {
  booking_id: string;
  performer_id: string;
  action: BookingAction;
  expires_at: Timestamp;
  used: boolean;
  created_at: Timestamp;
  used_at?: Timestamp;
}

/**
 * Generate a high-entropy, URL-safe token. We don't store the raw token —
 * the document ID *is* the token, which means lookup is O(1) and an attacker
 * cannot enumerate by guessing booking IDs.
 */
function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Create a single-use action token for a performer to accept or decline a
 * booking. Returns the absolute action URL (using `APP_BASE_URL` /
 * `appBaseUrl`) and the raw token id.
 */
export async function createActionToken(opts: {
  bookingId: string;
  performerId: string;
  action: BookingAction;
  appBaseUrl: string;
  ttlHours?: number;
}): Promise<{ token: string; url: string }> {
  const db = getFirestore('default');
  const tokenId = generateToken();
  const ttlHours = opts.ttlHours ?? TOKEN_TTL_HOURS;
  const expiresAt = Timestamp.fromMillis(Date.now() + ttlHours * 60 * 60 * 1000);

  const doc: BookingActionToken = {
    booking_id: opts.bookingId,
    performer_id: opts.performerId,
    action: opts.action,
    expires_at: expiresAt,
    used: false,
    created_at: admin.firestore.Timestamp.now(),
  };

  await db.collection(TOKENS_COLLECTION).doc(tokenId).set(doc);

  const base = opts.appBaseUrl.replace(/\/$/, '');
  const url = `${base}/booking-action?token=${encodeURIComponent(tokenId)}`;
  return { token: tokenId, url };
}

/**
 * Atomically validate and consume a token. Returns the parsed token data.
 * Throws on missing / expired / already-used tokens.
 */
export async function consumeActionToken(tokenId: string): Promise<BookingActionToken> {
  const db = getFirestore('default');
  const ref = db.collection(TOKENS_COLLECTION).doc(tokenId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new TokenError('not_found', 'Action link is invalid.');
    }
    const data = snap.data() as BookingActionToken;
    if (data.used) {
      throw new TokenError('used', 'This action link has already been used.');
    }
    if (data.expires_at.toMillis() < Date.now()) {
      throw new TokenError('expired', 'This action link has expired.');
    }
    tx.update(ref, {
      used: true,
      used_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return data;
  });
}

export class TokenError extends Error {
  constructor(public code: 'not_found' | 'used' | 'expired', message: string) {
    super(message);
    this.name = 'TokenError';
  }
}

export const BOOKING_ACTION_TOKENS_COLLECTION = TOKENS_COLLECTION;
