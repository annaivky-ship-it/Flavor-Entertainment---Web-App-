const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const newPerformer = {
    name: 'Anna Ivky',
    tagline: 'Sophistication and a hint of mystery.',
    photo_url: 'https://picsum.photos/seed/anna/800/1200',
    bio: 'Anna is the epitome of grace and professionalism. Her experience with exclusive, private events makes her the ideal choice for clients seeking a discreet yet impactful presence.',
    service_ids: ['waitress-lingerie', 'show-toy'],
    service_areas: ['Perth South'],
    status: 'available',
    rating: 5.0,
    review_count: 89,
    min_booking_duration_hours: 3
};

async function addAnna() {
    try {
        await db.collection('performers').doc('6').set(newPerformer);
        console.log('Anna added successfully!');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
addAnna();
