// The service catalogue. Despite the legacy filename, this is the authoritative
// list of bookable services and ships in the production bundle.
//
// Demo/seed performers, bookings, DNS list, and communications used to live
// here too. They have been moved to `src/dev/seed/mockData.ts` and must only
// be loaded behind `import.meta.env.DEV` so they are tree-shaken from prod.
//
// SKUs marked `enabled: false` are withheld pending legal review of their
// descriptive copy (see docs/legal-risk-assessment.md §1). They remain in
// the catalogue so historical bookings can still resolve their metadata,
// but `publishedServices` (the export consumed by the UI) filters them out
// and the booking callable rejects them at create time.

import type { Service } from '../types';

export const allServices: Service[] = [
    // Waitressing
    { id: 'waitress-lingerie', category: 'Waitressing', name: 'Lingerie Waitress', description: 'Elegant and flirty. Serves drinks in sexy lingerie.', rate: 110, rate_type: 'per_hour', min_duration_hours: 1, booking_notes: 'Private events only' },
    { id: 'waitress-topless', category: 'Waitressing', name: 'Topless Waitress', description: 'Topless service for fun and cheeky vibes.', rate: 160, rate_type: 'per_hour', min_duration_hours: 1, booking_notes: 'Private events only' },
    { id: 'waitress-nude', category: 'Waitressing', name: 'Nude Waitress', description: 'Bold full nude service. Great for wild private parties.', rate: 260, rate_type: 'per_hour', min_duration_hours: 1, booking_notes: 'Private events only' },
    // Strip Shows
    { id: 'show-hot-cream', category: 'Strip Show', name: 'Hot Cream Show', description: 'Flirty strip ending with whipped cream play.', rate: 380, rate_type: 'flat', duration_minutes: 10, booking_notes: 'Self-performance, no client contact' },
    { id: 'show-pearl', category: 'Strip Show', name: 'Pearl Show', description: 'G-string strip with classic pearl finish.', rate: 500, rate_type: 'flat', duration_minutes: 15, booking_notes: 'Self-performance, no client contact' },
    { id: 'show-toy', category: 'Strip Show', name: 'Toy Show', description: 'Full nude strip with toy performance.', rate: 550, rate_type: 'flat', duration_minutes: 15, booking_notes: 'Self-performance, no client contact' },
    { id: 'show-pearls-vibe-cream', category: 'Strip Show', name: 'Pearls, Vibe + Cream', description: 'All-in-one show with cream, pearls, and toy play.', rate: 650, rate_type: 'flat', duration_minutes: 20, booking_notes: 'Self-performance, no client contact' },
    { id: 'show-works-fruit', category: 'Strip Show', name: 'Works + Fruit', description: 'Full deluxe show with cream, fruit, pearls, and toys.', rate: 650, rate_type: 'flat', duration_minutes: 20, booking_notes: 'Self-performance, no client contact' },
    // Withheld pending counsel review of descriptive copy. These describe
    // penetrative acts and engage WA Prostitution Act 2000 procurement risk;
    // flip `enabled: true` only after sign-off and copy rewrite.
    { id: 'show-deluxe-works', enabled: false, category: 'Strip Show', name: 'Deluxe Works Show', description: 'Full strip with squirting, toys, and body play.', rate: 700, rate_type: 'flat', duration_minutes: 20, booking_notes: 'Pending legal review' },
    { id: 'show-fisting-squirting', enabled: false, category: 'Strip Show', name: 'Fisting Squirting', description: 'Extreme adult show including fisting and squirting.', rate: 750, rate_type: 'flat', duration_minutes: 20, booking_notes: 'Pending legal review' },
    { id: 'show-works-greek', enabled: false, category: 'Strip Show', name: 'Works + Greek Show', description: 'Deluxe show plus full "Greek" toy play.', rate: 850, rate_type: 'flat', duration_minutes: 20, booking_notes: 'Pending legal review' },
    { id: 'show-absolute-works', enabled: false, category: 'Strip Show', name: 'The Absolute Works', description: 'Everything: toys, cream, pearls, squirt, Greek. Ultimate show.', rate: 1000, rate_type: 'flat', duration_minutes: 25, booking_notes: 'Pending legal review' },
    // Promotional & Hosting Services
    { id: 'misc-promo-model', category: 'Promotional & Hosting', name: 'Promotional Model', description: 'Professional and engaging model for your product or brand.', rate: 100, rate_type: 'per_hour', min_duration_hours: 2 },
    { id: 'misc-atmospheric', category: 'Promotional & Hosting', name: 'Atmospheric Entertainment', description: 'Adds to the ambiance of your event with grace and style.', rate: 90, rate_type: 'per_hour', min_duration_hours: 2 },
    { id: 'misc-games-host', category: 'Promotional & Hosting', name: 'Game Hosting', description: 'Fun and interactive game hosting for parties.', rate: 120, rate_type: 'per_hour', min_duration_hours: 1 },
];

// The publishable / bookable subset. Disabled SKUs are hidden from the UI
// and rejected at booking-create time (see functions/src/index.ts).
export const publishedServices: Service[] = allServices.filter(s => s.enabled !== false);
