/**
 * Unified PayID webhook (Monoova).
 *
 * Single endpoint that handles PayID inbound payment notifications. Performs
 * BOTH the payment-confirmation flow (mark booking paid + confirmed) AND the
 * verification-signal flow (write verificationRecord for PayID name match).
 *
 * Pipeline (transactional, idempotent by transactionId):
 *
 *   1. HMAC-SHA256 signature check on raw body
 *   2. Parse payload via payments/monoova.ts:parseMonoovaPayload
 *   3. Drop unsupported event types (return 200 to acknowledge)
 *   4. Idempotency: payment_events/{transactionId} acts as the lock
 *   5. Lookup booking by `bookingReference` (FE-XXXXXX)
 *   6. Validate amount within $0.01 tolerance
 *   7. PayID name match (namesLooselyMatch) → writes verificationRecord
 *   8. Decision tree:
 *        - amount mismatch  → booking → 'payment_review', notification_outbox 'payment_review'
 *        - already paid     → ack and skip
 *        - name mismatch    → booking → 'PENDING_ADMIN_REVIEW',
 *                             manualReviewQueue entry, payment_status='paid'
 *        - happy path       → booking → 'confirmed', payment_status='paid',
 *                             notification_outbox 'payment_confirmed'
 *   9. Audit log entries for every branch
 *
 * The booking-confirmation status transition also triggers
 * onBookingCompleted in triggers/verification.ts which auto-promotes the
 * customer's trustTier when thresholds are crossed.
 *
 * Secrets: MONOOVA_WEBHOOK_SECRET, HASH_SECRET (for verificationRecord
 * subjectPhoneHash on lookup).
 *
 * Note: this webhook supersedes both the legacy payments/webhookHandler.ts
 * (us-central1 'monoovaWebhook') and the earlier verification/monoova.ts
 * (australia-southeast1 'verificationMonoovaWebhook'). Both old exports are
 * removed in functions/src/index.ts in this commit.
 */

import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { parseMonoovaPayload, verifyMonoovaSignature } from '../payments/monoova';
import { namesLooselyMatch, MONOOVA_WEBHOOK_SECRET } from '../integrations/monoova';
import { REGION, writeAudit, HASH_SECRET, hashPhone, normalizePhoneE164 } from '../utils/shared';

const getDb = () => getFirestore('default');

const SUPPORTED_EVENT_TYPES = new Set([
  'payment_received',
  'paymentreceived',
  'transaction.completed',
  'receivedpayment',
  'payid.payment.received',
]);

export const payIdWebhook = onRequest(
  {
    region: REGION,
    secrets: [MONOOVA_WEBHOOK_SECRET, HASH_SECRET],
    cors: false,
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const db = getDb();

    // --- 1. Read raw body for signature verification ---
    const rawBody =
      (req as any).rawBody?.toString?.('utf-8') ??
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const signatureHeader =
      (req.headers['x-monoova-signature'] as string) ||
      (req.headers['x-signature'] as string) ||
      (req.headers['authorization'] as string) ||
      '';

    const secret = MONOOVA_WEBHOOK_SECRET.value() || process.env.MONOOVA_WEBHOOK_SECRET;
    if (!verifyMonoovaSignature(rawBody, signatureHeader, secret)) {
      console.error('payIdWebhook: invalid signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // --- 2. Parse payload ---
    const parsed = parseMonoovaPayload(payload);
    if (!parsed) {
      await db.collection('payment_events').add({
        eventType: 'UNPARSEABLE',
        transactionId: null,
        bookingReference: null,
        amount: null,
        status: 'error',
        rawPayload: payload,
        processed: true,
        processingResult: 'Could not parse payload — missing transactionId',
        bookingId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.status(200).json({ received: true, result: 'unparseable' });
      return;
    }

    // --- 3. Filter unsupported event types ---
    if (!SUPPORTED_EVENT_TYPES.has(parsed.eventType.toLowerCase())) {
      console.log(`payIdWebhook: ignoring event type ${parsed.eventType}`);
      res.status(200).json({ received: true, result: 'ignored_event_type' });
      return;
    }

    const eventRef = db.collection('payment_events').doc(parsed.transactionId);

    try {
      const result = await db.runTransaction(async (tx) => {
        // --- 4. Idempotency lock ---
        const existing = await tx.get(eventRef);
        if (existing.exists) {
          return { status: 'already_processed', detail: 'Duplicate webhook' };
        }

        const baseEvent: Record<string, any> = {
          eventType: parsed.eventType,
          transactionId: parsed.transactionId,
          bookingReference: parsed.bookingReference,
          amount: parsed.amount,
          payerName: parsed.payerName,
          payerBSB: parsed.payerBSB,
          payerAccount: parsed.payerAccount,
          receivedAt: parsed.receivedAt,
          rawPayload: payload,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          processed: true,
          bookingId: null,
        };

        // --- 5. Lookup booking ---
        if (!parsed.bookingReference || !parsed.bookingReference.startsWith('FE-')) {
          tx.set(eventRef, {
            ...baseEvent,
            status: 'unmatched',
            processingResult: `No valid booking reference: "${parsed.bookingReference}"`,
          });
          return { status: 'unmatched', detail: 'no_reference' };
        }

        const bookingsQ = await db
          .collection('bookings')
          .where('bookingReference', '==', parsed.bookingReference)
          .limit(1)
          .get();

        if (bookingsQ.empty) {
          tx.set(eventRef, {
            ...baseEvent,
            status: 'unmatched',
            processingResult: `No booking found for reference ${parsed.bookingReference}`,
          });
          return { status: 'unmatched', detail: 'no_booking' };
        }

        const bookingDoc = bookingsQ.docs[0];
        const booking = bookingDoc.data();
        const bookingId = bookingDoc.id;
        baseEvent.bookingId = bookingId;

        // --- 6. Already-paid short-circuit ---
        if (booking.payment_status === 'paid' || booking.payment_status === 'deposit_paid') {
          tx.set(eventRef, {
            ...baseEvent,
            status: 'already_paid',
            processingResult: `Booking ${bookingId} already paid`,
          });
          return { status: 'already_paid', detail: bookingId };
        }

        // --- 7. Amount validation ---
        const expectedAmount = booking.depositAmount || booking.amount_deposit || booking.amount_total_due || 0;
        const tolerance = 0.01;
        if (Math.abs(parsed.amount - expectedAmount) > tolerance) {
          tx.set(eventRef, {
            ...baseEvent,
            status: 'amount_mismatch',
            processingResult: `Amount $${parsed.amount} != expected $${expectedAmount}`,
          });
          tx.update(bookingDoc.ref, {
            status: 'payment_review',
            payment_status: 'review',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Notify admin
          tx.set(db.collection('notification_outbox').doc(), {
            type: 'payment_review',
            bookingId,
            bookingReference: parsed.bookingReference,
            sent: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          return { status: 'amount_mismatch', detail: bookingId };
        }

        // --- 8. PayID name match (verification signal) ---
        const bookingName: string = booking.client_name || booking.fullName || '';
        const payerName = parsed.payerName || '';
        const nameMatched = !!(payerName && bookingName && namesLooselyMatch(bookingName, payerName));

        // Write verificationRecord (signal: payid_match)
        const verRecRef = db.collection('verificationRecords').doc();
        tx.set(verRecRef, {
          subjectType: 'customer',
          subjectId: booking.customerId || null,
          bookingId,
          signal: 'payid_match',
          result: nameMatched ? 'pass' : 'review',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: null,
          subjectPhoneHash: booking.client_phone
            ? hashPhone(normalizePhoneE164(booking.client_phone))
            : null,
          meta: {
            bookingName,
            payerName,
            payerBSB: parsed.payerBSB,
            payerAccount: parsed.payerAccount,
            amount: parsed.amount,
            transactionId: parsed.transactionId,
          },
        });

        // --- 9. Decide booking outcome ---
        const bookingUpdates: Record<string, any> = {
          payment_status: 'paid',
          monoovaTransactionId: parsed.transactionId,
          paymentReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
          payIdMatched: nameMatched,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (nameMatched) {
          // Trigger onVerificationRecordCreated will re-evaluate other signals
          // and lift verification_status to 'cleared' when complete. Here we
          // just promote payment status. If the booking is already past the
          // verification gate (trusted tier or pre-cleared), confirm it now.
          if (
            booking.verification_status === 'cleared' ||
            booking.trustTier === 'trusted'
          ) {
            bookingUpdates.status = 'confirmed';
            bookingUpdates.verification_status = 'cleared';
          }

          tx.set(eventRef, {
            ...baseEvent,
            status: 'matched',
            processingResult: `Payment confirmed and PayID name matched for ${bookingId}`,
          });

          tx.set(db.collection('notification_outbox').doc(), {
            type: 'payment_confirmed',
            bookingId,
            bookingReference: parsed.bookingReference,
            performerId: booking.performer_id || null,
            clientName: bookingName,
            clientPhone: booking.client_phone || booking.mobile || booking.phone || '',
            clientEmail: booking.client_email || booking.email || '',
            sent: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          // Name mismatch — payment landed but verification needs human review
          bookingUpdates.status = 'PENDING_ADMIN_REVIEW';
          bookingUpdates.verification_status = 'manual_review';

          tx.set(
            db.collection('manualReviewQueue').doc(bookingId),
            {
              bookingId,
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

          tx.set(eventRef, {
            ...baseEvent,
            status: 'name_mismatch',
            processingResult: `Payment received but PayID name "${payerName}" did not match booking name "${bookingName}"`,
          });

          tx.set(db.collection('notification_outbox').doc(), {
            type: 'payment_review',
            bookingId,
            bookingReference: parsed.bookingReference,
            sent: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        tx.update(bookingDoc.ref, bookingUpdates);

        return {
          status: nameMatched ? 'matched' : 'name_mismatch',
          detail: bookingId,
        };
      });

      // Audit log (post-transaction so we don't slow it down)
      try {
        if (result.status === 'matched') {
          await writeAudit({
            actorUid: 'system',
            actorRole: 'system',
            action: 'PAYID_DEPOSIT_CONFIRMED',
            subjectType: 'booking',
            subjectId: result.detail,
            bookingId: result.detail,
            meta: { transactionId: parsed.transactionId, amount: parsed.amount },
          });
          await writeAudit({
            actorUid: 'system',
            actorRole: 'system',
            action: 'PAYID_MATCHED',
            subjectType: 'booking',
            subjectId: result.detail,
            bookingId: result.detail,
            meta: { payerName: parsed.payerName },
          });
        } else if (result.status === 'name_mismatch') {
          await writeAudit({
            actorUid: 'system',
            actorRole: 'system',
            action: 'PAYID_MISMATCH',
            subjectType: 'booking',
            subjectId: result.detail,
            bookingId: result.detail,
            meta: { payerName: parsed.payerName },
          });
        } else if (result.status === 'amount_mismatch') {
          await writeAudit({
            actorUid: 'system',
            actorRole: 'system',
            action: 'PAYID_DEPOSIT_CONFIRMED',
            subjectType: 'booking',
            subjectId: result.detail,
            bookingId: result.detail,
            meta: { amountReceived: parsed.amount, mismatch: true },
          });
        }
      } catch (auditErr) {
        console.error('Audit log write failed (non-blocking):', auditErr);
      }

      console.log(`payIdWebhook: ${result.status} txn=${parsed.transactionId}`);
      res.status(200).json({ received: true, result: result.status });
    } catch (err: any) {
      console.error('payIdWebhook: processing error:', err);
      try {
        await eventRef.set(
          {
            eventType: parsed.eventType,
            transactionId: parsed.transactionId,
            bookingReference: parsed.bookingReference,
            amount: parsed.amount,
            status: 'error',
            rawPayload: payload,
            processed: true,
            processingResult: `Processing error: ${err.message}`,
            bookingId: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (storeErr) {
        console.error('Failed to store error event:', storeErr);
      }
      res.status(500).json({ error: 'Internal processing error' });
    }
  }
);
