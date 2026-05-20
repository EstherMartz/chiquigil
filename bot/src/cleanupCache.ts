import type { ParseResult } from '../../src/features/cleanup/parseAllaganInventory';
import type { CleanupResult, UsesEntry } from '../../src/features/cleanup/types';

export interface CachedCleanup {
  ownerId: string;
  cacheId: string;
  csv: string;
  parsed: ParseResult;
  marketIds: number[];
  result: CleanupResult;
  usesByItemId: Map<number, UsesEntry[]>;
  createdAt: number;
  lastTouchedAt: number;
}

export interface CleanupCacheOptions {
  ttlMs: number;
  maxEntries: number;
}

export interface CleanupCache {
  set(userId: string, entry: CachedCleanup): void;
  get(userId: string): CachedCleanup | null;
  delete(userId: string): void;
  evictExpired(): void;
  size(): number;
}

export function createCleanupCache(opts: CleanupCacheOptions): CleanupCache {
  const store = new Map<string, CachedCleanup>();

  function isExpired(entry: CachedCleanup, now: number): boolean {
    return now - entry.lastTouchedAt > opts.ttlMs;
  }

  function evictOldestTouched(): void {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [key, entry] of store) {
      if (entry.lastTouchedAt < oldestTs) {
        oldestTs = entry.lastTouchedAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) store.delete(oldestKey);
  }

  return {
    set(userId, entry) {
      store.set(userId, entry);
      while (store.size > opts.maxEntries) evictOldestTouched();
    },
    get(userId) {
      const entry = store.get(userId);
      if (!entry) return null;
      const now = Date.now();
      if (isExpired(entry, now)) {
        store.delete(userId);
        return null;
      }
      entry.lastTouchedAt = now;
      return entry;
    },
    delete(userId) {
      store.delete(userId);
    },
    evictExpired() {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (isExpired(entry, now)) store.delete(key);
      }
    },
    size() {
      return store.size;
    },
  };
}
