"use strict";
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDatabase = exports.addAnnaTest = exports.assessBookingRisk = exports.adminReviewIncident = exports.submitIncidentReport = exports.recordBookingConsent = exports.adminTriggerKyc = exports.diditKycWebhook = exports.notificationOutboxWorker = exports.scheduledBookingExpiry = exports.monoovaWebhook = exports.onBookingStatusChanged = exports.onBookingCreated = exports.twilioInboundWebhook = exports.notificationsWorker = exports.initializeDiditSession = exports.createBookingRequest = exports.scheduledRetentionCleanup = exports.reviewApplicationApprove = exports.submitApplication = exports.createDraftApplication = exports.analyzeVettingRisk = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const twilio_1 = require("./twilio");
const send_1 = require("./messaging/send");
const templates_1 = require("./messaging/templates");
const idempotency_1 = require("./utils/idempotency");
const genai_1 = require("@google/genai");
const didit_1 = require("./didit");
const scoring_1 = require("./risk/scoring");
const reporting_1 = require("./incidents/reporting");
const consent_1 = require("./consent");
const dns_1 = require("./dns");
const payments_1 = require("./payments");
const BOOKING_PAYMENT_HOLD_MINUTES = parseInt(process.env.BOOKING_PAYMENT_HOLD_MINUTES || '30', 10);
admin.initializeApp();
const db = (0, firestore_1.getFirestore)('default');
const fns = functions;
exports.analyzeVettingRisk = fns.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new fns.https.HttpsError('unauthenticated', 'User must be signed in.');
    }
    const isAdminUser = await isAdmin(context.auth.uid);
    if (!isAdminUser && context.auth.token.admin !== true) {
        throw new fns.https.HttpsError('permission-denied', 'Only admins can perform risk analysis.');
    }
    const { bookingDetails } = data;
    try {
        const ai = new genai_1.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: `Evaluate this booking request for risk assessment:\n${JSON.stringify(bookingDetails)}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: genai_1.Type.OBJECT,
                    properties: {
                        riskLevel: { type: genai_1.Type.STRING, description: "Low, Medium, or High risk level" },
                        reasons: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
                        vettedStatusRecommendation: { type: genai_1.Type.STRING },
                        notes: { type: genai_1.Type.STRING }
                    },
                    required: ["riskLevel", "reasons", "vettedStatusRecommendation"],
                },
            },
        });
        return JSON.parse(((_a = response.text) === null || _a === void 0 ? void 0 : _a.trim()) || "{}");
    }
    catch (error) {
        console.error("Gemini Vetting Error:", error);
        throw new fns.https.HttpsError('internal', 'Failed to analyze risk.');
    }
});
/**
 * Helper: Write Audit Log
 */
async function writeAuditLog(actorUid, actorRole, action, applicationId, details = {}) {
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
async function isAdmin(uid) {
    const adminDoc = await db.collection('admins').doc(uid).get();
    return adminDoc.exists;
}
/**
 * Create a new draft application
 */
exports.createDraftApplication = fns.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new fns.https.HttpsError('unauthenticated', 'User must be signed in.');
    const appData = data.application;
    const appRef = db.collection('vetting_applications').doc();
    await appRef.set(Object.assign(Object.assign({}, appData), { userId: context.auth.uid, status: 'draft', submittedAt: null, reviewedAt: null, reviewedBy: null, riskFlags: [], lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }));
    return { applicationId: appRef.id };
});
/**
 * Submit Vetting Application
 */
exports.submitApplication = fns.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new fns.https.HttpsError('unauthenticated', 'User must be signed in.');
    const { applicationId } = data;
    const appRef = db.collection('vetting_applications').doc(applicationId);
    const appSnap = await appRef.get();
    if (!appSnap.exists)
        throw new fns.https.HttpsError('not-found', 'Application not found.');
    const appData = appSnap.data();
    if (appData.userId !== context.auth.uid)
        throw new fns.https.HttpsError('permission-denied', 'Not owner.');
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
exports.reviewApplicationApprove = fns.https.onCall(async (data, context) => {
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
exports.scheduledRetentionCleanup = fns.pubsub.schedule('every 24 hours').onRun(async (context) => {
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
        if (data.idFilePath)
            await bucket.file(data.idFilePath).delete().catch(() => { });
        if (data.selfieFilePath)
            await bucket.file(data.selfieFilePath).delete().catch(() => { });
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
exports.createBookingRequest = fns.https.onCall(async (request) => {
    const { formState, performerIds } = request.data;
    return db.runTransaction(async (transaction) => {
        // DNS Check
        const normalizedEmail = (0, dns_1.normalizeEmail)(formState.email);
        const normalizedPhone = (0, dns_1.normalizePhoneToE164)(formState.phone || formState.mobile);
        const emailHash = (0, dns_1.sha256)(normalizedEmail);
        const phoneHash = (0, dns_1.sha256)(normalizedPhone);
        const blacklistDoc = await transaction.get(db.collection('blacklist').doc(Buffer.from(formState.email.toLowerCase()).toString('hex')));
        if (blacklistDoc.exists)
            throw new fns.https.HttpsError('permission-denied', 'Application could not be processed.');
        const isBlocked = await (0, dns_1.dnsLookup)(emailHash, phoneHash);
        if (isBlocked) {
            throw new fns.https.HttpsError('permission-denied', 'Application could not be processed.');
        }
        const newBookings = [];
        for (const pId of performerIds) {
            const slotId = `${pId}_${formState.eventDate}_${formState.eventTime}`;
            // Slot locking
            const slotRef = db.collection('booking_slots').doc(slotId);
            const slotDoc = await transaction.get(slotRef);
            if (slotDoc.exists) {
                throw new fns.https.HttpsError('already-exists', `This time slot is already booked for performer ${pId}.`);
            }
            const bookingRef = db.collection('bookings').doc();
            const bookingReference = (0, payments_1.generateBookingReference)();
            const expiresAt = new Date(Date.now() + BOOKING_PAYMENT_HOLD_MINUTES * 60 * 1000);
            // Allowlist form fields — never spread arbitrary client data
            const sanitizedForm = {
                client_name: formState.fullName || '',
                client_email: formState.email || '',
                client_phone: formState.mobile || formState.phone || '',
                client_dob: formState.dob || null,
                event_date: formState.eventDate || '',
                event_time: formState.eventTime || '',
                event_address: formState.eventAddress || '',
                event_type: formState.eventType || '',
                duration_hours: parseFloat(formState.duration) || 2,
                number_of_guests: parseInt(formState.numberOfGuests, 10) || 0,
                services_requested: Array.isArray(formState.selectedServices) ? formState.selectedServices : [],
                client_message: formState.client_message || null,
                id_document_path: formState.id_document_path || null,
                selfie_document_path: formState.selfie_document_path || null,
                eventSuburb: formState.eventSuburb || null,
            };
            const bookingData = Object.assign(Object.assign({}, sanitizedForm), { performer_id: pId, status: 'pending_performer_acceptance', payment_status: 'unpaid', paymentMethod: 'PAYID', bookingReference, currency: 'AUD', monoovaTransactionId: null, paymentReceivedAt: null, expiresAt: admin.firestore.Timestamp.fromDate(expiresAt), slotLock: slotId, created_at: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            // Reserve the slot atomically
            transaction.set(slotRef, {
                bookingId: bookingRef.id,
                performerId: pId,
                date: formState.eventDate,
                time: formState.eventTime,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            transaction.set(bookingRef, bookingData);
            newBookings.push(Object.assign({ id: bookingRef.id }, bookingData));
            transaction.set(db.collection('notificationsQueue').doc(), {
                type: 'WHATSAPP',
                to: pId,
                body: `New Booking Request from ${formState.fullName}.`,
                status: 'queued',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        return {
            success: true,
            bookingIds: newBookings.map(b => b.id),
            bookingReferences: newBookings.map(b => b.bookingReference),
        };
    });
});
exports.initializeDiditSession = fns.https.onCall(async (data, context) => {
    const { bookingId } = data;
    if (!bookingId) {
        throw new fns.https.HttpsError('invalid-argument', 'Booking ID is required.');
    }
    try {
        const session = await (0, didit_1.createKycSession)(bookingId);
        if (!session) {
            throw new Error('Could not create KYC session (Didit missing or disabled).');
        }
        return { success: true, url: session.verification_url, sessionId: session.session_id };
    }
    catch (error) {
        throw new fns.https.HttpsError('internal', error.message || 'Error occurred initializing KYC.');
    }
});
exports.notificationsWorker = fns.firestore
    .document('notificationsQueue/{id}')
    .onCreate(async (snapshot) => {
    const data = snapshot.data();
    if (data.status !== 'queued')
        return;
    try {
        if (data.type === 'WHATSAPP')
            await (0, twilio_1.sendWhatsApp)(data.to, data.body);
        else
            await (0, twilio_1.sendSms)(data.to, data.body);
        return snapshot.ref.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    catch (error) {
        return snapshot.ref.update({ status: 'failed', lastError: error.message });
    }
});
exports.twilioInboundWebhook = fns.https.onRequest(async (req, res) => {
    if (!(0, twilio_1.verifyTwilioSignature)(req)) {
        res.status(403).send('Invalid signature');
        return;
    }
    res.status(200).send('OK');
});
exports.onBookingCreated = fns.firestore
    .document('bookings/{bookingId}')
    .onCreate(async (snap, context) => {
    var _a;
    const bookingId = context.params.bookingId;
    const data = snap.data();
    if (data.status !== 'pending_performer_acceptance' && data.status !== 'PENDING')
        return;
    const idempotencyKey = `booking_created_${bookingId}`;
    if (!(await (0, idempotency_1.checkAndSetIdempotency)(idempotencyKey)))
        return;
    // Auto-run risk scoring for new bookings
    try {
        const clientEmail = data.client_email || data.email || '';
        const clientPhone = data.client_phone || data.phone || data.mobile || '';
        const emailHash = clientEmail ? (0, dns_1.sha256)((0, dns_1.normalizeEmail)(clientEmail)) : '';
        const phoneHash = clientPhone ? (0, dns_1.sha256)((0, dns_1.normalizePhoneToE164)(clientPhone)) : '';
        const riskResult = await (0, scoring_1.calculateRiskScore)({
            bookingId,
            clientEmail,
            clientPhone,
            clientEmailHash: emailHash,
            clientPhoneHash: phoneHash,
            ipAddress: data.client_ip || null,
            deviceFingerprint: data.device_fingerprint || null,
            kycStatus: data.kyc_status || 'NOT_STARTED',
            kycConfidence: data.kyc_confidence || null,
        });
        await snap.ref.update({
            risk_score: riskResult.score,
            risk_level: riskResult.level,
            risk_decision: riskResult.decision,
        });
        console.log(`Risk score for booking ${bookingId}: ${riskResult.score} (${riskResult.level}) → ${riskResult.decision}`);
    }
    catch (riskError) {
        console.error(`Risk scoring failed for booking ${bookingId}:`, riskError);
        // Non-blocking: don't fail the booking creation if risk scoring fails
    }
    const settingsDoc = await db.collection('settings').doc('messaging').get();
    const adminNumbers = ((_a = settingsDoc.data()) === null || _a === void 0 ? void 0 : _a.adminNotifyNumbers) || [];
    // Notify Admin
    for (const adminNum of adminNumbers) {
        await (0, send_1.sendMessage)({
            bookingId,
            templateKey: 'NEW_BOOKING_ADMIN',
            to: adminNum,
            body: (0, templates_1.renderTemplate)('NEW_BOOKING_ADMIN', data)
        });
    }
    // Notify Performer
    if (data.performerPhone) {
        await (0, send_1.sendMessage)({
            bookingId,
            templateKey: 'NEW_BOOKING_PERFORMER',
            to: data.performerPhone,
            body: (0, templates_1.renderTemplate)('NEW_BOOKING_PERFORMER', data)
        });
    }
    // Notify Client
    if (data.clientPhone || data.phone) {
        await (0, send_1.sendMessage)({
            bookingId,
            templateKey: 'RECEIVED_CLIENT',
            to: data.clientPhone || data.phone,
            body: (0, templates_1.renderTemplate)('RECEIVED_CLIENT', data)
        });
    }
});
exports.onBookingStatusChanged = fns.firestore
    .document('bookings/{bookingId}')
    .onUpdate(async (change, context) => {
    const bookingId = context.params.bookingId;
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === after.status)
        return;
    // Cleanup slot lock if booking is rejected or cancelled
    if (after.status === 'rejected' || after.status === 'DECLINED' || after.status === 'cancelled' || after.status === 'CANCELLED') {
        if (after.slotLock) {
            await db.collection('booking_slots').doc(after.slotLock).delete().catch(() => { });
        }
    }
    const idempotencyKey = `booking_status_${bookingId}_${after.status}`;
    if (!(await (0, idempotency_1.checkAndSetIdempotency)(idempotencyKey)))
        return;
    const clientPhone = after.clientPhone || after.phone;
    const performerPhone = after.performerPhone;
    if (after.status === 'deposit_pending' || after.status === 'APPROVED') {
        if (clientPhone) {
            await (0, send_1.sendMessage)({
                bookingId,
                templateKey: 'APPROVED_PAYID_CLIENT',
                to: clientPhone,
                body: (0, templates_1.renderTemplate)('APPROVED_PAYID_CLIENT', after)
            });
        }
    }
    else if (after.status === 'confirmed' || after.status === 'CONFIRMED') {
        if (clientPhone) {
            await (0, send_1.sendMessage)({
                bookingId,
                templateKey: 'CONFIRMED_CLIENT',
                to: clientPhone,
                body: (0, templates_1.renderTemplate)('CONFIRMED_CLIENT', after)
            });
        }
        if (performerPhone) {
            await (0, send_1.sendMessage)({
                bookingId,
                templateKey: 'CONFIRMED_PERFORMER',
                to: performerPhone,
                body: (0, templates_1.renderTemplate)('CONFIRMED_PERFORMER', after)
            });
        }
    }
    else if (after.status === 'rejected' || after.status === 'DECLINED') {
        if (clientPhone) {
            await (0, send_1.sendMessage)({
                bookingId,
                templateKey: 'DECLINED_CLIENT',
                to: clientPhone,
                body: (0, templates_1.renderTemplate)('DECLINED_CLIENT', after)
            });
        }
    }
    else if (after.status === 'cancelled' || after.status === 'CANCELLED') {
        if (clientPhone) {
            await (0, send_1.sendMessage)({
                bookingId,
                templateKey: 'CANCELLED_ALL',
                to: clientPhone,
                body: (0, templates_1.renderTemplate)('CANCELLED_ALL', after)
            });
        }
        if (performerPhone) {
            await (0, send_1.sendMessage)({
                bookingId,
                templateKey: 'CANCELLED_ALL',
                to: performerPhone,
                body: (0, templates_1.renderTemplate)('CANCELLED_ALL', after)
            });
        }
    }
});
// --- Monoova PayID Webhook ---
exports.monoovaWebhook = fns.https.onRequest(payments_1.handleMonoovaWebhook);
// --- Booking Expiry Scheduler ---
// Runs every 5 minutes to expire unpaid bookings past their hold time
exports.scheduledBookingExpiry = fns.pubsub.schedule('every 5 minutes').onRun(async () => {
    const count = await (0, payments_1.expireUnpaidBookings)();
    console.log(`Booking expiry job: expired ${count} bookings.`);
});
// --- Notification Outbox Worker ---
// Processes notification jobs created by webhook handler and expiry scheduler
exports.notificationOutboxWorker = fns.firestore
    .document('notification_outbox/{id}')
    .onCreate(async (snapshot) => {
    var _a;
    const data = snapshot.data();
    if (data.sent)
        return;
    try {
        const settingsDoc = await db.collection('settings').doc('messaging').get();
        const adminNumbers = ((_a = settingsDoc.data()) === null || _a === void 0 ? void 0 : _a.adminNotifyNumbers) || [];
        if (data.type === 'payment_confirmed') {
            // Notify client
            if (data.clientPhone) {
                await (0, send_1.sendMessage)({
                    bookingId: data.bookingId,
                    templateKey: 'CONFIRMED_CLIENT',
                    to: data.clientPhone,
                    body: (0, templates_1.renderTemplate)('CONFIRMED_CLIENT', {
                        clientName: data.clientName,
                        payIdReference: data.bookingReference,
                    })
                });
            }
            // Notify admin
            for (const adminNum of adminNumbers) {
                await (0, send_1.sendMessage)({
                    bookingId: data.bookingId,
                    templateKey: 'NEW_BOOKING_ADMIN',
                    to: adminNum,
                    body: `[Flavor Entertainers] Payment confirmed for booking ${data.bookingReference}. Client: ${data.clientName}.`
                });
            }
        }
        else if (data.type === 'booking_expired') {
            // Notify client their booking expired
            if (data.clientPhone) {
                await (0, send_1.sendMessage)({
                    bookingId: data.bookingId,
                    templateKey: 'CANCELLED_ALL',
                    to: data.clientPhone,
                    body: `[Flavor Entertainers] Your booking ${data.bookingReference} has expired due to non-payment. Please rebook if you'd still like to proceed.`
                });
            }
        }
        else if (data.type === 'payment_review') {
            // Notify admin of payment needing review
            for (const adminNum of adminNumbers) {
                await (0, send_1.sendMessage)({
                    bookingId: data.bookingId,
                    templateKey: 'NEW_BOOKING_ADMIN',
                    to: adminNum,
                    body: `[Flavor Entertainers] Payment for booking ${data.bookingReference} requires manual review (amount mismatch or issue).`
                });
            }
        }
        await snapshot.ref.update({
            sent: true,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (error) {
        console.error('Notification outbox worker error:', error);
        await snapshot.ref.update({
            sent: false,
            lastError: error.message,
        });
    }
});
// Export DNS functions
__exportStar(require("./dns"), exports);
// --- Didit KYC Endpoints ---
/**
 * Webhook endpoint for Didit KYC verification results.
 * Didit sends POST requests here when verification status changes.
 */
exports.diditKycWebhook = fns.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    // Verify webhook signature
    const signature = req.headers['x-signature'] || '';
    const timestamp = req.headers['x-timestamp'] || '';
    const rawBody = JSON.stringify(req.body);
    if (!(0, didit_1.verifyWebhookSignature)(rawBody, signature, timestamp)) {
        console.error('Invalid Didit webhook signature');
        res.status(403).send('Invalid signature');
        return;
    }
    try {
        const webhookData = req.body;
        const eventType = webhookData.event || 'status.updated';
        if (eventType === 'status.updated' &&
            (webhookData.status === 'Approved' || webhookData.status === 'Declined')) {
            const result = await (0, didit_1.processKycResult)(webhookData);
            console.log(`KYC ${result.kycResult} for booking ${result.bookingId} → ${result.newStatus}`);
            // Send notification to client
            const bookingDoc = await db.collection('bookings').doc(result.bookingId).get();
            const booking = bookingDoc.data();
            const clientPhone = (booking === null || booking === void 0 ? void 0 : booking.clientPhone) || (booking === null || booking === void 0 ? void 0 : booking.phone) || (booking === null || booking === void 0 ? void 0 : booking.client_phone);
            if (clientPhone) {
                if (result.kycResult === 'PASS' && result.newStatus === 'CONFIRMED') {
                    await (0, send_1.sendMessage)({
                        bookingId: result.bookingId,
                        templateKey: 'CONFIRMED_CLIENT',
                        to: clientPhone,
                        body: (0, templates_1.renderTemplate)('CONFIRMED_CLIENT', booking)
                    });
                }
                else if (result.kycResult === 'FAIL') {
                    await (0, send_1.sendMessage)({
                        bookingId: result.bookingId,
                        templateKey: 'DECLINED_CLIENT',
                        to: clientPhone,
                        body: (0, templates_1.renderTemplate)('DECLINED_CLIENT', booking)
                    });
                }
            }
        }
        res.status(200).json({ received: true });
    }
    catch (error) {
        console.error('Error processing Didit webhook:', error);
        res.status(500).json({ error: 'Internal error processing webhook' });
    }
});
/**
 * Admin-triggered KYC session creation.
 * Use when auto-creation fails or admin wants to manually trigger KYC.
 */
exports.adminTriggerKyc = fns.https.onCall(async (data, context) => {
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
        const session = await (0, didit_1.createKycSession)(bookingId);
        return {
            success: true,
            verification_url: (session === null || session === void 0 ? void 0 : session.verification_url) || null,
            session_id: (session === null || session === void 0 ? void 0 : session.session_id) || null
        };
    }
    catch (error) {
        throw new fns.https.HttpsError('internal', `Failed to create KYC session: ${error.message}`);
    }
});
// --- Safety Verification System ---
/**
 * Step 2: Record client consent before identity verification.
 */
exports.recordBookingConsent = fns.https.onCall(async (data, context) => {
    var _a;
    const { bookingId, ipAddress, userAgent, deviceFingerprint } = data;
    if (!bookingId) {
        throw new fns.https.HttpsError('invalid-argument', 'bookingId is required');
    }
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    if (!bookingDoc.exists) {
        throw new fns.https.HttpsError('not-found', 'Booking not found');
    }
    const booking = bookingDoc.data();
    const consentId = await (0, consent_1.recordConsent)({
        bookingId,
        clientEmail: booking.client_email || booking.email,
        clientPhone: booking.client_phone || booking.phone,
        ipAddress: ipAddress || ((_a = context.rawRequest) === null || _a === void 0 ? void 0 : _a.ip) || 'unknown',
        userAgent: userAgent || 'unknown',
        deviceFingerprint,
        consentText: consent_1.CONSENT_TEXT,
    });
    return { success: true, consentId, consentText: consent_1.CONSENT_TEXT };
});
/**
 * Performer: Submit an incident report about a dangerous client.
 */
exports.submitIncidentReport = fns.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const { client_name, client_email, client_phone, incident_description, risk_level, evidence_urls, booking_id } = data;
    if (!client_name || !incident_description || !risk_level) {
        throw new fns.https.HttpsError('invalid-argument', 'Missing required fields');
    }
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(risk_level)) {
        throw new fns.https.HttpsError('invalid-argument', 'Invalid risk level');
    }
    const reportId = await (0, reporting_1.createIncidentReport)({
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
    const adminNumbers = ((_a = settingsDoc.data()) === null || _a === void 0 ? void 0 : _a.adminNotifyNumbers) || [];
    for (const num of adminNumbers) {
        await (0, send_1.sendMessage)({
            bookingId: booking_id || 'incident',
            templateKey: 'KYC_FLAGGED_ADMIN',
            to: num,
            body: `[Flavor Entertainers] ⚠️ New incident report: ${client_name} (${risk_level}). "${incident_description.substring(0, 80)}..." Review in admin dashboard.`,
        });
    }
    return { success: true, reportId };
});
/**
 * Admin: Review and act on an incident report.
 */
exports.adminReviewIncident = fns.https.onCall(async (data, context) => {
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
        await (0, reporting_1.approveIncidentReport)(reportId, context.auth.uid, notes);
        return { success: true, message: 'Report approved. Client added to DNS register.' };
    }
    else if (action === 'reject') {
        await (0, reporting_1.rejectIncidentReport)(reportId, context.auth.uid, notes || 'Insufficient evidence');
        return { success: true, message: 'Report rejected.' };
    }
    else {
        throw new fns.https.HttpsError('invalid-argument', 'Action must be "approve" or "reject"');
    }
});
/**
 * Run full risk assessment for a booking.
 * Called after KYC result or manually by admin.
 */
exports.assessBookingRisk = fns.https.onCall(async (data, context) => {
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
    const booking = bookingDoc.data();
    const assessment = await (0, scoring_1.calculateRiskScore)({
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
    }
    else if (assessment.decision === 'MANUAL_REVIEW') {
        await db.collection('bookings').doc(bookingId).update({
            risk_score: assessment.score,
            risk_level: assessment.level,
            risk_decision: assessment.decision,
            status: 'PENDING_ADMIN_REVIEW',
        });
    }
    else {
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
exports.addAnnaTest = fns.https.onRequest(async (req, res) => {
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: String(error) });
    }
});
/**
 * seedDatabase — Public HTTPS endpoint to populate Firestore with sample data.
 * Uses Admin SDK so Firestore security rules are bypassed.
 * Only seeds if the performers collection is empty (idempotent).
 */
exports.seedDatabase = fns.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    try {
        const existing = await db.collection('performers').limit(1).get();
        if (!existing.empty) {
            res.json({ success: true, message: 'Database already seeded — performers exist.', seeded: false });
            return;
        }
        const batch = db.batch();
        const performers = [
            { id: 5, name: 'April Flavor', tagline: 'Sweet, sassy, and always a delight.', photo_url: 'https://picsum.photos/seed/april/800/1200', bio: 'April brings a fresh and exciting energy to every event. With a background in dance and modeling, she captivates audiences and ensures a memorable experience.', service_ids: ['waitress-topless', 'show-hot-cream', 'show-pearl', 'show-deluxe-works', 'misc-promo-model'], service_areas: ['Perth North', 'Perth South'], status: 'available', rating: 4.9, review_count: 124, min_booking_duration_hours: 2, created_at: admin.firestore.FieldValue.serverTimestamp() },
            { id: 6, name: 'Anna Ivky', tagline: 'Sophistication and a hint of mystery.', photo_url: 'https://picsum.photos/seed/anna/800/1200', bio: 'Anna is the epitome of grace and professionalism. Her experience with exclusive, private events makes her the ideal choice for clients seeking a discreet yet impactful presence.', service_ids: ['waitress-lingerie', 'show-toy', 'show-works-greek', 'show-absolute-works'], service_areas: ['Perth South', 'Southwest'], status: 'available', rating: 5.0, review_count: 89, min_booking_duration_hours: 3, created_at: admin.firestore.FieldValue.serverTimestamp() },
            { id: 1, name: 'Scarlett', tagline: 'The life of the party, guaranteed.', photo_url: 'https://picsum.photos/seed/scarlett/800/1200', bio: 'With over a decade of experience in corporate events and private parties, Scarlett knows exactly how to get the crowd going.', service_ids: ['waitress-topless', 'waitress-nude', 'show-hot-cream', 'misc-atmospheric'], service_areas: ['Perth North', 'Perth South', 'Southwest'], status: 'available', rating: 4.8, review_count: 215, min_booking_duration_hours: 2, created_at: admin.firestore.FieldValue.serverTimestamp() },
            { id: 2, name: 'Jasmine', tagline: 'Elegance and charm for your special event.', photo_url: 'https://picsum.photos/seed/jasmine/800/1200', bio: 'Jasmine specializes in high-end events, bringing a touch of class and sophistication.', service_ids: ['misc-promo-model', 'misc-atmospheric', 'waitress-lingerie'], service_areas: ['Perth South'], status: 'busy', rating: 4.7, review_count: 56, min_booking_duration_hours: 2, created_at: admin.firestore.FieldValue.serverTimestamp() },
            { id: 3, name: 'Amber', tagline: 'Bringing warmth and energy to every room.', photo_url: 'https://picsum.photos/seed/amber/800/1200', bio: 'Amber\'s infectious energy and friendly approach make her perfect for creating a relaxed and fun atmosphere.', service_ids: ['waitress-topless', 'misc-games-host', 'show-pearl'], service_areas: ['Perth North', 'Northwest'], status: 'available', rating: 4.9, review_count: 142, min_booking_duration_hours: 1, created_at: admin.firestore.FieldValue.serverTimestamp() },
            { id: 4, name: 'Chloe', tagline: 'Professional, punctual, and always polished.', photo_url: 'https://picsum.photos/seed/chloe/800/1200', bio: 'Chloe prides herself on her professionalism and attention to detail.', service_ids: ['misc-promo-model', 'misc-atmospheric', 'waitress-lingerie'], service_areas: ['Southwest'], status: 'offline', rating: 4.6, review_count: 38, min_booking_duration_hours: 2, created_at: admin.firestore.FieldValue.serverTimestamp() },
        ];
        const services = [
            { id: 'waitress-lingerie', category: 'Waitressing', name: 'Lingerie Waitress', rate: 110, rate_type: 'per_hour', min_duration_hours: 1 },
            { id: 'waitress-topless', category: 'Waitressing', name: 'Topless Waitress', rate: 160, rate_type: 'per_hour', min_duration_hours: 1 },
            { id: 'waitress-nude', category: 'Waitressing', name: 'Nude Waitress', rate: 260, rate_type: 'per_hour', min_duration_hours: 1 },
            { id: 'show-hot-cream', category: 'Strip Show', name: 'Hot Cream Show', rate: 380, rate_type: 'flat', duration_minutes: 10 },
            { id: 'show-pearl', category: 'Strip Show', name: 'Pearl Show', rate: 500, rate_type: 'flat', duration_minutes: 15 },
            { id: 'show-toy', category: 'Strip Show', name: 'Toy Show', rate: 550, rate_type: 'flat', duration_minutes: 15 },
            { id: 'show-pearls-vibe-cream', category: 'Strip Show', name: 'Pearls, Vibe + Cream', rate: 650, rate_type: 'flat', duration_minutes: 20 },
            { id: 'show-works-fruit', category: 'Strip Show', name: 'Works + Fruit', rate: 650, rate_type: 'flat', duration_minutes: 20 },
            { id: 'show-deluxe-works', category: 'Strip Show', name: 'Deluxe Works Show', rate: 700, rate_type: 'flat', duration_minutes: 20 },
            { id: 'show-fisting-squirting', category: 'Strip Show', name: 'Fisting Squirting', rate: 750, rate_type: 'flat', duration_minutes: 20 },
            { id: 'show-works-greek', category: 'Strip Show', name: 'Works + Greek Show', rate: 850, rate_type: 'flat', duration_minutes: 20 },
            { id: 'show-absolute-works', category: 'Strip Show', name: 'The Absolute Works', rate: 1000, rate_type: 'flat', duration_minutes: 25 },
            { id: 'misc-promo-model', category: 'Promotional & Hosting', name: 'Promotional Model', rate: 100, rate_type: 'per_hour', min_duration_hours: 2 },
            { id: 'misc-atmospheric', category: 'Promotional & Hosting', name: 'Atmospheric Entertainment', rate: 90, rate_type: 'per_hour', min_duration_hours: 2 },
            { id: 'misc-games-host', category: 'Promotional & Hosting', name: 'Game Hosting', rate: 120, rate_type: 'per_hour', min_duration_hours: 1 },
        ];
        for (const p of performers) {
            batch.set(db.collection('performers').doc(String(p.id)), p);
        }
        for (const s of services) {
            batch.set(db.collection('services').doc(s.id), s);
        }
        await batch.commit();
        console.log('Database seeded successfully with performers and services.');
        res.json({ success: true, message: 'Database seeded with 6 performers and 15 services.', seeded: true });
    }
    catch (error) {
        console.error('Seed error:', error);
        res.status(500).json({ success: false, error: String(error) });
    }
});
//# sourceMappingURL=index.js.map