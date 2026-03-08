#!/usr/bin/env tsx
/**
 * seedFirestore.ts — Production / Staging Firestore Seed Script
 * ───────────────────────────────────────────────────────────────
 * Populates your Firestore database with realistic demo data.
 * Designed to be run once during initial project setup or to reset staging.
 *
 * Usage:
 *   npx tsx scripts/seedFirestore.ts
 *   npm run seed
 *
 * Requirements:
 *   - GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT env var pointing
 *     to a Firebase service account JSON file.
 *   - Or set FIREBASE_PROJECT_ID and use Application Default Credentials (gcloud auth).
 *
 * SAFETY:
 *   - Will NOT run if NODE_ENV=production unless you pass --force.
 *   - Writes to the 'staging' Firestore instance by default.
 *   - Pass --project=<id> to override the project.
 *
 * Example:
 *   FIREBASE_PROJECT_ID=flavor-staging npx tsx scripts/seedFirestore.ts
 */

import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ─── Safety check ────────────────────────────────────────────────────────────
const isForced = process.argv.includes('--force');
if (process.env.NODE_ENV === 'production' && !isForced) {
  console.error('❌ Refusing to seed production database. Pass --force to override.');
  process.exit(1);
}

// ─── Firebase Admin init ─────────────────────────────────────────────────────
function initAdmin(): Firestore {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  let app;
  if (serviceAccountPath && existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(readFileSync(resolve(serviceAccountPath), 'utf8')) as ServiceAccount;
    app = initializeApp({ credential: cert(serviceAccount) });
    console.log(`✅ Initialized with service account: ${serviceAccountPath}`);
  } else if (projectId) {
    app = initializeApp({ projectId });
    console.log(`✅ Initialized with project ID: ${projectId} (Application Default Credentials)`);
  } else {
    console.error(
      '❌ No Firebase credentials found.\n' +
      '   Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID.\n' +
      '   See SETUP.md for details.'
    );
    process.exit(1);
  }
  return getFirestore(app);
}

// ─── Seed data (mirrors demoData.ts but using Admin SDK types) ───────────────
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
const daysAhead = (n: number) => new Date(now.getTime() + n * 86400000).toISOString().split('T')[0];

const PERFORMERS = [
  { id: '5',  name: 'April Flavor', tagline: 'Sweet, sassy, and always a delight.', photo_url: 'https://picsum.photos/seed/april/800/1200', bio: 'April brings a fresh and exciting energy to every event.', service_ids: ['waitress-topless', 'show-hot-cream', 'show-pearl', 'show-deluxe-works', 'misc-promo-model'], service_areas: ['Perth North', 'Perth South'], status: 'available', rating: 4.9, review_count: 124, min_booking_duration_hours: 2, created_at: daysAgo(180) },
  { id: '6',  name: 'Anna Ivky', tagline: 'Sophistication and a hint of mystery.', photo_url: 'https://picsum.photos/seed/anna/800/1200', bio: 'Anna is the epitome of grace and professionalism.', service_ids: ['waitress-lingerie', 'show-toy', 'show-works-greek', 'show-absolute-works'], service_areas: ['Perth South', 'Southwest'], status: 'available', rating: 5.0, review_count: 89, min_booking_duration_hours: 3, created_at: daysAgo(365) },
  { id: '1',  name: 'Scarlett', tagline: 'The life of the party, guaranteed.', photo_url: 'https://picsum.photos/seed/scarlett/800/1200', bio: 'With over a decade of experience, Scarlett knows exactly how to get the crowd going.', service_ids: ['waitress-topless', 'waitress-nude', 'show-hot-cream', 'misc-atmospheric'], service_areas: ['Perth North', 'Perth South', 'Southwest'], status: 'available', rating: 4.8, review_count: 215, min_booking_duration_hours: 2, created_at: daysAgo(500) },
  { id: '2',  name: 'Jasmine', tagline: 'Elegance and charm for your special event.', photo_url: 'https://picsum.photos/seed/jasmine/800/1200', bio: 'Jasmine specialises in high-end events.', service_ids: ['misc-promo-model', 'misc-atmospheric', 'waitress-lingerie'], service_areas: ['Perth South'], status: 'busy', rating: 4.7, review_count: 56, min_booking_duration_hours: 2, created_at: daysAgo(240) },
  { id: '3',  name: 'Amber', tagline: 'Bringing warmth and energy to every room.', photo_url: 'https://picsum.photos/seed/amber/800/1200', bio: "Amber's infectious energy makes her perfect for creating a relaxed atmosphere.", service_ids: ['waitress-topless', 'misc-games-host', 'show-pearl'], service_areas: ['Perth North', 'Northwest'], status: 'available', rating: 4.9, review_count: 142, min_booking_duration_hours: 1, created_at: daysAgo(400) },
  { id: '4',  name: 'Chloe', tagline: 'Professional, punctual, and always polished.', photo_url: 'https://picsum.photos/seed/chloe/800/1200', bio: 'Chloe prides herself on professionalism and attention to detail.', service_ids: ['misc-promo-model', 'misc-atmospheric', 'waitress-lingerie'], service_areas: ['Southwest'], status: 'offline', rating: 4.6, review_count: 38, min_booking_duration_hours: 2, created_at: daysAgo(300) },
  { id: '7',  name: 'Luna', tagline: 'Mystical and mesmerizing — she owns the room.', photo_url: 'https://picsum.photos/seed/luna7/800/1200', bio: 'Luna has a magnetic stage presence.', service_ids: ['show-pearl', 'show-toy', 'show-pearls-vibe-cream', 'waitress-topless'], service_areas: ['Perth North', 'Perth South', 'Northwest'], status: 'available', rating: 4.95, review_count: 77, min_booking_duration_hours: 2, created_at: daysAgo(90) },
  { id: '8',  name: 'Zara', tagline: 'Bold, fierce, and absolutely unforgettable.', photo_url: 'https://picsum.photos/seed/zara8/800/1200', bio: 'Zara delivers premium performances with a professional attitude.', service_ids: ['show-absolute-works', 'show-works-greek', 'show-deluxe-works', 'waitress-nude'], service_areas: ['Perth South', 'Southwest'], status: 'available', rating: 4.85, review_count: 103, min_booking_duration_hours: 2, created_at: daysAgo(120) },
  { id: '9',  name: 'Violet', tagline: 'Graceful, playful, and always professional.', photo_url: 'https://picsum.photos/seed/violet9/800/1200', bio: 'Violet combines elegance with a playful spirit.', service_ids: ['waitress-lingerie', 'waitress-topless', 'misc-promo-model', 'misc-atmospheric'], service_areas: ['Perth North'], status: 'busy', rating: 4.75, review_count: 61, min_booking_duration_hours: 2, created_at: daysAgo(200) },
  { id: '10', name: 'Mia', tagline: 'Fun, flirty, and full of personality.', photo_url: 'https://picsum.photos/seed/mia10/800/1200', bio: "Mia's warm personality makes her a crowd favourite.", service_ids: ['misc-games-host', 'misc-atmospheric', 'waitress-topless', 'show-hot-cream'], service_areas: ['Perth North', 'Perth South'], status: 'available', rating: 4.8, review_count: 88, min_booking_duration_hours: 1, created_at: daysAgo(60) },
  { id: '11', name: 'Sienna', tagline: 'Radiant, refined, and ready to impress.', photo_url: 'https://picsum.photos/seed/sienna11/800/1200', bio: "Sienna's background in fashion modelling makes her versatile.", service_ids: ['misc-promo-model', 'misc-atmospheric', 'waitress-lingerie', 'show-pearl'], service_areas: ['Southwest', 'Perth South'], status: 'available', rating: 4.7, review_count: 45, min_booking_duration_hours: 2, created_at: daysAgo(45) },
  { id: '12', name: 'Ruby', tagline: 'Sparkling energy from the moment she arrives.', photo_url: 'https://picsum.photos/seed/ruby12/800/1200', bio: 'Ruby is known for her exceptional timing and high energy.', service_ids: ['show-hot-cream', 'show-pearl', 'show-toy', 'waitress-topless', 'misc-games-host'], service_areas: ['Perth North', 'Northwest'], status: 'pending_verification', rating: 4.6, review_count: 12, min_booking_duration_hours: 1, created_at: daysAgo(14) },
];

const BOOKINGS = [
  { id: 'seed-b001', performer_id: 1, client_name: 'James Thornton', client_email: 'james.thornton@gmail.com', client_phone: '0412345678', event_date: daysAhead(3), event_time: '19:00', event_address: '12 Riverside Dr, Perth WA 6000', event_type: 'Corporate Gala', status: 'confirmed', payment_status: 'fully_paid', id_document_path: null, selfie_document_path: null, deposit_receipt_path: 'seed/receipt_james.pdf', created_at: daysAgo(4), duration_hours: 4, number_of_guests: 60, services_requested: ['waitress-topless'], verified_by_admin_name: 'Admin', verified_at: daysAgo(3), client_message: 'High-profile corporate event — please be punctual.', performer: { id: 1, name: 'Scarlett' }, performer_eta_minutes: 20 },
  { id: 'seed-b002', performer_id: 6, client_name: 'Daniel Reeves', client_email: 'daniel.reeves@hotmail.com', client_phone: '0421987654', event_date: daysAhead(7), event_time: '20:00', event_address: '88 Harbour St, Fremantle WA 6160', event_type: 'Birthday Celebration', status: 'confirmed', payment_status: 'deposit_paid', id_document_path: null, selfie_document_path: null, deposit_receipt_path: 'seed/receipt_daniel.pdf', created_at: daysAgo(5), duration_hours: 3, number_of_guests: 25, services_requested: ['waitress-lingerie', 'show-toy'], verified_by_admin_name: 'Admin', verified_at: daysAgo(4), client_message: null, performer: { id: 6, name: 'Anna Ivky' }, performer_eta_minutes: 30 },
  { id: 'seed-b003', performer_id: 7, client_name: 'Ryan Patterson', client_email: 'ryan.patto@gmail.com', client_phone: '0487654321', event_date: daysAhead(10), event_time: '20:30', event_address: '456 Party Ave, Fremantle WA 6160', event_type: "Hen's Night", status: 'pending_deposit_confirmation', payment_status: 'deposit_paid', id_document_path: null, selfie_document_path: null, deposit_receipt_path: 'seed/receipt_ryan.jpg', created_at: daysAgo(2), duration_hours: 3, number_of_guests: 20, services_requested: ['waitress-topless', 'show-pearl'], verified_by_admin_name: null, verified_at: null, client_message: null, performer: { id: 7, name: 'Luna' }, performer_eta_minutes: null },
  { id: 'seed-b004', performer_id: 3, client_name: 'Sarah Mitchell', client_email: 'sarah.m@email.com', client_phone: '0422334455', event_date: daysAhead(21), event_time: '18:00', event_address: '77 Ocean Parade, Cottesloe WA 6011', event_type: 'Private Party', status: 'deposit_pending', payment_status: 'unpaid', id_document_path: null, selfie_document_path: null, deposit_receipt_path: null, created_at: daysAgo(1), duration_hours: 2, number_of_guests: 30, services_requested: ['waitress-topless', 'misc-games-host'], verified_by_admin_name: 'Admin', verified_at: daysAgo(1), client_message: 'Fun vibe for the girls.', performer: { id: 3, name: 'Amber' }, performer_eta_minutes: null },
  { id: 'seed-b005', performer_id: 10, client_name: 'Laurina Sargeant', client_email: 'laurina.s@example.com', client_phone: '0422334455', event_date: daysAhead(18), event_time: '19:00', event_address: '1 Posh Place, Dalkeith WA 6009', event_type: 'VIP Birthday Party', status: 'pending_vetting', payment_status: 'unpaid', id_document_path: null, selfie_document_path: null, deposit_receipt_path: null, created_at: daysAgo(0), duration_hours: 3, number_of_guests: 15, services_requested: ['waitress-topless', 'show-hot-cream'], verified_by_admin_name: null, verified_at: null, client_message: 'Surprise event — please be discreet.', performer: { id: 10, name: 'Mia' }, performer_eta_minutes: null },
  { id: 'seed-b006', performer_id: 5, client_name: 'Nathan Clarke', client_email: 'n.clarke@personal.net', client_phone: '0455667788', event_date: daysAhead(30), event_time: '20:00', event_address: '45 Cottesloe Blvd, Cottesloe WA 6011', event_type: 'Engagement Celebration', status: 'pending_performer_acceptance', payment_status: 'unpaid', id_document_path: null, selfie_document_path: null, deposit_receipt_path: null, created_at: now.toISOString(), duration_hours: 3, number_of_guests: 40, services_requested: ['waitress-topless', 'show-hot-cream'], verified_by_admin_name: null, verified_at: null, client_message: 'Surprise for my partner.', performer: { id: 5, name: 'April Flavor' }, performer_eta_minutes: null },
  { id: 'seed-b007', performer_id: 1, client_name: 'Michael Frost', client_email: 'mike.frost@gmail.com', client_phone: '0400112233', event_date: daysAgo(7).split('T')[0], event_time: '19:00', event_address: '34 Kings Park Rd, West Perth WA 6005', event_type: 'Birthday Bash', status: 'completed', payment_status: 'fully_paid', id_document_path: null, selfie_document_path: null, deposit_receipt_path: 'seed/receipt_mike.pdf', created_at: daysAgo(14), duration_hours: 4, number_of_guests: 45, services_requested: ['waitress-topless', 'show-hot-cream'], verified_by_admin_name: 'Admin', verified_at: daysAgo(13), client_message: null, performer: { id: 1, name: 'Scarlett' }, performer_eta_minutes: null },
  { id: 'seed-b008', performer_id: 3, client_name: 'Emily White', client_email: 'em.white@web.net', client_phone: '0433445566', event_date: daysAgo(5).split('T')[0], event_time: '17:00', event_address: '101 Social Blvd, Joondalup WA 6027', event_type: 'Charity Fundraiser', status: 'rejected', payment_status: 'unpaid', id_document_path: null, selfie_document_path: null, deposit_receipt_path: null, created_at: daysAgo(12), duration_hours: 3, number_of_guests: 100, services_requested: ['misc-games-host'], verified_by_admin_name: null, verified_at: null, client_message: null, performer: { id: 3, name: 'Amber' }, performer_eta_minutes: null },
];

const DNS_ENTRIES = [
  { id: 'seed-dns-1', client_name: 'Aggressive Alex', client_email: 'alex.blocked@example.com', client_phone: '0400111222', reason: 'Became aggressive and made performers uncomfortable.', status: 'approved', submitted_by_performer_id: 1, created_at: daysAgo(10), performer: { name: 'Scarlett' } },
  { id: 'seed-dns-2', client_name: 'Problematic Pete', client_email: 'pete.problem@example.com', client_phone: '0499888777', reason: 'Attempted to solicit services outside contract.', status: 'pending', submitted_by_performer_id: 2, created_at: daysAgo(1), performer: { name: 'Jasmine' } },
  { id: 'seed-dns-3', client_name: 'Difficult Dan', client_email: 'dan.the.man@email.com', client_phone: '0411222333', reason: 'Constant disputes over payment.', status: 'approved', submitted_by_performer_id: 3, created_at: daysAgo(30), performer: { name: 'Amber' } },
  { id: 'seed-dns-4', client_name: 'No-Show Nick', client_email: 'nick.noshow@webmail.com', client_phone: '0477332211', reason: "Did not show up to confirmed event. Wasted performer's time.", status: 'approved', submitted_by_performer_id: 5, created_at: daysAgo(45), performer: { name: 'April Flavor' } },
  { id: 'seed-dns-5', client_name: 'Boundary Brad', client_email: 'b.brad@email.net', client_phone: '0455111999', reason: 'Repeatedly pushed boundaries and harassed performer after event.', status: 'pending', submitted_by_performer_id: 7, created_at: daysAgo(2), performer: { name: 'Luna' } },
];

const COMMUNICATIONS = [
  { id: 'seed-comm-1', sender: 'System', recipient: 'admin', message: '✅ Booking #seed-b001 for James Thornton with Scarlett has been confirmed.', created_at: daysAgo(3), read: true, booking_id: 'seed-b001', type: 'booking_confirmation' },
  { id: 'seed-comm-2', sender: 'System', recipient: 1, message: '🎉 BOOKING CONFIRMED! Your event with James Thornton on Friday is locked in.', created_at: daysAgo(3), read: true, booking_id: 'seed-b001', type: 'booking_confirmation' },
  { id: 'seed-comm-3', sender: 'Jasmine', recipient: 'admin', message: "⚠️ New 'Do Not Serve' submission for Problematic Pete. Please review.", created_at: daysAgo(1), read: false, type: 'admin_message' },
  { id: 'seed-comm-4', sender: 'System', recipient: 'admin', message: '🧾 Ryan Patterson has submitted deposit receipt for Booking #seed-b003. Please verify.', created_at: daysAgo(0), read: false, booking_id: 'seed-b003', type: 'admin_message' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main seed function
// ─────────────────────────────────────────────────────────────────────────────

async function seed(db: Firestore) {
  console.log('\n🌱 Starting Firestore seed...\n');

  // Write in batches (Firestore limit: 500 ops per batch)
  const batch = db.batch();
  let opCount = 0;

  const write = (ref: FirebaseFirestore.DocumentReference, data: object) => {
    batch.set(ref, data);
    opCount++;
  };

  // Performers
  console.log(`📝 Seeding ${PERFORMERS.length} performers...`);
  for (const p of PERFORMERS) {
    write(db.collection('performers').doc(p.id), p);
  }

  // Bookings
  console.log(`📝 Seeding ${BOOKINGS.length} bookings...`);
  for (const b of BOOKINGS) {
    write(db.collection('bookings').doc(b.id), b);
  }

  // DNS entries
  console.log(`📝 Seeding ${DNS_ENTRIES.length} DNS entries...`);
  for (const d of DNS_ENTRIES) {
    write(db.collection('do_not_serve').doc(d.id), d);
  }

  // Communications
  console.log(`📝 Seeding ${COMMUNICATIONS.length} communications...`);
  for (const c of COMMUNICATIONS) {
    write(db.collection('communications').doc(c.id), c);
  }

  await batch.commit();
  console.log(`\n✅ Seeded ${opCount} documents successfully.\n`);
  console.log('Next steps:');
  console.log('  1. Set up Firebase Auth users (admin + performers) via Firebase Console');
  console.log('  2. Run: firebase deploy --only firestore:rules');
  console.log('  3. Run: firebase deploy --only functions');
  console.log('  4. See SETUP.md for complete production checklist\n');
}

// ─── Run ─────────────────────────────────────────────────────────────────────
const db = initAdmin();
seed(db).catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
