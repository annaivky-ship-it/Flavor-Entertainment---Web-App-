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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createKycSession = createKycSession;
exports.verifyWebhookSignature = verifyWebhookSignature;
exports.processKycResult = processKycResult;
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const getDb = () => admin.firestore();
// Didit API Configuration
const DIDIT_API_KEY = process.env.DIDIT_API_KEY || '';
const DIDIT_WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID || '';
const DIDIT_API_BASE = process.env.DIDIT_API_BASE || 'https://verification.didit.me';
const DIDIT_APP_URL = process.env.DIDIT_APP_URL || 'https://flavorentertainers.com.au';
const DIDIT_WEBHOOK_SECRET = process.env.DIDIT_WEBHOOK_SECRET || '';
// --- Session Management ---
/**
 * Create a Didit KYC verification session for a booking.
 * Returns the verification URL to redirect/embed for the client.
 */
async function createKycSession(bookingId) {
    if (!DIDIT_API_KEY || !DIDIT_WORKFLOW_ID) {
        console.warn('Didit KYC not configured. Skipping session creation.');
        return null;
    }
    const bookingDoc = await getDb().collection('bookings').doc(bookingId).get();
    if (!bookingDoc.exists) {
        throw new Error(`Booking ${bookingId} not found`);
    }
    const booking = bookingDoc.data();
    const callbackUrl = `${DIDIT_APP_URL}/kyc-complete?bookingId=${bookingId}`;
    try {
        const response = await fetch(`${DIDIT_API_BASE}/v3/session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DIDIT_API_KEY}`,
            },
            body: JSON.stringify({
                workflow_id: DIDIT_WORKFLOW_ID,
                vendor_data: bookingId,
                callback: callbackUrl,
                features: {
                    document: true,
                    face_match: true,
                    aml: true,
                },
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Didit API error (${response.status}):`, errorText);
            throw new Error(`Didit API returned ${response.status}`);
        }
        const sessionData = await response.json();
        // Store session info in Firestore
        await getDb().collection('bookings').doc(bookingId).update({
            kyc_status: 'PENDING',
            kyc_provider: 'didit',
            kyc_session_id: sessionData.session_id,
            kyc_verification_url: sessionData.verification_url,
            kyc_initiated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Store full session record for audit
        await getDb().collection('kyc_sessions').doc(sessionData.session_id).set({
            booking_id: bookingId,
            session_id: sessionData.session_id,
            session_token: sessionData.session_token,
            verification_url: sessionData.verification_url,
            client_email: booking.client_email,
            client_phone: booking.client_phone,
            client_name: booking.client_name,
            status: 'NOT_STARTED',
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Audit log
        await getDb().collection('audit_log').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            actor_id: 'system',
            actor_role: 'system',
            action: 'KYC_SESSION_CREATED',
            booking_id: bookingId,
            details: {
                provider: 'didit',
                session_id: sessionData.session_id,
            },
        });
        console.log(`KYC session created for booking ${bookingId}: ${sessionData.session_id}`);
        return sessionData;
    }
    catch (error) {
        console.error('Failed to create Didit KYC session:', error);
        // Mark booking as KYC failed so admin can retry
        await getDb().collection('bookings').doc(bookingId).update({
            kyc_status: 'ERROR',
            kyc_error: error.message || 'Unknown error creating KYC session',
        });
        throw error;
    }
}
// --- Webhook Verification ---
/**
 * Verify the Didit webhook signature for authenticity.
 */
function verifyWebhookSignature(payload, signature, timestamp) {
    if (!DIDIT_WEBHOOK_SECRET) {
        console.warn('Didit webhook secret not configured. Skipping signature verification.');
        return true; // Allow in dev, but warn
    }
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
        .createHmac('sha256', DIDIT_WEBHOOK_SECRET)
        .update(signedPayload)
        .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
// --- Process Webhook Result ---
/**
 * Process a Didit webhook event and update booking/DNS status accordingly.
 */
async function processKycResult(webhookData) {
    var _a, _b, _c;
    const { session_id, status, vendor_data } = webhookData;
    // Look up booking from session
    let bookingId = vendor_data;
    if (!bookingId) {
        const sessionDoc = await getDb().collection('kyc_sessions').doc(session_id).get();
        if (!sessionDoc.exists) {
            throw new Error(`KYC session ${session_id} not found`);
        }
        bookingId = sessionDoc.data().booking_id;
    }
    const bookingRef = getDb().collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) {
        throw new Error(`Booking ${bookingId} not found`);
    }
    const booking = bookingDoc.data();
    // Update KYC session record
    await getDb().collection('kyc_sessions').doc(session_id).update({
        status: status,
        document_data: webhookData.document_data || null,
        face_match: webhookData.face_match || null,
        aml_screening: webhookData.aml_screening || null,
        completed_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    const kycResult = status === 'Approved' ? 'PASS' : 'FAIL';
    let newBookingStatus;
    if (kycResult === 'PASS') {
        // KYC passed — check AML flags
        const hasAmlHits = ((_a = webhookData.aml_screening) === null || _a === void 0 ? void 0 : _a.result) === 'flagged';
        if (hasAmlHits) {
            // Flag for admin review but don't auto-deny
            newBookingStatus = 'PENDING_ADMIN_REVIEW';
            await bookingRef.update({
                kyc_status: 'PASS_WITH_FLAGS',
                kyc_aml_flagged: true,
                status: newBookingStatus,
                kyc_document_data: webhookData.document_data || null,
                kyc_completed_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await logAudit('system', 'system', 'KYC_PASS_WITH_AML_FLAGS', bookingId, {
                provider: 'didit',
                aml_hits: (_b = webhookData.aml_screening) === null || _b === void 0 ? void 0 : _b.hits,
            });
        }
        else {
            // Clean pass — check DNS one more time, then confirm
            const { dnsLookup } = await Promise.resolve().then(() => __importStar(require('./dns/index')));
            const isBlocked = await dnsLookup(booking.client_email_hash, booking.client_phone_hash);
            if (isBlocked) {
                newBookingStatus = 'DENIED';
                await bookingRef.update({
                    kyc_status: 'PASS',
                    dns_status: 'DENIED_DNS_AFTER_KYC',
                    status: newBookingStatus,
                    refundable_amount: booking.amount_deposit,
                    non_refundable_amount: booking.amount_kyc_fee,
                    kyc_document_data: webhookData.document_data || null,
                    kyc_completed_at: admin.firestore.FieldValue.serverTimestamp(),
                });
                await logAudit('system', 'system', 'DNS_HIT_AFTER_KYC', bookingId, {
                    reason: 'Client passed KYC but matched DNS entry',
                });
            }
            else {
                newBookingStatus = 'CONFIRMED';
                await bookingRef.update({
                    kyc_status: 'PASS',
                    dns_status: 'CLEAR',
                    status: newBookingStatus,
                    kyc_document_data: webhookData.document_data || null,
                    kyc_completed_at: admin.firestore.FieldValue.serverTimestamp(),
                });
                await logAudit('system', 'system', 'KYC_PASS', bookingId, {
                    provider: 'didit',
                    verified_name: (_c = webhookData.document_data) === null || _c === void 0 ? void 0 : _c.full_name,
                });
            }
        }
    }
    else {
        // KYC failed
        newBookingStatus = 'DENIED';
        await bookingRef.update({
            kyc_status: 'FAIL',
            status: newBookingStatus,
            refundable_amount: booking.amount_deposit,
            non_refundable_amount: booking.amount_kyc_fee,
            kyc_document_data: webhookData.document_data || null,
            kyc_completed_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        await logAudit('system', 'system', 'KYC_FAIL', bookingId, {
            provider: 'didit',
            reason: `Didit status: ${status}`,
        });
    }
    return {
        bookingId: bookingId,
        kycResult,
        newStatus: newBookingStatus,
    };
}
// --- Helper ---
async function logAudit(actorUid, actorRole, action, bookingId, details = {}) {
    await getDb().collection('audit_log').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actor_id: actorUid,
        actor_role: actorRole,
        action,
        booking_id: bookingId,
        details,
    });
}
//# sourceMappingURL=didit.js.map