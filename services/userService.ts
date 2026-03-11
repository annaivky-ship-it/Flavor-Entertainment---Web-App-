import { db, auth } from './firebaseClient';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
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
 * Called after successful authentication to persist user data.
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
  const existing = await getDoc(userRef);

  if (existing.exists()) {
    await updateDoc(userRef, {
      displayName: data.displayName,
      photoURL: data.photoURL,
      lastLoginAt: serverTimestamp(),
    });
  } else {
    await setDoc(userRef, {
      uid,
      email: data.email,
      displayName: data.displayName,
      photoURL: data.photoURL,
      role: data.role,
      ...(data.performerId != null ? { performerId: data.performerId } : {}),
      provider: data.provider,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
  }
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
