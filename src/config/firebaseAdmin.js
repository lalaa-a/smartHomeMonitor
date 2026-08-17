import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (raw) {
    // JSON pasted directly into the env var (Railway, or a .env with the whole object as the value)
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT: ${err.message}`);
    }
  }

  // Fallback: path to a JSON file on disk (useful for local dev if you keep a local file)
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error(
      'Set either FIREBASE_SERVICE_ACCOUNT (JSON contents) or GOOGLE_APPLICATION_CREDENTIALS (file path).'
    );
  }

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(`Service account file not found at ${credentialsPath}.`);
  }

  try {
    return JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse service account file at ${credentialsPath}: ${err.message}`);
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
