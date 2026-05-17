import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

const getDb = () => getFirestore('default');
const fns = functions as any;

// Pepper resolved at first call (not module load) so a missing secret raises
// a clear runtime error visible in Functions logs rather than a known-bad
// fallback hash. Emulator/test runs use a deterministic dev value.
function getPepper(): string {
  const fromEnv = process.env.DNS_HASH_PEPPER;
  if (fromEnv) return fromEnv;
  if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'test') {
    return 'emulator-only-dns-pepper-do-not-use-in-prod';
  }
  throw new Error('DNS_HASH_PEPPER is not configured. Refusing to compute DNS hashes with a known fallback.');
}

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
  return crypto.createHash('sha256').update(value + getPepper()).digest('hex');
}

async function writeAuditLog(actorUid: string, actorRole: string, action: string, bookingId: string, details: any = {}) {
  await getDb().collection('audit_log').add({
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
  const dnsQuery = await getDb().collection('dns_entries')
    .where('status', '==', 'ACTIVE')
    .where('match_keys', 'array-contains-any', [emailHash, phoneHash])
    .limit(1)
    .get();

  return !dnsQuery.empty;
}

export async function hasPreviousSuccessfulBooking(emailHash: string, phoneHash: string): Promise<boolean> {
  const emailQuery = await getDb().collection('bookings')
    .where('client_email_hash', '==', emailHash)
    .where('status', 'in', ['CONFIRMED', 'confirmed', 'completed'])
    .limit(1)
    .get();

  if (!emailQuery.empty) return true;

  const phoneQuery = await getDb().collection('bookings')
    .where('client_phone_hash', '==', phoneHash)
    .where('status', 'in', ['CONFIRMED', 'confirmed', 'completed'])
    .limit(1)
    .get();

  return !phoneQuery.empty;
}

// --- Cloud Functions ---

export const createBookingAndScreenDns = fns.https.onCall(async (data: any, context: any) => {
  const { client_email, client_phone, client_name, amount_deposit } = data;

  if (!client_email || !client_phone || !client_name) {
    throw new fns.https.HttpsError('invalid-argument', 'Missing required client details.');
  }

  const emailHash = sha256(normalizeEmail(client_email));
  const phoneHash = sha256(normalizePhoneToE164(client_phone));

  const isBlocked = await dnsLookup(emailHash, phoneHash);

  const bookingRef = getDb().collection('bookings').doc();
  const payid_reference = `BK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  if (isBlocked) {
    // Generate an opaque support reference. The reference is stored on the
    // booking doc so an admin handling a customer enquiry can look up the
    // original DNS hit, but the reference itself reveals nothing.
    const supportReference = `SR-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    const bookingData: any = {
      client_name,
      client_email,
      client_phone,
      client_email_hash: emailHash,
      client_phone_hash: phoneHash,
      payid_reference,
      support_reference: supportReference,
      amount_deposit,
      amount_total_due: amount_deposit,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      dns_status: 'DENIED_DNS',
      status: 'DENIED',
      payment_status: 'AWAITING_PAYMENT',
      verification_status: 'denied'
    };

    await bookingRef.set(bookingData);

    await writeAuditLog(
      context.auth?.uid || 'anonymous',
      context.auth ? 'client' : 'system',
      'DNS_HIT',
      bookingRef.id,
      { reason: 'Matched active DNS entry during initial screening', supportReference }
    );
    await writeAuditLog(
      context.auth?.uid || 'anonymous',
      context.auth ? 'client' : 'system',
      'BOOKING_DENIED',
      bookingRef.id,
      { reason: 'DNS_HIT', supportReference }
    );

    // Structured rejection: do not reveal that a DNS register match
    // occurred, but give the customer a route to contact us for review
    // (APP 12/13). The support reference resolves to this booking doc.
    return {
      success: false,
      message:
        "We're unable to proceed with this booking. If you believe this is in error, " +
        `email support@theprivatebook.au and quote reference ${supportReference}.`,
      supportReference,
    };
  }

  const isPreviousBooker = await hasPreviousSuccessfulBooking(emailHash, phoneHash);

  const bookingData: any = {
    client_name,
    client_email,
    client_phone,
    client_email_hash: emailHash,
    client_phone_hash: phoneHash,
    payid_reference,
    amount_deposit,
    amount_total_due: amount_deposit,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    dns_status: 'CLEAR',
    status: 'PENDING',
    payment_status: 'AWAITING_PAYMENT',
    verification_status: isPreviousBooker ? 'cleared' : 'pending'
  };

  await bookingRef.set(bookingData);

  await writeAuditLog(
    context.auth?.uid || 'anonymous',
    context.auth ? 'client' : 'system',
    'DNS_CHECK',
    bookingRef.id,
    { result: 'CLEAR', isPreviousBooker }
  );

  return {
    success: true,
    bookingId: bookingRef.id,
    paymentInstructions: {
      payid_identifier: 'payments@flavrentertainers.com.au',
      amount_total_due: amount_deposit,
      payid_reference
    }
  };
});

export const confirmPayidPayment = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const adminDoc = await getDb().collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists && context.auth.token.admin !== true) {
    throw new fns.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { bookingId } = data;
  const bookingRef = getDb().collection('bookings').doc(bookingId);

  await getDb().runTransaction(async (t: FirebaseFirestore.Transaction) => {
    const doc = await t.get(bookingRef);
    if (!doc.exists) throw new fns.https.HttpsError('not-found', 'Booking not found');

    t.update(bookingRef, {
      payment_status: 'PAID',
      status: 'CONFIRMED'
    });
  });

  await writeAuditLog(context.auth.uid, 'admin', 'PAYMENT_CONFIRMED', bookingId);

  return { success: true };
});

/**
 * Migration function to convert 'approved' -> 'ACTIVE' and backfill hashes.
 * Access restricted to admins.
 */
export const runDnsMigration = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const adminDoc = await getDb().collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists && context.auth.token.admin !== true) {
    throw new fns.https.HttpsError('permission-denied', 'Admin access required');
  }

  const dnsRef = getDb().collection('dns_entries');
  const snapshot = await dnsRef.get();

  if (snapshot.empty) {
    return { message: 'No entries found.' };
  }

  let count = 0;
  const batch = getDb().batch();

  for (const doc of snapshot.docs) {
    const entry = doc.data();
    const updates: any = {};

    if (entry.status === 'approved') {
      updates.status = 'ACTIVE';
    }

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
