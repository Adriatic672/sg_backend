/* eslint-disable no-console */
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_DB_URL;

let redisClient: any = null;
let redisReady = false;

if (!redisUrl) {
  console.warn('[Redis] REDIS_DB_URL not set — Redis disabled, running without cache.');
} else {
  redisClient = createClient({ url: redisUrl });

  redisClient.on('connect', () => {
    redisReady = true;
    console.log('Redis client connected...');
  });

  redisClient.on('error', (err: any) => {
    redisReady = false;
    console.error('[Redis] connection error:', err.message);
  });

  redisClient.connect().catch((err: any) => {
    console.error('[Redis] initial connect failed:', err.message);
  });
}

const setItem = async (key: string, value: string): Promise<void> => {
  if (!redisReady || !redisClient) return;
  try {
    await redisClient.set(key, value);
  } catch (err: any) {
    console.error(`[Redis] Error setting key "${key}":`, err.message);
  }
};

const getItem = async (key: string): Promise<string | null> => {
  if (!redisReady || !redisClient) return null;
  try {
    return await redisClient.get(key);
  } catch (err: any) {
    console.error(`[Redis] Error getting key "${key}":`, err.message);
    return null;
  }
};

export { redisClient, setItem, getItem };
