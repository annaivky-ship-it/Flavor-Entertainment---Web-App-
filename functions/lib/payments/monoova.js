"use strict";
/**
 * Monoova webhook payload parser and signature verification.
 *
 * The exact Monoova payload shape is not known in advance.
 * This module centralizes field mapping so it can be adjusted easily.
 * Raw payload is always preserved for audit.
 */
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
exports.parseMonoovaPayload = parseMonoovaPayload;
exports.verifyMonoovaSignature = verifyMonoovaSignature;
const crypto = __importStar(require("crypto"));
/**
 * Extract relevant fields from a Monoova webhook payload.
 * Tries multiple known field paths to be resilient to schema changes.
 */
function parseMonoovaPayload(payload) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7;
    if (!payload)
        return null;
    // Transaction ID: try common field names
    const transactionId = (_d = (_c = (_b = (_a = payload.TransactionId) !== null && _a !== void 0 ? _a : payload.transactionId) !== null && _b !== void 0 ? _b : payload.UniqueIdentifier) !== null && _c !== void 0 ? _c : payload.id) !== null && _d !== void 0 ? _d : null;
    if (!transactionId)
        return null;
    // Booking reference: typically in the description/reference field
    const rawReference = (_k = (_j = (_h = (_g = (_f = (_e = payload.Description) !== null && _e !== void 0 ? _e : payload.description) !== null && _f !== void 0 ? _f : payload.PaymentReference) !== null && _g !== void 0 ? _g : payload.paymentReference) !== null && _h !== void 0 ? _h : payload.Reference) !== null && _j !== void 0 ? _j : payload.reference) !== null && _k !== void 0 ? _k : '';
    // Extract FE-XXXXXX pattern from the reference string
    const refMatch = String(rawReference).match(/FE-[A-Z0-9]{6}/);
    const bookingReference = refMatch ? refMatch[0] : String(rawReference).trim();
    // Amount
    const amount = parseFloat((_p = (_o = (_m = (_l = payload.Amount) !== null && _l !== void 0 ? _l : payload.amount) !== null && _m !== void 0 ? _m : payload.TotalAmount) !== null && _o !== void 0 ? _o : payload.totalAmount) !== null && _p !== void 0 ? _p : '0');
    // Event type
    const eventType = (_u = (_t = (_s = (_r = (_q = payload.EventType) !== null && _q !== void 0 ? _q : payload.eventType) !== null && _r !== void 0 ? _r : payload.Status) !== null && _s !== void 0 ? _s : payload.status) !== null && _t !== void 0 ? _t : payload.Type) !== null && _u !== void 0 ? _u : 'payment_received';
    // Payer info (optional, for admin visibility)
    const payerName = (_x = (_w = (_v = payload.PayerName) !== null && _v !== void 0 ? _v : payload.payerName) !== null && _w !== void 0 ? _w : payload.SourceAccountName) !== null && _x !== void 0 ? _x : null;
    const payerBSB = (_0 = (_z = (_y = payload.PayerBSB) !== null && _y !== void 0 ? _y : payload.payerBSB) !== null && _z !== void 0 ? _z : payload.SourceBSB) !== null && _0 !== void 0 ? _0 : null;
    const payerAccount = (_3 = (_2 = (_1 = payload.PayerAccount) !== null && _1 !== void 0 ? _1 : payload.payerAccount) !== null && _2 !== void 0 ? _2 : payload.SourceAccountNumber) !== null && _3 !== void 0 ? _3 : null;
    const receivedAt = (_7 = (_6 = (_5 = (_4 = payload.DateTime) !== null && _4 !== void 0 ? _4 : payload.dateTime) !== null && _5 !== void 0 ? _5 : payload.CreatedDateTime) !== null && _6 !== void 0 ? _6 : payload.Timestamp) !== null && _7 !== void 0 ? _7 : null;
    return {
        transactionId: String(transactionId),
        bookingReference,
        amount: isNaN(amount) ? 0 : amount,
        eventType: String(eventType),
        payerName,
        payerBSB,
        payerAccount,
        receivedAt,
    };
}
/**
 * Verify Monoova webhook signature if a secret is configured.
 * Returns true if no secret is set (graceful degradation) or if signature is valid.
 */
function verifyMonoovaSignature(rawBody, signatureHeader, secret) {
    // If no secret configured, allow through but log warning
    if (!secret) {
        console.warn('MONOOVA_WEBHOOK_SECRET not configured — skipping signature verification');
        return true;
    }
    if (!signatureHeader) {
        console.error('Missing webhook signature header');
        return false;
    }
    // HMAC-SHA256 signature verification (common pattern for webhook providers)
    const computed = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
    // Constant-time comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(signatureHeader, 'hex'));
    }
    catch (_a) {
        // If the signature is a different format, try base64
        try {
            const computedB64 = crypto
                .createHmac('sha256', secret)
                .update(rawBody)
                .digest('base64');
            return crypto.timingSafeEqual(Buffer.from(computedB64), Buffer.from(signatureHeader));
        }
        catch (_b) {
            return false;
        }
    }
}
//# sourceMappingURL=monoova.js.map