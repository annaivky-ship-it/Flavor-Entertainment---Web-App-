"use strict";
/**
 * Shared configuration constants for Cloud Functions.
 * Centralizes environment variable access to avoid duplication.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDnsHashPepper = getDnsHashPepper;
/**
 * DNS hash pepper used for one-way hashing of client PII.
 * MUST be set via environment variable in production.
 */
function getDnsHashPepper() {
    const pepper = process.env.DNS_HASH_PEPPER;
    if (!pepper) {
        throw new Error('DNS_HASH_PEPPER environment variable is not set. ' +
            'This is required for secure hashing of client data. ' +
            'Set it via: firebase functions:config:set dns.hash_pepper="your-secret-value"');
    }
    return pepper;
}
//# sourceMappingURL=config.js.map