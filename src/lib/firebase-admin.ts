import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getPrivateKey() {
  const value = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!value) return undefined;

  // Handle three possible formats from .env files:
  // 1. Already contains real newlines (multi-line in .env)
  // 2. Contains literal \n escape sequences (single-line with quotes)
  // 3. Contains \\n (double-escaped, e.g. from some CI systems)
  let key = value;

  // If the key doesn't yet have real newlines, replace escaped ones
  if (!key.includes("\n")) {
    key = key.replace(/\\n/g, "\n");
  }

  return key;
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
    throw new Error(
      "Firebase Admin not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY."
    );
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
