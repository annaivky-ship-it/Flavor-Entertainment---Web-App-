#!/usr/bin/env npx ts-node
/**
 * Admin Setup Script
 *
 * Sets up the initial admin user and required Firestore collections.
 * Run this once after deploying to a new Firebase project.
 *
 * Usage:
 *   npx ts-node scripts/setup-admin.ts --email admin@example.com --uid <firebase-auth-uid>
 *
 * Prerequisites:
 *   - Firebase Admin SDK credentials (GOOGLE_APPLICATION_CREDENTIALS env var)
 *   - The user must already exist in Firebase Auth
 */

import * as admin from 'firebase-admin';

const args = process.argv.slice(2);
const emailIdx = args.indexOf('--email');
const uidIdx = args.indexOf('--uid');

if (emailIdx === -1 || uidIdx === -1) {
  console.error('Usage: npx ts-node scripts/setup-admin.ts --email <email> --uid <uid>');
  process.exit(1);
}

const email = args[emailIdx + 1];
const uid = args[uidIdx + 1];

if (!email || !uid) {
  console.error('Both --email and --uid are required');
  process.exit(1);
}

async function main() {
  admin.initializeApp();
  const db = admin.firestore();

  console.log(`Setting up admin for: ${email} (${uid})`);

  // 1. Set custom claims on the Auth user
  await admin.auth().setCustomUserClaims(uid, { admin: true, role: 'admin' });
  console.log('  [OK] Custom claims set (admin: true)');

  // 2. Create admin document in Firestore
  await db.collection('admins').doc(uid).set({
    email,
    role: 'admin',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('  [OK] Admin document created in admins collection');

  // 3. Create default messaging settings if not exists
  const settingsDoc = await db.collection('settings').doc('messaging').get();
  if (!settingsDoc.exists) {
    await db.collection('settings').doc('messaging').set({
      providerPrimary: 'clicksend',
      providerFallback: 'twilio',
      adminNotifyNumbers: [],
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('  [OK] Default messaging settings created');
  } else {
    console.log('  [SKIP] Messaging settings already exist');
  }

  // 4. Create default app settings if not exists
  const appSettingsDoc = await db.collection('settings').doc('app').get();
  if (!appSettingsDoc.exists) {
    await db.collection('settings').doc('app').set({
      kyc_fee: 5.00,
      deposit_percentage: 0.25,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('  [OK] Default app settings created');
  } else {
    console.log('  [SKIP] App settings already exist');
  }

  console.log('\nAdmin setup complete! The user can now sign in and access the admin dashboard.');
  console.log('Note: The user may need to sign out and back in for custom claims to take effect.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
