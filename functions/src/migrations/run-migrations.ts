/**
 * One-time migration script to fix security-related data issues.
 *
 * Run with: npx ts-node --project ../tsconfig.json migrations/run-migrations.ts
 * Or from functions/: npx ts-node src/migrations/run-migrations.ts
 *
 * Migrations:
 * 1. Re-hash blacklist entries from hex encoding to SHA-256
 * 2. Backfill participant_uids on existing communications
 * 3. Backfill client_uid on existing bookings
 */

import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const PROJECT_ID = 'studio-4495412314-3b1ce';
// Firebase CLI OAuth client credentials (public, used by all firebase-tools installs)
const FIREBASE_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// Read Firebase CLI refresh token
const configPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const refreshToken = config.tokens?.refresh_token;

if (!refreshToken) {
  console.error('No Firebase CLI refresh token found. Run `firebase login` first.');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: PROJECT_ID,
    credential: admin.credential.refreshToken({
      client_id: FIREBASE_CLIENT_ID,
      client_secret: FIREBASE_CLIENT_SECRET,
      refresh_token: refreshToken,
      type: 'authorized_user',
    } as any),
  });
}
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Migration 1: Migrate blacklist entries from hex-encoded email to SHA-256
// ---------------------------------------------------------------------------
async function migrateBlacklistHashes() {
  console.log('\n--- Migration 1: Blacklist hash migration (hex → SHA-256) ---');

  const snapshot = await db.collection('blacklist').get();
  if (snapshot.empty) {
    console.log('No blacklist entries found. Skipping.');
    return;
  }

  let migrated = 0;
  let skipped = 0;
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const docId = doc.id;

    // Check if the doc ID looks like hex-encoded email (all hex chars, even length)
    // SHA-256 hashes are exactly 64 hex chars; hex-encoded emails are variable length
    if (docId.length === 64 && /^[0-9a-f]+$/.test(docId)) {
      // Already looks like a SHA-256 hash (64 hex chars)
      skipped++;
      continue;
    }

    // Try to decode hex to see if it's a hex-encoded email
    if (/^[0-9a-f]+$/.test(docId) && docId.length % 2 === 0) {
      try {
        const decodedEmail = Buffer.from(docId, 'hex').toString('utf8');

        // Verify it looks like an email
        if (decodedEmail.includes('@') && decodedEmail.includes('.')) {
          const sha256Hash = createHash('sha256').update(decodedEmail.toLowerCase()).digest('hex');

          // Create new doc with SHA-256 hash as ID
          const newRef = db.collection('blacklist').doc(sha256Hash);
          batch.set(newRef, {
            ...doc.data(),
            migrated_from: docId,
            migrated_at: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Delete old hex-encoded doc
          batch.delete(doc.ref);
          migrated++;

          console.log(`  Migrating: ${decodedEmail} → ${sha256Hash.substring(0, 16)}...`);
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  if (migrated > 0) {
    await batch.commit();
  }
  console.log(`Blacklist migration complete: ${migrated} migrated, ${skipped} skipped.`);
}

// ---------------------------------------------------------------------------
// Migration 2: Backfill participant_uids on existing communications
// ---------------------------------------------------------------------------
async function backfillCommunicationParticipants() {
  console.log('\n--- Migration 2: Backfill participant_uids on communications ---');

  const snapshot = await db.collection('communications').get();
  if (snapshot.empty) {
    console.log('No communications found. Skipping.');
    return;
  }

  let updated = 0;
  let skipped = 0;
  let batchCount = 0;
  let batch = db.batch();

  for (const commDoc of snapshot.docs) {
    const data = commDoc.data();

    // Skip if already has participant_uids
    if (data.participant_uids && Array.isArray(data.participant_uids) && data.participant_uids.length > 0) {
      skipped++;
      continue;
    }

    // Build participant_uids from the booking's client and performer
    const participantUids: string[] = [];

    // If sender_uid exists, include it
    if (data.sender_uid) {
      participantUids.push(data.sender_uid);
    }

    // Try to get booking participants
    if (data.booking_id) {
      try {
        const bookingDoc = await db.collection('bookings').doc(data.booking_id).get();
        if (bookingDoc.exists) {
          const booking = bookingDoc.data()!;
          if (booking.client_uid && !participantUids.includes(booking.client_uid)) {
            participantUids.push(booking.client_uid);
          }
          // performer_id might be a number (Firestore doc ID) or a UID string
          const performerId = String(booking.performer_id || '');
          if (performerId && !participantUids.includes(performerId)) {
            participantUids.push(performerId);
          }
        }
      } catch (err) {
        console.warn(`  Could not fetch booking ${data.booking_id}:`, err);
      }
    }

    // If we still have no participants, use a fallback
    if (participantUids.length === 0) {
      console.warn(`  Communication ${commDoc.id} has no resolvable participants. Setting sender_uid to 'system'.`);
      participantUids.push('system');
    }

    batch.update(commDoc.ref, {
      participant_uids: participantUids,
      sender_uid: data.sender_uid || 'system',
    });

    updated++;
    batchCount++;

    // Firestore batch limit is 500
    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Communications migration complete: ${updated} updated, ${skipped} already had participant_uids.`);
}

// ---------------------------------------------------------------------------
// Migration 3: Backfill client_uid on existing bookings
// ---------------------------------------------------------------------------
async function backfillBookingClientUid() {
  console.log('\n--- Migration 3: Backfill client_uid on bookings ---');

  const snapshot = await db.collection('bookings').get();
  if (snapshot.empty) {
    console.log('No bookings found. Skipping.');
    return;
  }

  // Build email → UID mapping from Firebase Auth
  const emailToUid = new Map<string, string>();
  try {
    let pageToken: string | undefined;
    do {
      const listResult = await admin.auth().listUsers(1000, pageToken);
      for (const user of listResult.users) {
        if (user.email) {
          emailToUid.set(user.email.toLowerCase(), user.uid);
        }
      }
      pageToken = listResult.pageToken;
    } while (pageToken);
    console.log(`  Loaded ${emailToUid.size} email → UID mappings from Firebase Auth.`);
  } catch (err) {
    console.error('  Failed to list users from Firebase Auth:', err);
    console.log('  Will skip bookings without existing client_uid.');
  }

  let updated = 0;
  let skipped = 0;
  let unresolved = 0;
  let batchCount = 0;
  let batch = db.batch();

  for (const bookingDoc of snapshot.docs) {
    const data = bookingDoc.data();

    // Skip if already has client_uid
    if (data.client_uid) {
      skipped++;
      continue;
    }

    // Try to resolve client_uid from email
    const email = (data.client_email || data.email || '').toLowerCase().trim();
    const uid = emailToUid.get(email);

    if (uid) {
      batch.update(bookingDoc.ref, { client_uid: uid });
      updated++;
      batchCount++;
    } else {
      unresolved++;
    }

    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Booking migration complete: ${updated} updated, ${skipped} already had client_uid, ${unresolved} could not resolve email → UID.`);
}

// ---------------------------------------------------------------------------
// Run all migrations
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Starting security migrations ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  try {
    await migrateBlacklistHashes();
    await backfillCommunicationParticipants();
    await backfillBookingClientUid();

    console.log('\n=== All migrations complete ===');
  } catch (err) {
    console.error('\nMigration failed:', err);
    process.exit(1);
  }

  process.exit(0);
}

main();
