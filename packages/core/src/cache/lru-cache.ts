export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  hitRatio: number;
  itemCount: number;
}

interface CacheEntry<V> {
  value: V;
  expiresAt?: number;
}

/**
 * Generic, bounded LRU Cache with TTL support and performance telemetry.
 */
export class LRUCache<K, V> {
  private readonly maxItems: number;
  private readonly defaultTtlMs?: number;
  private cache = new Map<K, CacheEntry<V>>();

  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: { maxItems?: number; defaultTtlMs?: number } = {}) {
    this.maxItems = options.maxItems || 500;
    this.defaultTtlMs = options.defaultTtlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Refresh position to mark as recently used (delete and re-insert)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.value;
  }

  set(key: K, value: V, ttlMs: number | undefined = this.defaultTtlMs): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxItems) {
      // Evict oldest item (first entry in Map iterator)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
        this.evictions++;
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRatio: total > 0 ? Number((this.hits / total).toFixed(4)) : 0,
      itemCount: this.cache.size,
    };
  }
}
