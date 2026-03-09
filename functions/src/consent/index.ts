import * as admin from 'firebase-admin';

const getDb = () => admin.firestore();

/**
 * Record client consent for identity verification.
 * Must be called before KYC session creation.
 */
export async function recordConsent(params: {
    bookingId: string;
    clientEmail: string;
    clientPhone: string;
    ipAddress: string;
    userAgent: string;
    deviceFingerprint?: string;
    consentText: string;
}): Promise<string> {
    const consentRef = await getDb().collection('consents').add({
        booking_id: params.bookingId,
        client_email: params.clientEmail.toLowerCase().trim(),
        client_phone: params.clientPhone,
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        device_fingerprint: params.deviceFingerprint || null,
        consent_text: params.consentText,
        consented_at: admin.firestore.FieldValue.serverTimestamp(),
        revoked: false,
    });

    // Update booking with consent reference
    await getDb().collection('bookings').doc(params.bookingId).update({
        consent_id: consentRef.id,
        consent_timestamp: admin.firestore.FieldValue.serverTimestamp(),
        client_ip: params.ipAddress,
        device_fingerprint: params.deviceFingerprint || null,
    });

    await getDb().collection('audit_log').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actor_id: params.clientEmail,
        actor_role: 'client',
        action: 'CONSENT_RECORDED',
        booking_id: params.bookingId,
        details: {
            consent_id: consentRef.id,
            ip_address: params.ipAddress,
        },
    });

    return consentRef.id;
}

export const CONSENT_TEXT = `By proceeding, I consent to the following:

1. My government-issued ID will be verified through a secure third-party identity verification service.
2. A liveness check may be performed to confirm my identity.
3. My details will be checked against internal safety databases.
4. This verification is required before any booking can be confirmed.
5. My verification results will be stored securely and used solely for safety purposes.
6. I understand that failing verification will result in my booking being declined.

This process protects the safety of all parties involved.`;
