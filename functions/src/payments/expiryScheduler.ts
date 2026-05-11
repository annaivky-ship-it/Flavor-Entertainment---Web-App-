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

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveBookingPII } from '../booking/pii';

const getDb = () => getFirestore('default');

export async function expireUnpaidBookings(): Promise<number> {
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

    // Resolve PII from the appropriate source (parent doc for legacy
    // bookings, /bookingPII for split bookings).
    const pii = await resolveBookingPII(bookingDoc.id, booking);

    // Create notification outbox for expiry
    const notifRef = db.collection('notification_outbox').doc();
    batch.set(notifRef, {
      type: 'booking_expired',
      bookingId: bookingDoc.id,
      bookingReference: booking.bookingReference || '',
      performerId: booking.performer_id || null,
      clientName: pii.client_name,
      clientPhone: pii.client_phone,
      clientEmail: pii.client_email,
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
