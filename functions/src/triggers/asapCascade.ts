/**
 * Auto-cascade for stale ASAP bookings.
 *
 * When a booking is created with `is_asap: true` and the performer doesn't
 * accept within ASAP_CASCADE_TIMEOUT_MINUTES, this job:
 *   - sets status = 'asap_cascaded' (terminal for that performer leg)
 *   - sets cancellation_reason = 'asap_no_performer_response'
 *   - releases the slot lock (no time conflict was ever recorded but be safe)
 *   - enqueues a notification_outbox entry so admin + client are alerted and
 *     admin can manually pick another performer
 *
 * The function is idempotent — re-running on the same booking is a no-op
 * because the status guard rejects anything not still in
 * pending_performer_acceptance.
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const getDb = () => getFirestore('default');

export const ASAP_CASCADE_TIMEOUT_MINUTES = 10;

export async function cascadeStaleAsapBookings(now: Date = new Date()): Promise<number> {
  const db = getDb();
  const cutoff = admin.firestore.Timestamp.fromDate(
    new Date(now.getTime() - ASAP_CASCADE_TIMEOUT_MINUTES * 60 * 1000)
  );

  const stale = await db.collection('bookings')
    .where('is_asap', '==', true)
    .where('status', '==', 'pending_performer_acceptance')
    .where('created_at', '<=', cutoff)
    .get();

  if (stale.empty) return 0;

  let cascadedCount = 0;
  const batchSize = 500;
  let batch = db.batch();
  let batchOps = 0;

  for (const bookingDoc of stale.docs) {
    const booking = bookingDoc.data();

    batch.update(bookingDoc.ref, {
      status: 'asap_cascaded',
      cancellation_reason: 'asap_no_performer_response',
      cancelled_at: admin.firestore.FieldValue.serverTimestamp(),
      cancelled_by: 'system',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (booking.slotLock) {
      const slotRef = db.collection('booking_slots').doc(booking.slotLock);
      batch.delete(slotRef);
    }

    const notifRef = db.collection('notification_outbox').doc();
    batch.set(notifRef, {
      type: 'asap_cascaded',
      bookingId: bookingDoc.id,
      bookingReference: booking.bookingReference || '',
      performerId: booking.performer_id || null,
      performerName: booking.performer?.name || '',
      clientName: booking.client_name || booking.fullName || '',
      clientPhone: booking.client_phone || booking.mobile || booking.phone || '',
      clientEmail: booking.client_email || booking.email || '',
      eventTime: booking.event_time || '',
      eventAddress: booking.event_address || '',
      sent: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const auditRef = db.collection('audit_logs').doc();
    batch.set(auditRef, {
      action: 'ASAP_BOOKING_CASCADED',
      subjectType: 'booking',
      subjectId: bookingDoc.id,
      bookingId: bookingDoc.id,
      actorRole: 'system',
      meta: {
        performerId: booking.performer_id,
        timeoutMinutes: ASAP_CASCADE_TIMEOUT_MINUTES,
        bookingCreatedAt: booking.created_at?.toDate?.()?.toISOString?.() ?? null,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    cascadedCount++;
    batchOps += 3;

    if (batchOps >= batchSize - 3) {
      await batch.commit();
      batch = db.batch();
      batchOps = 0;
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  console.log(`ASAP cascade: ${cascadedCount} stale bookings auto-declined.`);
  return cascadedCount;
}
