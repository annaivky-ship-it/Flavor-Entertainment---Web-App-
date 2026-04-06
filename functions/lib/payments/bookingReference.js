"use strict";
/**
 * Booking reference generation for PayID payments.
 * Format: FE-XXXXXX (uppercase alphanumeric, no ambiguous chars)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBookingReference = generateBookingReference;
// Exclude ambiguous characters: 0/O, 1/I/L
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateBookingReference() {
    let result = '';
    for (let i = 0; i < 6; i++) {
        const index = Math.floor(Math.random() * CHARS.length);
        result += CHARS[index];
    }
    return `FE-${result}`;
}
//# sourceMappingURL=bookingReference.js.map