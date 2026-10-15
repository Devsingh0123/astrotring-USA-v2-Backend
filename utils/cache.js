/**
 * Production In-Memory LRU Cache with TTL support.
 * Used for deterministic astronomical and astrological calculations
 * to avoid duplicate remote API calls and ensure ultra-low response latency (<5ms).
 */
export class MemoryCache {
  constructor(maxSize = 1000, defaultTtlMs = 1000 * 60 * 60 * 24) { // default 24h
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
    this.cache = new Map();
  }

  /**
   * Generates a deterministic hash key from an arbitrary object or primitive
   */
  static generateKey(prefix, data) {
    if (typeof data === 'string') {
      return `${prefix}:${data}`;
    }
    const sortedString = JSON.stringify(data, Object.keys(data).sort());
    return `${prefix}:${sortedString}`;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest item (first key in map iterator)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlMs
    });
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this.cache.clear();
  }
}

export const vedicCache = new MemoryCache(2000, 1000 * 60 * 60 * 24); // 24h cache for 2000 items
