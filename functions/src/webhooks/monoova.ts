/**
 * Monoova webhook handler.
 *
 * Public HTTPS endpoint that receives PayID inbound payment notifications.
 * Verifies an HMAC-SHA256 signature in the `x-monoova-signature` header
 * (computed over the raw request body using MONOOVA_WEBHOOK_SECRET).
 *
 * On a valid payload that references a known booking, this:
 *   1. Records a `payid_match` verificationRecord with pass/review based on
 *      whether the bank-supplied account name matches the booking client name.
 *   2. Updates the booking with payment_status, payIdMatched flag.
 *   3. Increments the customer's successfulBookings counter on full confirmation.
 *   4. Writes auditLog entries for the deposit and name-match outcome.
 */

import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { MONOOVA_WEBHOOK_SECRET } from '../integrations/monoova';
import { namesLooselyMatch } from '../integrations/monoova';
import { REGION, writeAudit } from '../utils/shared';

const getDb = () => getFirestore('default');

interface MonoovaWebhookBody {
  event: 'payid.payment.received' | 'penny_drop.confirmed' | string;
  reference?: string;            // matches booking.payid_reference
  amountCents?: number;
  payerName?: string;            // bank-supplied account name
  payerPayId?: string;
  txId?: string;
  receivedAt?: string;
}

function verifySignature(rawBody: string, signature: string | undefined): boolean {
  const secret = MONOOVA_WEBHOOK_SECRET.value();
  if (!secret) {
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      console.warn('MONOOVA_WEBHOOK_SECRET unset in emulator — accepting webhook.');
      return true;
    }
    return false;
  }
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // timingSafeEqual requires equal lengths
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export const monoovaWebhook = onRequest(
  {
    region: REGION,
    secrets: [MONOOVA_WEBHOOK_SECRET],
    cors: false,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const rawBody = (req as any).rawBody?.toString?.('utf-8') || JSON.stringify(req.body);
    const signature = (req.headers['x-monoova-signature'] as string) || '';

    if (!verifySignature(rawBody, signature)) {
      console.error('Invalid Monoova webhook signature');
      res.status(401).send('Invalid signature');
      return;
    }

    const body = req.body as MonoovaWebhookBody;
    const event = body.event;

    try {
      if (event === 'payid.payment.received') {
        await handlePayIdPayment(body);
      } else if (event === 'penny_drop.confirmed') {
        await handlePennyDropConfirmed(body);
      } else {
        console.warn(`Unhandled Monoova event: ${event}`);
      }
      res.status(200).json({ received: true });
    } catch (err) {
      console.error('Monoova webhook processing error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  }
);

async function handlePayIdPayment(body: MonoovaWebhookBody): Promise<void> {
  const reference = body.reference;
  if (!reference) {
    console.warn('PayID webhook missing reference');
    return;
  }

  const db = getDb();
  const bookingsQ = await db
    .collection('bookings')
    .where('payid_reference', '==', reference)
    .limit(1)
    .get();

  if (bookingsQ.empty) {
    console.warn(`No booking found for PayID reference ${reference}`);
    return;
  }

  const bookingDoc = bookingsQ.docs[0];
  const booking = bookingDoc.data();
  const bookingRef = bookingDoc.ref;

  const bookingName = booking.client_name || '';
  const payerName = body.payerName || '';
  const matched = namesLooselyMatch(bookingName, payerName);

  await db.collection('verificationRecords').add({
    subjectType: 'customer',
    subjectId: booking.customerId || null,
    bookingId: bookingDoc.id,
    signal: 'payid_match',
    result: matched ? 'pass' : 'review',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: null,
    meta: {
      bookingName,
      payerName,
      payerPayId: body.payerPayId || null,
      amountCents: body.amountCents || null,
      txId: body.txId || null,
    },
  });

  const updates: Record<string, any> = {
    payIdMatched: matched,
    payment_status: 'PAID',
    payment_received_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!matched) {
    updates.verification_status = 'manual_review';
    updates.status = 'PENDING_ADMIN_REVIEW';
    await db.collection('manualReviewQueue').doc(bookingDoc.id).set(
      {
        bookingId: bookingDoc.id,
        customerId: booking.customerId || null,
        reasons: admin.firestore.FieldValue.arrayUnion('payid_name_mismatch'),
        status: 'pending',
        queuedAt: admin.firestore.FieldValue.serverTimestamp(),
        decidedAt: null,
        decidedBy: null,
        decidedNotes: null,
      },
      { merge: true }
    );
  } else {
    if (booking.verification_status === 'pending' || booking.verification_status === 'cleared') {
      updates.verification_status = 'cleared';
      updates.status = 'CONFIRMED';
    }
  }

  await bookingRef.update(updates);

  await writeAudit({
    actorUid: 'system',
    actorRole: 'system',
    action: matched ? 'PAYID_MATCHED' : 'PAYID_MISMATCH',
    subjectType: 'booking',
    subjectId: bookingDoc.id,
    bookingId: bookingDoc.id,
    meta: { bookingName, payerName },
  });

  await writeAudit({
    actorUid: 'system',
    actorRole: 'system',
    action: 'PAYID_DEPOSIT_CONFIRMED',
    subjectType: 'booking',
    subjectId: bookingDoc.id,
    bookingId: bookingDoc.id,
    meta: { amountCents: body.amountCents, txId: body.txId },
  });
}

async function handlePennyDropConfirmed(body: MonoovaWebhookBody): Promise<void> {
  // The performer's local penny-drop confirmation step (see verification/performer.ts)
  // is what marks the drop confirmed in our DB. This handler only logs the
  // callback for audit purposes — Monoova confirms the inbound transfer
  // landed, but we already trust the performer-supplied code.
  await writeAudit({
    actorUid: 'system',
    actorRole: 'system',
    action: 'PERFORMER_PENNY_DROP_CONFIRMED',
    subjectType: 'system',
    meta: { txId: body.txId, reference: body.reference },
  });
}
