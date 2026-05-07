/**
 * Rotate HASH_SECRET and re-hash existing doNotServeList entries.
 *
 * Usage:
 *   HASH_SECRET=<new-hex> node scripts/rotate-hash-secret.js [--dry-run] [--write-audit]
 *
 * Inputs:
 *   - data/dns-raw-values.json (NOT committed): { entryId: string -> rawValue: string }
 *   - HASH_SECRET env var (the NEW secret)
 *
 * Behaviour:
 *   - For every entry in data/dns-raw-values.json, recompute the HMAC and update
 *     doNotServeList/{entryId}.value. If the entry doesn't exist or already
 *     matches, it's skipped.
 *   - Logs the count of updates and (with --write-audit) writes a single audit
 *     log entry attributed to the runner.
 *
 * As of the cutover commit the DNS register is empty, so this script is a no-op
 * and serves as a future-use template.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';

const newSecret = process.env.HASH_SECRET;
if (!newSecret) {
  console.error('HASH_SECRET env var is required (the NEW secret).');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const writeAudit = process.argv.includes('--write-audit');

const rawValuesPath = path.resolve(__dirname, '../data/dns-raw-values.json');
if (!fs.existsSync(rawValuesPath)) {
  console.warn(`No raw-values file at ${rawValuesPath}. Nothing to do.`);
  process.exit(0);
}

interface RawValueEntry {
  matchType: 'phone_hash' | 'email_hash' | 'face_hash';
  rawValue: string;
}

const rawValues: Record<string, RawValueEntry> = JSON.parse(
  fs.readFileSync(rawValuesPath, 'utf-8')
);

function hmacSha256(value: string): string {
  return crypto.createHmac('sha256', newSecret as string).update(value).digest('hex');
}

function rebuildHashed(matchType: RawValueEntry['matchType'], raw: string): string {
  if (matchType === 'phone_hash') return hmacSha256(`phone:${raw}`);
  if (matchType === 'email_hash') return hmacSha256(`email:${raw}`);
  return hmacSha256(`face:${raw}`);
}

async function main() {
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const [entryId, info] of Object.entries(rawValues)) {
    const ref = db.collection('doNotServeList').doc(entryId);
    const doc = await ref.get();
    if (!doc.exists) {
      console.log(`[missing] ${entryId}`);
      missing++;
      continue;
    }
    const currentValue: string = doc.data()!.value;
    const newValue = rebuildHashed(info.matchType, info.rawValue);
    if (currentValue === newValue) {
      console.log(`[skip] ${entryId} (already up-to-date)`);
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] ${entryId}: ${currentValue} → ${newValue}`);
      updated++;
      continue;
    }
    await ref.update({ value: newValue, lastRehashedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`[updated] ${entryId}: ${currentValue.slice(0, 8)}… → ${newValue.slice(0, 8)}…`);
    updated++;
  }

  if (writeAudit && !dryRun) {
    await db.collection('auditLog').add({
      actorUid: process.env.USER || 'unknown',
      actorRole: 'admin',
      action: 'HASH_SECRET_ROTATED',
      subjectType: 'system',
      subjectId: null,
      bookingId: null,
      meta: { entriesRehashed: updated, skipped, missing },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  console.log(`Done. updated=${updated} skipped=${skipped} missing=${missing}`);
}

main().catch(err => { console.error(err); process.exit(1); });
