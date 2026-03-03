# Do Not Serve (DNS) Workflow Implementation

This document outlines the implementation of the "Do Not Serve (DNS)" workflow for the Australian booking platform using Firebase.

## 1. Firestore Data Model JSON Examples

### `dns_entries/{dnsId}`

```json
{
  "client_name": "Aggressive Alex",
  "client_name_norm": "aggressive alex",
  "client_email_hash": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
  "client_phone_hash": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
  "match_keys": [
    "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
    "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"
  ],
  "reason": "Became aggressive and refused to follow event guidelines.",
  "reason_code": "ABUSIVE_BEHAVIOUR",
  "status": "ACTIVE",
  "submitted_by_performer_id": "1",
  "created_at": "2026-02-13T10:59:47.140Z"
}
```

### `bookings/{bookingId}`

```json
{
  "client_name": "Aggressive Alex",
  "client_email": "alex.blocked@example.com",
  "client_phone": "0400111222",
  "client_email_hash": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
  "client_phone_hash": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
  "payid_reference": "BK-A1B2C3",
  "amount_deposit": 50.00,
  "amount_kyc_fee": 10.00,
  "amount_total_due": 60.00,
  "payment_status": "AWAITING_PAYMENT",
  "kyc_status": "NOT_STARTED",
  "dns_status": "DENIED_DNS",
  "status": "DENIED",
  "created_at": "2026-02-25T21:06:48.000Z"
}
```

### `audit_log/{logId}`

```json
{
  "timestamp": "2026-02-25T21:06:48.000Z",
  "actor_role": "system",
  "actor_id": "anonymous",
  "action": "DNS_HIT",
  "booking_id": "booking-123",
  "details": {
    "reason": "Matched active DNS entry during initial screening"
  }
}
```

## 2. Cloud Functions (TypeScript) Code

The Cloud Functions are implemented in `functions/src/dns/index.ts`. They include:
- `createBookingAndScreenDns()`
- `confirmPayidPayment()`
- `handleKycWebhookOrResult()`
- `dnsLookup()`

## 3. Firestore Security Rules

Add the following to your `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is an admin
    function isAdmin() {
      return request.auth != null && (
        request.auth.token.admin == true || 
        exists(/databases/$(database)/documents/admins/$(request.auth.uid))
      );
    }

    // dns_entries: Only admins can read/write
    match /dns_entries/{dnsId} {
      allow read, write: if isAdmin();
    }

    // dns_submissions: Performers can submit, admins can read/write
    match /dns_submissions/{submissionId} {
      allow create: if request.auth != null && request.auth.token.role == 'performer';
      allow read, write: if isAdmin();
    }

    // bookings: Clients can read their own, admins can read/write all
    match /bookings/{bookingId} {
      allow read: if request.auth != null && resource.data.client_uid == request.auth.uid;
      allow read, write: if isAdmin();
      // Note: Creation is handled securely via Cloud Functions
    }

    // audit_log: Only admins can read
    match /audit_log/{logId} {
      allow read: if isAdmin();
      allow write: if false; // Only written by Cloud Functions
    }
  }
}
```

## 4. Migration Script (Cloud Function)

The following function can be called by an administrator to migrate legacy DNS entries. It converts status `approved` to `ACTIVE` and backfills hashed match keys.

```typescript
/**
 * Migration function to convert 'approved' -> 'ACTIVE' and backfill hashes.
 * Access restricted to admins.
 */
export const runDnsMigration = fns.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new fns.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  // Verify Admin
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists && context.auth.token.admin !== true) {
    throw new fns.https.HttpsError('permission-denied', 'Admin access required');
  }

  const dnsRef = db.collection('dns_entries');
  const snapshot = await dnsRef.get();

  if (snapshot.empty) {
    return { message: 'No entries found.' };
  }

  let count = 0;
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const entry = doc.data();
    const updates: any = {};

    // 1. Convert status 'approved' -> 'ACTIVE'
    if (entry.status === 'approved') {
      updates.status = 'ACTIVE';
    }

    // 2. Backfill hashes and match_keys
    if (!entry.match_keys || !entry.client_email_hash) {
      const email = entry.client_email || '';
      const phone = entry.client_phone || '';
      
      const emailHash = email ? sha256(normalizeEmail(email)) : 'NO_EMAIL';
      const phoneHash = phone ? sha256(normalizePhoneToE164(phone)) : 'NO_PHONE';
      
      updates.client_email_hash = emailHash;
      updates.client_phone_hash = phoneHash;
      updates.match_keys = [emailHash, phoneHash].filter(h => h !== 'NO_EMAIL' && h !== 'NO_PHONE');
      
      if (entry.client_name && !entry.client_name_norm) {
        updates.client_name_norm = entry.client_name.toLowerCase().trim();
      }
    }

    if (Object.keys(updates).length > 0) {
      batch.update(doc.ref, updates);
      count++;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  await writeAuditLog(context.auth.uid, 'admin', 'DNS_MIGRATION_RUN', 'system', { updated_count: count });

  return { success: true, updated_count: count };
});
```

## 5. Test Cases (Unit Tests)

```typescript
import { normalizeEmail, normalizePhoneToE164, sha256, dnsLookup } from '../src/dns';
import * as admin from 'firebase-admin';

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const firestoreMock = {
    collection: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ empty: true })
  };
  return {
    firestore: jest.fn(() => firestoreMock),
    FieldValue: { serverTimestamp: jest.fn() }
  };
});

describe('DNS Workflow Tests', () => {
  
  describe('Normalization & Hashing', () => {
    it('should normalize AU phone numbers to E164 format', () => {
      expect(normalizePhoneToE164('0400 111 222')).toBe('+61400111222');
      expect(normalizePhoneToE164('0400111222')).toBe('+61400111222');
      expect(normalizePhoneToE164('+61 400 111 222')).toBe('+61400111222');
      expect(normalizePhoneToE164('(08) 9123 4567')).toBe('+61891234567');
    });

    it('should normalize emails correctly', () => {
      expect(normalizeEmail(' Alex.Blocked@Example.com ')).toBe('alex.blocked@example.com');
    });

    it('should produce stable SHA256 hashes', () => {
      const email = 'test@example.com';
      const hash1 = sha256(email);
      const hash2 = sha256(email);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex length
    });
  });

  describe('DNS Lookup', () => {
    it('should return false if no match is found', async () => {
      const result = await dnsLookup('hash1', 'hash2');
      expect(result).toBe(false);
    });

    it('should return true if a match is found', async () => {
      // Override mock for this test
      const db = admin.firestore();
      (db.collection('dns_entries').where as jest.Mock).mockReturnValueOnce({
        where: jest.fn().mockReturnValueOnce({
          limit: jest.fn().mockReturnValueOnce({
            get: jest.fn().mockResolvedValueOnce({ empty: false })
          })
        })
      });

      const result = await dnsLookup('hash1', 'hash2');
      expect(result).toBe(true);
    });
  });
});
```
