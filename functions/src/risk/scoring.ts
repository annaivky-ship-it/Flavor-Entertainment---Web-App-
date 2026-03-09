import * as admin from 'firebase-admin';

const getDb = () => admin.firestore();

// --- Types ---

export interface RiskFactors {
    identityVerification: number;    // 0–25 points
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
    clientEmail: string;
    clientPhone: string;
    clientEmailHash: string;
    clientPhoneHash: string;
    ipAddress?: string;
    deviceFingerprint?: string;
    kycStatus?: string;
    kycConfidence?: number;
}): Promise<RiskAssessment> {
    const factors: RiskFactors = {
        identityVerification: 0,
        dnsMatch: 0,
        repeatClientTrust: 0,
        failedAttempts: 0,
        behaviorAnomalies: 0,
        deviceRisk: 0,
    };
    const reasons: string[] = [];

    // --- Factor 1: Identity Verification (0–25 points) ---
    if (params.kycStatus === 'FAIL') {
        factors.identityVerification = 25;
        reasons.push('Identity verification failed');
    } else if (params.kycStatus === 'PASS_WITH_FLAGS') {
        factors.identityVerification = 15;
        reasons.push('Identity verified with AML flags');
    } else if (params.kycStatus === 'ERROR') {
        factors.identityVerification = 10;
        reasons.push('Identity verification error');
    } else if (params.kycStatus === 'NOT_STARTED') {
        factors.identityVerification = 5;
        reasons.push('Identity verification not yet completed');
    } else if (params.kycStatus === 'PASS') {
        factors.identityVerification = 0;
    } else if (params.kycStatus === 'BYPASSED') {
        factors.identityVerification = 0;
        // Trusted repeat client
    }

    // Confidence score penalty
    if (params.kycConfidence !== undefined && params.kycConfidence < 0.7) {
        factors.identityVerification += 5;
        reasons.push(`Low verification confidence: ${(params.kycConfidence * 100).toFixed(0)}%`);
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
    if (trustResult.isTrusted) {
        factors.repeatClientTrust = -20;
        reasons.push(`Trusted repeat client (${trustResult.previousBookings} successful bookings)`);
    } else if (trustResult.previousBookings > 0) {
        factors.repeatClientTrust = -10;
        reasons.push(`Returning client (${trustResult.previousBookings} previous bookings)`);
    }

    // --- Factor 4: Failed Verification Attempts (0–15 points) ---
    const failedCount = await getFailedVerificationCount(params.clientEmail, params.clientPhone);
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

    // --- Calculate Final Score ---
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

    // Override: DNS block always rejects
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

    // Store risk score in Firestore
    await getDb().collection('risk_scores').add({
        booking_id: params.bookingId,
        client_email_hash: params.clientEmailHash,
        client_phone_hash: params.clientPhoneHash,
        ...assessment,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Audit log
    await getDb().collection('audit_log').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actor_id: 'system',
        actor_role: 'system',
        action: 'RISK_SCORE_CALCULATED',
        booking_id: params.bookingId,
        details: {
            score,
            level,
            decision,
            factors,
            reasons,
        },
    });

    return assessment;
}

// --- DNS Register Check (enhanced) ---

async function checkDnsRegister(emailHash: string, phoneHash: string, rawEmail?: string): Promise<{
    blocked: boolean;
    review: boolean;
    matchType: string;
    reason: string;
}> {
    // Check hashed entries (privacy-safe)
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

    // Check legacy do_not_serve collection (backward compat)
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
    lastVerifiedAt: string | null;
    verificationAge: number | null; // days since last verification
}

async function checkRepeatClientTrust(emailHash: string, phoneHash: string): Promise<TrustResult> {
    // Check for previous successful bookings
    const emailBookings = await getDb().collection('bookings')
        .where('client_email_hash', '==', emailHash)
        .where('status', 'in', ['CONFIRMED', 'confirmed', 'completed'])
        .get();

    const phoneBookings = await getDb().collection('bookings')
        .where('client_phone_hash', '==', phoneHash)
        .where('status', 'in', ['CONFIRMED', 'confirmed', 'completed'])
        .get();

    // Deduplicate by booking ID
    const allBookingIds = new Set<string>();
    [...emailBookings.docs, ...phoneBookings.docs].forEach(doc => allBookingIds.add(doc.id));
    const previousBookings = allBookingIds.size;

    if (previousBookings === 0) {
        return { isTrusted: false, previousBookings: 0, lastVerifiedAt: null, verificationAge: null };
    }

    // Check last KYC verification
    const kycQuery = await getDb().collection('kyc_sessions')
        .where('status', '==', 'Approved')
        .orderBy('completed_at', 'desc')
        .limit(1)
        .get();

    let lastVerifiedAt: string | null = null;
    let verificationAge: number | null = null;

    if (!kycQuery.empty) {
        const kycData = kycQuery.docs[0].data();
        const completedAt = kycData.completed_at?.toDate?.() || new Date(kycData.completed_at);
        lastVerifiedAt = completedAt.toISOString();
        verificationAge = Math.floor((Date.now() - completedAt.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Trust if: verified within 12 months + successful bookings + no DNS
    const isTrusted = previousBookings >= 1 && verificationAge !== null && verificationAge < 365;

    return { isTrusted, previousBookings, lastVerifiedAt, verificationAge };
}

/**
 * Check if a client should skip KYC (trusted repeat client).
 */
export async function shouldSkipKyc(emailHash: string, phoneHash: string): Promise<{
    skip: boolean;
    reason: string;
}> {
    const trust = await checkRepeatClientTrust(emailHash, phoneHash);

    if (!trust.isTrusted) {
        return { skip: false, reason: 'New or unverified client' };
    }

    // Also verify no DNS entries have been added since last booking
    const dnsCheck = await checkDnsRegister(emailHash, phoneHash);
    if (dnsCheck.blocked || dnsCheck.review) {
        return { skip: false, reason: 'DNS register match found since last booking' };
    }

    return {
        skip: true,
        reason: `Trusted repeat client: ${trust.previousBookings} bookings, verified ${trust.verificationAge} days ago`,
    };
}

// --- Failed Verification Count ---

async function getFailedVerificationCount(email: string, phone: string): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const failedQuery = await getDb().collection('kyc_sessions')
        .where('client_email', '==', email.toLowerCase().trim())
        .where('status', 'in', ['Declined', 'FAIL'])
        .where('created_at', '>=', thirtyDaysAgo)
        .get();

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

    // Check rapid booking attempts (more than 3 in 1 hour)
    const rapidBookings = await getDb().collection('bookings')
        .where('client_email', '==', email.toLowerCase().trim())
        .where('created_at', '>=', oneHourAgo)
        .get();

    if (rapidBookings.size > 3) {
        score += 10;
        reasons.push(`${rapidBookings.size} booking attempts in the last hour`);
    }

    // Check multiple different performers in 24h (possible scanning)
    const dayBookings = await getDb().collection('bookings')
        .where('client_email', '==', email.toLowerCase().trim())
        .where('created_at', '>=', oneDayAgo)
        .get();

    const uniquePerformers = new Set(dayBookings.docs.map(d => d.data().performer_id));
    if (uniquePerformers.size > 3) {
        score += 5;
        reasons.push(`Requested ${uniquePerformers.size} different performers in 24h`);
    }

    return { score, reasons };
}

// --- Device/IP Risk ---

async function checkDeviceRisk(fingerprint: string, ipAddress?: string): Promise<{
    score: number;
    reasons: string[];
}> {
    let score = 0;
    const reasons: string[] = [];

    // Check if fingerprint was used by multiple blocked clients
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

    // Check fingerprint used by different emails (potential fraud)
    if (fingerprint) {
        const multipleEmails = await getDb().collection('bookings')
            .where('device_fingerprint', '==', fingerprint)
            .limit(10)
            .get();

        const uniqueEmails = new Set(multipleEmails.docs.map(d => d.data().client_email));
        if (uniqueEmails.size > 3) {
            score += 5;
            reasons.push(`Same device used by ${uniqueEmails.size} different email addresses`);
        }
    }

    return { score, reasons };
}
