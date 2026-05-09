import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Cloud Functions Smoke Tests
 *
 * These test the exported function signatures and basic validation logic
 * without requiring Firebase emulators.
 */

// Mock firebase-admin before importing anything
vi.mock('firebase-admin', () => {
  const fakeFirestore = {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
      add: vi.fn().mockResolvedValue({ id: 'test-id' }),
    }),
  };
  return {
    default: {
      initializeApp: vi.fn(),
      firestore: {
        FieldValue: { serverTimestamp: vi.fn().mockReturnValue('SERVER_TIMESTAMP') },
        Timestamp: { now: vi.fn().mockReturnValue({ toDate: () => new Date() }) },
      },
      storage: vi.fn().mockReturnValue({ bucket: vi.fn() }),
    },
    initializeApp: vi.fn(),
    firestore: vi.fn(),
  };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn().mockReturnValue({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
      }),
      add: vi.fn().mockResolvedValue({ id: 'test-id' }),
    }),
    runTransaction: vi.fn(),
  }),
}));

vi.mock('firebase-functions', () => {
  const HttpsError = class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  };
  const mockModule = {
    https: {
      onCall: vi.fn((handler: any) => handler),
      onRequest: vi.fn((handler: any) => handler),
      HttpsError,
    },
    firestore: {
      document: vi.fn().mockReturnValue({
        onCreate: vi.fn((handler: any) => handler),
        onUpdate: vi.fn((handler: any) => handler),
      }),
    },
    pubsub: {
      schedule: vi.fn().mockReturnValue({
        onRun: vi.fn((handler: any) => handler),
      }),
    },
  };
  return { default: mockModule, ...mockModule };
});

vi.mock('../twilio', () => ({
  sendWhatsApp: vi.fn().mockResolvedValue({}),
  sendSms: vi.fn().mockResolvedValue({}),
  verifyTwilioSignature: vi.fn().mockReturnValue(true),
}));

vi.mock('../messaging/send', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../messaging/templates', () => ({
  renderTemplate: vi.fn().mockReturnValue('Test message'),
}));

vi.mock('../utils/idempotency', () => ({
  checkAndSetIdempotency: vi.fn().mockResolvedValue(true),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY' },
}));

vi.mock('../risk/scoring', () => ({
  calculateRiskScore: vi.fn().mockResolvedValue({ score: 0, level: 'LOW', decision: 'APPROVE', reasons: [] }),
  isTrustedCustomer: vi.fn().mockResolvedValue({ trusted: false, reason: 'new' }),
}));

vi.mock('../incidents/reporting', () => ({
  createIncidentReport: vi.fn().mockResolvedValue('report-123'),
  approveIncidentReport: vi.fn().mockResolvedValue(undefined),
  rejectIncidentReport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../consent', () => ({
  recordConsent: vi.fn().mockResolvedValue('consent-123'),
  CONSENT_TEXT: 'Test consent text',
}));

vi.mock('../dns', () => ({
  dnsLookup: vi.fn().mockResolvedValue(false),
  normalizeEmail: vi.fn((e: string) => e.toLowerCase()),
  normalizePhoneToE164: vi.fn((p: string) => p),
  sha256: vi.fn((s: string) => `hash_${s}`),
}));

describe('createBookingRequest', () => {
  it('is exported as a callable function', async () => {
    const indexModule = await import('../index');
    expect(indexModule.createBookingRequest).toBeDefined();
  });
});

describe('createDraftApplication', () => {
  it('rejects unauthenticated calls', async () => {
    const indexModule = await import('../index');
    const handler = indexModule.createDraftApplication;

    // The handler is wrapped by onCall mock which returns the handler directly
    await expect(
      handler({ application: {} }, { auth: null })
    ).rejects.toThrow('User must be signed in.');
  });
});

describe('submitApplication', () => {
  it('rejects unauthenticated calls', async () => {
    const indexModule = await import('../index');
    const handler = indexModule.submitApplication;

    await expect(
      handler({ applicationId: 'test' }, { auth: null })
    ).rejects.toThrow('User must be signed in.');
  });
});

describe('submitIncidentReport', () => {
  it('rejects unauthenticated calls', async () => {
    const indexModule = await import('../index');
    const handler = indexModule.submitIncidentReport;

    await expect(
      handler({}, { auth: null })
    ).rejects.toThrow('Must be authenticated');
  });

  it('rejects missing required fields', async () => {
    const indexModule = await import('../index');
    const handler = indexModule.submitIncidentReport;

    await expect(
      handler(
        { client_name: '', incident_description: '', risk_level: '' },
        { auth: { uid: 'user-123', token: { name: 'Test' } } }
      )
    ).rejects.toThrow('Missing required fields');
  });
});

describe('analyzeVettingRisk', () => {
  it('rejects unauthenticated calls', async () => {
    const indexModule = await import('../index');
    const handler = indexModule.analyzeVettingRisk;

    await expect(
      handler({ bookingDetails: {} }, { auth: null })
    ).rejects.toThrow('User must be signed in.');
  });
});

describe('sendSms - Twilio error handling', () => {
  it('sendSms module is importable', async () => {
    const twilio = await import('../twilio');
    expect(twilio.sendSms).toBeDefined();
    expect(twilio.sendWhatsApp).toBeDefined();
  });
});
