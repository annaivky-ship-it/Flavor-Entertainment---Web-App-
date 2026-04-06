"use strict";
/**
 * Scheduled job to expire unpaid bookings.
 *
 * Finds bookings where:
 * - status = deposit_pending
 * - payment_status = unpaid
 * - expiresAt is in the past
 *
 * Sets status = expired, creates notification outbox job.
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
exports.expireUnpaidBookings = expireUnpaidBookings;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const getDb = () => (0, firestore_1.getFirestore)('default');
async function expireUnpaidBookings() {
    const db = getDb();
    const now = admin.firestore.Timestamp.now();
    const expiredQuery = await db.collection('bookings')
        .where('status', '==', 'deposit_pending')
        .where('expiresAt', '<=', now)
        .get();
    if (expiredQuery.empty) {
        console.log('No expired bookings found.');
        return 0;
    }
    let expiredCount = 0;
    // Process in batches of 500 (Firestore batch limit)
    const batchSize = 500;
    let batch = db.batch();
    let batchCount = 0;
    for (const bookingDoc of expiredQuery.docs) {
        const booking = bookingDoc.data();
        // Double-check: don't expire if already paid
        if (booking.payment_status === 'paid' || booking.payment_status === 'deposit_paid') {
            console.log(`Skipping booking ${bookingDoc.id} — already paid despite deposit_pending status`);
            continue;
        }
        batch.update(bookingDoc.ref, {
            status: 'expired',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Release the slot lock if one exists
        if (booking.slotLock) {
            const slotRef = db.collection('booking_slots').doc(booking.slotLock);
            batch.delete(slotRef);
        }
        // Create notification outbox for expiry
        const notifRef = db.collection('notification_outbox').doc();
        batch.set(notifRef, {
            type: 'booking_expired',
            bookingId: bookingDoc.id,
            bookingReference: booking.bookingReference || '',
            performerId: booking.performer_id || null,
            clientName: booking.client_name || booking.fullName || '',
            clientPhone: booking.client_phone || booking.mobile || booking.phone || '',
            clientEmail: booking.client_email || booking.email || '',
            sent: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        expiredCount++;
        batchCount += 2; // 2 operations per booking (update + notif create)
        if (batchCount >= batchSize - 2) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
        }
    }
    if (batchCount > 0) {
        await batch.commit();
    }
    console.log(`Expired ${expiredCount} unpaid bookings.`);
    return expiredCount;
}
//# sourceMappingURL=expiryScheduler.js.map