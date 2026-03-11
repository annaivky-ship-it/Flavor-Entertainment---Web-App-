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
exports.CONSENT_TEXT = void 0;
exports.recordConsent = recordConsent;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const getDb = () => (0, firestore_1.getFirestore)('default');
/**
 * Record client consent for identity verification.
 * Must be called before KYC session creation.
 */
async function recordConsent(params) {
    const consentRef = await getDb().collection('consents').add({
        booking_id: params.bookingId,
        client_email: params.clientEmail.toLowerCase().trim(),
        client_phone: params.clientPhone,
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        device_fingerprint: params.deviceFingerprint || null,
        consent_text: params.consentText,
        consented_at: admin.firestore.FieldValue.serverTimestamp(),
        revoked: false,
    });
    // Update booking with consent reference
    await getDb().collection('bookings').doc(params.bookingId).update({
        consent_id: consentRef.id,
        consent_timestamp: admin.firestore.FieldValue.serverTimestamp(),
        client_ip: params.ipAddress,
        device_fingerprint: params.deviceFingerprint || null,
    });
    await getDb().collection('audit_log').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actor_id: params.clientEmail,
        actor_role: 'client',
        action: 'CONSENT_RECORDED',
        booking_id: params.bookingId,
        details: {
            consent_id: consentRef.id,
            ip_address: params.ipAddress,
        },
    });
    return consentRef.id;
}
exports.CONSENT_TEXT = `By proceeding, I consent to the following:

1. My government-issued ID will be verified through a secure third-party identity verification service.
2. A liveness check may be performed to confirm my identity.
3. My details will be checked against internal safety databases.
4. This verification is required before any booking can be confirmed.
5. My verification results will be stored securely and used solely for safety purposes.
6. I understand that failing verification will result in my booking being declined.

This process protects the safety of all parties involved.`;
//# sourceMappingURL=index.js.map