import { db } from './firebaseClient';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import type { Role } from '../types';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: Role;
  performerId?: number;
  provider: string;
  createdAt: any;
  lastLoginAt: any;
}

/**
 * Creates or updates a user profile document in Firestore.
 * Uses setDoc with merge to avoid read-then-write race conditions.
 * On first login, all fields are written. On subsequent logins,
 * only displayName, photoURL, and lastLoginAt are updated.
 */
export async function saveUserProfile(
  uid: string,
  data: {
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    role: Role;
    performerId?: number;
    provider: string;
  }
): Promise<void> {
  if (!db) return;

  const userRef = doc(db, 'users', uid);

  // merge: true preserves existing fields (like createdAt) while updating
  // the fields we provide. For createdAt we only want to set it once,
  // so we check existence to avoid overwriting it.
  const snap = await getDoc(userRef);
  const isNew = !snap.exists();

  await setDoc(userRef, {
    uid,
    email: data.email,
    displayName: data.displayName,
    photoURL: data.photoURL,
    role: data.role,
    ...(data.performerId != null ? { performerId: data.performerId } : {}),
    provider: data.provider,
    lastLoginAt: serverTimestamp(),
    ...(isNew ? { createdAt: serverTimestamp() } : {}),
  }, { merge: true });
}

/**
 * Fetches a user profile from Firestore by UID.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;

  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}
