import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export const redisClient = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  }
});

redisClient.on('connect', () => {
  console.log('Redis cache connected successfully.');
});

redisClient.on('error', (err) => {
  console.error('Redis cache error:', err.message);
});

/**
 * Redis-backed temporary cache utility for Vedic Astrology & Horoscope calculations.
 */
export const vedicCache = {
  /**
   * Generates a deterministic Redis key from an object of parameters.
   */
  generateKey(prefix, params) {
    const sortedKeys = Object.keys(params).sort();
    const serialized = sortedKeys
      .map((k) => `${k}=${JSON.stringify(params[k])}`)
      .join('&');
    return `japaika:${prefix}:${serialized}`;
  },

  /**
   * Retrieve a parsed JSON value from Redis by key.
   */
  async get(key) {
    try {
      const raw = await redisClient.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * Store a JSON-serializable value in Redis with an expiration TTL (in seconds).
   */
  async set(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Non-fatal: if Redis is unreachable, skip caching without breaking the request
    }
  },

  /**
   * Delete a key from Redis.
   */
  async del(key) {
    try {
      await redisClient.del(key);
    } catch {
      // Non-fatal
    }
  }
};
