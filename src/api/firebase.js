// Firebase initialization. Reads config from environment variables (.env),
// so no keys are hardcoded in source. See .env.example for what's needed —
// copy it to .env and fill in the values from your Firebase project.
import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore"

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:         import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:          import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:              import.meta.env.VITE_FIREBASE_APP_ID,
}

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
