"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIncidentReport = createIncidentReport;
exports.approveIncidentReport = approveIncidentReport;
exports.rejectIncidentReport = rejectIncidentReport;
exports.getPendingReports = getPendingReports;
const admin = __importStar(require("firebase-admin"));
const getDb = () => admin.firestore();
// --- Create Incident Report ---
async function createIncidentReport(report) {
    const reportRef = await getDb().collection('incident_reports').add(Object.assign(Object.assign({}, report), { client_email: report.client_email.toLowerCase().trim(), client_phone: report.client_phone.replace(/[\s\-\(\)]/g, ''), status: 'PENDING_REVIEW', created_at: admin.firestore.FieldValue.serverTimestamp() }));
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
async function approveIncidentReport(reportId, adminUid, adminNotes) {
    const reportRef = getDb().collection('incident_reports').doc(reportId);
    const reportDoc = await reportRef.get();
    if (!reportDoc.exists)
        throw new Error('Report not found');
    const report = reportDoc.data();
    // Import hash utilities from DNS module
    const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
    const PEPPER = process.env.DNS_HASH_PEPPER || 'default-secret-pepper-change-me-in-prod';
    function sha256(value) {
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
async function rejectIncidentReport(reportId, adminUid, reason) {
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
async function getPendingReports() {
    const snap = await getDb().collection('incident_reports')
        .where('status', '==', 'PENDING_REVIEW')
        .orderBy('created_at', 'desc')
        .get();
    return snap.docs.map((d) => (Object.assign(Object.assign({}, d.data()), { id: d.id })));
}
//# sourceMappingURL=reporting.js.map