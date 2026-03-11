import { readFileSync } from 'fs';
import { join } from 'path';

const PROJECT_ID = 'studio-4495412314-3b1ce';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function getAccessToken() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const configPath = join(home, '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) throw new Error('No refresh token found');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
  });
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('Token exchange failed: ' + JSON.stringify(data));
  return data.access_token;
}

function toFV(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFV) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) fields[k] = toFV(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function writeDoc(token, col, docId, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = toFV(v);
  const resp = await fetch(`${BASE}/${col}/${docId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
}

const now = new Date().toISOString();
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();

const docs = [
  ['performers', '5', { id: 5, name: 'April Flavor', tagline: 'Sweet, sassy, and always a delight.', photo_url: '/images/performers/april-flavor.jpg', bio: 'April brings a fresh and exciting energy to every event.', service_ids: ['waitress-topless','show-hot-cream','show-pearl','show-deluxe-works','misc-promo-model'], service_areas: ['Perth North','Perth South'], status: 'available', rating: 4.9, review_count: 124, min_booking_duration_hours: 2, created_at: now }],
  ['performers', '6', { id: 6, name: 'Anna Ivky', tagline: 'Sophistication and a hint of mystery.', photo_url: '/images/performers/anna-ivky.jpg', bio: 'Anna is the epitome of grace and professionalism.', service_ids: ['waitress-lingerie','show-toy','show-works-greek','show-absolute-works'], service_areas: ['Perth South','Southwest'], status: 'available', rating: 5.0, review_count: 89, min_booking_duration_hours: 3, created_at: now }],
  ['performers', '1', { id: 1, name: 'Scarlett', tagline: 'The life of the party, guaranteed.', photo_url: '/images/performers/scarlett.jpg', bio: 'Scarlett knows exactly how to get the crowd going.', service_ids: ['waitress-topless','waitress-nude','show-hot-cream','misc-atmospheric'], service_areas: ['Perth North','Perth South','Southwest'], status: 'available', rating: 4.8, review_count: 215, min_booking_duration_hours: 2, created_at: now }],
  ['performers', '2', { id: 2, name: 'Jasmine', tagline: 'Elegance and charm for your special event.', photo_url: '/images/performers/jasmine.jpg', bio: 'Jasmine specializes in high-end events.', service_ids: ['misc-promo-model','misc-atmospheric','waitress-lingerie'], service_areas: ['Perth South'], status: 'busy', rating: 4.7, review_count: 56, min_booking_duration_hours: 2, created_at: now }],
  ['performers', '3', { id: 3, name: 'Amber', tagline: 'Bringing warmth and energy to every room.', photo_url: '/images/performers/amber.jpg', bio: 'Amber creates a relaxed and fun atmosphere.', service_ids: ['waitress-topless','misc-games-host','show-pearl'], service_areas: ['Perth North','Northwest'], status: 'available', rating: 4.9, review_count: 142, min_booking_duration_hours: 1, created_at: now }],
  ['performers', '4', { id: 4, name: 'Chloe', tagline: 'Professional, punctual, and always polished.', photo_url: '/images/performers/chloe.jpg', bio: 'Chloe prides herself on professionalism.', service_ids: ['misc-promo-model','misc-atmospheric','waitress-lingerie'], service_areas: ['Southwest'], status: 'offline', rating: 4.6, review_count: 38, min_booking_duration_hours: 2, created_at: now }],
  ['bookings', 'bfa3e8a7-58d6-44b1-8798-294956e105b6', { id: 'bfa3e8a7-58d6-44b1-8798-294956e105b6', performer_id: 1, client_name: 'John Smith', client_email: 'john.smith@example.com', client_phone: '0412345678', event_date: '2024-08-15', event_time: '19:00', event_address: '123 Fun Street, Perth WA', event_type: 'Corporate Gala', status: 'confirmed', payment_status: 'fully_paid', id_document_path: null, selfie_document_path: null, deposit_receipt_path: null, created_at: ago(2), duration_hours: 4, number_of_guests: 50, services_requested: ['waitress-topless'], verified_by_admin_name: 'Admin Demo', verified_at: ago(1.5), client_message: 'Energetic performance for corporate crowd.', performer: {id:1,name:'Scarlett'}, performer_eta_minutes: 25 }],
  ['bookings', '9c5e3f5b-b9d1-4a2e-8c6f-7d1a2b3c4d5e', { id: '9c5e3f5b-b9d1-4a2e-8c6f-7d1a2b3c4d5e', performer_id: 2, client_name: 'Jane Doe', client_email: 'jane.d@email.com', client_phone: '0487654321', event_date: '2024-08-22', event_time: '20:30', event_address: '456 Party Ave, Fremantle WA', event_type: 'Birthday Celebration', status: 'pending_deposit_confirmation', payment_status: 'deposit_paid', id_document_path: 'path/to/id.pdf', selfie_document_path: 'path/to/selfie.jpg', deposit_receipt_path: 'path/to/receipt.jpg', created_at: ago(1), duration_hours: 3, number_of_guests: 20, services_requested: ['waitress-lingerie'], verified_by_admin_name: null, verified_at: null, client_message: null, performer: {id:2,name:'Jasmine'}, performer_eta_minutes: 30 }],
  ['bookings', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', { id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef', performer_id: 5, client_name: 'Laurina Sargeant', client_email: 'laurina.s@example.com', client_phone: '0422334455', event_date: '2024-09-10', event_time: '19:00', event_address: '1 Posh Place, Dalkeith WA', event_type: 'VIP Birthday Party', status: 'pending_performer_acceptance', payment_status: 'unpaid', id_document_path: 'path/to/another_id.jpg', selfie_document_path: null, deposit_receipt_path: null, created_at: now, duration_hours: 3, number_of_guests: 15, services_requested: ['waitress-topless','show-hot-cream'], verified_by_admin_name: null, verified_at: null, client_message: 'Surprise party, be discreet.', performer: {id:5,name:'April Flavor'}, performer_eta_minutes: null }],
  ['bookings', 'd4c3b2a1-f6e5-0987-4321-fedcba098765', { id: 'd4c3b2a1-f6e5-0987-4321-fedcba098765', performer_id: 3, client_name: 'Emily White', client_email: 'em.white@web.net', client_phone: '0433445566', event_date: '2024-08-18', event_time: '17:00', event_address: '101 Social Blvd, Joondalup WA', event_type: 'Charity Fundraiser', status: 'rejected', payment_status: 'unpaid', id_document_path: 'path/to/id_emily.png', selfie_document_path: null, deposit_receipt_path: null, created_at: ago(5), duration_hours: 3, number_of_guests: 100, services_requested: ['misc-games-host'], verified_by_admin_name: null, verified_at: null, client_message: null, performer: {id:3,name:'Amber'}, performer_eta_minutes: null }],
  ['do_not_serve', 'dns-1', { id: 'dns-1', client_name: 'Aggressive Alex', client_email: 'alex.blocked@example.com', client_phone: '0400111222', reason: 'Became aggressive and refused to follow guidelines.', status: 'approved', submitted_by_performer_id: 1, created_at: ago(10), performer: {name:'Scarlett'} }],
  ['do_not_serve', 'dns-2', { id: 'dns-2', client_name: 'Problematic Pete', client_email: 'pete.problem@example.com', client_phone: '0499888777', reason: 'Solicited services outside the contract.', status: 'pending', submitted_by_performer_id: 2, created_at: ago(1), performer: {name:'Jasmine'} }],
  ['do_not_serve', 'dns-3', { id: 'dns-3', client_name: 'Difficult Dan', client_email: 'dan.the.man@email.com', client_phone: '0411222333', reason: 'Constant payment disputes.', status: 'approved', submitted_by_performer_id: 3, created_at: ago(30), performer: {name:'Amber'} }],
  ['communications', 'comm-1', { id: 'comm-1', sender: 'System', recipient: 'admin', message: 'Booking #bfa3e8a7 for John Smith was confirmed.', created_at: ago(2), read: true, booking_id: 'bfa3e8a7-58d6-44b1-8798-294956e105b6' }],
  ['communications', 'comm-2', { id: 'comm-2', sender: 'System', recipient: '1', message: 'Your booking with John Smith is confirmed!', created_at: ago(2), read: true, booking_id: 'bfa3e8a7-58d6-44b1-8798-294956e105b6' }],
  ['communications', 'comm-3', { id: 'comm-3', sender: 'Jasmine', recipient: 'admin', message: 'New Do Not Serve entry submitted for Problematic Pete.', created_at: ago(1), read: false }],
];

async function seed() {
  const token = await getAccessToken();
  console.log('Token acquired. Seeding...\n');

  for (const [col, docId, data] of docs) {
    try {
      await writeDoc(token, col, docId, data);
      console.log(`  + ${col}/${docId}`);
    } catch (e) {
      console.error(`  x ${col}/${docId}: ${e.message.slice(0, 100)}`);
    }
  }
  console.log('\nDone!');
}

seed();
