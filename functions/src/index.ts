import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { sendWhatsApp, sendSms, verifyTwilioSignature } from './twilio';
import { sendMessage } from './messaging/send';
import { renderTemplate } from './messaging/templates';
import { checkAndSetIdempotency } from './utils/idempotency';
import { GoogleGenAI, Type } from "@google/genai";
import { createKycSession, processKycResult, verifyWebhookSignature } from './didit';
import { calculateRiskScore, shouldSkipKyc } from './risk/scoring';
import { createIncidentReport, approveIncidentReport, rejectIncidentReport } from './incidents/reporting';
import { recordConsent, CONSENT_TEXT } from './consent';
import { dnsLookup, normalizeEmail, normalizePhoneToE164, sha256 } from './dns';
// Fix: Declaring Buffer to resolve 'Cannot find name Buffer' error in environments without node types.
declare const Buffer: any;

admin.initializeApp();
const db = getFirestore('default');
const fns = functions as any;

export const analyzeVettingRisk = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'User must be signed in.');
  }

  const isAdminUser = await isAdmin(context.auth.uid);
  if (!isAdminUser && context.auth.token.admin !== true) {
    throw new fns.https.HttpsError('permission-denied', 'Only admins can perform risk analysis.');
  }

  const { bookingDetails } = data;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Evaluate this booking request for risk assessment:\n${JSON.stringify(bookingDetails)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            riskLevel: { type: Type.STRING, description: "Low, Medium, or High risk level" },
            reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
            vettedStatusRecommendation: { type: Type.STRING },
            notes: { type: Type.STRING }
          },
          required: ["riskLevel", "reasons", "vettedStatusRecommendation"],
        },
      },
    });

    return JSON.parse(response.text?.trim() || "{}");
  } catch (error) {
    console.error("Gemini Vetting Error:", error);
    throw new fns.https.HttpsError('internal', 'Failed to analyze risk.');
  }
});

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
    if (data.idFilePath) await bucket.file(data.idFilePath).delete().catch(() => { });
    if (data.selfieFilePath) await bucket.file(data.selfieFilePath).delete().catch(() => { });

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
    // DNS Check
    const normalizedEmail = normalizeEmail(formState.email);
    const normalizedPhone = normalizePhoneToE164(formState.phone || formState.mobile);

    const emailHash = sha256(normalizedEmail);
    const phoneHash = sha256(normalizedPhone);

    const blacklistDoc = await transaction.get(db.collection('blacklist').doc(Buffer.from(formState.email.toLowerCase()).toString('hex')));
    if (blacklistDoc.exists) throw new fns.https.HttpsError('permission-denied', 'Application could not be processed.');

    const isBlocked = await dnsLookup(emailHash, phoneHash);

    if (isBlocked) {
      throw new fns.https.HttpsError('permission-denied', 'Application could not be processed.');
    }

    const newBookings: any[] = [];
    for (const pId of performerIds) {
      const slotId = `${pId}_${formState.eventDate}_${formState.eventTime}`;

      // Slot locking
      const slotRef = db.collection('booking_slots').doc(slotId);
      const slotDoc = await transaction.get(slotRef);

      if (slotDoc.exists) {
        throw new fns.https.HttpsError(
          'already-exists',
          `This time slot is already booked for performer ${pId}.`
        );
      }

      const bookingRef = db.collection('bookings').doc();
      const bookingData = {
        ...formState,
        performer_id: pId,
        status: 'pending_performer_acceptance',
        slotLock: slotId,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Reserve the slot atomically
      transaction.set(slotRef, {
        bookingId: bookingRef.id,
        performerId: pId,
        date: formState.eventDate,
        time: formState.eventTime,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

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

export const initializeDiditSession = fns.https.onCall(async (data: { bookingId: string }, context: any) => {
  const { bookingId } = data;
  if (!bookingId) {
    throw new fns.https.HttpsError('invalid-argument', 'Booking ID is required.');
  }

  try {
    const session = await createKycSession(bookingId);
    if (!session) {
      throw new Error('Could not create KYC session (Didit missing or disabled).');
    }
    return { success: true, url: session.verification_url, sessionId: session.session_id };
  } catch (error: any) {
    throw new fns.https.HttpsError('internal', error.message || 'Error occurred initializing KYC.');
  }
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

    // Cleanup slot lock if booking is rejected or cancelled
    if (after.status === 'rejected' || after.status === 'DECLINED' || after.status === 'cancelled' || after.status === 'CANCELLED') {
      if (after.slotLock) {
        await db.collection('booking_slots').doc(after.slotLock).delete().catch(() => { });
      }
    }

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

// Export DNS functions
export * from './dns';

// --- Didit KYC Endpoints ---

/**
 * Webhook endpoint for Didit KYC verification results.
 * Didit sends POST requests here when verification status changes.
 */
export const diditKycWebhook = fns.https.onRequest(async (req: any, res: any) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  // Verify webhook signature
  const signature = req.headers['x-signature'] || '';
  const timestamp = req.headers['x-timestamp'] || '';
  const rawBody = JSON.stringify(req.body);

  if (!verifyWebhookSignature(rawBody, signature, timestamp)) {
    console.error('Invalid Didit webhook signature');
    res.status(403).send('Invalid signature');
    return;
  }

  try {
    const webhookData = req.body;
    const eventType = webhookData.event || 'status.updated';

    if (eventType === 'status.updated' &&
      (webhookData.status === 'Approved' || webhookData.status === 'Declined')) {

      const result = await processKycResult(webhookData);
      console.log(`KYC ${result.kycResult} for booking ${result.bookingId} → ${result.newStatus}`);

      // Send notification to client
      const bookingDoc = await db.collection('bookings').doc(result.bookingId).get();
      const booking = bookingDoc.data();
      const clientPhone = booking?.clientPhone || booking?.phone || booking?.client_phone;

      if (clientPhone) {
        if (result.kycResult === 'PASS' && result.newStatus === 'CONFIRMED') {
          await sendMessage({
            bookingId: result.bookingId,
            templateKey: 'CONFIRMED_CLIENT',
            to: clientPhone,
            body: renderTemplate('CONFIRMED_CLIENT', booking)
          });
        } else if (result.kycResult === 'FAIL') {
          await sendMessage({
            bookingId: result.bookingId,
            templateKey: 'DECLINED_CLIENT',
            to: clientPhone,
            body: renderTemplate('DECLINED_CLIENT', booking)
          });
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Error processing Didit webhook:', error);
    res.status(500).json({ error: 'Internal error processing webhook' });
  }
});

/**
 * Admin-triggered KYC session creation.
 * Use when auto-creation fails or admin wants to manually trigger KYC.
 */
export const adminTriggerKyc = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists && context.auth.token.admin !== true) {
    throw new fns.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { bookingId } = data;
  if (!bookingId) {
    throw new fns.https.HttpsError('invalid-argument', 'bookingId is required');
  }

  try {
    const session = await createKycSession(bookingId);
    return {
      success: true,
      verification_url: session?.verification_url || null,
      session_id: session?.session_id || null
    };
  } catch (error: any) {
    throw new fns.https.HttpsError('internal', `Failed to create KYC session: ${error.message}`);
  }
});

// --- Safety Verification System ---

/**
 * Step 2: Record client consent before identity verification.
 */
export const recordBookingConsent = fns.https.onCall(async (data: any, context: any) => {
  const { bookingId, ipAddress, userAgent, deviceFingerprint } = data;

  if (!bookingId) {
    throw new fns.https.HttpsError('invalid-argument', 'bookingId is required');
  }

  const bookingDoc = await db.collection('bookings').doc(bookingId).get();
  if (!bookingDoc.exists) {
    throw new fns.https.HttpsError('not-found', 'Booking not found');
  }

  const booking = bookingDoc.data()!;

  const consentId = await recordConsent({
    bookingId,
    clientEmail: booking.client_email || booking.email,
    clientPhone: booking.client_phone || booking.phone,
    ipAddress: ipAddress || context.rawRequest?.ip || 'unknown',
    userAgent: userAgent || 'unknown',
    deviceFingerprint,
    consentText: CONSENT_TEXT,
  });

  return { success: true, consentId, consentText: CONSENT_TEXT };
});

/**
 * Performer: Submit an incident report about a dangerous client.
 */
export const submitIncidentReport = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const {
    client_name, client_email, client_phone,
    incident_description, risk_level,
    evidence_urls, booking_id
  } = data;

  if (!client_name || !incident_description || !risk_level) {
    throw new fns.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(risk_level)) {
    throw new fns.https.HttpsError('invalid-argument', 'Invalid risk level');
  }

  const reportId = await createIncidentReport({
    client_name,
    client_email: client_email || '',
    client_phone: client_phone || '',
    incident_description,
    risk_level,
    reported_by_performer_id: context.auth.uid,
    reported_by_name: context.auth.token.name || context.auth.token.email || 'Unknown',
    evidence_urls: evidence_urls || [],
    booking_id: booking_id || null,
  });

  // Notify admins
  const settingsDoc = await db.collection('settings').doc('messaging').get();
  const adminNumbers = settingsDoc.data()?.adminNotifyNumbers || [];
  for (const num of adminNumbers) {
    await sendMessage({
      bookingId: booking_id || 'incident',
      templateKey: 'KYC_FLAGGED_ADMIN' as any,
      to: num,
      body: `[Flavor Entertainers] ⚠️ New incident report: ${client_name} (${risk_level}). "${incident_description.substring(0, 80)}..." Review in admin dashboard.`,
    });
  }

  return { success: true, reportId };
});

/**
 * Admin: Review and act on an incident report.
 */
export const adminReviewIncident = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists && context.auth.token.admin !== true) {
    throw new fns.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { reportId, action, notes } = data;

  if (!reportId || !action) {
    throw new fns.https.HttpsError('invalid-argument', 'reportId and action required');
  }

  if (action === 'approve') {
    await approveIncidentReport(reportId, context.auth.uid, notes);
    return { success: true, message: 'Report approved. Client added to DNS register.' };
  } else if (action === 'reject') {
    await rejectIncidentReport(reportId, context.auth.uid, notes || 'Insufficient evidence');
    return { success: true, message: 'Report rejected.' };
  } else {
    throw new fns.https.HttpsError('invalid-argument', 'Action must be "approve" or "reject"');
  }
});

/**
 * Run full risk assessment for a booking.
 * Called after KYC result or manually by admin.
 */
export const assessBookingRisk = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { bookingId } = data;
  if (!bookingId) {
    throw new fns.https.HttpsError('invalid-argument', 'bookingId required');
  }

  const bookingDoc = await db.collection('bookings').doc(bookingId).get();
  if (!bookingDoc.exists) {
    throw new fns.https.HttpsError('not-found', 'Booking not found');
  }

  const booking = bookingDoc.data()!;

  const assessment = await calculateRiskScore({
    bookingId,
    clientEmail: booking.client_email || booking.email,
    clientPhone: booking.client_phone || booking.phone,
    clientEmailHash: booking.client_email_hash || '',
    clientPhoneHash: booking.client_phone_hash || '',
    ipAddress: booking.client_ip,
    deviceFingerprint: booking.device_fingerprint,
    kycStatus: booking.kyc_status,
    kycConfidence: booking.kyc_confidence,
  });

  // Apply decision to booking
  if (assessment.decision === 'APPROVE') {
    await db.collection('bookings').doc(bookingId).update({
      risk_score: assessment.score,
      risk_level: assessment.level,
      risk_decision: assessment.decision,
      status: booking.kyc_status === 'PASS' || booking.kyc_status === 'BYPASSED'
        ? 'CONFIRMED' : booking.status,
    });
  } else if (assessment.decision === 'MANUAL_REVIEW') {
    await db.collection('bookings').doc(bookingId).update({
      risk_score: assessment.score,
      risk_level: assessment.level,
      risk_decision: assessment.decision,
      status: 'PENDING_ADMIN_REVIEW',
    });
  } else {
    await db.collection('bookings').doc(bookingId).update({
      risk_score: assessment.score,
      risk_level: assessment.level,
      risk_decision: assessment.decision,
      status: 'DENIED',
    });
  }

  return {
    success: true,
    assessment: {
      score: assessment.score,
      level: assessment.level,
      decision: assessment.decision,
      reasons: assessment.reasons,
    },
  };
});

export const addAnnaTest = fns.https.onRequest(async (req: any, res: any) => {
  try {
    const newPerformer = {
      id: 6,
      name: 'Anna Ivky',
      tagline: 'Sophistication and a hint of mystery.',
      photo_url: 'https://picsum.photos/seed/anna/800/1200',
      bio: 'Anna is the epitome of grace and professionalism. Her experience with exclusive, private events makes her the ideal choice for clients seeking a discreet yet impactful presence. Her poise and charm elevate any gathering.',
      service_ids: ['waitress-lingerie', 'show-toy', 'show-works-greek', 'show-absolute-works'],
      service_areas: ['Perth South', 'Southwest'],
      status: 'available',
      rating: 5.0,
      review_count: 89,
      min_booking_duration_hours: 3,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('performers').doc('6').set(newPerformer);
    res.json({ success: true, message: 'Anna added properly' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: String(error) });
  }
});