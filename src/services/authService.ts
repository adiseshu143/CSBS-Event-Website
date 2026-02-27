/**
 * Firebase Authentication Service
 * Handles Google Sign-In for team leader email verification
 * and stores verified user data in Firestore.
 */
import { getFirebaseApp } from './firebase';

import type { User, Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

let auth: Auth | null = null;
let db: Firestore | null = null;

/* ---------- Lazy singletons ---------- */

const getAuth = async (): Promise<Auth> => {
  if (!auth) {
    const { getAuth: initAuth } = await import('firebase/auth');
    auth = initAuth(await getFirebaseApp());
  }
  return auth;
};

const getFirestore = async (): Promise<Firestore> => {
  if (!db) {
    const { getFirestore: initFirestore } = await import('firebase/firestore');
    db = initFirestore(await getFirebaseApp());
  }
  return db;
};

/* ---------- Public types ---------- */

export interface VerifiedUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
}

/* ---------- Google Sign-In ---------- */

/**
 * Sign in with Google popup and validate that the email is @vishnu.edu.in.
 * On success, stores user data in Firestore `verified_users` collection.
 * Returns the authenticated user info.
 */
export const signInWithGoogle = async (): Promise<VerifiedUser> => {
  const { GoogleAuthProvider, signInWithPopup, signOut } = await import('firebase/auth');

  const authInstance = await getAuth();
  const provider = new GoogleAuthProvider();

  // Hint: only show vishnu.edu.in accounts
  provider.setCustomParameters({ hd: 'vishnu.edu.in' });

  let result;
  try {
    result = await signInWithPopup(authInstance, provider);
  } catch (firebaseError: unknown) {
    // Provide user-friendly messages for common Firebase auth errors
    const code = (firebaseError as { code?: string })?.code ?? '';
    if (code === 'auth/operation-not-allowed') {
      throw new Error(
        'Google Sign-In is not enabled for this app. Please contact the event organizers at csbs.vitb@gmail.com.',
      );
    }
    if (code === 'auth/popup-blocked') {
      throw new Error(
        'The sign-in popup was blocked by your browser. Please allow popups for this site and try again.',
      );
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('popup-closed-by-user');
    }
    if (code === 'auth/network-request-failed') {
      throw new Error(
        'Network error — please check your internet connection and try again.',
      );
    }
    // Re-throw with original message for unknown errors
    throw firebaseError;
  }

  const user: User = result.user;

  // Validate domain
  const email = (user.email ?? '').toLowerCase();
  if (!email.endsWith('@vishnu.edu.in')) {
    // Sign them out immediately — not authorized
    await signOut(authInstance);
    throw new Error('Only @vishnu.edu.in emails are authorized. Please sign in with your college email.');
  }

  const verifiedUser: VerifiedUser = {
    uid: user.uid,
    email,
    displayName: user.displayName ?? '',
    photoURL: user.photoURL ?? null,
  };

  // Store in Firestore (fire-and-forget — don't block the UI)
  storeVerifiedUser(verifiedUser).catch((err) =>
    console.warn('Firestore write failed (non-critical):', err),
  );

  return verifiedUser;
};

/* ---------- Firestore storage ---------- */

/**
 * Save/update the verified user document in Firestore.
 * Collection: `verified_users`, Document ID: user UID
 */
async function storeVerifiedUser(user: VerifiedUser): Promise<void> {
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const firestore = await getFirestore();

  await setDoc(
    doc(firestore, 'verified_users', user.uid),
    {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      lastVerifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/* ---------- Sign out ---------- */

/**
 * Sign out the current user (for form reset, etc.)
 */
export const signOutUser = async (): Promise<void> => {
  const authInstance = await getAuth();
  await authInstance.signOut();
};
