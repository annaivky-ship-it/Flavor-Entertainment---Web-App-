/**
 * PII retention triggers.
 *
 * Scheduled functions that purge personal information once it is no longer
 * required, in line with Privacy Act 1988 (Cth) APP 11.2 and the retention
 * periods published in the customer-facing Privacy Policy.
 *
 * Defaults to **dry-run** — set PII_RETENTION_ENFORCE=true in the function
 * environment to actually delete. Dry-runs still write `pii_retention_log`
 * entries so admins can see what would be purged.
 *
 * Retention rules implemented here:
 *   - bookingPII docs older than 7 years (by event date)        → delete
 *   - bookingPII docs from cancelled bookings older than 90 days → delete
 *   - faceEmbeddings older than 12 months                        → delete
 *   - otpAttempts older than 24 hours                            → delete
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { REGION, writeAudit } from '../utils/shared';

const getDb = () => getFirestore('default');

const SEVEN_YEARS_MS = 7 * 365 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const BATCH_SIZE = 100;

function isEnforced(): boolean {
  return process.env.PII_RETENTION_ENFORCE === 'true';
}

async function logRetention(action: string, count: number, details: Record<string, any> = {}) {
  const db = getDb();
  await db.collection('pii_retention_log').add({
    action,
    count,
    enforced: isEnforced(),
    ranAt: admin.firestore.FieldValue.serverTimestamp(),
    details,
  });
  // Also push to the main audit trail for admin visibility.
  await writeAudit({
    actorUid: 'system',
    actorRole: 'system',
    action: `PII_RETENTION_${action.toUpperCase()}`,
    subjectType: 'system',
    subjectId: 'pii_retention',
    meta: { count, enforced: isEnforced(), ...details },
  }).catch(() => { /* best-effort */ });
}

async function deleteBatch(refs: FirebaseFirestore.DocumentReference[]): Promise<void> {
  if (refs.length === 0) return;
  if (!isEnforced()) return; // dry-run
  const db = getDb();
  const batch = db.batch();
  for (const ref of refs) batch.delete(ref);
  await batch.commit();
}

// --- 1. Purge expired bookingPII documents ---

export const pruneBookingPII = onSchedule(
  { region: REGION, schedule: 'every day 03:00', timeZone: 'Australia/Perth' },
  async () => {
    const db = getDb();
    const now = Date.now();
    const sevenYearCutoff = new Date(now - SEVEN_YEARS_MS).toISOString().slice(0, 10);
    const ninetyDayCutoff = admin.firestore.Timestamp.fromMillis(now - NINETY_DAYS_MS);

    // 7-year purge: bookingPII docs whose linked booking's event_date is older
    // than 7y. We read the booking to fetch event_date — bookingPII does not
    // duplicate it. Bound the work per run to avoid runaway costs.
    const piiCandidates = await db.collection('bookingPII').limit(BATCH_SIZE).get();
    const toDeleteOld: FirebaseFirestore.DocumentReference[] = [];
    const toDeleteCancelled: FirebaseFirestore.DocumentReference[] = [];

    for (const piiDoc of piiCandidates.docs) {
      const bookingId = piiDoc.id;
      const bookingSnap = await db.collection('bookings').doc(bookingId).get();
      if (!bookingSnap.exists) {
        // Orphan: parent booking gone — safe to purge.
        toDeleteOld.push(piiDoc.ref);
        continue;
      }
      const booking = bookingSnap.data()!;
      const eventDate: string | undefined = booking.event_date;
      const status: string = (booking.status || '').toLowerCase();
      const cancelledAt = booking.cancelled_at;

      if (eventDate && eventDate < sevenYearCutoff) {
        toDeleteOld.push(piiDoc.ref);
        continue;
      }

      if (status === 'cancelled' && cancelledAt) {
        const cancelledTs = typeof cancelledAt === 'string'
          ? admin.firestore.Timestamp.fromDate(new Date(cancelledAt))
          : (cancelledAt as admin.firestore.Timestamp);
        if (cancelledTs.toMillis() < ninetyDayCutoff.toMillis()) {
          toDeleteCancelled.push(piiDoc.ref);
        }
      }
    }

    await deleteBatch(toDeleteOld);
    await deleteBatch(toDeleteCancelled);
    await logRetention('bookingPII', toDeleteOld.length + toDeleteCancelled.length, {
      sevenYear: toDeleteOld.length,
      cancelled90d: toDeleteCancelled.length,
    });
  }
);

// --- 2. Purge expired face embeddings ---

export const pruneFaceEmbeddings = onSchedule(
  { region: REGION, schedule: 'every day 03:15', timeZone: 'Australia/Perth' },
  async () => {
    const db = getDb();
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - TWELVE_MONTHS_MS);
    const stale = await db
      .collection('faceEmbeddings')
      .where('capturedAt', '<', cutoff)
      .limit(BATCH_SIZE)
      .get();

    const refs = stale.docs.map(d => d.ref);
    await deleteBatch(refs);
    await logRetention('faceEmbeddings', refs.length, { cutoff: cutoff.toDate().toISOString() });
  }
);

// --- 3. Purge consumed / expired OTP attempts ---

export const pruneOtpAttempts = onSchedule(
  { region: REGION, schedule: 'every day 03:30', timeZone: 'Australia/Perth' },
  async () => {
    const db = getDb();
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - ONE_DAY_MS);
    const stale = await db
      .collection('otpAttempts')
      .where('createdAt', '<', cutoff)
      .limit(BATCH_SIZE * 5)
      .get();

    const refs = stale.docs.map(d => d.ref);
    await deleteBatch(refs);
    await logRetention('otpAttempts', refs.length, { cutoff: cutoff.toDate().toISOString() });
  }
);
