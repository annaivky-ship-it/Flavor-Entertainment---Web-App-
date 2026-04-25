/**
 * Phone number helpers shared by WhatsApp + SMS senders.
 *
 * The booking app only services Australian mobile numbers. We accept the
 * common formats that clients enter on the booking form and normalise to
 * strict E.164 (`+614XXXXXXXX`).
 */

const AU_MOBILE_E164 = /^\+614\d{8}$/;

export class InvalidPhoneNumberError extends Error {
  constructor(value: string) {
    super(`Invalid Australian mobile number: ${value || '(empty)'}`);
    this.name = 'InvalidPhoneNumberError';
  }
}

/**
 * Loose normaliser used by legacy code paths. Returns null when the value
 * cannot be normalised. New code should prefer {@link formatAustralianMobile}.
 */
export function normalizePhone(phone: string, defaultCountryCode: string = '+61'): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/(?!^\+)[^\d]/g, '');

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

/**
 * Strict Australian mobile formatter. Accepts:
 *  - `04XX XXX XXX`, `04XXXXXXXX`
 *  - `614XXXXXXXX`
 *  - `+614XXXXXXXX`
 *  - Numbers with spaces, dashes, parentheses
 *
 * Returns the canonical `+614XXXXXXXX` form or throws
 * {@link InvalidPhoneNumberError} when the number is not a valid AU mobile.
 */
export function formatAustralianMobile(raw: string | null | undefined): string {
  if (!raw) throw new InvalidPhoneNumberError(String(raw));

  const trimmed = String(raw).trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');

  let candidate: string | null = null;

  if (hasPlus && digits.startsWith('614') && digits.length === 11) {
    candidate = '+' + digits;
  } else if (digits.startsWith('614') && digits.length === 11) {
    candidate = '+' + digits;
  } else if (digits.startsWith('04') && digits.length === 10) {
    candidate = '+61' + digits.substring(1);
  } else if (digits.startsWith('4') && digits.length === 9) {
    // Bare mobile w/o leading zero, e.g. `4XXXXXXXX`
    candidate = '+61' + digits;
  }

  if (!candidate || !AU_MOBILE_E164.test(candidate)) {
    throw new InvalidPhoneNumberError(trimmed);
  }

  return candidate;
}

/** Convenience wrapper that returns `null` instead of throwing. */
export function tryFormatAustralianMobile(raw: string | null | undefined): string | null {
  try {
    return formatAustralianMobile(raw);
  } catch {
    return null;
  }
}

/** Build the `whatsapp:+614…` channel address Twilio expects. */
export function toWhatsAppAddress(e164: string): string {
  return `whatsapp:${e164}`;
}
