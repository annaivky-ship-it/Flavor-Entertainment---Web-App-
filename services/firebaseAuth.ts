/**
 * Firebase Authentication Service — Live Production
 * ─────────────────────────────────────────────────
 * Centralises all auth operations. The Login component calls these helpers
 * instead of calling Firebase SDK directly, keeping auth logic in one place.
 *
 * Role assignment strategy (custom claims):
 *   - admin@flavorentertainers.com.au → role: 'admin'
 *   - <firstname>@flavorentertainers.com.au → role: 'performer' (matched by email pattern)
 *   - any other verified email → role: 'user'
 *
 * For production, custom claims are set via Cloud Functions or the Firebase Admin SDK.
 * The fallback email-matching logic below handles the dev/staging case where claims
 * have not yet been provisioned.
 */
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebaseClient';
import type { Role } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthedUser {
  name: string;
  role: Role;
  id?: number;        // performerId if role === 'performer'
  uid: string;        // Firebase UID
  email: string;
}

interface RoleResolutionResult {
  role: Role;
  performerId?: number;
  displayName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Role Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine the user's role from Firebase Auth custom claims, with a safe
 * fallback to email-pattern matching for dev/staging environments.
 */
async function resolveRole(user: User): Promise<RoleResolutionResult> {
  // 1. Try custom claims first (set via Cloud Functions / Admin SDK)
  try {
    const tokenResult = await user.getIdTokenResult(/* forceRefresh */ false);
    const claimsRole = tokenResult.claims.role as Role | undefined;
    if (claimsRole && ['admin', 'performer', 'user'].includes(claimsRole)) {
      return {
        role: claimsRole,
        performerId: tokenResult.claims.performerId as number | undefined,
        displayName: user.displayName || user.email?.split('@')[0] || 'User',
      };
    }
  } catch {
    // Custom claims unavailable — fall through to Firestore lookup
  }

  // 2. Check Firestore /users/{uid} document for stored role
  if (db) {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        return {
          role: (data.role as Role) || 'user',
          performerId: data.performerId,
          displayName: data.displayName || user.displayName || user.email?.split('@')[0] || 'User',
        };
      }
    } catch {
      // Firestore unavailable — fall through to email pattern
    }
  }

  // 3. Email-pattern fallback (dev/staging only)
  const email = user.email?.toLowerCase() || '';
  if (email === 'admin@flavorentertainers.com.au') {
    return { role: 'admin', displayName: 'Admin' };
  }
  if (email.endsWith('@flavorentertainers.com.au')) {
    // Performer emails are: firstname@flavorentertainers.com.au
    return {
      role: 'performer',
      displayName: user.displayName || email.split('@')[0],
    };
  }

  return {
    role: 'user',
    displayName: user.displayName || user.email?.split('@')[0] || 'User',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function loginWithEmail(
  email: string,
  password: string
): Promise<{ user: AuthedUser | null; error: string | null }> {
  if (!auth) {
    return { user: null, error: 'Authentication is not configured. Check environment variables.' };
  }
  try {
    const credential: UserCredential = await signInWithEmailAndPassword(auth, email, password);
    const { role, performerId, displayName } = await resolveRole(credential.user);
    return {
      user: {
        name: displayName,
        role,
        id: performerId,
        uid: credential.user.uid,
        email: credential.user.email || email,
      },
      error: null,
    };
  } catch (err: any) {
    const msg = mapFirebaseAuthError(err.code);
    return { user: null, error: msg };
  }
}

export async function loginWithGoogle(): Promise<{ user: AuthedUser | null; error: string | null }> {
  if (!auth) {
    return { user: null, error: 'Authentication is not configured. Check environment variables.' };
  }
  try {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    const { role, performerId, displayName } = await resolveRole(credential.user);
    return {
      user: {
        name: displayName,
        role,
        id: performerId,
        uid: credential.user.uid,
        email: credential.user.email || '',
      },
      error: null,
    };
  } catch (err: any) {
    return { user: null, error: mapFirebaseAuthError(err.code) };
  }
}

export async function registerUser(
  email: string,
  password: string,
  displayName: string
): Promise<{ uid: string | null; error: string | null }> {
  if (!auth || !db) {
    return { uid: null, error: 'Authentication service unavailable.' };
  }
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    // Create user document in Firestore with default 'user' role
    await setDoc(doc(db, 'users', credential.user.uid), {
      email,
      displayName,
      role: 'user',
      createdAt: new Date().toISOString(),
    });
    return { uid: credential.user.uid, error: null };
  } catch (err: any) {
    return { uid: null, error: mapFirebaseAuthError(err.code) };
  }
}

export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  if (!auth) return { error: 'Authentication unavailable.' };
  try {
    await sendPasswordResetEmail(auth, email);
    return { error: null };
  } catch (err: any) {
    return { error: mapFirebaseAuthError(err.code) };
  }
}

export async function logout(): Promise<void> {
  if (auth) await signOut(auth);
}

export function onAuthChange(callback: (user: AuthedUser | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null);
      return;
    }
    try {
      const { role, performerId, displayName } = await resolveRole(firebaseUser);
      callback({
        name: displayName,
        role,
        id: performerId,
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
      });
    } catch {
      callback(null);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Error message mapping
// ─────────────────────────────────────────────────────────────────────────────

function mapFirebaseAuthError(code: string): string {
  const map: Record<string, string> = {
    'auth/user-not-found':      'No account found with that email address.',
    'auth/wrong-password':      'Incorrect password. Please try again.',
    'auth/invalid-email':       'Please enter a valid email address.',
    'auth/user-disabled':       'This account has been disabled. Contact support.',
    'auth/too-many-requests':   'Too many failed attempts. Please wait and try again.',
    'auth/email-already-in-use':'An account with this email already exists.',
    'auth/weak-password':       'Password must be at least 6 characters.',
    'auth/popup-closed-by-user':'Sign-in popup was closed before completing.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/invalid-credential':  'Invalid email or password.',
  };
  return map[code] || 'Authentication failed. Please try again.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin helpers (called by Cloud Functions or admin tooling)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provision a performer account:
 *   1. Creates Firebase Auth user
 *   2. Writes /users/{uid} with role: 'performer' and performerId
 *
 * ⚠️ This should only be called from an admin-authenticated session.
 * In production, prefer using a Cloud Function with Admin SDK to set custom claims.
 */
export async function provisionPerformerAccount(
  email: string,
  temporaryPassword: string,
  performerId: number,
  displayName: string
): Promise<{ uid: string | null; error: string | null }> {
  if (!auth || !db) return { uid: null, error: 'Services unavailable.' };
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, temporaryPassword);
    await setDoc(doc(db, 'users', credential.user.uid), {
      email,
      displayName,
      role: 'performer',
      performerId,
      createdAt: new Date().toISOString(),
    });
    return { uid: credential.user.uid, error: null };
  } catch (err: any) {
    return { uid: null, error: mapFirebaseAuthError(err.code) };
  }
}
