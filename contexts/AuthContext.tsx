import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebaseClient';
import type { Role } from '../types';

export type AuthedUser = { name: string; role: Role; id?: number } | null;

interface AuthContextValue {
  authedUser: AuthedUser;
  authReady: boolean;
  firebaseUid: string | null;
  // Login flow modal control (left in here so the modal trigger is colocated
  // with the auth state it ultimately updates).
  showLogin: boolean;
  setShowLogin: (open: boolean) => void;
  setAuthedUser: (user: AuthedUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Resolves a Firebase Auth user's role from custom claims, falling back to
 * the /admins and /performers_auth Firestore lookups. Pure-ish so it can
 * be unit-tested separately from the provider's effect.
 */
async function resolveAuthedUser(firebaseUser: any): Promise<NonNullable<AuthedUser>> {
  try {
    const token = await firebaseUser.getIdTokenResult();
    if (token.claims.role === 'admin' || token.claims.admin === true) {
      return {
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Admin',
        role: 'admin',
      };
    }
    if (token.claims.role === 'performer' && token.claims.performerId) {
      return {
        name: firebaseUser.displayName || 'Performer',
        role: 'performer',
        id: Number(token.claims.performerId),
      };
    }
    if (db) {
      const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.uid));
      if (adminDoc.exists()) {
        return {
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Admin',
          role: 'admin',
        };
      }
      const perfDoc = await getDoc(doc(db, 'performers_auth', firebaseUser.uid));
      if (perfDoc.exists()) {
        const perfData = perfDoc.data();
        return {
          name: perfData.name || firebaseUser.displayName || 'Performer',
          role: 'performer',
          id: perfData.performerId || undefined,
        };
      }
    }
  } catch (err) {
    console.warn('Error determining user role:', err);
  }
  return {
    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Client',
    role: 'user',
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authedUser, setAuthedUser] = useState<AuthedUser>(null);
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setFirebaseUid(firebaseUser.uid);
        const resolved = await resolveAuthedUser(firebaseUser);
        setAuthedUser(resolved);
      } else {
        setFirebaseUid(null);
        setAuthedUser(null);
        // Sign in anonymously so every visitor has a stable UID for
        // storage-path namespacing + return-customer tracking. The
        // createBookingRequest callable doesn't require auth, so this
        // failing (anon sign-in disabled in console) is non-fatal — the
        // app keeps working without a UID.
        signInAnonymously(auth!).catch((err) => {
          console.warn('Anonymous sign-in failed (non-fatal):', err.message);
          setAuthReady(true);
        });
        return;
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const setUserCb = useCallback((user: AuthedUser) => setAuthedUser(user), []);

  return (
    <AuthContext.Provider
      value={{
        authedUser,
        authReady,
        firebaseUid,
        showLogin,
        setShowLogin,
        setAuthedUser: setUserCb,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
