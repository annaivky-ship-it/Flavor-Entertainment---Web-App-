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
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const missingVars = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => `VITE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`);

if (missingVars.length > 0) {
  console.warn(`Missing required environment variables: ${missingVars.join(', ')}. Firebase features will be disabled. Please check your .env file.`);
} else {
  console.log("Firebase configuration detected. Initializing services...");
}

/**
 * Initialize Firebase App
 * Checks if an app is already initialized to avoid "Duplicate App" errors.
 */
const app: FirebaseApp | null = missingVars.length === 0 
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null;

/**
 * Initialize and export service instances.
 */
export const db: Firestore | null = app ? getFirestore(app) : null;

export const auth: Auth | null = app ? getAuth(app) : null;
export const storage: FirebaseStorage | null = app ? getStorage(app) : null;
export const functions: Functions | null = app ? getFunctions(app) : null;

export { app };
