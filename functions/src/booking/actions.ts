/**
 * Booking lifecycle callables.
 *
 * Replaces the previous client-side `updateDoc(bookings/...)` pattern where
 * the browser wrote directly to Firestore. With `firestore.rules` locked to
 * `update: false` on /bookings, every state transition must go through one
 * of these callables so the server can enforce role + transition validity.
 *
 * Region: us-central1 (matches the rest of the v1 callables in index.ts).
 * App Check is gated via APP_CHECK_REQUIRED to align rollout.
 *
 * Callables:
 *   - clientCancelBooking({ bookingId, reason })
 *   - performerDecideBooking({ bookingId, decision, etaMinutes? })
 *   - performerUpdateEta({ bookingId, etaMinutes })
 *   - performerUpdateLiveStatus({ bookingId, status })   // en_route|arrived|in_progress|completed
 *   - adminUpdateBookingStatus({ bookingId, status, updates? })
 *   - adminCancelBooking({ bookingId, reason })
 *   - adminReassignPerformer({ bookingId, newPerformerId })
 *
 *   - adminUpdatePerformer({ performerId, updates })
 *   - adminCreatePerformer({ performer })
 *   - adminSetPerformerStatus({ performerId, status })
 *   - adminSetPerformerAcceptsAsap({ performerId, acceptsAsap })
 *
 *   - adminCreateDoNotServeEntry({ ...entry })   // legacy do_not_serve collection
 *   - adminUpdateDoNotServeStatus({ entryId, status })
 *
 *   - sendBookingMessage({ bookingId, message, recipientRole })
 *   - markCommunicationRead({ messageId })
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const fns = functions as any;
const getDb = () => getFirestore('default');

const APP_CHECK_REQUIRED = process.env.APP_CHECK_REQUIRED === 'true';

function requireAppCheckV1(context: any) {
  if (!APP_CHECK_REQUIRED) return;
  if (!context.app) {
    throw new fns.https.HttpsError('failed-precondition', 'App Check token missing or invalid.');
  }
}

function requireAuth(context: any): { uid: string; token: any } {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  return context.auth;
}

async function isAdminUid(uid: string, token?: any): Promise<boolean> {
  if (token?.admin === true) return true;
  const doc = await getDb().collection('admins').doc(uid).get();
  return doc.exists;
}

async function requireAdminCtx(context: any): Promise<{ uid: string; token: any }> {
  requireAppCheckV1(context);
  const auth = requireAuth(context);
  if (!(await isAdminUid(auth.uid, auth.token))) {
    throw new fns.https.HttpsError('permission-denied', 'Admin access required.');
  }
  return auth;
}

async function resolvePerformerIdFromAuth(uid: string, token?: any): Promise<string | null> {
  if (token?.role === 'performer' && token?.performerId != null) {
    return String(token.performerId);
  }
  const doc = await getDb().collection('performers_auth').doc(uid).get();
  if (!doc.exists) return null;
  const data = doc.data() || {};
  if (data.performerId != null) return String(data.performerId);
  return null;
}

// --- Audit helper ---
async function writeAudit(actor: { uid: string; role: 'client' | 'performer' | 'admin' | 'system' },
                          action: string, bookingId: string, details: any = {}) {
  await getDb().collection('audit_logs').add({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    actorUid: actor.uid,
    actorRole: actor.role,
    action,
    bookingId,
    details,
  });
}

// --- Status-machine guards ---
const TERMINAL_BOOKING_STATUSES = new Set([
  'cancelled', 'CANCELLED',
  'rejected', 'DECLINED',
  'completed', 'COMPLETED',
  'expired',
  'DENIED',
]);

const PERFORMER_LIVE_STATUSES = new Set([
  'en_route', 'arrived', 'in_progress', 'completed',
]);

const ADMIN_ALLOWED_TARGETS = new Set([
  'pending_performer_acceptance', 'pending_vetting',
  'deposit_pending', 'pending_deposit_confirmation',
  'confirmed', 'CONFIRMED',
  'en_route', 'arrived', 'in_progress', 'completed',
  'cancelled', 'rejected', 'expired',
  'payment_review', 'asap_cascaded',
  'PENDING_ADMIN_REVIEW', 'DENIED',
]);

// ============================================================================
// CLIENT CALLABLES
// ============================================================================

export const clientCancelBooking = fns.https.onCall(async (data: any, context: any) => {
  requireAppCheckV1(context);
  const auth = requireAuth(context);

  const bookingId = String(data?.bookingId || '').trim();
  const reason = String(data?.reason || '').slice(0, 500);
  if (!bookingId) throw new fns.https.HttpsError('invalid-argument', 'bookingId required.');

  const db = getDb();
  const ref = db.collection('bookings').doc(bookingId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new fns.https.HttpsError('not-found', 'Booking not found.');
    const b = snap.data()!;
    if (b.client_uid !== auth.uid) {
      throw new fns.https.HttpsError('permission-denied', 'Not your booking.');
    }
    if (TERMINAL_BOOKING_STATUSES.has(b.status)) {
      throw new fns.https.HttpsError('failed-precondition', `Cannot cancel a booking in status ${b.status}.`);
    }
    tx.update(ref, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason || null,
      cancelled_by: 'client',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await writeAudit({ uid: auth.uid, role: 'client' }, 'BOOKING_CANCELLED', bookingId, { reason });
  return { success: true };
});

// ============================================================================
// PERFORMER CALLABLES
// ============================================================================

export const performerDecideBooking = fns.https.onCall(async (data: any, context: any) => {
  requireAppCheckV1(context);
  const auth = requireAuth(context);

  const bookingId = String(data?.bookingId || '').trim();
  const decision = String(data?.decision || '').toLowerCase();
  const etaMinutes = data?.etaMinutes != null ? Number(data.etaMinutes) : null;

  if (!bookingId) throw new fns.https.HttpsError('invalid-argument', 'bookingId required.');
  if (decision !== 'accepted' && decision !== 'declined') {
    throw new fns.https.HttpsError('invalid-argument', 'decision must be accepted|declined.');
  }
  if (etaMinutes != null && (!Number.isFinite(etaMinutes) || etaMinutes < 0 || etaMinutes > 600)) {
    throw new fns.https.HttpsError('invalid-argument', 'etaMinutes out of range.');
  }

  const performerId = await resolvePerformerIdFromAuth(auth.uid, auth.token);
  if (!performerId) {
    throw new fns.https.HttpsError('permission-denied', 'Not a registered performer.');
  }

  const db = getDb();
  const ref = db.collection('bookings').doc(bookingId);
  let newStatus = '';
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new fns.https.HttpsError('not-found', 'Booking not found.');
    const b = snap.data()!;
    if (String(b.performer_id) !== performerId) {
      throw new fns.https.HttpsError('permission-denied', 'Booking not assigned to you.');
    }
    if (b.status !== 'pending_performer_acceptance') {
      throw new fns.https.HttpsError('failed-precondition', `Booking is in status ${b.status}.`);
    }

    if (decision === 'declined') {
      newStatus = 'rejected';
      tx.update(ref, {
        status: 'rejected',
        cancelled_by: 'performer',
        cancelled_at: new Date().toISOString(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Server-side trust tier (already resolved at booking-create time).
      // Trusted bookers skip the vetting queue.
      newStatus = b.trustTier === 'trusted' ? 'deposit_pending' : 'pending_vetting';
      const updates: Record<string, any> = {
        status: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (etaMinutes != null) updates.performer_eta_minutes = etaMinutes;
      tx.update(ref, updates);
    }
  });

  await writeAudit(
    { uid: auth.uid, role: 'performer' },
    decision === 'accepted' ? 'PERFORMER_ACCEPTED' : 'PERFORMER_DECLINED',
    bookingId,
    { newStatus, etaMinutes }
  );

  return { success: true, status: newStatus };
});

export const performerUpdateEta = fns.https.onCall(async (data: any, context: any) => {
  requireAppCheckV1(context);
  const auth = requireAuth(context);

  const bookingId = String(data?.bookingId || '').trim();
  const etaMinutes = Number(data?.etaMinutes);
  if (!bookingId) throw new fns.https.HttpsError('invalid-argument', 'bookingId required.');
  if (!Number.isFinite(etaMinutes) || etaMinutes < 0 || etaMinutes > 600) {
    throw new fns.https.HttpsError('invalid-argument', 'etaMinutes out of range.');
  }

  const performerId = await resolvePerformerIdFromAuth(auth.uid, auth.token);
  if (!performerId) throw new fns.https.HttpsError('permission-denied', 'Not a registered performer.');

  const db = getDb();
  const ref = db.collection('bookings').doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) throw new fns.https.HttpsError('not-found', 'Booking not found.');
  if (String(snap.data()!.performer_id) !== performerId) {
    throw new fns.https.HttpsError('permission-denied', 'Booking not assigned to you.');
  }
  await ref.update({
    performer_eta_minutes: etaMinutes,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await writeAudit({ uid: auth.uid, role: 'performer' }, 'PERFORMER_ETA_UPDATED', bookingId, { etaMinutes });
  return { success: true };
});

export const performerUpdateLiveStatus = fns.https.onCall(async (data: any, context: any) => {
  requireAppCheckV1(context);
  const auth = requireAuth(context);

  const bookingId = String(data?.bookingId || '').trim();
  const status = String(data?.status || '').trim();
  if (!bookingId) throw new fns.https.HttpsError('invalid-argument', 'bookingId required.');
  if (!PERFORMER_LIVE_STATUSES.has(status)) {
    throw new fns.https.HttpsError('invalid-argument', 'Status must be en_route|arrived|in_progress|completed.');
  }

  const performerId = await resolvePerformerIdFromAuth(auth.uid, auth.token);
  if (!performerId) throw new fns.https.HttpsError('permission-denied', 'Not a registered performer.');

  const db = getDb();
  const ref = db.collection('bookings').doc(bookingId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new fns.https.HttpsError('not-found', 'Booking not found.');
    const b = snap.data()!;
    if (String(b.performer_id) !== performerId) {
      throw new fns.https.HttpsError('permission-denied', 'Booking not assigned to you.');
    }
    // Only allow progressing from confirmed → en_route → arrived → in_progress → completed.
    const order = ['confirmed', 'en_route', 'arrived', 'in_progress', 'completed'];
    const fromIdx = order.indexOf(b.status);
    const toIdx = order.indexOf(status);
    if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) {
      throw new fns.https.HttpsError('failed-precondition',
        `Cannot transition ${b.status} -> ${status}.`);
    }
    tx.update(ref, { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });

  await writeAudit({ uid: auth.uid, role: 'performer' }, 'PERFORMER_LIVE_STATUS', bookingId, { status });
  return { success: true };
});

// ============================================================================
// ADMIN CALLABLES — Booking lifecycle
// ============================================================================

export const adminUpdateBookingStatus = fns.https.onCall(async (data: any, context: any) => {
  const auth = await requireAdminCtx(context);

  const bookingId = String(data?.bookingId || '').trim();
  const status = String(data?.status || '').trim();
  const updates = data?.updates && typeof data.updates === 'object' ? data.updates : {};
  if (!bookingId) throw new fns.https.HttpsError('invalid-argument', 'bookingId required.');
  if (!ADMIN_ALLOWED_TARGETS.has(status)) {
    throw new fns.https.HttpsError('invalid-argument', `Status ${status} not permitted.`);
  }

  // Whitelist updatable fields admin can set alongside status
  const ALLOWED_UPDATE_FIELDS = new Set([
    'verified_by_admin_name', 'verified_at',
    'deposit_receipt_path',
    'performer_eta_minutes',
    'adminNotes',
    'cancelled_at', 'cancellation_reason', 'cancelled_by',
  ]);
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (ALLOWED_UPDATE_FIELDS.has(k)) filtered[k] = v;
  }

  const db = getDb();
  const ref = db.collection('bookings').doc(bookingId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new fns.https.HttpsError('not-found', 'Booking not found.');
    const patch: Record<string, any> = {
      status,
      ...filtered,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (status === 'confirmed' && !patch.verified_at) {
      patch.verified_at = new Date().toISOString();
    }
    tx.update(ref, patch);
  });

  await writeAudit({ uid: auth.uid, role: 'admin' }, 'ADMIN_BOOKING_STATUS', bookingId, { status, filtered });
  return { success: true };
});

export const adminCancelBooking = fns.https.onCall(async (data: any, context: any) => {
  const auth = await requireAdminCtx(context);
  const bookingId = String(data?.bookingId || '').trim();
  const reason = String(data?.reason || '').slice(0, 500);
  if (!bookingId) throw new fns.https.HttpsError('invalid-argument', 'bookingId required.');

  const db = getDb();
  await db.collection('bookings').doc(bookingId).update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancellation_reason: reason || null,
    cancelled_by: 'admin',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await writeAudit({ uid: auth.uid, role: 'admin' }, 'ADMIN_BOOKING_CANCELLED', bookingId, { reason });
  return { success: true };
});

export const adminReassignPerformer = fns.https.onCall(async (data: any, context: any) => {
  const auth = await requireAdminCtx(context);
  const bookingId = String(data?.bookingId || '').trim();
  const newPerformerId = String(data?.newPerformerId || '').trim();
  if (!bookingId || !newPerformerId) {
    throw new fns.https.HttpsError('invalid-argument', 'bookingId and newPerformerId required.');
  }

  const db = getDb();
  const ref = db.collection('bookings').doc(bookingId);
  const perfDoc = await db.collection('performers').doc(newPerformerId).get();
  if (!perfDoc.exists) throw new fns.https.HttpsError('not-found', 'Target performer not found.');

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new fns.https.HttpsError('not-found', 'Booking not found.');
    const oldPerformerId = snap.data()!.performer_id;
    tx.update(ref, {
      performer_id: newPerformerId,
      performer_reassigned_from_id: oldPerformerId,
      status: 'pending_performer_acceptance',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await writeAudit({ uid: auth.uid, role: 'admin' }, 'ADMIN_BOOKING_REASSIGNED', bookingId, { newPerformerId });
  return { success: true };
});

// ============================================================================
// ADMIN CALLABLES — Performers
// ============================================================================

const PERFORMER_ALLOWED_FIELDS = new Set([
  'name', 'tagline', 'bio', 'photo_url', 'gallery_urls',
  'service_ids', 'service_areas',
  'status', 'accepts_asap',
  'min_booking_duration_hours', 'rating', 'review_count',
]);

export const adminUpdatePerformer = fns.https.onCall(async (data: any, context: any) => {
  const auth = await requireAdminCtx(context);
  const performerId = String(data?.performerId || '').trim();
  const updates = data?.updates;
  if (!performerId) throw new fns.https.HttpsError('invalid-argument', 'performerId required.');
  if (!updates || typeof updates !== 'object') {
    throw new fns.https.HttpsError('invalid-argument', 'updates object required.');
  }

  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (PERFORMER_ALLOWED_FIELDS.has(k)) filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) {
    throw new fns.https.HttpsError('invalid-argument', 'No allowed fields in updates.');
  }
  filtered.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  await getDb().collection('performers').doc(performerId).set(filtered, { merge: true });
  await writeAudit({ uid: auth.uid, role: 'admin' }, 'ADMIN_PERFORMER_UPDATED', performerId, { fields: Object.keys(filtered) });
  return { success: true };
});

export const adminSetPerformerStatus = fns.https.onCall(async (data: any, context: any) => {
  const auth = await requireAdminCtx(context);
  const performerId = String(data?.performerId || '').trim();
  const status = String(data?.status || '').trim();
  const ALLOWED = new Set(['available', 'busy', 'offline', 'pending_verification', 'rejected', 'active']);
  if (!performerId) throw new fns.https.HttpsError('invalid-argument', 'performerId required.');
  if (!ALLOWED.has(status)) throw new fns.https.HttpsError('invalid-argument', 'Invalid status.');
  await getDb().collection('performers').doc(performerId).set(
    { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  await writeAudit({ uid: auth.uid, role: 'admin' }, 'ADMIN_PERFORMER_STATUS', performerId, { status });
  return { success: true };
});

export const adminSetPerformerAcceptsAsap = fns.https.onCall(async (data: any, context: any) => {
  const auth = await requireAdminCtx(context);
  const performerId = String(data?.performerId || '').trim();
  const acceptsAsap = !!data?.acceptsAsap;
  if (!performerId) throw new fns.https.HttpsError('invalid-argument', 'performerId required.');
  await getDb().collection('performers').doc(performerId).set(
    { accepts_asap: acceptsAsap, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  await writeAudit({ uid: auth.uid, role: 'admin' }, 'ADMIN_PERFORMER_ASAP', performerId, { acceptsAsap });
  return { success: true };
});

export const adminCreatePerformer = fns.https.onCall(async (data: any, context: any) => {
  const auth = await requireAdminCtx(context);
  const performer = data?.performer;
  if (!performer || typeof performer !== 'object') {
    throw new fns.https.HttpsError('invalid-argument', 'performer object required.');
  }
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(performer)) {
    if (PERFORMER_ALLOWED_FIELDS.has(k)) filtered[k] = v;
  }
  if (!filtered.name) throw new fns.https.HttpsError('invalid-argument', 'name required.');

  const db = getDb();
  // Highest existing numeric id + 1 (legacy numeric id pattern)
  const snap = await db.collection('performers').orderBy('id', 'desc').limit(1).get();
  const lastId = snap.empty ? 0 : Number(snap.docs[0].data()?.id) || 0;
  const newId = lastId + 1;
  const docId = String(newId);

  const doc = {
    ...filtered,
    id: newId,
    status: filtered.status || 'pending_verification',
    rating: filtered.rating ?? 0,
    review_count: filtered.review_count ?? 0,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('performers').doc(docId).set(doc);
  await writeAudit({ uid: auth.uid, role: 'admin' }, 'ADMIN_PERFORMER_CREATED', docId, { name: filtered.name });
  return { success: true, performerId: docId, performer: { ...doc, id: newId } };
});

// ============================================================================
// ADMIN CALLABLES — Do-not-serve (legacy do_not_serve collection)
// ============================================================================

export const adminCreateDoNotServeEntry = fns.https.onCall(async (data: any, context: any) => {
  const auth = await requireAdminCtx(context);
  const entry = data?.entry;
  if (!entry || typeof entry !== 'object') {
    throw new fns.https.HttpsError('invalid-argument', 'entry object required.');
  }
  const allowedFields = new Set([
    'client_name', 'client_email', 'client_phone',
    'reason', 'submitted_by_performer_id',
  ]);
  const filtered: Record<string, any> = { status: 'pending' };
  for (const [k, v] of Object.entries(entry)) {
    if (allowedFields.has(k)) filtered[k] = v;
  }
  if (!filtered.client_name || !filtered.reason) {
    throw new fns.https.HttpsError('invalid-argument', 'client_name and reason required.');
  }
  filtered.created_at = new Date().toISOString();
  filtered.createdAt = admin.firestore.FieldValue.serverTimestamp();
  filtered.addedByAdmin = auth.uid;

  const ref = await getDb().collection('do_not_serve').add(filtered);
  await writeAudit({ uid: auth.uid, role: 'admin' }, 'ADMIN_DNS_CREATED', ref.id, { clientName: filtered.client_name });
  return { success: true, entryId: ref.id, entry: { id: ref.id, ...filtered } };
});

export const adminUpdateDoNotServeStatus = fns.https.onCall(async (data: any, context: any) => {
  const auth = await requireAdminCtx(context);
  const entryId = String(data?.entryId || '').trim();
  const status = String(data?.status || '').trim();
  if (!entryId) throw new fns.https.HttpsError('invalid-argument', 'entryId required.');
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    throw new fns.https.HttpsError('invalid-argument', 'Invalid status.');
  }
  await getDb().collection('do_not_serve').doc(entryId).update({
    status,
    decidedAt: admin.firestore.FieldValue.serverTimestamp(),
    decidedBy: auth.uid,
  });
  await writeAudit({ uid: auth.uid, role: 'admin' }, 'ADMIN_DNS_STATUS', entryId, { status });
  return { success: true };
});

// ============================================================================
// COMMUNICATIONS
// ============================================================================

/**
 * Send a booking-scoped message. Resolves participant_uids server-side from
 * the booking's client_uid + performer_auth uid + admin set, so rules can
 * enforce "only participants can read".
 */
export const sendBookingMessage = fns.https.onCall(async (data: any, context: any) => {
  requireAppCheckV1(context);
  const auth = requireAuth(context);

  const bookingId = String(data?.bookingId || '').trim();
  const message = String(data?.message || '').slice(0, 4000);
  const type = String(data?.type || 'direct_message').slice(0, 40);
  if (!bookingId || !message) {
    throw new fns.https.HttpsError('invalid-argument', 'bookingId and message required.');
  }

  const db = getDb();
  const bookingSnap = await db.collection('bookings').doc(bookingId).get();
  if (!bookingSnap.exists) throw new fns.https.HttpsError('not-found', 'Booking not found.');
  const booking = bookingSnap.data()!;

  // Determine the sender's role + verify they're a participant
  const isAdmin = await isAdminUid(auth.uid, auth.token);
  const performerId = await resolvePerformerIdFromAuth(auth.uid, auth.token);
  const isPerformerForBooking = performerId != null && String(booking.performer_id) === performerId;
  const isOwner = booking.client_uid === auth.uid;

  if (!isAdmin && !isPerformerForBooking && !isOwner) {
    throw new fns.https.HttpsError('permission-denied', 'Not a participant on this booking.');
  }

  // Resolve admin participants (any active admin uid)
  const adminsSnap = await db.collection('admins').limit(20).get();
  const adminUids = adminsSnap.docs.map(d => d.id);

  // Resolve performer auth uid (best-effort)
  let performerAuthUid: string | null = null;
  if (booking.performer_id != null) {
    const pAuthSnap = await db.collection('performers_auth')
      .where('performerId', '==', booking.performer_id)
      .limit(1)
      .get();
    if (!pAuthSnap.empty) performerAuthUid = pAuthSnap.docs[0].id;
  }

  const participantSet = new Set<string>();
  if (booking.client_uid) participantSet.add(booking.client_uid);
  if (performerAuthUid) participantSet.add(performerAuthUid);
  for (const u of adminUids) participantSet.add(u);
  participantSet.add(auth.uid); // sender always a participant

  const senderRole = isAdmin ? 'Admin'
    : isPerformerForBooking ? 'Performer'
    : 'Client';

  const ref = await db.collection('communications').add({
    booking_id: bookingId,
    sender: senderRole,
    sender_uid: auth.uid,
    recipient: isAdmin ? 'all' : 'admin',
    participant_uids: Array.from(participantSet),
    message,
    type,
    read: false,
    created_at: new Date().toISOString(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    message: {
      id: ref.id,
      booking_id: bookingId,
      sender: senderRole,
      sender_uid: auth.uid,
      recipient: isAdmin ? 'all' : 'admin',
      participant_uids: Array.from(participantSet),
      message,
      type,
      read: false,
      created_at: new Date().toISOString(),
    },
  };
});
