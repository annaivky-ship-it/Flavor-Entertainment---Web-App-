import { initializeApp, getApp, getApps } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import type { Analytics } from 'firebase/analytics';

// Firebase web SDK config — sourced entirely from VITE_FIREBASE_* env vars.
//
// Note on the security boundary: a Firebase web API key is intentionally
// public — it identifies the project, not a privileged caller. Real access
// control is enforced by:
//   1. Firestore Security Rules (`firestore.rules`)
//   2. Storage Security Rules (`storage.rules`)
//   3. Cloud Function auth checks (`context.auth` / `isAdmin()` in `functions/src/index.ts`)
//   4. Firebase App Check (see `docs/deployment-checklist.md`) once enabled
//
// These layers must remain audited; rotating the API key alone does not
// substitute for them. The key still lives in env vars so non-prod builds
// can target a separate Firebase project without a code change and so the
// key can be rotated via the hosting environment.
const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  // measurementId is only included when set; required by Analytics, optional
  // for everything else.
  ...(measurementId ? { measurementId } : {}),
};

const ENV_VAR_NAMES: Record<string, string> = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

const missingVars = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => ENV_VAR_NAMES[k] || k);

// Demo mode is allowed to skip Firebase entirely — the app uses dev seed data.
const isDemoMode = import.meta.env.VITE_APP_MODE === 'demo';

if (missingVars.length > 0 && !isDemoMode) {
  const message =
    `Missing required Firebase environment variables: ${missingVars.join(', ')}. ` +
    `Configure them in the hosting environment (Vercel project settings) and redeploy.`;
  if (import.meta.env.PROD) {
    throw new Error(message);
  }
  console.warn(message + ' (dev build — Firebase services will be unavailable.)');
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
export const db: Firestore | null = app ? getFirestore(app, 'default') : null;

export const auth: Auth | null = app ? getAuth(app) : null;
export const storage: FirebaseStorage | null = app ? getStorage(app) : null;
export const functions: Functions | null = app ? getFunctions(app) : null;

// Analytics is only initialised when:
//   1. Firebase itself initialised successfully
//   2. VITE_FIREBASE_MEASUREMENT_ID is set
//   3. The runtime supports gtag (skips SSR, web workers, certain in-app browsers)
// Consumers should treat `analytics` as nullable.
export let analytics: Analytics | null = null;
if (app && measurementId && typeof window !== 'undefined') {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) analytics = getAnalytics(app);
    })
    .catch(() => {
      // Swallow — Analytics is non-critical and shouldn't break boot.
    });
}

export { app };
