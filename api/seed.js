import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin — uses Application Default Credentials on GCP,
// or GOOGLE_APPLICATION_CREDENTIALS env var, or falls back to project ID only.
if (getApps().length === 0) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'studio-4495412314-3b1ce';

  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    initializeApp({ credential: cert(serviceAccount), projectId });
  } else {
    // Fallback: initialize with just project ID (works if default credentials are available)
    initializeApp({ projectId });
  }
}

const db = getFirestore('default');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // Check if already seeded
    const existing = await db.collection('performers').limit(1).get();
    if (!existing.empty) {
      return res.json({ success: true, message: 'Already seeded — performers exist.', seeded: false });
    }

    const batch = db.batch();

    const performers = [
      { id: 5, name: 'April Flavor', tagline: 'Sweet, sassy, and always a delight.', photo_url: 'https://picsum.photos/seed/april/800/1200', bio: 'April brings a fresh and exciting energy to every event. With a background in dance and modeling, she captivates audiences and ensures a memorable experience.', service_ids: ['waitress-topless', 'show-hot-cream', 'show-pearl', 'show-deluxe-works', 'misc-promo-model'], service_areas: ['Perth North', 'Perth South'], status: 'available', rating: 4.9, review_count: 124, min_booking_duration_hours: 2, created_at: FieldValue.serverTimestamp() },
      { id: 6, name: 'Anna Ivky', tagline: 'Sophistication and a hint of mystery.', photo_url: 'https://picsum.photos/seed/anna/800/1200', bio: 'Anna is the epitome of grace and professionalism. Her experience with exclusive, private events makes her the ideal choice for clients seeking a discreet yet impactful presence.', service_ids: ['waitress-lingerie', 'show-toy', 'show-works-greek', 'show-absolute-works'], service_areas: ['Perth South', 'Southwest'], status: 'available', rating: 5.0, review_count: 89, min_booking_duration_hours: 3, created_at: FieldValue.serverTimestamp() },
      { id: 1, name: 'Scarlett', tagline: 'The life of the party, guaranteed.', photo_url: 'https://picsum.photos/seed/scarlett/800/1200', bio: 'With over a decade of experience in corporate events and private parties, Scarlett knows exactly how to get the crowd going.', service_ids: ['waitress-topless', 'waitress-nude', 'show-hot-cream', 'misc-atmospheric'], service_areas: ['Perth North', 'Perth South', 'Southwest'], status: 'available', rating: 4.8, review_count: 215, min_booking_duration_hours: 2, created_at: FieldValue.serverTimestamp() },
      { id: 2, name: 'Jasmine', tagline: 'Elegance and charm for your special event.', photo_url: 'https://picsum.photos/seed/jasmine/800/1200', bio: 'Jasmine specializes in high-end events, bringing a touch of class and sophistication.', service_ids: ['misc-promo-model', 'misc-atmospheric', 'waitress-lingerie'], service_areas: ['Perth South'], status: 'busy', rating: 4.7, review_count: 56, min_booking_duration_hours: 2, created_at: FieldValue.serverTimestamp() },
      { id: 3, name: 'Amber', tagline: 'Bringing warmth and energy to every room.', photo_url: 'https://picsum.photos/seed/amber/800/1200', bio: "Amber's infectious energy and friendly approach make her perfect for creating a relaxed and fun atmosphere.", service_ids: ['waitress-topless', 'misc-games-host', 'show-pearl'], service_areas: ['Perth North', 'Northwest'], status: 'available', rating: 4.9, review_count: 142, min_booking_duration_hours: 1, created_at: FieldValue.serverTimestamp() },
      { id: 4, name: 'Chloe', tagline: 'Professional, punctual, and always polished.', photo_url: 'https://picsum.photos/seed/chloe/800/1200', bio: 'Chloe prides herself on her professionalism and attention to detail.', service_ids: ['misc-promo-model', 'misc-atmospheric', 'waitress-lingerie'], service_areas: ['Southwest'], status: 'offline', rating: 4.6, review_count: 38, min_booking_duration_hours: 2, created_at: FieldValue.serverTimestamp() },
    ];

    const services = [
      { id: 'waitress-lingerie', category: 'Waitressing', name: 'Lingerie Waitress', rate: 110, rate_type: 'per_hour', min_duration_hours: 1 },
      { id: 'waitress-topless', category: 'Waitressing', name: 'Topless Waitress', rate: 160, rate_type: 'per_hour', min_duration_hours: 1 },
      { id: 'waitress-nude', category: 'Waitressing', name: 'Nude Waitress', rate: 260, rate_type: 'per_hour', min_duration_hours: 1 },
      { id: 'show-hot-cream', category: 'Strip Show', name: 'Hot Cream Show', rate: 380, rate_type: 'flat', duration_minutes: 10 },
      { id: 'show-pearl', category: 'Strip Show', name: 'Pearl Show', rate: 500, rate_type: 'flat', duration_minutes: 15 },
      { id: 'show-toy', category: 'Strip Show', name: 'Toy Show', rate: 550, rate_type: 'flat', duration_minutes: 15 },
      { id: 'show-pearls-vibe-cream', category: 'Strip Show', name: 'Pearls, Vibe + Cream', rate: 650, rate_type: 'flat', duration_minutes: 20 },
      { id: 'show-works-fruit', category: 'Strip Show', name: 'Works + Fruit', rate: 650, rate_type: 'flat', duration_minutes: 20 },
      { id: 'show-deluxe-works', category: 'Strip Show', name: 'Deluxe Works Show', rate: 700, rate_type: 'flat', duration_minutes: 20 },
      { id: 'show-fisting-squirting', category: 'Strip Show', name: 'Fisting Squirting', rate: 750, rate_type: 'flat', duration_minutes: 20 },
      { id: 'show-works-greek', category: 'Strip Show', name: 'Works + Greek Show', rate: 850, rate_type: 'flat', duration_minutes: 20 },
      { id: 'show-absolute-works', category: 'Strip Show', name: 'The Absolute Works', rate: 1000, rate_type: 'flat', duration_minutes: 25 },
      { id: 'misc-promo-model', category: 'Promotional & Hosting', name: 'Promotional Model', rate: 100, rate_type: 'per_hour', min_duration_hours: 2 },
      { id: 'misc-atmospheric', category: 'Promotional & Hosting', name: 'Atmospheric Entertainment', rate: 90, rate_type: 'per_hour', min_duration_hours: 2 },
      { id: 'misc-games-host', category: 'Promotional & Hosting', name: 'Game Hosting', rate: 120, rate_type: 'per_hour', min_duration_hours: 1 },
    ];

    for (const p of performers) {
      batch.set(db.collection('performers').doc(String(p.id)), p);
    }
    for (const s of services) {
      batch.set(db.collection('services').doc(s.id), s);
    }

    await batch.commit();
    return res.json({ success: true, message: 'Seeded 6 performers and 15 services.', seeded: true });
  } catch (error) {
    console.error('Seed error:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
}
