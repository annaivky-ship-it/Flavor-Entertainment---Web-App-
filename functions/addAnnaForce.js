const admin = require('firebase-admin');

// Initialize with default credentials assuming it's run via Firebase CLI or has credentials locally
admin.initializeApp({
    projectId: "studio-4495412314-3b1ce"
});

const db = admin.firestore();

const annaData = {
    id: 6,
    name: 'Anna Ivky',
    tagline: 'Sophistication and a hint of mystery.',
    photo_url: 'https://picsum.photos/seed/anna/800/1200',
    bio: 'Anna is the epitome of grace and professionalism. Her experience with exclusive, private events makes her the ideal choice for clients seeking a discreet yet impactful presence. Her poise and charm elevate any gathering.',
    service_ids: ['waitress-lingerie', 'show-toy', 'show-works-greek', 'show-absolute-works'],
    service_areas: ['Perth South', 'Southwest'],
    status: 'available',
    rating: 5.0,
    review_count: 89,
    min_booking_duration_hours: 3,
    created_at: new Date().toISOString()
};

async function addAnna() {
    try {
        await db.collection('performers').doc('6').set(annaData);
        console.log('Anna added successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error adding Anna:', error);
        process.exit(1);
    }
}

addAnna();
