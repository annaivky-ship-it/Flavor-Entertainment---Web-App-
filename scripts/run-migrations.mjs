/**
 * One-time migration script using Firebase client SDK + Admin REST API.
 * Uses the Firebase CLI's access token to call Firestore REST API directly.
 *
 * Run: node scripts/run-migrations.mjs
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';

const PROJECT_ID = 'studio-4495412314-3b1ce';
const DB = '(default)';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DB}/documents`;

// Firebase CLI public OAuth client
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// Get refresh token from Firebase CLI config and exchange for a proper OAuth access token
const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const refreshToken = config.tokens?.refresh_token;

if (!refreshToken) {
  console.error('No Firebase CLI refresh token found. Run `firebase login` first.');
  process.exit(1);
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

let ACCESS_TOKEN = await getAccessToken();
console.log('OAuth token obtained successfully.');

const headers = {
  'Authorization': `Bearer ${ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
};

async function firestoreGet(path) {
  const res = await fetch(`${BASE}/${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

async function firestoreList(collectionId, pageSize = 100) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${BASE}/${collectionId}?pageSize=${pageSize}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LIST ${collectionId}: ${res.status} ${text}`);
    }
    const data = await res.json();
    if (data.documents) docs.push(...data.documents);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function firestorePatch(docPath, fields, updateMask) {
  const maskParams = updateMask.map(f => `updateMask.fieldPaths=${f}`).join('&');
  const url = `${BASE}/${docPath}?${maskParams}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${docPath}: ${res.status} ${text}`);
  }
  return res.json();
}

async function firestoreCreate(collectionId, docId, fields) {
  const url = `${BASE}/${collectionId}?documentId=${docId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CREATE ${collectionId}/${docId}: ${res.status} ${text}`);
  }
  return res.json();
}

async function firestoreDelete(docPath) {
  const url = `${BASE}/${docPath}`;
  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE ${docPath}: ${res.status} ${text}`);
  }
}

function getDocId(doc) {
  return doc.name.split('/').pop();
}

function getStringField(doc, field) {
  return doc.fields?.[field]?.stringValue || '';
}

function getArrayField(doc, field) {
  const arr = doc.fields?.[field]?.arrayValue?.values;
  return arr ? arr.map(v => v.stringValue || '') : [];
}

// ---------------------------------------------------------------------------
// Migration 1: Blacklist hex → SHA-256
// ---------------------------------------------------------------------------
async function migrateBlacklistHashes() {
  console.log('\n--- Migration 1: Blacklist hash migration (hex → SHA-256) ---');

  let docs;
  try {
    docs = await firestoreList('blacklist');
  } catch (e) {
    console.log('No blacklist collection or empty. Skipping.', e.message);
    return;
  }

  if (docs.length === 0) {
    console.log('No blacklist entries found. Skipping.');
    return;
  }

  let migrated = 0, skipped = 0;

  for (const doc of docs) {
    const docId = getDocId(doc);

    // SHA-256 hashes are exactly 64 hex chars
    if (docId.length === 64 && /^[0-9a-f]+$/.test(docId)) {
      skipped++;
      continue;
    }

    // Check if hex-encoded email
    if (/^[0-9a-f]+$/.test(docId) && docId.length % 2 === 0) {
      try {
        const decoded = Buffer.from(docId, 'hex').toString('utf8');
        if (decoded.includes('@') && decoded.includes('.')) {
          const sha256 = createHash('sha256').update(decoded.toLowerCase()).digest('hex');

          // Create new doc with SHA-256 ID
          const fields = { ...doc.fields };
          fields.migrated_from = { stringValue: docId };
          fields.migrated_at = { timestampValue: new Date().toISOString() };
          await firestoreCreate('blacklist', sha256, fields);

          // Delete old doc
          await firestoreDelete(`blacklist/${docId}`);
          migrated++;
          console.log(`  Migrated: ${decoded} → ${sha256.substring(0, 16)}...`);
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

  console.log(`Blacklist: ${migrated} migrated, ${skipped} skipped.`);
}

// ---------------------------------------------------------------------------
// Migration 2: Backfill participant_uids on communications
// ---------------------------------------------------------------------------
async function backfillCommunicationParticipants() {
  console.log('\n--- Migration 2: Backfill participant_uids on communications ---');

  let docs;
  try {
    docs = await firestoreList('communications');
  } catch (e) {
    console.log('No communications found. Skipping.', e.message);
    return;
  }

  if (docs.length === 0) {
    console.log('No communications found. Skipping.');
    return;
  }

  // Cache booking lookups
  const bookingCache = new Map();

  let updated = 0, skipped = 0;

  for (const doc of docs) {
    const existing = getArrayField(doc, 'participant_uids');
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const participantUids = [];
    const senderUid = getStringField(doc, 'sender_uid');
    if (senderUid) participantUids.push(senderUid);

    const bookingId = getStringField(doc, 'booking_id');
    if (bookingId) {
      let booking = bookingCache.get(bookingId);
      if (!booking) {
        try {
          booking = await firestoreGet(`bookings/${bookingId}`);
          bookingCache.set(bookingId, booking);
        } catch {
          // booking may not exist
        }
      }
      if (booking) {
        const clientUid = getStringField(booking, 'client_uid');
        if (clientUid && !participantUids.includes(clientUid)) participantUids.push(clientUid);
        const performerId = getStringField(booking, 'performer_id');
        if (performerId && !participantUids.includes(performerId)) participantUids.push(performerId);
      }
    }

    if (participantUids.length === 0) participantUids.push('system');

    const docId = getDocId(doc);
    await firestorePatch(`communications/${docId}`, {
      participant_uids: { arrayValue: { values: participantUids.map(u => ({ stringValue: u })) } },
      sender_uid: { stringValue: senderUid || 'system' },
    }, ['participant_uids', 'sender_uid']);

    updated++;
  }

  console.log(`Communications: ${updated} updated, ${skipped} already had participant_uids.`);
}

// ---------------------------------------------------------------------------
// Migration 3: Backfill client_uid on bookings
// ---------------------------------------------------------------------------
async function backfillBookingClientUid() {
  console.log('\n--- Migration 3: Backfill client_uid on bookings ---');

  // Build email → UID map from exported auth_users.json
  const emailToUid = new Map();
  try {
    const authData = JSON.parse(readFileSync('auth_users.json', 'utf8'));
    for (const user of authData.users || []) {
      if (user.email) emailToUid.set(user.email.toLowerCase(), user.localId);
    }
    console.log(`  Loaded ${emailToUid.size} email → UID mappings.`);
  } catch (e) {
    console.log('  Could not load auth_users.json:', e.message);
  }

  let docs;
  try {
    docs = await firestoreList('bookings');
  } catch (e) {
    console.log('No bookings found. Skipping.', e.message);
    return;
  }

  if (docs.length === 0) {
    console.log('No bookings found. Skipping.');
    return;
  }

  let updated = 0, skipped = 0, unresolved = 0;

  for (const doc of docs) {
    const existing = getStringField(doc, 'client_uid');
    if (existing) {
      skipped++;
      continue;
    }

    const email = (getStringField(doc, 'client_email') || getStringField(doc, 'email')).toLowerCase().trim();
    const uid = emailToUid.get(email);

    if (uid) {
      const docId = getDocId(doc);
      await firestorePatch(`bookings/${docId}`, {
        client_uid: { stringValue: uid },
      }, ['client_uid']);
      updated++;
    } else {
      unresolved++;
    }
  }

  console.log(`Bookings: ${updated} updated, ${skipped} already had client_uid, ${unresolved} unresolved.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Starting security migrations ===');
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Quick auth check — list bookings with pageSize=1
  try {
    const res = await fetch(`${BASE}/bookings?pageSize=1`, { headers });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.error('Access token expired. Run `firebase login --reauth` and retry.');
        process.exit(1);
      }
      throw new Error(`Auth check failed: ${res.status} ${await res.text()}`);
    }
    console.log('Auth: OK');
  } catch (e) {
    console.error('Auth check failed:', e.message);
    process.exit(1);
  }

  await migrateBlacklistHashes();
  await backfillCommunicationParticipants();
  await backfillBookingClientUid();

  console.log('\n=== All migrations complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
