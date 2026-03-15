import { describe, it, expect } from 'vitest';

// We inline the normalizePhone logic here since functions/ has a separate build
// This tests the same algorithm from functions/src/utils/phone.ts
function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/(?!^\+)[^\d]/g, '');

  if (cleaned.startsWith('04') && cleaned.length === 10) {
    return '+61' + cleaned.substring(1);
  }

  if (cleaned.startsWith('614') && cleaned.length === 11) {
    return '+' + cleaned;
  }

  if (cleaned.startsWith('+614') && cleaned.length === 12) {
    return cleaned;
  }

  if (cleaned.startsWith('+') && cleaned.length >= 10 && cleaned.length <= 16) {
    return cleaned;
  }

  return null;
}

describe('normalizePhone', () => {
  it('returns null for empty input', () => {
    expect(normalizePhone('')).toBeNull();
  });

  it('normalizes Australian mobile numbers starting with 04', () => {
    expect(normalizePhone('0412345678')).toBe('+61412345678');
    expect(normalizePhone('04 1234 5678')).toBe('+61412345678');
    expect(normalizePhone('04-1234-5678')).toBe('+61412345678');
  });

  it('normalizes numbers starting with 614', () => {
    expect(normalizePhone('61412345678')).toBe('+61412345678');
  });

  it('keeps already formatted +614 numbers', () => {
    expect(normalizePhone('+61412345678')).toBe('+61412345678');
  });

  it('keeps valid international numbers', () => {
    expect(normalizePhone('+14155551234')).toBe('+14155551234');
  });

  it('returns null for invalid numbers', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('abcdefgh')).toBeNull();
  });

  it('strips formatting characters', () => {
    expect(normalizePhone('(04) 1234-5678')).toBe('+61412345678');
  });
});
