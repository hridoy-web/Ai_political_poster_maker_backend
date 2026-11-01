import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

export const getFirebaseAuth = (): Auth => {
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is not set");
  }

  const app = getApps()[0] ?? initializeApp({ projectId });

  return getAuth(app);
};