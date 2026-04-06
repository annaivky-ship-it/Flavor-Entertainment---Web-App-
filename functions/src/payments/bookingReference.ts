/**
 * Booking reference generation for PayID payments.
 * Format: FE-XXXXXX (uppercase alphanumeric, no ambiguous chars)
 */

// Exclude ambiguous characters: 0/O, 1/I/L
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateBookingReference(): string {
  let result = '';
  for (let i = 0; i < 6; i++) {
    const index = Math.floor(Math.random() * CHARS.length);
    result += CHARS[index];
  }
  return `FE-${result}`;
}
