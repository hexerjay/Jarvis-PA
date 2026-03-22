import admin from 'firebase-admin';
import { logger } from '../utils/logger';
import { config } from '../config';

let db: admin.firestore.Firestore | null = null;

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    if (config.firebaseServiceAccount) {
      const serviceAccount = JSON.parse(config.firebaseServiceAccount);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      logger.info("Firebase Admin initialized with service account.");
      db = admin.firestore();
    } else {
      logger.warn("FIREBASE_SERVICE_ACCOUNT not found. Using default application credentials.");
      admin.initializeApp();
      db = admin.firestore();
    }
  } catch (error) {
    logger.error("Firebase Admin initialization failed. Memory service will be disabled.", error);
  }
} else {
  db = admin.firestore();
}

export const memoryService = {
  /**
   * Save a message to the conversation history
   */
  async saveMessage(userId: string, role: 'user' | 'assistant', text: string) {
    if (!db) {
      logger.warn("Firestore not initialized. Skipping saveMessage.");
      return;
    }
    try {
      await db.collection('users').doc(userId).collection('conversations').add({
        role,
        text,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      logger.error(`Failed to save message for user ${userId}`, e);
    }
  },

  /**
   * Retrieve the last N messages for context
   */
  async getRecentContext(userId: string, limit: number = 5) {
    if (!db) {
      logger.warn("Firestore not initialized. Returning empty context.");
      return [];
    }
    try {
      const snapshot = await db.collection('users').doc(userId).collection('conversations')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
      
      return snapshot.docs.map(doc => doc.data()).reverse();
    } catch (e) {
      logger.error(`Failed to get context for user ${userId}`, e);
      return [];
    }
  },

  /**
   * Store structured tasks
   */
  async saveTask(userId: string, taskData: any) {
    if (!db) {
      logger.warn("Firestore not initialized. Skipping saveTask.");
      return "dummy-task-id";
    }
    try {
      const docRef = await db.collection('users').doc(userId).collection('tasks').add({
        ...taskData,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return docRef.id;
    } catch (e) {
      logger.error(`Failed to save task for user ${userId}`, e);
      throw e;
    }
  },

  /**
   * Queue a command for the local Python agent
   */
  async queueCommand(userId: string, commandData: any) {
    if (!db) {
      logger.warn("Firestore not initialized. Skipping queueCommand.");
      return "dummy-command-id";
    }
    try {
      const docRef = await db.collection('desktop_commands').add({
        ...commandData,
        userId,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return docRef.id;
    } catch (e) {
      logger.error(`Failed to queue command for user ${userId}`, e);
      throw e;
    }
  }
};
