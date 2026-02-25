// Firebase Configuration Service
interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

/**
 * Get Firebase configuration from environment variables
 */
export const getFirebaseConfig = (): FirebaseConfig => {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
};

/**
 * Validate Firebase configuration
 */
export const isFirebaseConfigValid = (): boolean => {
  const config = getFirebaseConfig();
  return (
    !!config.apiKey &&
    !!config.authDomain &&
    !!config.projectId &&
    !!config.appId
  );
};
