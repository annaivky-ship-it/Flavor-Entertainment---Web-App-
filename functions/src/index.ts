import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendWhatsApp, sendSms, verifyTwilioSignature } from './twilio';
import { sendMessage } from './messaging/send';
import { renderTemplate } from './messaging/templates';
import { checkAndSetIdempotency } from './utils/idempotency';

// Fix: Declaring Buffer to resolve 'Cannot find name Buffer' error in environments without node types.
declare const Buffer: any;

admin.initializeApp();
const db = admin.firestore();
const fns = functions as any;

/**
 * Helper: Write Audit Log
 */
async function writeAuditLog(actorUid: string, actorRole: 'client' | 'admin' | 'system', action: string, applicationId: string, details: any = {}) {
  await db.collection('audit_logs').add({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    actorUid,
    actorRole,
    action,
    applicationId,
    details
  });
}

/**
 * Helper: Check Admin
 */
async function isAdmin(uid: string) {
  const adminDoc = await db.collection('admins').doc(uid).get();
  return adminDoc.exists;
}

/**
 * Create a new draft application
 */
export const createDraftApplication = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) throw new fns.https.HttpsError('unauthenticated', 'User must be signed in.');

  const appData = data.application;
  const appRef = db.collection('vetting_applications').doc();
  
  await appRef.set({
    ...appData,
    userId: context.auth.uid,
    status: 'draft',
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    riskFlags: [],
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { applicationId: appRef.id };
});

/**
 * Submit Vetting Application
 */
export const submitApplication = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) throw new fns.https.HttpsError('unauthenticated', 'User must be signed in.');
  
  const { applicationId } = data;
  const appRef = db.collection('vetting_applications').doc(applicationId);
  const appSnap = await appRef.get();

  if (!appSnap.exists) throw new fns.https.HttpsError('not-found', 'Application not found.');
  const appData = appSnap.data()!;

  if (appData.userId !== context.auth.uid) throw new fns.https.HttpsError('permission-denied', 'Not owner.');
  
  // Validation
  if (!appData.idFilePath || !appData.selfieFilePath) {
    throw new fns.https.HttpsError('failed-precondition', 'Missing required documents.');
  }

  // Age Threshold Check (18+)
  const dob = new Date(appData.dob);
  const age = Math.floor((new Date().getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  if (age < 18) {
    throw new fns.https.HttpsError('failed-precondition', 'Client must be at least 18 years old.');
  }

  await appRef.update({
    status: 'pending',
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ipAddress: context.rawRequest.ip || null
  });

  await writeAuditLog(context.auth.uid, 'client', 'VETTING_SUBMITTED', applicationId);

  return { success: true };
});

/**
 * Admin: Approve Application
 */
export const reviewApplicationApprove = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth || !await isAdmin(context.auth.uid)) {
    throw new fns.https.HttpsError('permission-denied', 'Admin access required.');
  }

  const { applicationId, riskFlags = [] } = data;
  const appRef = db.collection('vetting_applications').doc(applicationId);

  await appRef.update({
    status: 'approved',
    riskFlags,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewedBy: context.auth.token.email || context.auth.uid,
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await writeAuditLog(context.auth.uid, 'admin', 'VETTING_APPROVED', applicationId, { riskFlags });

  return { success: true };
});

/**
 * Retention Cleanup
 * Automatically delete files after specified periods.
 * Scheduled for every 24 hours.
 */
export const scheduledRetentionCleanup = fns.pubsub.schedule('every 24 hours').onRun(async (context: any) => {
  const now = admin.firestore.Timestamp.now();
  
  // 1. Find rejected apps older than 30 days
  const thirtyDaysAgo = new Date(now.toDate().getTime() - 30 * 24 * 60 * 60 * 1000);
  const rejectedSnap = await db.collection('vetting_applications')
    .where('status', '==', 'rejected')
    .where('lastUpdatedAt', '<=', thirtyDaysAgo)
    .get();

  // 2. Find approved apps older than 14 days
  const fourteenDaysAgo = new Date(now.toDate().getTime() - 14 * 24 * 60 * 60 * 1000);
  const approvedSnap = await db.collection('vetting_applications')
    .where('status', '==', 'approved')
    .where('lastUpdatedAt', '<=', fourteenDaysAgo)
    .get();

  const toCleanup = [...rejectedSnap.docs, ...approvedSnap.docs];
  const bucket = admin.storage().bucket();

  for (const doc of toCleanup) {
    const data = doc.data();
    if (data.idFilePath) await bucket.file(data.idFilePath).delete().catch(() => {});
    if (data.selfieFilePath) await bucket.file(data.selfieFilePath).delete().catch(() => {});
    
    await doc.ref.update({
      idFilePath: null,
      selfieFilePath: null,
      filesDeletedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await writeAuditLog('system', 'system', 'FILES_DELETED', doc.id);
  }

  console.log(`Cleaned up documents for ${toCleanup.length} applications.`);
});

/**
 * Legacy Booking Transaction (Retained for functionality)
 */
export const createBookingRequest = fns.https.onCall(async (request: any) => {
  const { formState, performerIds } = request.data;

  return db.runTransaction(async (transaction: any) => {
    const emailHash = Buffer.from(formState.email.toLowerCase()).toString('hex');
    const blacklistDoc = await transaction.get(db.collection('blacklist').doc(emailHash));
    if (blacklistDoc.exists) throw new fns.https.HttpsError('permission-denied', 'Client is blacklisted.');

    const newBookings: any[] = [];
    for (const pId of performerIds) {
      const slotId = `${pId}_${formState.eventDate}_${formState.eventTime}`;
      const bookingRef = db.collection('bookings').doc();
      const bookingData = {
        ...formState,
        performer_id: pId,
        status: 'pending_performer_acceptance',
        slotLock: slotId,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      transaction.set(bookingRef, bookingData);
      newBookings.push({ id: bookingRef.id, ...bookingData });
      
      transaction.set(db.collection('notificationsQueue').doc(), {
        type: 'WHATSAPP',
        to: pId,
        body: `New Booking Request from ${formState.fullName}.`,
        status: 'queued',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return { success: true, bookingIds: newBookings.map(b => b.id) };
  });
});

export const notificationsWorker = fns.firestore
  .document('notificationsQueue/{id}')
  .onCreate(async (snapshot: any) => {
    const data = snapshot.data();
    if (data.status !== 'queued') return;
    try {
      if (data.type === 'WHATSAPP') await sendWhatsApp(data.to, data.body);
      else await sendSms(data.to, data.body);
      return snapshot.ref.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() });
    } catch (error: any) {
      return snapshot.ref.update({ status: 'failed', lastError: error.message });
    }
  });

export const twilioInboundWebhook = fns.https.onRequest(async (req: any, res: any) => {
  if (!verifyTwilioSignature(req)) {
    res.status(403).send('Invalid signature');
    return;
  }
  res.status(200).send('OK');
});

export const onBookingCreated = fns.firestore
  .document('bookings/{bookingId}')
  .onCreate(async (snap: any, context: any) => {
    const bookingId = context.params.bookingId;
    const data = snap.data();
    
    if (data.status !== 'pending_performer_acceptance' && data.status !== 'PENDING') return;

    const idempotencyKey = `booking_created_${bookingId}`;
    if (!(await checkAndSetIdempotency(idempotencyKey))) return;

    const settingsDoc = await db.collection('settings').doc('messaging').get();
    const adminNumbers = settingsDoc.data()?.adminNotifyNumbers || [];

    // Notify Admin
    for (const adminNum of adminNumbers) {
      await sendMessage({
        bookingId,
        templateKey: 'NEW_BOOKING_ADMIN',
        to: adminNum,
        body: renderTemplate('NEW_BOOKING_ADMIN', data)
      });
    }

    // Notify Performer
    if (data.performerPhone) {
      await sendMessage({
        bookingId,
        templateKey: 'NEW_BOOKING_PERFORMER',
        to: data.performerPhone,
        body: renderTemplate('NEW_BOOKING_PERFORMER', data)
      });
    }

    // Notify Client
    if (data.clientPhone || data.phone) {
      await sendMessage({
        bookingId,
        templateKey: 'RECEIVED_CLIENT',
        to: data.clientPhone || data.phone,
        body: renderTemplate('RECEIVED_CLIENT', data)
      });
    }
  });

export const onBookingStatusChanged = fns.firestore
  .document('bookings/{bookingId}')
  .onUpdate(async (change: any, context: any) => {
    const bookingId = context.params.bookingId;
    const before = change.before.data();
    const after = change.after.data();

    if (before.status === after.status) return;

    const idempotencyKey = `booking_status_${bookingId}_${after.status}`;
    if (!(await checkAndSetIdempotency(idempotencyKey))) return;

    const clientPhone = after.clientPhone || after.phone;
    const performerPhone = after.performerPhone;

    if (after.status === 'deposit_pending' || after.status === 'APPROVED') {
      if (clientPhone) {
        await sendMessage({
          bookingId,
          templateKey: 'APPROVED_PAYID_CLIENT',
          to: clientPhone,
          body: renderTemplate('APPROVED_PAYID_CLIENT', after)
        });
      }
    } else if (after.status === 'confirmed' || after.status === 'CONFIRMED') {
      if (clientPhone) {
        await sendMessage({
          bookingId,
          templateKey: 'CONFIRMED_CLIENT',
          to: clientPhone,
          body: renderTemplate('CONFIRMED_CLIENT', after)
        });
      }
      if (performerPhone) {
        await sendMessage({
          bookingId,
          templateKey: 'CONFIRMED_PERFORMER',
          to: performerPhone,
          body: renderTemplate('CONFIRMED_PERFORMER', after)
        });
      }
    } else if (after.status === 'rejected' || after.status === 'DECLINED') {
      if (clientPhone) {
        await sendMessage({
          bookingId,
          templateKey: 'DECLINED_CLIENT',
          to: clientPhone,
          body: renderTemplate('DECLINED_CLIENT', after)
        });
      }
    } else if (after.status === 'cancelled' || after.status === 'CANCELLED') {
      if (clientPhone) {
        await sendMessage({
          bookingId,
          templateKey: 'CANCELLED_ALL',
          to: clientPhone,
          body: renderTemplate('CANCELLED_ALL', after)
        });
      }
      if (performerPhone) {
        await sendMessage({
          bookingId,
          templateKey: 'CANCELLED_ALL',
          to: performerPhone,
          body: renderTemplate('CANCELLED_ALL', after)
        });
      }
    }
  });

// Export KYC functions
export * from './kyc';