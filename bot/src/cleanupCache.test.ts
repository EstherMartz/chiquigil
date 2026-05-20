import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCleanupCache, type CachedCleanup } from './cleanupCache';

function fakeEntry(overrides: Partial<CachedCleanup> = {}): CachedCleanup {
  const now = Date.now();
  return {
    ownerId: 'u1',
    cacheId: 'abcdef012345',
    csv: '',
    parsed: { entries: [], unrecognized: [] },
    marketIds: [],
    result: { craft: [], sellMb: [], vendor: [], discard: [], unrecognized: [] },
    usesByItemId: new Map(),
    createdAt: now,
    lastTouchedAt: now,
    ...overrides,
  };
}

describe('cleanupCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stores and retrieves entries by ownerId', () => {
    const cache = createCleanupCache({ ttlMs: 30 * 60_000, maxEntries: 100 });
    const entry = fakeEntry({ ownerId: 'u1' });
    cache.set('u1', entry);
    expect(cache.get('u1')).toBe(entry);
  });

  it('returns null for missing entries', () => {
    const cache = createCleanupCache({ ttlMs: 30 * 60_000, maxEntries: 100 });
    expect(cache.get('nobody')).toBeNull();
  });

  it('returns null and removes entry once TTL has elapsed', () => {
    const cache = createCleanupCache({ ttlMs: 1000, maxEntries: 100 });
    cache.set('u1', fakeEntry({ ownerId: 'u1' }));
    vi.advanceTimersByTime(1001);
    expect(cache.get('u1')).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it('get() bumps lastTouchedAt to extend the sliding TTL', () => {
    const cache = createCleanupCache({ ttlMs: 1000, maxEntries: 100 });
    cache.set('u1', fakeEntry({ ownerId: 'u1' }));
    vi.advanceTimersByTime(900);
    expect(cache.get('u1')).not.toBeNull(); // touch
    vi.advanceTimersByTime(900);
    expect(cache.get('u1')).not.toBeNull(); // still alive — first touch reset the clock
  });

  it('evicts the least-recently-touched entry when over soft cap', () => {
    const cache = createCleanupCache({ ttlMs: 30 * 60_000, maxEntries: 2 });
    cache.set('u1', fakeEntry({ ownerId: 'u1' }));
    vi.advanceTimersByTime(10);
    cache.set('u2', fakeEntry({ ownerId: 'u2' }));
    vi.advanceTimersByTime(10);
    cache.get('u1'); // bump u1
    vi.advanceTimersByTime(10);
    cache.set('u3', fakeEntry({ ownerId: 'u3' })); // size now 3 > cap 2 → evict oldest-touched, which is u2
    expect(cache.get('u1')).not.toBeNull();
    expect(cache.get('u2')).toBeNull();
    expect(cache.get('u3')).not.toBeNull();
  });

  it('evictExpired() removes only expired entries', () => {
    const cache = createCleanupCache({ ttlMs: 1000, maxEntries: 100 });
    cache.set('old', fakeEntry({ ownerId: 'old' }));
    vi.advanceTimersByTime(500);
    cache.set('fresh', fakeEntry({ ownerId: 'fresh' }));
    vi.advanceTimersByTime(600); // old has aged 1100ms (> 1000), fresh has aged 600ms
    cache.evictExpired();
    expect(cache.get('old')).toBeNull();
    expect(cache.get('fresh')).not.toBeNull();
  });

  it('delete() removes a specific entry', () => {
    const cache = createCleanupCache({ ttlMs: 30 * 60_000, maxEntries: 100 });
    cache.set('u1', fakeEntry({ ownerId: 'u1' }));
    cache.delete('u1');
    expect(cache.get('u1')).toBeNull();
  });
});
