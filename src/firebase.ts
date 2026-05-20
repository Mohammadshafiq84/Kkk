import { initializeApp } from 'firebase/app';
import { 
  initializeAuth, 
  browserPopupRedirectResolver, 
  inMemoryPersistence 
} from 'firebase/auth';
import { 
  initializeFirestore, 
  memoryLocalCache 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with memory-only cache (zero local storage) and long polling fallback
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId || undefined);

// Initialize Auth with in-memory persistence (zero local storage)
export const auth = initializeAuth(app, {
  persistence: inMemoryPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});
