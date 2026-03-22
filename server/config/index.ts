import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

interface Config {
  port: number;
  env: string;
  geminiApiKey: string;
  telegramBotToken: string;
  firebaseServiceAccount: string;
  webhookSecret: string;
}

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    logger.warn(`Environment variable ${name} is missing.`);
    return '';
  }
  return value;
};

export const config: Config = {
  port: 3000,
  env: process.env.NODE_ENV || 'development',
  geminiApiKey: requireEnv('GEMINI_API_KEY'),
  telegramBotToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT || '',
  webhookSecret: process.env.WEBHOOK_SECRET || 'secret123',
};
