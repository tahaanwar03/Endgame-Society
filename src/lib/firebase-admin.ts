import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getPrivateKey() {
  const value = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  return value ? value.replace(/\\n/g, "\n") : undefined;
}

function hasAdminConfig() {
  return Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      getPrivateKey()
  );
}

export function getAdminDb() {
  if (!hasAdminConfig()) {
    throw new Error("Firebase Admin environment variables are not configured.");
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: getPrivateKey()
      })
    });

  return getFirestore(app);
}
