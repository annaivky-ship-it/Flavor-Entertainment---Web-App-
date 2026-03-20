
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-project.appspot.com',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:1234567890:web:abcdef',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
        await setDoc(doc(db, 'performers', '101'), newPerformer);
        console.log('Anna added successfully!');
    } catch(e) {
        console.error(e);
    }
}
addAnna();

