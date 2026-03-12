"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRateLimit = checkRateLimit;
exports.cleanupRateLimits = cleanupRateLimits;
const firestore_1 = require("firebase-admin/firestore");
const getDb = () => (0, firestore_1.getFirestore)('default');
/**
 * Simple Firestore-based rate limiter.
 * Tracks request counts per identifier within a sliding window.
 *
 * @param identifier - Unique identifier (e.g., IP address, email, UID)
 * @param options - Rate limit configuration
 * @returns true if the request is allowed, false if rate limited
 */
async function checkRateLimit(identifier, options) {
    const { maxRequests, windowSeconds, prefix } = options;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const key = `${prefix}_${identifier}`;
    const ref = getDb().collection('rate_limits').doc(key);
    try {
        const result = await getDb().runTransaction(async (t) => {
            const doc = await t.get(ref);
            const data = doc.data();
            if (!data) {
                // First request
                t.set(ref, {
                    count: 1,
                    timestamps: [now],
                    updated_at: now,
                });
                return true;
            }
            // Filter timestamps within the window
            const validTimestamps = data.timestamps.filter((ts) => ts > windowStart);
            if (validTimestamps.length >= maxRequests) {
                return false; // Rate limited
            }
            // Add current timestamp and update
            validTimestamps.push(now);
            t.update(ref, {
                count: validTimestamps.length,
                timestamps: validTimestamps,
                updated_at: now,
            });
            return true;
        });
        return result;
    }
    catch (error) {
        console.error('Rate limit check failed:', error);
        // Fail closed — block the request if rate limiting is broken
        return false;
    }
}
/**
 * Scheduled cleanup for expired rate limit entries.
 * Should be called periodically (e.g., every hour).
 */
async function cleanupRateLimits() {
    const oneHourAgo = Date.now() - 3600 * 1000;
    const snapshot = await getDb()
        .collection('rate_limits')
        .where('updated_at', '<', oneHourAgo)
        .limit(500)
        .get();
    if (snapshot.empty)
        return 0;
    const batch = getDb().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    return snapshot.size;
}
//# sourceMappingURL=rateLimit.js.map