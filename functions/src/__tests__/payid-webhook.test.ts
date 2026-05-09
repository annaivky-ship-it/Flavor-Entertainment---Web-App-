/**
 * Unit tests for the unified PayID webhook payload parser + signature checks.
 *
 * The full transactional pipeline is exercised via emulator integration tests
 * (see Phase 3 deployment checklist). These unit tests cover the pure helpers
 * and the most common short-circuit paths.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as crypto from 'crypto';

// Real impls (no mocking — these are pure functions)
import { parseMonoovaPayload, verifyMonoovaSignature } from '../payments/monoova';
import { namesLooselyMatch } from '../integrations/monoova';

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.FUNCTIONS_EMULATOR = 'true';
});

describe('parseMonoovaPayload', () => {
  it('extracts FE-XXXXXX reference embedded in description', () => {
    const parsed = parseMonoovaPayload({
      TransactionId: 'tx-1',
      Description: 'Deposit FE-AB12CD for booking',
      Amount: '125.50',
      EventType: 'payment_received',
      PayerName: 'John Smith',
    });
    expect(parsed?.transactionId).toBe('tx-1');
    expect(parsed?.bookingReference).toBe('FE-AB12CD');
    expect(parsed?.amount).toBe(125.5);
    expect(parsed?.payerName).toBe('John Smith');
  });

  it('falls back to camelCase fields when PascalCase missing', () => {
    const parsed = parseMonoovaPayload({
      transactionId: 'tx-2',
      reference: 'FE-XYZ789',
      amount: 50,
      eventType: 'transaction.completed',
    });
    expect(parsed?.transactionId).toBe('tx-2');
    expect(parsed?.bookingReference).toBe('FE-XYZ789');
    expect(parsed?.amount).toBe(50);
  });

  it('returns null when transactionId is missing', () => {
    expect(parseMonoovaPayload({ Description: 'FE-AAAAAA', Amount: 10 })).toBeNull();
  });

  it('handles a non-numeric amount as 0', () => {
    const parsed = parseMonoovaPayload({
      TransactionId: 'tx-3',
      Description: 'FE-AAAAAA',
      Amount: 'not-a-number',
    });
    expect(parsed?.amount).toBe(0);
  });
});

describe('verifyMonoovaSignature', () => {
  it('accepts a valid HMAC-SHA256 hex signature', () => {
    const secret = 'shared-secret';
    const body = '{"foo":"bar"}';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyMonoovaSignature(body, sig, secret)).toBe(true);
  });

  it('rejects a wrong signature', () => {
    expect(verifyMonoovaSignature('{}', 'deadbeef', 'shared-secret')).toBe(false);
  });

  it('rejects when signature header is missing', () => {
    expect(verifyMonoovaSignature('{}', undefined, 'shared-secret')).toBe(false);
  });

  it('allows in emulator when secret is unset (graceful dev mode)', () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    expect(verifyMonoovaSignature('{}', undefined, undefined)).toBe(true);
  });
});

describe('namesLooselyMatch — webhook-relevant scenarios', () => {
  it('matches typical bank-supplied account names', () => {
    expect(namesLooselyMatch('Alex Jones', 'JONES, ALEX')).toBe(true);
    expect(namesLooselyMatch('Alex Jones', 'MR ALEX JONES')).toBe(true);
    expect(namesLooselyMatch('Alex Jones', 'Alex M Jones')).toBe(true);
  });

  it('rejects clearly different names (potential fraud)', () => {
    expect(namesLooselyMatch('Alex Jones', 'Pat Williams')).toBe(false);
  });

  it('rejects empty bank-supplied name (cannot verify)', () => {
    expect(namesLooselyMatch('Alex Jones', '')).toBe(false);
  });
});
