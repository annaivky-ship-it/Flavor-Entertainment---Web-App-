/**
 * Performer status auto-transitions on booking lifecycle events.
 *
 * Two events drive an automatic flip of `performer.status`:
 *
 *   1. Performer commits to a booking (booking moves INTO the active set):
 *      if performer.status === 'available' → flip to 'busy'.
 *
 *   2. Performer is released from a booking (booking moves OUT of the active
 *      set into a terminal state): if performer.status === 'busy' AND the
 *      performer has no OTHER active bookings → flip to 'available'.
 *
 * "Active" intentionally excludes `pending_performer_acceptance` — at that
 * stage the performer hasn't committed yet, they're still deciding. Once they
 * accept (status → `pending_vetting`) they're committed.
 *
 * The function is intentionally conservative: it only flips
 * available↔busy. It will NOT override deliberate states like 'offline',
 * 'pending_verification', or 'rejected'.
 */

import type { Firestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

export type PerformerStatusValue =
  | 'available' | 'busy' | 'offline' | 'pending_verification' | 'rejected';

export const ACTIVE_BOOKING_STATUSES = new Set([
  'pending_vetting',
  'deposit_pending',
  'pending_deposit_confirmation',
  'confirmed',
  'en_route',
  'arrived',
  'in_progress',
]);

export type StatusFlip = 'busy' | 'available' | null;

/**
 * Pure decision function — no I/O. Given before/after booking statuses,
 * the performer's current status, and a count of OTHER active bookings the
 * performer holds, returns the new performer.status to write, or null
 * for no-op.
 */
export function nextPerformerStatus(args: {
  beforeBookingStatus: string;
  afterBookingStatus: string;
  performerStatus: PerformerStatusValue;
  otherActiveBookingsCount: number;
}): StatusFlip {
  const { beforeBookingStatus, afterBookingStatus, performerStatus, otherActiveBookingsCount } = args;

  const wasActive = ACTIVE_BOOKING_STATUSES.has(beforeBookingStatus);
  const isActive = ACTIVE_BOOKING_STATUSES.has(afterBookingStatus);

  // Just committed → flip available → busy.
  if (!wasActive && isActive && performerStatus === 'available') {
    return 'busy';
  }

  // Just released, AND no other gigs holding them → flip busy → available.
  if (wasActive && !isActive && performerStatus === 'busy' && otherActiveBookingsCount === 0) {
    return 'available';
  }

  return null;
}

/**
 * I/O wrapper — reads performer doc, counts other active bookings, applies
 * the flip if any. Idempotent: a no-op flip is safe to run repeatedly.
 */
export async function syncPerformerStatusOnBookingChange(
  db: Firestore,
  bookingId: string,
  performerId: number | string,
  beforeBookingStatus: string,
  afterBookingStatus: string,
): Promise<StatusFlip> {
  if (performerId === undefined || performerId === null || performerId === '') return null;

  const performerRef = db.collection('performers').doc(String(performerId));
  const performerSnap = await performerRef.get();
  if (!performerSnap.exists) return null;
  const performer = performerSnap.data() as { status?: PerformerStatusValue } | undefined;
  const performerStatus = performer?.status;
  if (!performerStatus) return null;

  // Count other active bookings ONLY when releasing — the count query is the
  // expensive part, and we don't need it for the busy-flip path.
  let otherActiveBookingsCount = 0;
  const wasActive = ACTIVE_BOOKING_STATUSES.has(beforeBookingStatus);
  const isActive = ACTIVE_BOOKING_STATUSES.has(afterBookingStatus);
  if (wasActive && !isActive && performerStatus === 'busy') {
    const others = await db.collection('bookings')
      .where('performer_id', '==', typeof performerId === 'string' ? Number(performerId) : performerId)
      .where('status', 'in', Array.from(ACTIVE_BOOKING_STATUSES))
      .get();
    // Exclude THIS booking — its status hasn't been re-read here, but at
    // trigger time the after-write has already landed, so any 'in' query
    // would skip it on its own. Defensive filter all the same.
    otherActiveBookingsCount = others.docs.filter(d => d.id !== bookingId).length;
  }

  const flip = nextPerformerStatus({
    beforeBookingStatus,
    afterBookingStatus,
    performerStatus,
    otherActiveBookingsCount,
  });

  if (!flip) return null;

  await performerRef.update({
    status: flip,
    statusAutoUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    statusAutoUpdatedReason: flip === 'busy'
      ? `auto:booking_accepted:${bookingId}`
      : `auto:booking_released:${bookingId}`,
  });

  await db.collection('audit_logs').add({
    action: 'PERFORMER_STATUS_AUTO_FLIPPED',
    subjectType: 'performer',
    subjectId: String(performerId),
    bookingId,
    actorRole: 'system',
    meta: {
      from: performerStatus,
      to: flip,
      bookingTransition: `${beforeBookingStatus} → ${afterBookingStatus}`,
      otherActiveBookingsCount,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return flip;
}
