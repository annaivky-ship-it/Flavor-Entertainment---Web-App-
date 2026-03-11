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
exports.runDnsMigration = exports.handleKycWebhookOrResult = exports.confirmPayidPayment = exports.createBookingAndScreenDns = void 0;
exports.normalizeEmail = normalizeEmail;
exports.normalizePhoneToE164 = normalizePhoneToE164;
exports.sha256 = sha256;
exports.dnsLookup = dnsLookup;
exports.hasPreviousSuccessfulBooking = hasPreviousSuccessfulBooking;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const crypto = __importStar(require("crypto"));
const didit_1 = require("../didit");
const getDb = () => (0, firestore_1.getFirestore)('default');
const fns = functions;
const PEPPER = process.env.DNS_HASH_PEPPER || 'default-secret-pepper-change-me-in-prod';
// --- Helpers ---
function normalizeEmail(email) {
    return email.toLowerCase().trim();
}
function normalizePhoneToE164(phone, defaultCountryCode = '+61') {
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = defaultCountryCode + cleaned.substring(1);
    }
    else if (!cleaned.startsWith('+')) {
        cleaned = defaultCountryCode + cleaned;
    }
    return cleaned;
}
function sha256(value) {
    return crypto.createHash('sha256').update(value + PEPPER).digest('hex');
}
async function writeAuditLog(actorUid, actorRole, action, bookingId, details = {}) {
    await getDb().collection('audit_log').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actor_id: actorUid,
        actor_role: actorRole,
        action,
        booking_id: bookingId,
        details
    });
}
// --- Core DNS Lookup ---
async function dnsLookup(emailHash, phoneHash) {
    const dnsQuery = await getDb().collection('dns_entries')
        .where('status', '==', 'ACTIVE')
        .where('match_keys', 'array-contains-any', [emailHash, phoneHash])
        .limit(1)
        .get();
    return !dnsQuery.empty;
}
async function hasPreviousSuccessfulBooking(emailHash, phoneHash) {
    const emailQuery = await getDb().collection('bookings')
        .where('client_email_hash', '==', emailHash)
        .where('kyc_status', 'in', ['PASS', 'BYPASSED'])
        .limit(1)
        .get();
    if (!emailQuery.empty)
        return true;
    const phoneQuery = await getDb().collection('bookings')
        .where('client_phone_hash', '==', phoneHash)
        .where('kyc_status', 'in', ['PASS', 'BYPASSED'])
        .limit(1)
        .get();
    return !phoneQuery.empty;
}
// --- Cloud Functions ---
exports.createBookingAndScreenDns = fns.https.onCall(async (data, context) => {
    var _a, _b, _c;
    const { client_email, client_phone, client_name, amount_deposit, amount_kyc_fee } = data;
    if (!client_email || !client_phone || !client_name) {
        throw new fns.https.HttpsError('invalid-argument', 'Missing required client details.');
    }
    const emailHash = sha256(normalizeEmail(client_email));
    const phoneHash = sha256(normalizePhoneToE164(client_phone));
    const isBlocked = await dnsLookup(emailHash, phoneHash);
    const bookingRef = getDb().collection('bookings').doc();
    const payid_reference = `BK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    if (isBlocked) {
        const amount_total_due = amount_deposit + amount_kyc_fee;
        const bookingData = {
            client_name,
            client_email,
            client_phone,
            client_email_hash: emailHash,
            client_phone_hash: phoneHash,
            payid_reference,
            amount_deposit,
            amount_kyc_fee,
            amount_total_due,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            dns_status: 'DENIED_DNS',
            status: 'DENIED',
            payment_status: 'AWAITING_PAYMENT', // Never shown
            kyc_status: 'NOT_STARTED'
        };
        await bookingRef.set(bookingData);
        await writeAuditLog(((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid) || 'anonymous', context.auth ? 'client' : 'system', 'DNS_HIT', bookingRef.id, { reason: 'Matched active DNS entry during initial screening' });
        await writeAuditLog(((_b = context.auth) === null || _b === void 0 ? void 0 : _b.uid) || 'anonymous', context.auth ? 'client' : 'system', 'BOOKING_DENIED', bookingRef.id, { reason: 'DNS_HIT' });
        return {
            success: false,
            message: 'We can’t proceed with this booking.'
        };
    }
    // Not blocked, check if previous booker
    const isPreviousBooker = await hasPreviousSuccessfulBooking(emailHash, phoneHash);
    const final_amount_kyc_fee = isPreviousBooker ? 0 : amount_kyc_fee;
    const final_kyc_status = isPreviousBooker ? 'BYPASSED' : 'NOT_STARTED';
    const amount_total_due = amount_deposit + final_amount_kyc_fee;
    const bookingData = {
        client_name,
        client_email,
        client_phone,
        client_email_hash: emailHash,
        client_phone_hash: phoneHash,
        payid_reference,
        amount_deposit,
        amount_kyc_fee: final_amount_kyc_fee,
        amount_total_due,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        dns_status: 'CLEAR',
        status: 'PENDING',
        payment_status: 'AWAITING_PAYMENT',
        kyc_status: final_kyc_status
    };
    await bookingRef.set(bookingData);
    await writeAuditLog(((_c = context.auth) === null || _c === void 0 ? void 0 : _c.uid) || 'anonymous', context.auth ? 'client' : 'system', 'DNS_CHECK', bookingRef.id, { result: 'CLEAR', isPreviousBooker });
    return {
        success: true,
        bookingId: bookingRef.id,
        paymentInstructions: {
            payid_identifier: 'payments@flavrentertainers.com.au',
            amount_total_due,
            payid_reference
        }
    };
});
exports.confirmPayidPayment = fns.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    // Verify Admin
    const adminDoc = await getDb().collection('admins').doc(context.auth.uid).get();
    if (!adminDoc.exists && context.auth.token.admin !== true) {
        throw new fns.https.HttpsError('permission-denied', 'Admin access required');
    }
    const { bookingId } = data;
    const bookingRef = getDb().collection('bookings').doc(bookingId);
    let shouldSkipKyc = false;
    await getDb().runTransaction(async (t) => {
        const doc = await t.get(bookingRef);
        if (!doc.exists)
            throw new fns.https.HttpsError('not-found', 'Booking not found');
        const bookingData = doc.data();
        shouldSkipKyc = bookingData.kyc_status === 'BYPASSED';
        t.update(bookingRef, {
            payment_status: 'PAID',
            status: shouldSkipKyc ? 'CONFIRMED' : 'DEPOSIT_PAID'
        });
    });
    await writeAuditLog(context.auth.uid, 'admin', 'PAYMENT_CONFIRMED', bookingId);
    if (shouldSkipKyc) {
        await writeAuditLog('system', 'system', 'KYC_BYPASSED', bookingId);
        return { success: true, kyc_required: false };
    }
    else {
        // Trigger Didit KYC session
        try {
            const session = await (0, didit_1.createKycSession)(bookingId);
            await writeAuditLog('system', 'system', 'KYC_STARTED', bookingId, {
                provider: 'didit',
                session_id: (session === null || session === void 0 ? void 0 : session.session_id) || null
            });
            return {
                success: true,
                kyc_required: true,
                verification_url: (session === null || session === void 0 ? void 0 : session.verification_url) || null
            };
        }
        catch (error) {
            console.error('KYC session creation failed:', error);
            await writeAuditLog('system', 'system', 'KYC_SESSION_ERROR', bookingId, {
                error: error.message
            });
            return {
                success: true,
                kyc_required: true,
                kyc_error: 'Failed to create verification session. Admin will follow up.'
            };
        }
    }
});
exports.handleKycWebhookOrResult = fns.https.onCall(async (data, context) => {
    // In reality, this might be an HTTP webhook from a KYC provider
    // For this example, we'll assume it's an admin or system call
    if (!context.auth) {
        throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const { bookingId, kycResult, providerRef } = data; // kycResult: 'PASS' | 'FAIL'
    const bookingRef = getDb().collection('bookings').doc(bookingId);
    const doc = await bookingRef.get();
    if (!doc.exists)
        throw new fns.https.HttpsError('not-found', 'Booking not found');
    const booking = doc.data();
    const updateData = {
        kyc_status: kycResult,
        kyc_provider_ref: providerRef || null
    };
    if (kycResult === 'PASS') {
        // Re-run DNS check
        const isBlocked = await dnsLookup(booking.client_email_hash, booking.client_phone_hash);
        if (isBlocked) {
            updateData.dns_status = 'DENIED_DNS_AFTER_KYC';
            updateData.status = 'DENIED';
            updateData.refundable_amount = booking.amount_deposit;
            updateData.non_refundable_amount = booking.amount_kyc_fee;
            await writeAuditLog('system', 'system', 'DNS_HIT', bookingId, { reason: 'Matched active DNS entry during post-KYC screening' });
            await writeAuditLog('system', 'system', 'BOOKING_DENIED', bookingId, { reason: 'DENIED_DNS_AFTER_KYC' });
        }
        else {
            updateData.dns_status = 'CLEAR';
            updateData.status = 'CONFIRMED';
        }
    }
    else {
        updateData.status = 'DENIED';
        updateData.refundable_amount = booking.amount_deposit;
        updateData.non_refundable_amount = booking.amount_kyc_fee;
    }
    await bookingRef.update(updateData);
    await writeAuditLog('system', 'system', 'KYC_RESULT', bookingId, { result: kycResult });
    return { success: true, status: updateData.status };
});
/**
 * Migration function to convert 'approved' -> 'ACTIVE' and backfill hashes.
 * Access restricted to admins.
 */
exports.runDnsMigration = fns.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    // Verify Admin
    const adminDoc = await getDb().collection('admins').doc(context.auth.uid).get();
    if (!adminDoc.exists && context.auth.token.admin !== true) {
        throw new fns.https.HttpsError('permission-denied', 'Admin access required');
    }
    const dnsRef = getDb().collection('dns_entries');
    const snapshot = await dnsRef.get();
    if (snapshot.empty) {
        return { message: 'No entries found.' };
    }
    let count = 0;
    const batch = getDb().batch();
    for (const doc of snapshot.docs) {
        const entry = doc.data();
        const updates = {};
        // 1. Convert status 'approved' -> 'ACTIVE'
        if (entry.status === 'approved') {
            updates.status = 'ACTIVE';
        }
        // 2. Backfill hashes and match_keys
        if (!entry.match_keys || !entry.client_email_hash) {
            const email = entry.client_email || '';
            const phone = entry.client_phone || '';
            const emailHash = email ? sha256(normalizeEmail(email)) : 'NO_EMAIL';
            const phoneHash = phone ? sha256(normalizePhoneToE164(phone)) : 'NO_PHONE';
            updates.client_email_hash = emailHash;
            updates.client_phone_hash = phoneHash;
            updates.match_keys = [emailHash, phoneHash].filter(h => h !== 'NO_EMAIL' && h !== 'NO_PHONE');
            if (entry.client_name && !entry.client_name_norm) {
                updates.client_name_norm = entry.client_name.toLowerCase().trim();
            }
        }
        if (Object.keys(updates).length > 0) {
            batch.update(doc.ref, updates);
            count++;
        }
    }
    if (count > 0) {
        await batch.commit();
    }
    await writeAuditLog(context.auth.uid, 'admin', 'DNS_MIGRATION_RUN', 'system', { updated_count: count });
    return { success: true, updated_count: count };
});
//# sourceMappingURL=index.js.map