// Firebase initialization. Reads config from environment variables (.env),
// so no keys are hardcoded in source. Two ways to provide the config:
//   1. One JSON blob:  VITE_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...",...}
//   2. Six separate vars: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, etc.
// Option 1 is simplest (one secret to paste instead of six) — see .env.example.
import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore"

function loadFirebaseConfig() {
  const blob = import.meta.env.VITE_FIREBASE_CONFIG
  if (blob) {
    try { return JSON.parse(blob) } catch { /* fall through to individual vars */ }
  }
  return {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:         import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:          import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId:  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:              import.meta.env.VITE_FIREBASE_APP_ID,
  }
}

const firebaseConfig = loadFirebaseConfig()

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

let app, auth, db
if (firebaseConfigured) {
  app  = initializeApp(firebaseConfig)
  auth = getAuth(app)
  // Persistent local cache = offline support out of the box. Firestore keeps
  // a local copy (IndexedDB) and syncs automatically when back online —
  // this is what makes the app still work with no internet.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
}

export { auth, db }
