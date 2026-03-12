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
exports.scheduledSlotCleanup = exports.scheduledRateLimitCleanup = exports.assessBookingRisk = exports.adminReviewIncident = exports.submitIncidentReport = exports.recordBookingConsent = exports.adminTriggerKyc = exports.diditKycWebhook = exports.onBookingStatusChanged = exports.onBookingCreated = exports.twilioInboundWebhook = exports.notificationsWorker = exports.createBookingRequest = exports.scheduledRetentionCleanup = exports.reviewApplicationApprove = exports.submitApplication = exports.createDraftApplication = exports.analyzeVettingRisk = void 0;
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
const rateLimit_1 = require("./utils/rateLimit");
const logger_1 = require("./utils/logger");
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
        logger_1.logger.error("Gemini vetting analysis failed", { error: String(error) });
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
    // Rate limit: max 3 submissions per user per hour
    const allowed = await (0, rateLimit_1.checkRateLimit)(context.auth.uid, {
        prefix: 'vetting_submit',
        maxRequests: 3,
        windowSeconds: 3600,
    });
    if (!allowed) {
        throw new fns.https.HttpsError('resource-exhausted', 'Too many submission attempts. Please try again later.');
    }
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
    logger_1.logger.info("Retention cleanup completed", { cleanedCount: toCleanup.length });
});
/**
 * Legacy Booking Transaction (Retained for functionality)
 */
exports.createBookingRequest = fns.https.onCall(async (request) => {
    const { formState, performerIds } = request.data;
    // --- Input Validation ---
    if (!formState || typeof formState !== 'object') {
        throw new fns.https.HttpsError('invalid-argument', 'formState is required.');
    }
    if (!Array.isArray(performerIds) || performerIds.length === 0) {
        throw new fns.https.HttpsError('invalid-argument', 'At least one performer must be selected.');
    }
    if (!formState.email || typeof formState.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.email)) {
        throw new fns.https.HttpsError('invalid-argument', 'A valid email address is required.');
    }
    if (!formState.fullName || typeof formState.fullName !== 'string' || formState.fullName.trim().length < 2) {
        throw new fns.https.HttpsError('invalid-argument', 'Full name is required.');
    }
    if (!formState.phone && !formState.mobile) {
        throw new fns.https.HttpsError('invalid-argument', 'Phone number is required.');
    }
    if (!formState.eventDate || typeof formState.eventDate !== 'string') {
        throw new fns.https.HttpsError('invalid-argument', 'Event date is required.');
    }
    // Verify event date is today or in the future
    const eventDateParsed = new Date(formState.eventDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(eventDateParsed.getTime())) {
        throw new fns.https.HttpsError('invalid-argument', 'Invalid event date format.');
    }
    if (eventDateParsed < today) {
        throw new fns.https.HttpsError('invalid-argument', 'Event date cannot be in the past.');
    }
    if (!formState.eventTime || typeof formState.eventTime !== 'string') {
        throw new fns.https.HttpsError('invalid-argument', 'Event time is required.');
    }
    // Rate limit: max 5 booking attempts per email per hour
    const emailKey = (formState.email || '').toLowerCase().trim();
    const allowed = await (0, rateLimit_1.checkRateLimit)(emailKey, {
        prefix: 'booking_create',
        maxRequests: 5,
        windowSeconds: 3600,
    });
    if (!allowed) {
        throw new fns.https.HttpsError('resource-exhausted', 'Too many booking attempts. Please try again later.');
    }
    return db.runTransaction(async (transaction) => {
        const emailHash = Buffer.from(formState.email.toLowerCase()).toString('hex');
        const blacklistDoc = await transaction.get(db.collection('blacklist').doc(emailHash));
        if (blacklistDoc.exists)
            throw new fns.https.HttpsError('permission-denied', 'Application could not be processed.');
        // DNS Check
        const normalizedEmail = formState.email.toLowerCase().trim();
        const normalizedPhone = formState.phone.replace(/\s+/g, '');
        const dnsEmailQuery = await transaction.get(db.collection('do_not_serve').where('email', '==', normalizedEmail));
        const dnsPhoneQuery = await transaction.get(db.collection('do_not_serve').where('phone', '==', normalizedPhone));
        if (!dnsEmailQuery.empty || !dnsPhoneQuery.empty) {
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
            const bookingData = Object.assign(Object.assign({}, formState), { performer_id: pId, status: 'pending_performer_acceptance', slotLock: slotId, created_at: admin.firestore.FieldValue.serverTimestamp() });
            // Reserve the slot atomically (expires after 48 hours if booking not confirmed)
            transaction.set(slotRef, {
                bookingId: bookingRef.id,
                performerId: pId,
                date: formState.eventDate,
                time: formState.eventTime,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
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
        return { success: true, bookingIds: newBookings.map(b => b.id) };
    });
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
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
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
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
        res.status(415).send('Content-Type must be application/json');
        return;
    }
    // Verify webhook signature
    const signature = req.headers['x-signature'] || '';
    const timestamp = req.headers['x-timestamp'] || '';
    const rawBody = JSON.stringify(req.body);
    if (!(0, didit_1.verifyWebhookSignature)(rawBody, signature, timestamp)) {
        logger_1.logger.error('Invalid Didit webhook signature', { ip: req.ip });
        res.status(403).send('Invalid signature');
        return;
    }
    try {
        const webhookData = req.body;
        const eventType = webhookData.event || 'status.updated';
        if (eventType === 'status.updated' &&
            (webhookData.status === 'Approved' || webhookData.status === 'Declined')) {
            const result = await (0, didit_1.processKycResult)(webhookData);
            logger_1.logger.info("KYC result processed", { kycResult: result.kycResult, bookingId: result.bookingId, newStatus: result.newStatus });
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
        logger_1.logger.error('Error processing Didit webhook', { error: error.message });
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
/**
 * Scheduled cleanup for expired rate limit entries.
 * Runs every hour to prevent the rate_limits collection from growing indefinitely.
 */
exports.scheduledRateLimitCleanup = fns.pubsub.schedule('every 1 hours').onRun(async () => {
    const cleaned = await (0, rateLimit_1.cleanupRateLimits)();
    if (cleaned > 0) {
        logger_1.logger.info("Rate limit cleanup completed", { cleanedCount: cleaned });
    }
});
/**
 * Clean up expired booking slot locks.
 * Runs every 6 hours to release slots from abandoned bookings.
 */
exports.scheduledSlotCleanup = fns.pubsub.schedule('every 6 hours').onRun(async () => {
    const now = new Date();
    const expiredSlots = await db.collection('booking_slots')
        .where('expiresAt', '<=', now)
        .limit(200)
        .get();
    if (expiredSlots.empty)
        return;
    let cleaned = 0;
    for (const slotDoc of expiredSlots.docs) {
        const slot = slotDoc.data();
        // Only release if the associated booking is not confirmed
        if (slot.bookingId) {
            const bookingDoc = await db.collection('bookings').doc(slot.bookingId).get();
            const booking = bookingDoc.data();
            if (booking && (booking.status === 'confirmed' || booking.status === 'CONFIRMED')) {
                // Booking is confirmed, remove the expiry (slot is permanent)
                await slotDoc.ref.update({ expiresAt: admin.firestore.FieldValue.delete() });
                continue;
            }
        }
        await slotDoc.ref.delete();
        cleaned++;
    }
    if (cleaned > 0) {
        logger_1.logger.info("Expired slot cleanup completed", { releasedCount: cleaned });
    }
});
//# sourceMappingURL=index.js.map