import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const getDb = () => getFirestore('default');

/**
 * Record client consent for the booking and verification process.
 * Must be called before SMS OTP / liveness flow begins.
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
        details: { consent_id: consentRef.id, ip_address: params.ipAddress },
    });

    return consentRef.id;
}

export const CONSENT_TEXT = `By proceeding, I consent to the following:

1. My phone number will be verified by SMS one-time-password.
2. For higher-tier bookings, I may be asked to complete an on-device liveness check (a brief blink-and-look-at-camera flow). No image of me is uploaded, transmitted, or stored — only a short numeric verification record.
3. My deposit payment via PayID will be verified to confirm the account name matches my booking name.
4. My phone, email, and (if applicable) liveness verification record will be checked against an internal safety register.
5. Verification results are retained for safety and audit purposes only and are never shared with third parties.
6. I confirm I am 18 years of age or older.

This process protects the safety of all parties involved.`;
