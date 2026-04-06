"use strict";
/**
 * Monoova webhook handler for PayID payment confirmation.
 *
 * Flow:
 * 1. Receive webhook POST
 * 2. Verify signature (if secret configured)
 * 3. Parse payload to extract transaction data
 * 4. Store raw event in payment_events (idempotent by transactionId)
 * 5. Match booking by bookingReference
 * 6. Verify amount matches depositAmount
 * 7. Verify booking is PENDING_PAYMENT (deposit_pending)
 * 8. Mark booking as confirmed + paid
 * 9. Create notification_outbox job
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMonoovaWebhook = handleMonoovaWebhook;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const monoova_1 = require("./monoova");
const getDb = () => (0, firestore_1.getFirestore)('default');
const SUPPORTED_EVENT_TYPES = [
    'payment_received',
    'PaymentReceived',
    'PAYMENT_RECEIVED',
    'transaction.completed',
    'receivedPayment',
];
async function handleMonoovaWebhook(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const db = getDb();
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    // Step 1: Verify signature
    const signatureHeader = req.headers['x-monoova-signature'] || req.headers['x-signature'] || req.headers['authorization'];
    const secret = process.env.MONOOVA_WEBHOOK_SECRET;
    if (!(0, monoova_1.verifyMonoovaSignature)(rawBody, signatureHeader, secret)) {
        console.error('Monoova webhook: invalid signature');
        res.status(403).json({ error: 'Invalid signature' });
        return;
    }
    // Step 2: Parse payload
    const parsed = (0, monoova_1.parseMonoovaPayload)(payload);
    if (!parsed) {
        console.error('Monoova webhook: could not parse payload', payload);
        // Store unparseable event for manual review
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
    // Step 3: Check if this is a supported event type
    const isPaymentEvent = SUPPORTED_EVENT_TYPES.some((t) => parsed.eventType.toLowerCase() === t.toLowerCase());
    if (!isPaymentEvent) {
        console.log(`Monoova webhook: ignoring unsupported event type: ${parsed.eventType}`);
        res.status(200).json({ received: true, result: 'ignored_event_type' });
        return;
    }
    // Step 4: Idempotency — check if we already processed this transaction
    const eventRef = db.collection('payment_events').doc(parsed.transactionId);
    try {
        const result = await db.runTransaction(async (transaction) => {
            const existingEvent = await transaction.get(eventRef);
            if (existingEvent.exists) {
                return { status: 'already_processed', processingResult: 'Duplicate webhook — already processed' };
            }
            // Step 5: Store the event record FIRST (before processing)
            const eventData = {
                eventType: parsed.eventType,
                transactionId: parsed.transactionId,
                bookingReference: parsed.bookingReference,
                amount: parsed.amount,
                status: 'received',
                rawPayload: payload,
                processed: false,
                processingResult: null,
                bookingId: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                processedAt: null,
                payerName: parsed.payerName,
                payerBSB: parsed.payerBSB,
                payerAccount: parsed.payerAccount,
                receivedAt: parsed.receivedAt,
            };
            // Step 6: Find the booking by reference
            if (!parsed.bookingReference || !parsed.bookingReference.startsWith('FE-')) {
                eventData.status = 'unmatched';
                eventData.processed = true;
                eventData.processingResult = `No valid booking reference found: "${parsed.bookingReference}"`;
                eventData.processedAt = admin.firestore.FieldValue.serverTimestamp();
                transaction.set(eventRef, eventData);
                return { status: 'unmatched', processingResult: eventData.processingResult };
            }
            const bookingsQuery = await db.collection('bookings')
                .where('bookingReference', '==', parsed.bookingReference)
                .limit(1)
                .get();
            if (bookingsQuery.empty) {
                eventData.status = 'unmatched';
                eventData.processed = true;
                eventData.processingResult = `No booking found for reference: ${parsed.bookingReference}`;
                eventData.processedAt = admin.firestore.FieldValue.serverTimestamp();
                transaction.set(eventRef, eventData);
                return { status: 'unmatched', processingResult: eventData.processingResult };
            }
            const bookingDoc = bookingsQuery.docs[0];
            const booking = bookingDoc.data();
            const bookingId = bookingDoc.id;
            eventData.bookingId = bookingId;
            // Step 7: Check booking is in deposit_pending status
            if (booking.status !== 'deposit_pending') {
                if (booking.payment_status === 'paid' || booking.payment_status === 'deposit_paid') {
                    eventData.status = 'already_paid';
                    eventData.processed = true;
                    eventData.processingResult = `Booking ${bookingId} already paid (status: ${booking.status}, payment: ${booking.payment_status})`;
                }
                else {
                    eventData.status = 'booking_not_pending';
                    eventData.processed = true;
                    eventData.processingResult = `Booking ${bookingId} not in deposit_pending state (current: ${booking.status})`;
                }
                eventData.processedAt = admin.firestore.FieldValue.serverTimestamp();
                transaction.set(eventRef, eventData);
                return { status: eventData.status, processingResult: eventData.processingResult };
            }
            // Step 8: Verify amount matches
            const expectedAmount = booking.depositAmount || booking.amount_deposit || 0;
            const amountTolerance = 0.01; // Allow 1 cent tolerance for rounding
            if (Math.abs(parsed.amount - expectedAmount) > amountTolerance) {
                eventData.status = 'amount_mismatch';
                eventData.processed = true;
                eventData.processingResult = `Amount mismatch: received $${parsed.amount}, expected $${expectedAmount} for booking ${bookingId}`;
                eventData.processedAt = admin.firestore.FieldValue.serverTimestamp();
                transaction.set(eventRef, eventData);
                // Put booking into review state so admin can manually handle
                transaction.update(bookingDoc.ref, {
                    status: 'payment_review',
                    payment_status: 'review',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return { status: 'amount_mismatch', processingResult: eventData.processingResult };
            }
            // Step 9: SUCCESS — Mark booking as confirmed + paid
            transaction.update(bookingDoc.ref, {
                status: 'confirmed',
                payment_status: 'paid',
                monoovaTransactionId: parsed.transactionId,
                paymentReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            eventData.status = 'matched';
            eventData.processed = true;
            eventData.processingResult = `Payment confirmed for booking ${bookingId}`;
            eventData.processedAt = admin.firestore.FieldValue.serverTimestamp();
            transaction.set(eventRef, eventData);
            // Step 10: Create notification outbox job
            const notifRef = db.collection('notification_outbox').doc();
            transaction.set(notifRef, {
                type: 'payment_confirmed',
                bookingId,
                bookingReference: parsed.bookingReference,
                performerId: booking.performer_id || null,
                clientName: booking.client_name || booking.fullName || '',
                clientPhone: booking.client_phone || booking.mobile || booking.phone || '',
                clientEmail: booking.client_email || booking.email || '',
                sent: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { status: 'matched', processingResult: `Payment confirmed for booking ${bookingId}` };
        });
        console.log(`Monoova webhook processed: txn=${parsed.transactionId}, result=${result.status}`);
        res.status(200).json({ received: true, result: result.status });
    }
    catch (error) {
        console.error('Monoova webhook processing error:', error);
        // Store error event
        try {
            await eventRef.set({
                eventType: parsed.eventType,
                transactionId: parsed.transactionId,
                bookingReference: parsed.bookingReference,
                amount: parsed.amount,
                status: 'error',
                rawPayload: payload,
                processed: true,
                processingResult: `Processing error: ${error.message}`,
                bookingId: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        catch (storeErr) {
            console.error('Failed to store error event:', storeErr);
        }
        res.status(500).json({ error: 'Internal processing error' });
    }
}
//# sourceMappingURL=webhookHandler.js.map