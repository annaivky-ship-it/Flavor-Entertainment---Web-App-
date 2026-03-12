/**
 * Quick script to create a test booking directly in Firestore using Admin SDK.
 * Usage: node scripts/run-test-booking.js
 */

const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
  const bookingId = 'test-booking-' + Date.now();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  const eventDate = futureDate.toISOString().split('T')[0];

  const testBooking = {
    id: bookingId,
    performer_id: 5,
    client_name: 'Test Client',
    client_email: 'test.booking@example.com',
    client_phone: '0400000000',
    client_dob: '1990-01-15',
    event_date: eventDate,
    event_time: '20:00',
    event_address: '99 Test Street, Perth WA 6000',
    event_type: 'Test Event - QA Booking',
    status: 'pending_performer_acceptance',
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
      id: 5,
      name: 'April Flavor',
    },
  };

  console.log('Creating test booking in Firestore...');
  console.log(`  Booking ID:  ${bookingId}`);
  console.log(`  Performer:   April Flavor (ID: 5)`);
  console.log(`  Event Date:  ${eventDate} at 20:00`);
  console.log(`  Status:      pending_performer_acceptance`);

  await db.collection('bookings').doc(bookingId).set(testBooking);
  console.log('\n  [OK] Test booking created in Firestore!');

  // Create admin notification
  const commId = 'test-comm-' + Date.now();
  await db.collection('communications').doc(commId).set({
    sender: 'System',
    recipient: 'admin',
    message: `Test booking #${bookingId.slice(0, 13)} created for April Flavor — event on ${eventDate}.`,
    created_at: new Date().toISOString(),
    read: false,
    booking_id: bookingId,
  });
  console.log('  [OK] Admin notification created.');

  // Create booking slot
  await db.collection('booking_slots').doc(bookingId).set({
    performer_id: 5,
    event_date: eventDate,
    event_time: '20:00',
    booking_id: bookingId,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  });
  console.log('  [OK] Booking slot created.');

  console.log('\nDone! Test booking is now live in Firestore.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
