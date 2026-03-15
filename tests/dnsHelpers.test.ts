import { describe, it, expect } from 'vitest';

// Inline the DNS helper logic since functions/ has a separate build
// These test the same algorithms from functions/src/dns/index.ts

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function normalizePhoneToE164(phone: string, defaultCountryCode: string = '+61'): string {
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = defaultCountryCode + cleaned.substring(1);
  } else if (!cleaned.startsWith('+')) {
    cleaned = defaultCountryCode + cleaned;
  }
  return cleaned;
}

describe('normalizeEmail', () => {
  it('lowercases email', () => {
    expect(normalizeEmail('Test@Example.COM')).toBe('test@example.com');
  });

  it('trims whitespace', () => {
    expect(normalizeEmail('  test@example.com  ')).toBe('test@example.com');
  });

  it('handles already-normalized email', () => {
    expect(normalizeEmail('user@domain.com')).toBe('user@domain.com');
  });

  it('handles mixed case with whitespace', () => {
    expect(normalizeEmail(' User@Gmail.COM ')).toBe('user@gmail.com');
  });
});

describe('normalizePhoneToE164', () => {
  it('converts Australian local numbers starting with 0', () => {
    expect(normalizePhoneToE164('0412345678')).toBe('+61412345678');
  });

  it('strips formatting characters', () => {
    expect(normalizePhoneToE164('04 1234 5678')).toBe('+61412345678');
    expect(normalizePhoneToE164('(04) 1234-5678')).toBe('+61412345678');
  });

  it('adds default country code to numbers without +', () => {
    expect(normalizePhoneToE164('412345678')).toBe('+61412345678');
  });

  it('keeps numbers already starting with +', () => {
    expect(normalizePhoneToE164('+61412345678')).toBe('+61412345678');
    expect(normalizePhoneToE164('+14155551234')).toBe('+14155551234');
  });

  it('uses custom country code', () => {
    expect(normalizePhoneToE164('0412345678', '+44')).toBe('+44412345678');
  });

  it('handles numbers with dashes and parentheses', () => {
    expect(normalizePhoneToE164('(02) 9876-5432')).toBe('+6129876-5432'.replace(/-/g, ''));
    // Actually let me recalculate: (02) 9876-5432 -> 0298765432 -> +61298765432
    expect(normalizePhoneToE164('(02) 9876-5432')).toBe('+61298765432');
  });
});
