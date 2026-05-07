import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const getDb = () => getFirestore('default');

// --- Types ---

export interface RiskFactors {
    verificationSignals: number;     // 0–25 points (replaces identityVerification)
    dnsMatch: number;                // 0–30 points
    repeatClientTrust: number;       // -20 to 0 (reduces risk)
    failedAttempts: number;          // 0–15 points
    behaviorAnomalies: number;       // 0–15 points
    deviceRisk: number;              // 0–15 points
}

export interface RiskAssessment {
    score: number;                   // 0–100
    level: 'SAFE' | 'REVIEW' | 'BLOCK';
    factors: RiskFactors;
    decision: 'APPROVE' | 'MANUAL_REVIEW' | 'REJECT';
    reasons: string[];
    timestamp: string;
}

// --- Risk Scoring Engine ---

/**
 * Calculate a comprehensive risk score for a booking.
 * Score 0–100: 0–30 = safe, 31–60 = review, 61–100 = block
 */
export async function calculateRiskScore(params: {
    bookingId: string;
    customerId?: string;
    clientEmail: string;
    clientPhone: string;
    clientEmailHash: string;
    clientPhoneHash: string;
    ipAddress?: string;
    deviceFingerprint?: string;
    verificationStatus?: 'pending' | 'cleared' | 'manual_review' | 'denied';
    smsOtpVerified?: boolean;
    livenessVerified?: boolean;
    payIdMatched?: boolean;
    trustTier?: 'unverified' | 'verified' | 'trusted';
}): Promise<RiskAssessment> {
    const factors: RiskFactors = {
        verificationSignals: 0,
        dnsMatch: 0,
        repeatClientTrust: 0,
        failedAttempts: 0,
        behaviorAnomalies: 0,
        deviceRisk: 0,
    };
    const reasons: string[] = [];

    // --- Factor 1: Verification Signals (0–25 points) ---
    // Self-hosted signals replace third-party KYC.
    if (params.verificationStatus === 'denied') {
        factors.verificationSignals = 25;
        reasons.push('Verification denied');
    } else if (params.verificationStatus === 'manual_review') {
        factors.verificationSignals = 15;
        reasons.push('Verification routed to manual review');
    } else if (params.verificationStatus === 'pending') {
        let pending = 10;
        if (params.smsOtpVerified) pending -= 3;
        if (params.livenessVerified) pending -= 3;
        if (params.payIdMatched) pending -= 4;
        factors.verificationSignals = Math.max(0, pending);
        if (factors.verificationSignals > 0) {
            reasons.push('Some verification signals still pending');
        }
    } else if (params.verificationStatus === 'cleared') {
        factors.verificationSignals = 0;
    }

    // --- Factor 2: DNS Register Match (0–30 points) ---
    const dnsResult = await checkDnsRegister(params.clientEmailHash, params.clientPhoneHash, params.clientEmail);
    if (dnsResult.blocked) {
        factors.dnsMatch = 30;
        reasons.push(`DNS match: ${dnsResult.matchType} (${dnsResult.reason})`);
    } else if (dnsResult.review) {
        factors.dnsMatch = 15;
        reasons.push(`DNS partial match: ${dnsResult.matchType}`);
    }

    // --- Factor 3: Repeat Client Trust (-20 to 0) ---
    const trustResult = await checkRepeatClientTrust(params.clientEmailHash, params.clientPhoneHash);
    if (trustResult.isTrusted || params.trustTier === 'trusted') {
        factors.repeatClientTrust = -20;
        reasons.push(`Trusted client (${trustResult.previousBookings} successful bookings)`);
    } else if (trustResult.previousBookings > 0 || params.trustTier === 'verified') {
        factors.repeatClientTrust = -10;
        reasons.push(`Returning client (${trustResult.previousBookings} previous bookings)`);
    }

    // --- Factor 4: Failed Verification Attempts (0–15 points) ---
    const failedCount = await getFailedVerificationCount(params.customerId, params.clientPhoneHash);
    if (failedCount >= 3) {
        factors.failedAttempts = 15;
        reasons.push(`${failedCount} failed verification attempts`);
    } else if (failedCount >= 1) {
        factors.failedAttempts = failedCount * 5;
        reasons.push(`${failedCount} failed verification attempt(s)`);
    }

    // --- Factor 5: Booking Behavior Anomalies (0–15 points) ---
    const anomalies = await detectBehaviorAnomalies(params.clientEmail, params.clientPhone);
    factors.behaviorAnomalies = Math.min(anomalies.score, 15);
    if (anomalies.reasons.length > 0) {
        reasons.push(...anomalies.reasons);
    }

    // --- Factor 6: Device/IP Risk (0–15 points) ---
    if (params.deviceFingerprint) {
        const deviceRisk = await checkDeviceRisk(params.deviceFingerprint, params.ipAddress);
        factors.deviceRisk = Math.min(deviceRisk.score, 15);
        if (deviceRisk.reasons.length > 0) {
            reasons.push(...deviceRisk.reasons);
        }
    }

    const rawScore = Object.values(factors).reduce((sum, val) => sum + val, 0);
    const score = Math.max(0, Math.min(100, rawScore));

    let level: RiskAssessment['level'];
    let decision: RiskAssessment['decision'];

    if (score <= 30) {
        level = 'SAFE';
        decision = 'APPROVE';
    } else if (score <= 60) {
        level = 'REVIEW';
        decision = 'MANUAL_REVIEW';
    } else {
        level = 'BLOCK';
        decision = 'REJECT';
    }

    if (dnsResult.blocked) {
        decision = 'REJECT';
        level = 'BLOCK';
    }

    const assessment: RiskAssessment = {
        score,
        level,
        factors,
        decision,
        reasons,
        timestamp: new Date().toISOString(),
    };

    await getDb().collection('risk_scores').add({
        booking_id: params.bookingId,
        client_email_hash: params.clientEmailHash,
        client_phone_hash: params.clientPhoneHash,
        ...assessment,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    await getDb().collection('audit_log').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actor_id: 'system',
        actor_role: 'system',
        action: 'RISK_SCORE_CALCULATED',
        booking_id: params.bookingId,
        details: { score, level, decision, factors, reasons },
    });

    return assessment;
}

// --- DNS Register Check ---

async function checkDnsRegister(emailHash: string, phoneHash: string, rawEmail?: string): Promise<{
    blocked: boolean;
    review: boolean;
    matchType: string;
    reason: string;
}> {
    const hashQuery = await getDb().collection('dns_entries')
        .where('status', '==', 'ACTIVE')
        .where('match_keys', 'array-contains-any', [emailHash, phoneHash])
        .limit(1)
        .get();

    if (!hashQuery.empty) {
        const entry = hashQuery.docs[0].data();
        return {
            blocked: entry.risk_level === 'HIGH' || entry.risk_level === 'CRITICAL',
            review: entry.risk_level === 'MEDIUM',
            matchType: 'exact_hash_match',
            reason: entry.reason || 'Matched DNS register entry',
        };
    }

    if (rawEmail) {
        const legacyQuery = await getDb().collection('do_not_serve')
            .where('client_email', '==', rawEmail.toLowerCase().trim())
            .where('status', '==', 'approved')
            .limit(1)
            .get();

        if (!legacyQuery.empty) {
            return {
                blocked: true,
                review: false,
                matchType: 'legacy_email_match',
                reason: legacyQuery.docs[0].data().reason || 'Matched legacy DNS entry',
            };
        }
    }

    return { blocked: false, review: false, matchType: 'none', reason: '' };
}

// --- Repeat Client Trust ---

export interface TrustResult {
    isTrusted: boolean;
    previousBookings: number;
    lastBookingAt: string | null;
    bookingAge: number | null; // days since last successful booking
}

async function checkRepeatClientTrust(emailHash: string, phoneHash: string): Promise<TrustResult> {
    const emailBookings = await getDb().collection('bookings')
        .where('client_email_hash', '==', emailHash)
        .where('status', 'in', ['CONFIRMED', 'confirmed', 'completed'])
        .get();

    const phoneBookings = await getDb().collection('bookings')
        .where('client_phone_hash', '==', phoneHash)
        .where('status', 'in', ['CONFIRMED', 'confirmed', 'completed'])
        .get();

    const allBookingIds = new Set<string>();
    let mostRecent: Date | null = null;
    [...emailBookings.docs, ...phoneBookings.docs].forEach(doc => {
        allBookingIds.add(doc.id);
        const ts = doc.data().created_at?.toDate?.();
        if (ts && (!mostRecent || ts > mostRecent)) mostRecent = ts;
    });
    const previousBookings = allBookingIds.size;

    if (previousBookings === 0) {
        return { isTrusted: false, previousBookings: 0, lastBookingAt: null, bookingAge: null };
    }

    let lastBookingAt: string | null = null;
    let bookingAge: number | null = null;
    if (mostRecent) {
        lastBookingAt = (mostRecent as Date).toISOString();
        bookingAge = Math.floor((Date.now() - (mostRecent as Date).getTime()) / (1000 * 60 * 60 * 24));
    }

    // Trust if 5+ successful bookings within 12 months and no DNS hit (checked elsewhere).
    const isTrusted = previousBookings >= 5 && bookingAge !== null && bookingAge < 365;

    return { isTrusted, previousBookings, lastBookingAt, bookingAge };
}

/**
 * Check if a customer qualifies for the trusted-tier shortcut.
 */
export async function isTrustedCustomer(emailHash: string, phoneHash: string): Promise<{
    trusted: boolean;
    reason: string;
}> {
    const trust = await checkRepeatClientTrust(emailHash, phoneHash);

    if (!trust.isTrusted) {
        return { trusted: false, reason: 'Insufficient verified booking history' };
    }

    const dnsCheck = await checkDnsRegister(emailHash, phoneHash);
    if (dnsCheck.blocked || dnsCheck.review) {
        return { trusted: false, reason: 'DNS register match found' };
    }

    return {
        trusted: true,
        reason: `${trust.previousBookings} successful bookings, last ${trust.bookingAge} days ago`,
    };
}

// --- Failed Verification Count ---

async function getFailedVerificationCount(customerId: string | undefined, phoneHash: string): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let query = getDb().collection('verificationRecords')
        .where('result', '==', 'fail')
        .where('completedAt', '>=', thirtyDaysAgo);

    if (customerId) {
        query = query.where('subjectId', '==', customerId);
    } else if (phoneHash) {
        query = query.where('subjectPhoneHash', '==', phoneHash);
    } else {
        return 0;
    }

    const failedQuery = await query.get();
    return failedQuery.size;
}

// --- Behavior Anomaly Detection ---

async function detectBehaviorAnomalies(email: string, phone: string): Promise<{
    score: number;
    reasons: string[];
}> {
    let score = 0;
    const reasons: string[] = [];
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    const rapidBookings = await getDb().collection('bookings')
        .where('client_email', '==', email.toLowerCase().trim())
        .where('created_at', '>=', oneHourAgo)
        .get();

    if (rapidBookings.size > 3) {
        score += 10;
        reasons.push(`${rapidBookings.size} booking attempts in the last hour`);
    }

    const dayBookings = await getDb().collection('bookings')
        .where('client_email', '==', email.toLowerCase().trim())
        .where('created_at', '>=', oneDayAgo)
        .get();

    const uniquePerformers = new Set(dayBookings.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => d.data().performer_id));
    if (uniquePerformers.size > 3) {
        score += 5;
        reasons.push(`Requested ${uniquePerformers.size} different performers in 24h`);
    }

    return { score, reasons };
}

// --- Device/IP Risk ---

async function checkDeviceRisk(fingerprint: string, _ipAddress?: string): Promise<{
    score: number;
    reasons: string[];
}> {
    let score = 0;
    const reasons: string[] = [];

    const blockedWithFingerprint = await getDb().collection('bookings')
        .where('device_fingerprint', '==', fingerprint)
        .where('status', 'in', ['DENIED', 'rejected'])
        .limit(5)
        .get();

    if (blockedWithFingerprint.size >= 2) {
        score += 10;
        reasons.push(`Device fingerprint linked to ${blockedWithFingerprint.size} blocked bookings`);
    } else if (blockedWithFingerprint.size === 1) {
        score += 5;
        reasons.push('Device fingerprint linked to a previously blocked booking');
    }

    if (fingerprint) {
        const multipleEmails = await getDb().collection('bookings')
            .where('device_fingerprint', '==', fingerprint)
            .limit(10)
            .get();

        const uniqueEmails = new Set(multipleEmails.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => d.data().client_email));
        if (uniqueEmails.size > 3) {
            score += 5;
            reasons.push(`Same device used by ${uniqueEmails.size} different email addresses`);
        }
    }

    return { score, reasons };
}
