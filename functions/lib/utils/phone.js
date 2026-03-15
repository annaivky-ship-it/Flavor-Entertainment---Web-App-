"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
function normalizePhone(phone, defaultCountryCode = '+61') {
    if (!phone)
        return null;
    // Remove all non-digit characters except leading +
    const cleaned = phone.replace(/(?!^\+)[^\d]/g, '');
    // If it starts with 0 and is an AU number (e.g., 04xx xxx xxx), replace 0 with +61
    if (cleaned.startsWith('04') && cleaned.length === 10) {
        return '+61' + cleaned.substring(1);
    }
    // If it starts with 614, prepend +
    if (cleaned.startsWith('614') && cleaned.length === 11) {
        return '+' + cleaned;
    }
    // If it already starts with +614, keep it
    if (cleaned.startsWith('+614') && cleaned.length === 12) {
        return cleaned;
    }
    // Generic fallback if it starts with + and has 10-15 digits
    if (cleaned.startsWith('+') && cleaned.length >= 10 && cleaned.length <= 16) {
        return cleaned;
    }
    return null;
}
//# sourceMappingURL=phone.js.map