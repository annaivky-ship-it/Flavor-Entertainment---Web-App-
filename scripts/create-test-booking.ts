#!/usr/bin/env npx ts-node
/**
 * Create Test Booking Script
 *
 * Creates a test booking directly in Firestore for QA/testing purposes.
 *
 * Usage:
 *   npx ts-node scripts/create-test-booking.ts
 *   npx ts-node scripts/create-test-booking.ts --performer-id 1 --status confirmed
 *
 * Prerequisites:
 *   - Firebase Admin SDK credentials (GOOGLE_APPLICATION_CREDENTIALS env var)
 *   - Performers must already exist in the database
 *
 * Options:
 *   --performer-id <id>   Performer ID to book (default: 1 = Scarlett)
 *   --status <status>     Booking status (default: pending_performer_acceptance)
 *   --event-date <date>   Event date YYYY-MM-DD (default: 7 days from now)
 */

import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

// Parse CLI args
const args = process.argv.slice(2);
function getArg(flag: string, defaultVal: string): string {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const performerId = parseInt(getArg('--performer-id', '1'), 10);
const status = getArg('--status', 'pending_performer_acceptance');
const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 7);
const eventDate = getArg('--event-date', futureDate.toISOString().split('T')[0]);

// Performer name lookup (matches mockData)
const performerNames: Record<number, string> = {
  1: 'Scarlett',
  2: 'Jasmine',
  3: 'Amber',
  4: 'Chloe',
  5: 'April Flavor',
  6: 'Anna Ivky',
};

async function main() {
  admin.initializeApp();
  const db = admin.firestore();

  const bookingId = uuidv4();
  const performerName = performerNames[performerId] || `Performer ${performerId}`;

  const testBooking = {
    id: bookingId,
    performer_id: performerId,
    client_name: 'Test Client',
    client_email: 'test.booking@example.com',
    client_phone: '0400000000',
    client_dob: '1990-01-15',
    event_date: eventDate,
    event_time: '20:00',
    event_address: '99 Test Street, Perth WA 6000',
    event_type: 'Test Event - QA Booking',
    status,
    payment_status: 'unpaid',
    id_document_path: null,
    selfie_document_path: null,
    deposit_receipt_path: null,
    created_at: new Date().toISOString(),
    duration_hours: 3,
    number_of_guests: 10,
    services_requested: ['waitress-topless', 'show-hot-cream'],
    verified_by_admin_name: null,
    verified_at: null,
    client_message: 'This is a test booking created for QA purposes.',
    performer_eta_minutes: null,
    performer: {
      id: performerId,
      name: performerName,
    },
  };

  console.log('Creating test booking...');
  console.log(`  Booking ID:  ${bookingId}`);
  console.log(`  Performer:   ${performerName} (ID: ${performerId})`);
  console.log(`  Event Date:  ${eventDate} at 20:00`);
  console.log(`  Status:      ${status}`);
  console.log(`  Services:    waitress-topless, show-hot-cream`);

  await db.collection('bookings').doc(bookingId).set(testBooking);
  console.log('\n  [OK] Test booking created successfully!');

  // Also create a notification in the communications collection
  const commId = `test-comm-${Date.now()}`;
  await db.collection('communications').doc(commId).set({
    sender: 'System',
    recipient: 'admin',
    message: `Test booking #${bookingId.slice(0, 8)} created for ${performerName} — event on ${eventDate}.`,
    created_at: new Date().toISOString(),
    read: false,
    booking_id: bookingId,
  });
  console.log('  [OK] Admin notification created.');

  // Create a booking slot to match
  await db.collection('booking_slots').doc(bookingId).set({
    performer_id: performerId,
    event_date: eventDate,
    event_time: '20:00',
    booking_id: bookingId,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  });
  console.log('  [OK] Booking slot created.');

  console.log(`\nTest booking is now visible in the admin dashboard.`);
  console.log(`You can manage it at: https://flavorentertainers.com.au/admin`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create test booking:', err);
  process.exit(1);
});
