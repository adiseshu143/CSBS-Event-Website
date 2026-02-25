// Firebase App Initialization
// Lazy-loaded singleton — Firebase SDK is only downloaded when actually called.
// This keeps the initial bundle small (~0 KB Firebase overhead).
import { getFirebaseConfig } from './firebaseConfig';

import type { FirebaseApp } from 'firebase/app';
import type { Analytics } from 'firebase/analytics';

let firebaseApp: FirebaseApp | null = null;
let firebaseAnalytics: Analytics | null = null;

/**
 * Initialize and return the Firebase app instance.
 * Uses dynamic import — firebase/app is only fetched on first call.
 */
export const getFirebaseApp = async (): Promise<FirebaseApp> => {
  if (!firebaseApp) {
    const { initializeApp } = await import('firebase/app');
    const config = getFirebaseConfig();
    firebaseApp = initializeApp(config);
  }
  return firebaseApp;
};

/**
 * Initialize and return Firebase Analytics.
 * Uses dynamic import — firebase/analytics is only fetched on first call.
 */
export const getFirebaseAnalytics = async (): Promise<Analytics> => {
  if (!firebaseAnalytics) {
    const { getAnalytics } = await import('firebase/analytics');
    firebaseAnalytics = getAnalytics(await getFirebaseApp());
  }
  return firebaseAnalytics;
};
