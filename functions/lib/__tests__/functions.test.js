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
const vitest_1 = require("vitest");
/**
 * Cloud Functions Smoke Tests
 *
 * These test the exported function signatures and basic validation logic
 * without requiring Firebase emulators.
 */
// Mock firebase-admin before importing anything
vitest_1.vi.mock('firebase-admin', () => {
    const fakeFirestore = {
        collection: vitest_1.vi.fn().mockReturnValue({
            doc: vitest_1.vi.fn().mockReturnValue({
                get: vitest_1.vi.fn().mockResolvedValue({ exists: false, data: () => null }),
                set: vitest_1.vi.fn().mockResolvedValue(undefined),
                update: vitest_1.vi.fn().mockResolvedValue(undefined),
            }),
            add: vitest_1.vi.fn().mockResolvedValue({ id: 'test-id' }),
        }),
    };
    return {
        default: {
            initializeApp: vitest_1.vi.fn(),
            firestore: {
                FieldValue: { serverTimestamp: vitest_1.vi.fn().mockReturnValue('SERVER_TIMESTAMP') },
                Timestamp: { now: vitest_1.vi.fn().mockReturnValue({ toDate: () => new Date() }) },
            },
            storage: vitest_1.vi.fn().mockReturnValue({ bucket: vitest_1.vi.fn() }),
        },
        initializeApp: vitest_1.vi.fn(),
        firestore: vitest_1.vi.fn(),
    };
});
vitest_1.vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vitest_1.vi.fn().mockReturnValue({
        collection: vitest_1.vi.fn().mockReturnValue({
            doc: vitest_1.vi.fn().mockReturnValue({
                get: vitest_1.vi.fn().mockResolvedValue({ exists: false, data: () => null }),
                set: vitest_1.vi.fn().mockResolvedValue(undefined),
            }),
            add: vitest_1.vi.fn().mockResolvedValue({ id: 'test-id' }),
        }),
        runTransaction: vitest_1.vi.fn(),
    }),
}));
vitest_1.vi.mock('firebase-functions', () => {
    const HttpsError = class HttpsError extends Error {
        constructor(code, message) {
            super(message);
            this.code = code;
        }
    };
    const mockModule = {
        https: {
            onCall: vitest_1.vi.fn((handler) => handler),
            onRequest: vitest_1.vi.fn((handler) => handler),
            HttpsError,
        },
        firestore: {
            document: vitest_1.vi.fn().mockReturnValue({
                onCreate: vitest_1.vi.fn((handler) => handler),
                onUpdate: vitest_1.vi.fn((handler) => handler),
            }),
        },
        pubsub: {
            schedule: vitest_1.vi.fn().mockReturnValue({
                onRun: vitest_1.vi.fn((handler) => handler),
            }),
        },
    };
    return Object.assign({ default: mockModule }, mockModule);
});
vitest_1.vi.mock('../twilio', () => ({
    sendWhatsApp: vitest_1.vi.fn().mockResolvedValue({}),
    sendSms: vitest_1.vi.fn().mockResolvedValue({}),
    verifyTwilioSignature: vitest_1.vi.fn().mockReturnValue(true),
}));
vitest_1.vi.mock('../messaging/send', () => ({
    sendMessage: vitest_1.vi.fn().mockResolvedValue(undefined),
}));
vitest_1.vi.mock('../messaging/templates', () => ({
    renderTemplate: vitest_1.vi.fn().mockReturnValue('Test message'),
}));
vitest_1.vi.mock('../utils/idempotency', () => ({
    checkAndSetIdempotency: vitest_1.vi.fn().mockResolvedValue(true),
}));
vitest_1.vi.mock('@google/genai', () => ({
    GoogleGenAI: vitest_1.vi.fn(),
    Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY' },
}));
vitest_1.vi.mock('../didit', () => ({
    createKycSession: vitest_1.vi.fn().mockResolvedValue(null),
    processKycResult: vitest_1.vi.fn().mockResolvedValue({}),
    verifyWebhookSignature: vitest_1.vi.fn().mockReturnValue(true),
}));
vitest_1.vi.mock('../risk/scoring', () => ({
    calculateRiskScore: vitest_1.vi.fn().mockResolvedValue({ score: 0, level: 'LOW', decision: 'APPROVE', reasons: [] }),
    shouldSkipKyc: vitest_1.vi.fn().mockReturnValue(false),
}));
vitest_1.vi.mock('../incidents/reporting', () => ({
    createIncidentReport: vitest_1.vi.fn().mockResolvedValue('report-123'),
    approveIncidentReport: vitest_1.vi.fn().mockResolvedValue(undefined),
    rejectIncidentReport: vitest_1.vi.fn().mockResolvedValue(undefined),
}));
vitest_1.vi.mock('../consent', () => ({
    recordConsent: vitest_1.vi.fn().mockResolvedValue('consent-123'),
    CONSENT_TEXT: 'Test consent text',
}));
vitest_1.vi.mock('../dns', () => ({
    dnsLookup: vitest_1.vi.fn().mockResolvedValue(false),
    normalizeEmail: vitest_1.vi.fn((e) => e.toLowerCase()),
    normalizePhoneToE164: vitest_1.vi.fn((p) => p),
    sha256: vitest_1.vi.fn((s) => `hash_${s}`),
}));
(0, vitest_1.describe)('createBookingRequest', () => {
    (0, vitest_1.it)('is exported as a callable function', async () => {
        const indexModule = await Promise.resolve().then(() => __importStar(require('../index')));
        (0, vitest_1.expect)(indexModule.createBookingRequest).toBeDefined();
    });
});
(0, vitest_1.describe)('createDraftApplication', () => {
    (0, vitest_1.it)('rejects unauthenticated calls', async () => {
        const indexModule = await Promise.resolve().then(() => __importStar(require('../index')));
        const handler = indexModule.createDraftApplication;
        // The handler is wrapped by onCall mock which returns the handler directly
        await (0, vitest_1.expect)(handler({ application: {} }, { auth: null })).rejects.toThrow('User must be signed in.');
    });
});
(0, vitest_1.describe)('submitApplication', () => {
    (0, vitest_1.it)('rejects unauthenticated calls', async () => {
        const indexModule = await Promise.resolve().then(() => __importStar(require('../index')));
        const handler = indexModule.submitApplication;
        await (0, vitest_1.expect)(handler({ applicationId: 'test' }, { auth: null })).rejects.toThrow('User must be signed in.');
    });
});
(0, vitest_1.describe)('submitIncidentReport', () => {
    (0, vitest_1.it)('rejects unauthenticated calls', async () => {
        const indexModule = await Promise.resolve().then(() => __importStar(require('../index')));
        const handler = indexModule.submitIncidentReport;
        await (0, vitest_1.expect)(handler({}, { auth: null })).rejects.toThrow('Must be authenticated');
    });
    (0, vitest_1.it)('rejects missing required fields', async () => {
        const indexModule = await Promise.resolve().then(() => __importStar(require('../index')));
        const handler = indexModule.submitIncidentReport;
        await (0, vitest_1.expect)(handler({ client_name: '', incident_description: '', risk_level: '' }, { auth: { uid: 'user-123', token: { name: 'Test' } } })).rejects.toThrow('Missing required fields');
    });
});
(0, vitest_1.describe)('analyzeVettingRisk', () => {
    (0, vitest_1.it)('rejects unauthenticated calls', async () => {
        const indexModule = await Promise.resolve().then(() => __importStar(require('../index')));
        const handler = indexModule.analyzeVettingRisk;
        await (0, vitest_1.expect)(handler({ bookingDetails: {} }, { auth: null })).rejects.toThrow('User must be signed in.');
    });
});
(0, vitest_1.describe)('sendSms - Twilio error handling', () => {
    (0, vitest_1.it)('sendSms module is importable', async () => {
        const twilio = await Promise.resolve().then(() => __importStar(require('../twilio')));
        (0, vitest_1.expect)(twilio.sendSms).toBeDefined();
        (0, vitest_1.expect)(twilio.sendWhatsApp).toBeDefined();
    });
});
//# sourceMappingURL=functions.test.js.map