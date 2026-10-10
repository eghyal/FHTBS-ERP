import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import firebaseConfig from "../../firebase-applet-config.json" with { type: "json" };

// Initialize Firebase App instance singleton
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
});

// Initialize Cloud Firestore with target databaseId
export const firestore = initializeFirestore(firebaseApp, {
  experimentalAutoDetectLongPolling: true,
}, firebaseConfig.firestoreDatabaseId || "(default)");

// Initialize Firebase Auth
export const auth = getAuth(firebaseApp);

// Initialize Firebase Storage
export const storage = getStorage(firebaseApp);
