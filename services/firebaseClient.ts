import { initializeApp, getApp, getApps } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import type { Functions } from 'firebase/functions';

// Firebase configuration for Flavor Entertainers
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDJXlPBCyGfFkHwYLb_fw-lyJ1CJRpQLz8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "studio-4495412314-3b1ce.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "studio-4495412314-3b1ce",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "studio-4495412314-3b1ce.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "387015361731",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:387015361731:web:6e0b25004191f54d3a4e76"
};

/**
 * Initialize Firebase App
 * Checks if an app is already initialized to avoid "Duplicate App" errors.
 */
const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * Initialize and export service instances.
 * Using initializeFirestore with experimentalForceLongPolling can help with "unavailable" errors in some environments.
 */
export const db: Firestore = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const auth: Auth = getAuth(app);
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app);

export { app };
