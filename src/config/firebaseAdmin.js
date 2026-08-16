import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';

function loadServiceAccount() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS env var is required: path to a Firebase service account JSON file.'
    );
  }
  const resolved = path.resolve(credentialsPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Service account file not found at ${resolved}.`);
  }
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse service account file at ${resolved}: ${err.message}`);
  }
}

function getApp() {
  if (getApps().length > 0) return getApps()[0];
  if (!process.env.FIREBASE_DATABASE_URL) {
    throw new Error('FIREBASE_DATABASE_URL env var is required.');
  }
  return initializeApp({
    credential: cert(loadServiceAccount()),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const app = getApp();

/** Realtime Database instance. All reads/writes go through here. */
export const db = getDatabase(app);

/** Firebase Auth, for verifying client ID tokens. */
export const auth = getAuth(app);

/** Firebase Cloud Messaging, for safety push notifications. */
export const messaging = getMessaging(app);
