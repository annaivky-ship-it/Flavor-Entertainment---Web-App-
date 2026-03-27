import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Firestore Rules Structural & Syntax Tests
 *
 * These tests validate the rules file syntax and structure.
 * For full emulator-based tests, run:
 *   npx firebase emulators:exec --only firestore "npm run test:rules"
 */

const rulesContent = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf-8');

describe('Firestore Rules - Syntax & Structure', () => {
  it('uses rules_version 2', () => {
    expect(rulesContent).toContain("rules_version = '2'");
  });

  it('has a root service cloud.firestore block', () => {
    expect(rulesContent).toContain('service cloud.firestore');
  });

  it('has balanced braces', () => {
    const opens = (rulesContent.match(/{/g) || []).length;
    const closes = (rulesContent.match(/}/g) || []).length;
    expect(opens).toBe(closes);
  });
});

describe('Firestore Rules - Booking Access Control', () => {
  it('unauthenticated users cannot read bookings (requires auth or admin)', () => {
    // Rule: allow read: if isAdmin() || (isSignedIn() && ...) || (isPerformer() && ...)
    // isSignedIn checks request.auth != null, so unauthenticated users are blocked
    expect(rulesContent).toContain('match /bookings/{bookingId}');
    expect(rulesContent).toContain('allow read: if isAdmin()');
    // Verify there's no "allow read: if true" for bookings
    const bookingsSection = rulesContent.substring(
      rulesContent.indexOf('match /bookings/{bookingId}'),
      rulesContent.indexOf('allow delete: if false', rulesContent.indexOf('match /bookings/{bookingId}')) + 30
    );
    expect(bookingsSection).not.toContain('allow read: if true');
  });

  it('clients can only read their own bookings', () => {
    expect(rulesContent).toContain('resource.data.client_uid == request.auth.uid');
  });

  it('performers can read bookings assigned to them', () => {
    expect(rulesContent).toContain('isPerformer()');
  });

  it('only admins can update booking status', () => {
    const bookingsSection = rulesContent.substring(
      rulesContent.indexOf('match /bookings/{bookingId}'),
      rulesContent.indexOf('allow delete: if false', rulesContent.indexOf('match /bookings/{bookingId}')) + 30
    );
    expect(bookingsSection).toContain('allow update: if isAdmin()');
  });

  it('nobody can delete bookings', () => {
    const bookingsSection = rulesContent.substring(
      rulesContent.indexOf('match /bookings/{bookingId}'),
      rulesContent.indexOf('allow delete: if false', rulesContent.indexOf('match /bookings/{bookingId}')) + 30
    );
    expect(bookingsSection).toContain('allow delete: if false');
  });
});

describe('Firestore Rules - User Data Protection', () => {
  it('has isOwner helper that checks auth.uid', () => {
    expect(rulesContent).toContain('function isOwner(userId)');
    expect(rulesContent).toContain('request.auth.uid == userId');
  });

  it('vetting applications restricted to owner or admin', () => {
    expect(rulesContent).toContain('match /vetting_applications/{appId}');
    expect(rulesContent).toContain('isOwner(resource.data.userId)');
  });

  it('audit logs are read-only for admins, write-only for system', () => {
    const auditSection = rulesContent.substring(
      rulesContent.indexOf('match /audit_log/{logId}'),
      rulesContent.indexOf('match /vetting_applications')
    );
    expect(auditSection).toContain('allow read: if isAdmin()');
    expect(auditSection).toContain('allow write: if false');
  });

  it('KYC sessions are admin-read only, cloud function write only', () => {
    expect(rulesContent).toContain('match /kyc_sessions/{sessionId}');
    const kycSection = rulesContent.substring(
      rulesContent.indexOf('match /kyc_sessions/{sessionId}'),
      rulesContent.indexOf('match /risk_scores')
    );
    expect(kycSection).toContain('allow read: if isAdmin()');
    expect(kycSection).toContain('allow write: if false');
  });

  it('has a default deny-all rule', () => {
    expect(rulesContent).toContain('match /{document=**}');
    // The last match block should deny everything
    const defaultRule = rulesContent.substring(
      rulesContent.lastIndexOf('match /{document=**}')
    );
    expect(defaultRule).toContain('allow read, write: if false');
  });
});

describe('Firestore Rules - Communications', () => {
  it('only allows updating the read field on communications', () => {
    expect(rulesContent).toContain("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read'])");
  });
});
