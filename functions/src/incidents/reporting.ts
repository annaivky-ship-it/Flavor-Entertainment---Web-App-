import * as admin from 'firebase-admin';

const getDb = () => admin.firestore();

// --- Types ---

export interface IncidentReport {
    id?: string;
    client_name: string;
    client_email: string;
    client_phone: string;
    incident_description: string;
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    reported_by_performer_id: number | string;
    reported_by_name?: string;
    evidence_urls?: string[];
    booking_id?: string;
    status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ESCALATED';
    admin_notes?: string;
    reviewed_by?: string;
    reviewed_at?: any;
    created_at?: any;
}

// --- Create Incident Report ---

export async function createIncidentReport(
    report: Omit<IncidentReport, 'id' | 'status' | 'created_at'>
): Promise<string> {
    const reportRef = await getDb().collection('incident_reports').add({
        ...report,
        client_email: report.client_email.toLowerCase().trim(),
        client_phone: report.client_phone.replace(/[\s\-\(\)]/g, ''),
        status: 'PENDING_REVIEW',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Audit log
    await getDb().collection('audit_log').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actor_id: String(report.reported_by_performer_id),
        actor_role: 'performer',
        action: 'INCIDENT_REPORTED',
        booking_id: report.booking_id || null,
        details: {
            report_id: reportRef.id,
            client_name: report.client_name,
            risk_level: report.risk_level,
        },
    });

    return reportRef.id;
}

// --- Approve Incident → Add to DNS Register ---

export async function approveIncidentReport(
    reportId: string,
    adminUid: string,
    adminNotes?: string
): Promise<void> {
    const reportRef = getDb().collection('incident_reports').doc(reportId);
    const reportDoc = await reportRef.get();

    if (!reportDoc.exists) throw new Error('Report not found');
    const report = reportDoc.data() as IncidentReport;

    // Import hash utilities from DNS module
    const crypto = await import('crypto');
    const PEPPER = process.env.DNS_HASH_PEPPER || 'default-secret-pepper-change-me-in-prod';

    function sha256(value: string): string {
        return crypto.createHash('sha256').update(value + PEPPER).digest('hex');
    }

    const emailNorm = report.client_email.toLowerCase().trim();
    const phoneNorm = report.client_phone.replace(/[\s\-\(\)]/g, '');
    const emailHash = sha256(emailNorm);
    const phoneHash = sha256(phoneNorm);

    // Create DNS register entry
    await getDb().collection('dns_entries').add({
        client_name: report.client_name,
        client_name_norm: report.client_name.toLowerCase().trim(),
        client_email_hash: emailHash,
        client_phone_hash: phoneHash,
        match_keys: [emailHash, phoneHash],
        reason: report.incident_description,
        risk_level: report.risk_level,
        reported_by: String(report.reported_by_performer_id),
        source_report_id: reportId,
        status: 'ACTIVE',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update report status
    await reportRef.update({
        status: 'APPROVED',
        admin_notes: adminNotes || null,
        reviewed_by: adminUid,
        reviewed_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Audit
    await getDb().collection('audit_log').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actor_id: adminUid,
        actor_role: 'admin',
        action: 'INCIDENT_APPROVED_DNS_ADDED',
        booking_id: report.booking_id || null,
        details: {
            report_id: reportId,
            client_name: report.client_name,
            risk_level: report.risk_level,
        },
    });
}

// --- Reject Incident Report ---

export async function rejectIncidentReport(
    reportId: string,
    adminUid: string,
    reason: string
): Promise<void> {
    await getDb().collection('incident_reports').doc(reportId).update({
        status: 'REJECTED',
        admin_notes: reason,
        reviewed_by: adminUid,
        reviewed_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    await getDb().collection('audit_log').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actor_id: adminUid,
        actor_role: 'admin',
        action: 'INCIDENT_REJECTED',
        details: { report_id: reportId, reason },
    });
}

// --- Get reports for admin review ---

export async function getPendingReports(): Promise<(IncidentReport & { id: string })[]> {
    const snap = await getDb().collection('incident_reports')
        .where('status', '==', 'PENDING_REVIEW')
        .orderBy('created_at', 'desc')
        .get();

    return snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => ({ ...d.data(), id: d.id } as IncidentReport & { id: string }));
}
