import fs from 'node:fs';
import path from 'node:path';
import { LRUCache, CacheStats, logger } from '@nexus/core';

export interface FileCacheEntry {
  content: string;
  mtimeMs: number;
  byteSize: number;
}

export interface FileCacheStats extends CacheStats {
  bytesSaved: number;
}

export class FileCache {
  private cache: LRUCache<string, FileCacheEntry>;
  private bytesSaved = 0;

  constructor(maxFiles = 500) {
    this.cache = new LRUCache<string, FileCacheEntry>({ maxItems: maxFiles });
  }

  /**
   * Normalizes a file path to standard lowercase/forward-slash for consistent cache keying.
   */
  private normalizeKey(filePath: string): string {
    return path.resolve(filePath).toLowerCase();
  }

  /**
   * Reads a file, returning cached content if unmodified on disk (mtime match).
   */
  readFile(filePath: string): { content: string; hit: boolean; byteSize: number } {
    const key = this.normalizeKey(filePath);
    const cached = this.cache.get(key);

    try {
      const stat = fs.statSync(filePath);

      if (cached && cached.mtimeMs === stat.mtimeMs) {
        this.bytesSaved += cached.byteSize;
        return {
          content: cached.content,
          hit: true,
          byteSize: cached.byteSize,
        };
      }

      // Read from disk and update cache
      const content = fs.readFileSync(filePath, 'utf-8');
      const byteSize = Buffer.byteLength(content, 'utf-8');

      this.cache.set(key, {
        content,
        mtimeMs: stat.mtimeMs,
        byteSize,
      });

      return {
        content,
        hit: false,
        byteSize,
      };
    } catch (err) {
      this.invalidate(filePath);
      throw err;
    }
  }

  /**
   * Invalidates a specific cached file path when written, edited, or deleted.
   */
  invalidate(filePath: string): void {
    const key = this.normalizeKey(filePath);
    this.cache.delete(key);
  }

  /**
   * Clears the entire file cache.
   */
  invalidateAll(): void {
    this.cache.clear();
    this.bytesSaved = 0;
  }

  /**
   * Retrieves cache performance statistics.
   */
  getStats(): FileCacheStats {
    const base = this.cache.getStats();
    return {
      ...base,
      bytesSaved: this.bytesSaved,
    };
  }

  resetStats(): void {
    this.cache.resetStats();
    this.bytesSaved = 0;
  }
}

export const globalFileCache = new FileCache();
