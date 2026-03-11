import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { createKycSession } from '../didit';

const getDb = () => getFirestore('default');
const fns = functions as any;

const PEPPER = process.env.DNS_HASH_PEPPER;
if (!PEPPER) {
  throw new Error('FATAL: DNS_HASH_PEPPER environment variable is required but not set.');
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
  return crypto.createHash('sha256').update(value + PEPPER).digest('hex');
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
    .where('kyc_status', 'in', ['PASS', 'BYPASSED'])
    .limit(1)
    .get();

  if (!emailQuery.empty) return true;

  const phoneQuery = await getDb().collection('bookings')
    .where('client_phone_hash', '==', phoneHash)
    .where('kyc_status', 'in', ['PASS', 'BYPASSED'])
    .limit(1)
    .get();

  return !phoneQuery.empty;
}

// --- Cloud Functions ---

export const createBookingAndScreenDns = fns.https.onCall(async (data: any, context: any) => {
  const { client_email, client_phone, client_name, amount_deposit, amount_kyc_fee } = data;

  if (!client_email || !client_phone || !client_name) {
    throw new fns.https.HttpsError('invalid-argument', 'Missing required client details.');
  }

  const emailHash = sha256(normalizeEmail(client_email));
  const phoneHash = sha256(normalizePhoneToE164(client_phone));

  const isBlocked = await dnsLookup(emailHash, phoneHash);

  const bookingRef = getDb().collection('bookings').doc();
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
      dns_status: 'DENIED_DNS',
      status: 'DENIED',
      payment_status: 'AWAITING_PAYMENT', // Never shown
      kyc_status: 'NOT_STARTED'
    };

    await bookingRef.set(bookingData);

    await writeAuditLog(
      context.auth?.uid || 'anonymous',
      context.auth ? 'client' : 'system',
      'DNS_HIT',
      bookingRef.id,
      { reason: 'Matched active DNS entry during initial screening' }
    );
    await writeAuditLog(
      context.auth?.uid || 'anonymous',
      context.auth ? 'client' : 'system',
      'BOOKING_DENIED',
      bookingRef.id,
      { reason: 'DNS_HIT' }
    );

    return {
      success: false,
      message: 'We can’t proceed with this booking.'
    };
  }

  // Not blocked, check if previous booker
  const isPreviousBooker = await hasPreviousSuccessfulBooking(emailHash, phoneHash);

  const final_amount_kyc_fee = isPreviousBooker ? 0 : amount_kyc_fee;
  const final_kyc_status = isPreviousBooker ? 'BYPASSED' : 'NOT_STARTED';
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
    dns_status: 'CLEAR',
    status: 'PENDING',
    payment_status: 'AWAITING_PAYMENT',
    kyc_status: final_kyc_status
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
  const adminDoc = await getDb().collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists && context.auth.token.admin !== true) {
    throw new fns.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { bookingId } = data;
  const bookingRef = getDb().collection('bookings').doc(bookingId);

  let shouldSkipKyc = false;

  await getDb().runTransaction(async (t: FirebaseFirestore.Transaction) => {
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
    return { success: true, kyc_required: false };
  } else {
    // Trigger Didit KYC session
    try {
      const session = await createKycSession(bookingId);
      await writeAuditLog('system', 'system', 'KYC_STARTED', bookingId, {
        provider: 'didit',
        session_id: session?.session_id || null
      });
      return {
        success: true,
        kyc_required: true,
        verification_url: session?.verification_url || null
      };
    } catch (error: any) {
      console.error('KYC session creation failed:', error);
      await writeAuditLog('system', 'system', 'KYC_SESSION_ERROR', bookingId, {
        error: error.message
      });
      return {
        success: true,
        kyc_required: true,
        kyc_error: 'Failed to create verification session. Admin will follow up.'
      };
    }
  }
});

export const handleKycWebhookOrResult = fns.https.onCall(async (data: any, context: any) => {
  // In reality, this might be an HTTP webhook from a KYC provider
  // For this example, we'll assume it's an admin or system call
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { bookingId, kycResult, providerRef } = data; // kycResult: 'PASS' | 'FAIL'

  const bookingRef = getDb().collection('bookings').doc(bookingId);
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

/**
 * Migration function to convert 'approved' -> 'ACTIVE' and backfill hashes.
 * Access restricted to admins.
 */
export const runDnsMigration = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Verify Admin
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

