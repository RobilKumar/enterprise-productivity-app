import firebaseAdmin from 'firebase-admin';
import { logger } from '../utils/logger';

export async function initFirebaseAdmin(): Promise<void> {
  if (firebaseAdmin.apps.length) return;
  try {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const credential = credPath
      ? firebaseAdmin.credential.applicationDefault()
      : firebaseAdmin.credential.cert({
          projectId:   process.env.FCM_PROJECT_ID   || '',
          clientEmail: process.env.FCM_CLIENT_EMAIL || '',
          privateKey:  (process.env.FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        });
    firebaseAdmin.initializeApp({ credential });
    logger.info('Firebase Admin initialised');
  } catch (err) {
    logger.warn('Firebase Admin init skipped:', (err as Error).message);
  }
}

export default firebaseAdmin;
