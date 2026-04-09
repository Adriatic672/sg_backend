/* eslint-disable no-console */
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_DB_URL;
const redisClient = createClient({
  url: redisUrl,
});

const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (err: any) {
    console.log(err.message);
    setTimeout(connectRedis, 5000);
  }
};

connectRedis();

redisClient.on('connect', () => console.log('Redis client connected...'));

redisClient.on('error', (err) => console.log(err));


const setItem = async (key: string, value: string): Promise<void> => {
  try {
    await redisClient.set(key, value); // No expiration set
    console.log(`Key "${key}" set successfully.`);
  } catch (err) {
    console.error(`Error setting key "${key}":`, err);
  }
};


const getItem = async (key: string): Promise<string | null> => {
  try {
    const value = await redisClient.get(key);
    console.log(`Value for key "${key}":`, value);
    return value;
  } catch (err) {
    console.error(`Error getting key "${key}":`, err);
    return "";
  }
};

export { redisClient, setItem, getItem };
