import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDJXlPBCyGfFkHwYLb_fw-lyJ1CJRpQLz8",
    authDomain: "studio-4495412314-3b1ce.firebaseapp.com",
    projectId: "studio-4495412314-3b1ce",
    storageBucket: "studio-4495412314-3b1ce.firebasestorage.app",
    messagingSenderId: "387015361731",
    appId: "1:387015361731:web:a9d32057f1ccf4023a4e76"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const newPerformer = {
    id: 101,
    name: "Anna Ivky",
    tagline: "Sophistication and a hint of mystery.",
    photo_url: "https://picsum.photos/seed/anna/800/1200",
    bio: "Anna is the epitome of grace and professionalism. Her experience with exclusive, private events makes her the ideal choice for clients seeking a discreet yet impactful presence.",
    service_ids: ["waitress-lingerie", "show-toy"],
    service_areas: ["Perth South"],
    status: "available",
    rating: 5.0,
    review_count: 89,
    min_booking_duration_hours: 3,
    created_at: new Date().toISOString()
};

async function addAnna() {
    try {
        await setDoc(doc(db, "performers", "101"), newPerformer);
        console.log("Anna added successfully!");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

addAnna();
