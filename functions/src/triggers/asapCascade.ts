/**
 * Auto-cascade for stale ASAP bookings.
 *
 * When a booking is created with `is_asap: true` and the performer doesn't
 * accept within ASAP_CASCADE_TIMEOUT_MINUTES, this job tries to reassign to
 * a backup performer. If no candidate is available — or after
 * ASAP_MAX_REASSIGNMENT_ATTEMPTS retries — it falls through to the terminal
 * cascade behaviour (status='asap_cascaded', notify admin to manually
 * reassign).
 *
 * Reassignment criteria (a candidate must satisfy ALL):
 *   - p.id !== current performer_id
 *   - p.id NOT IN asap_attempted_performer_ids
 *   - p.status === 'available'
 *   - p.accepts_asap !== false (undefined treated as opted-in)
 *   - p.service_ids intersects booking.services_requested (so the booked
 *     services can actually be delivered)
 *
 * Terminal cascade (when no candidate or attempts exhausted):
 *   - sets status='asap_cascaded'
 *   - releases the slot lock
 *   - enqueues notification_outbox{type:'asap_cascaded'} so admin + client
 *     are alerted and admin can pick another performer manually
 *
 * The function is idempotent — re-running on the same booking is safe
 * because the status guard rejects anything not still in
 * pending_performer_acceptance.
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const getDb = () => getFirestore('default');

export const ASAP_CASCADE_TIMEOUT_MINUTES = 10;
export const ASAP_MAX_REASSIGNMENT_ATTEMPTS = 2;

interface PerformerCandidate {
  id: number;
  name: string;
  status: string;
  accepts_asap?: boolean;
  service_ids?: string[];
}

export function pickReassignmentCandidate(
  performers: PerformerCandidate[],
  currentPerformerId: number,
  attemptedIds: number[],
  servicesRequested: string[],
): PerformerCandidate | null {
  const tried = new Set([currentPerformerId, ...attemptedIds]);
  const requested = new Set(servicesRequested || []);

  for (const p of performers) {
    if (tried.has(p.id)) continue;
    if (p.status !== 'available') continue;
    if (p.accepts_asap === false) continue;
    const offerings = p.service_ids || [];
    if (requested.size > 0 && !offerings.some(s => requested.has(s))) continue;
    return p;
  }
  return null;
}

export async function cascadeStaleAsapBookings(now: Date = new Date()): Promise<{ reassigned: number; cascaded: number }> {
  const db = getDb();
  const cutoff = admin.firestore.Timestamp.fromDate(
    new Date(now.getTime() - ASAP_CASCADE_TIMEOUT_MINUTES * 60 * 1000)
  );

  const stale = await db.collection('bookings')
    .where('is_asap', '==', true)
    .where('status', '==', 'pending_performer_acceptance')
    .where('created_at', '<=', cutoff)
    .get();

  if (stale.empty) return { reassigned: 0, cascaded: 0 };

  // Pull performers once and reuse across the batch — most cascades pick the
  // same active pool. Still acceptable up to a few hundred performers.
  const performersSnap = await db.collection('performers').get();
  const performers: PerformerCandidate[] = performersSnap.docs.map(d => {
    const data = d.data() as any;
    return {
      id: typeof data.id === 'number' ? data.id : Number(d.id),
      name: data.name,
      status: data.status,
      accepts_asap: data.accepts_asap,
      service_ids: data.service_ids,
    };
  });

  let reassignedCount = 0;
  let cascadedCount = 0;
  const batchSize = 500;
  let batch = db.batch();
  let batchOps = 0;

  const flushIfNeeded = async (cost: number) => {
    if (batchOps + cost >= batchSize) {
      await batch.commit();
      batch = db.batch();
      batchOps = 0;
    }
  };

  for (const bookingDoc of stale.docs) {
    const booking = bookingDoc.data();
    const attempted: number[] = Array.isArray(booking.asap_attempted_performer_ids)
      ? booking.asap_attempted_performer_ids
      : [];
    const currentPerformerId: number = booking.performer_id;

    const candidate = attempted.length < ASAP_MAX_REASSIGNMENT_ATTEMPTS
      ? pickReassignmentCandidate(performers, currentPerformerId, attempted, booking.services_requested || [])
      : null;

    if (candidate) {
      // Reassignment branch — restart the timer for the new performer.
      await flushIfNeeded(3);
      batch.update(bookingDoc.ref, {
        performer_id: candidate.id,
        performer: { id: candidate.id, name: candidate.name },
        performer_reassigned_from_id: currentPerformerId,
        asap_attempted_performer_ids: [...attempted, currentPerformerId],
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const notifRef = db.collection('notification_outbox').doc();
      batch.set(notifRef, {
        type: 'asap_reassigned',
        bookingId: bookingDoc.id,
        bookingReference: booking.bookingReference || '',
        performerId: candidate.id,
        performerName: candidate.name,
        previousPerformerId: currentPerformerId,
        previousPerformerName: booking.performer?.name || '',
        clientName: booking.client_name || booking.fullName || '',
        clientPhone: booking.client_phone || booking.mobile || booking.phone || '',
        eventTime: booking.event_time || '',
        eventAddress: booking.event_address || '',
        sent: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const auditRef = db.collection('audit_logs').doc();
      batch.set(auditRef, {
        action: 'ASAP_BOOKING_REASSIGNED',
        subjectType: 'booking',
        subjectId: bookingDoc.id,
        bookingId: bookingDoc.id,
        actorRole: 'system',
        meta: {
          fromPerformerId: currentPerformerId,
          toPerformerId: candidate.id,
          attemptNumber: attempted.length + 1,
          attemptCap: ASAP_MAX_REASSIGNMENT_ATTEMPTS,
          timeoutMinutes: ASAP_CASCADE_TIMEOUT_MINUTES,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      batchOps += 3;
      reassignedCount++;
      continue;
    }

    // Terminal cascade — no candidate available or attempts exhausted.
    await flushIfNeeded(booking.slotLock ? 4 : 3);
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
      batchOps++;
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
      attemptedPerformerIds: [...attempted, currentPerformerId],
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
        attemptedPerformerIds: [...attempted, currentPerformerId],
        attemptCap: ASAP_MAX_REASSIGNMENT_ATTEMPTS,
        timeoutMinutes: ASAP_CASCADE_TIMEOUT_MINUTES,
        bookingCreatedAt: booking.created_at?.toDate?.()?.toISOString?.() ?? null,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    batchOps += 3;
    cascadedCount++;
  }

  if (batchOps > 0) await batch.commit();

  console.log(`ASAP cascade: ${reassignedCount} reassigned, ${cascadedCount} terminal-cascaded.`);
  return { reassigned: reassignedCount, cascaded: cascadedCount };
}
