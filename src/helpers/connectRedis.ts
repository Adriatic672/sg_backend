/* eslint-disable no-console */
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_DB_URL;

let redisClient: any;
let isConnected = false;

if (redisUrl) {
  redisClient = createClient({
    url: redisUrl,
  });

  const connectRedis = async () => {
    try {
      await redisClient.connect();
      isConnected = true;
      console.log('Redis client connected...');
    } catch (err: any) {
      console.log('Redis connection failed - running without cache');
      isConnected = false;
    }
  };

  connectRedis();

  redisClient.on('connect', () => console.log('Redis client connected...'));
  redisClient.on('error', (err: any) => console.log('Redis error:', err.message));
} else {
  console.log('REDIS_DB_URL not set - running without Redis');
  isConnected = false;
}

const setItem = async (key: string, value: string): Promise<void> => {
  if (!isConnected || !redisClient) return;
  try {
    await redisClient.set(key, value);
  } catch (err) {
    // Silently fail - app continues without cache
  }
};

const getItem = async (key: string): Promise<string | null> => {
  if (!isConnected || !redisClient) return "";
  try {
    const value = await redisClient.get(key);
    return value;
  } catch (err) {
    return "";
  }
};

export { redisClient, setItem, getItem };
