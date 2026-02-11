import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

const firebaseConfig = {
    apiKey: "AIzaSyCCzqtyDN_2TuyyaJYFF_-aBl3PJfaN24E",
    authDomain: "ai-email-5951d.firebaseapp.com",
    projectId: "ai-email-5951d",
    storageBucket: "ai-email-5951d.firebasestorage.app",
    messagingSenderId: "168695672703",
    appId: "1:168695672703:web:c7b9fd3b3bd722c2feb44a",
    measurementId: "G-PDG8Z4ZVCR"
  };

export const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId)

if (!hasFirebaseConfig) {
  // Keep the app running so the UI can show a friendly setup message.
  console.warn(
    '[firebase] Missing env vars. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID (and others) in a .env file.',
  )
}

export const firebaseApp: FirebaseApp | null = hasFirebaseConfig ? initializeApp(firebaseConfig) : null
export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null

