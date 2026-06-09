import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseHistoryResponse, dailyBuckets, computeWeekDelta, dailyMedianBuckets,
  fetchHistoryWithinCached,
} from './universalisHistory';
import { clearHistoryCache } from './recipeCache';

describe('parseHistoryResponse', () => {
  it('extracts entries per item id', () => {
    const raw = {
      items: {
        '1': {
          entries: [
            { pricePerUnit: 100, quantity: 1, timestamp: 1, hq: false },
            { pricePerUnit: 110, quantity: 2, timestamp: 2, hq: true },
          ],
        },
      },
    };
    const out = parseHistoryResponse(raw);
    expect(out.get(1)).toHaveLength(2);
    expect(out.get(1)![0]).toEqual({ pricePerUnit: 100, quantity: 1, timestamp: 1, hq: false });
  });

  it('parses the single-item response shape ({ itemID, entries })', () => {
    const raw = {
      itemID: 8,
      entries: [
        { pricePerUnit: 40, quantity: 5, timestamp: 1700, hq: false },
        { pricePerUnit: 42, quantity: 1, timestamp: 1800, hq: false },
      ],
    };
    const out = parseHistoryResponse(raw);
    expect(out.get(8)).toHaveLength(2);
    expect(out.get(8)![1]).toEqual({ pricePerUnit: 42, quantity: 1, timestamp: 1800, hq: false });
  });

  it('drops malformed entries and defaults quantity', () => {
    const raw = {
      itemID: 9,
      entries: [
        { pricePerUnit: 100, timestamp: 10, hq: true },   // no quantity → defaults to 1
        { quantity: 3, timestamp: 20, hq: false },         // no price → dropped
        { pricePerUnit: 50, hq: false },                   // no timestamp → dropped
      ],
    };
    const out = parseHistoryResponse(raw);
    expect(out.get(9)).toEqual([{ pricePerUnit: 100, quantity: 1, timestamp: 10, hq: true }]);
  });

  it('returns an empty map for an unrecognized shape', () => {
    expect(parseHistoryResponse({}).size).toBe(0);
  });
});

describe('dailyBuckets', () => {
  it('groups entries into UTC daily buckets with mean price + total quantity', () => {
    const dayMs = 86_400_000;
    const day1 = 1_700_000_000_000;
    const day2 = day1 + dayMs;
    const entries = [
      { pricePerUnit: 100, quantity: 2, timestamp: Math.floor(day1 / 1000),     hq: false },
      { pricePerUnit: 200, quantity: 3, timestamp: Math.floor((day1 + 100) / 1000), hq: false },
      { pricePerUnit: 300, quantity: 1, timestamp: Math.floor(day2 / 1000),     hq: false },
    ];
    const out = dailyBuckets(entries, 99999);  // big lookback so test data isn't cut off
    expect(out).toEqual([
      { dayStartMs: Math.floor(day1 / dayMs) * dayMs, meanPrice: 160, quantity: 5 },
      { dayStartMs: Math.floor(day2 / dayMs) * dayMs, meanPrice: 300, quantity: 1 },
    ]);
  });

  it('drops days outside the lookback window', () => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const oldEntry = { pricePerUnit: 50, quantity: 1, timestamp: Math.floor((now - 40 * dayMs) / 1000), hq: false };
    const recentEntry = { pricePerUnit: 60, quantity: 1, timestamp: Math.floor((now - 1 * dayMs) / 1000), hq: false };
    const out = dailyBuckets([oldEntry, recentEntry], 30);
    expect(out).toHaveLength(1);
    expect(out[0].meanPrice).toBe(60);
  });
});

describe('computeWeekDelta', () => {
  const NOW = 1_700_000_000_000;  // arbitrary fixed clock for tests
  const DAY = 86_400_000;
  const sec = (ms: number) => Math.floor(ms / 1000);

  it('returns null when there are zero entries', () => {
    expect(computeWeekDelta([], NOW)).toBeNull();
  });

  it('returns null when only the recent week has sales (prior week empty)', () => {
    const entries = [
      { pricePerUnit: 100, quantity: 1, timestamp: sec(NOW - 2 * DAY), hq: false },
    ];
    expect(computeWeekDelta(entries, NOW)).toBeNull();
  });

  it('returns null when only the prior week has sales (recent week empty)', () => {
    const entries = [
      { pricePerUnit: 100, quantity: 1, timestamp: sec(NOW - 10 * DAY), hq: false },
    ];
    expect(computeWeekDelta(entries, NOW)).toBeNull();
  });

  it('computes a positive delta when recent week prices are higher', () => {
    // Prior week avg = 100, recent week avg = 120 → +20%
    const entries = [
      { pricePerUnit: 100, quantity: 1, timestamp: sec(NOW - 10 * DAY), hq: false },
      { pricePerUnit: 120, quantity: 1, timestamp: sec(NOW - 2 * DAY), hq: false },
    ];
    expect(computeWeekDelta(entries, NOW)).toBeCloseTo(20, 5);
  });

  it('computes a negative delta when recent week prices are lower', () => {
    // Prior week avg = 100, recent week avg = 90 → -10%
    const entries = [
      { pricePerUnit: 100, quantity: 1, timestamp: sec(NOW - 10 * DAY), hq: false },
      { pricePerUnit: 90, quantity: 1, timestamp: sec(NOW - 1 * DAY), hq: false },
    ];
    expect(computeWeekDelta(entries, NOW)).toBeCloseTo(-10, 5);
  });

  it('weights by quantity (a high-quantity sale moves the average more)', () => {
    // Prior: one sale of 100 at qty 1, avg = 100
    // Recent: two sales: 200 at qty 9, 100 at qty 1; weighted = (200*9 + 100*1) / 10 = 190
    // Delta = (190 - 100) / 100 * 100 = +90%
    const entries = [
      { pricePerUnit: 100, quantity: 1, timestamp: sec(NOW - 10 * DAY), hq: false },
      { pricePerUnit: 200, quantity: 9, timestamp: sec(NOW - 2 * DAY), hq: false },
      { pricePerUnit: 100, quantity: 1, timestamp: sec(NOW - 1 * DAY), hq: false },
    ];
    expect(computeWeekDelta(entries, NOW)).toBeCloseTo(90, 5);
  });

  it('ignores entries older than 14 days', () => {
    // Entry at 20 days ago should not affect anything.
    // Prior: 100 at 10d, recent: 120 at 2d → +20%
    const entries = [
      { pricePerUnit: 9999, quantity: 1, timestamp: sec(NOW - 20 * DAY), hq: false },
      { pricePerUnit: 100, quantity: 1, timestamp: sec(NOW - 10 * DAY), hq: false },
      { pricePerUnit: 120, quantity: 1, timestamp: sec(NOW - 2 * DAY), hq: false },
    ];
    expect(computeWeekDelta(entries, NOW)).toBeCloseTo(20, 5);
  });
});

describe('dailyMedianBuckets', () => {
  const DAY_MS = 86_400_000;
  function sec(ms: number) { return Math.floor(ms / 1000); }

  it('returns 7 nulls when entries is empty', () => {
    expect(dailyMedianBuckets([], 7)).toEqual([null, null, null, null, null, null, null]);
  });

  it('computes median for a day with odd number of sales', () => {
    const now = Date.now();
    const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
    const entries = [
      { pricePerUnit: 100, quantity: 1, timestamp: sec(todayStart + 1000), hq: false },
      { pricePerUnit: 300, quantity: 1, timestamp: sec(todayStart + 2000), hq: false },
      { pricePerUnit: 200, quantity: 1, timestamp: sec(todayStart + 3000), hq: false },
    ];
    const result = dailyMedianBuckets(entries, 7);
    expect(result).toHaveLength(7);
    expect(result[6]).toBe(200); // today = last slot, median of [100,200,300]
  });

  it('computes median for even count (average of two middle values)', () => {
    const now = Date.now();
    const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
    const entries = [
      { pricePerUnit: 100, quantity: 1, timestamp: sec(todayStart + 1000), hq: false },
      { pricePerUnit: 200, quantity: 1, timestamp: sec(todayStart + 2000), hq: false },
      { pricePerUnit: 300, quantity: 1, timestamp: sec(todayStart + 3000), hq: false },
      { pricePerUnit: 400, quantity: 1, timestamp: sec(todayStart + 4000), hq: false },
    ];
    const result = dailyMedianBuckets(entries, 7);
    expect(result[6]).toBe(250);
  });

  it('fills days without sales as null', () => {
    const now = Date.now();
    const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
    const twoDaysAgo = todayStart - 2 * DAY_MS;
    const entries = [
      { pricePerUnit: 500, quantity: 1, timestamp: sec(twoDaysAgo + 1000), hq: false },
    ];
    const result = dailyMedianBuckets(entries, 7);
    expect(result[4]).toBe(500);
    expect(result[5]).toBeNull();
    expect(result[6]).toBeNull();
  });

  it('ignores entries older than lookbackDays', () => {
    const now = Date.now();
    const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
    const entries = [
      { pricePerUnit: 9999, quantity: 1, timestamp: sec(todayStart - 10 * DAY_MS), hq: false },
      { pricePerUnit: 100, quantity: 1, timestamp: sec(todayStart + 1000), hq: false },
    ];
    const result = dailyMedianBuckets(entries, 7);
    expect(result[6]).toBe(100);
    expect(result.slice(0, 6).every((v) => v === null)).toBe(true);
  });
});

describe('fetchHistoryWithinCached', () => {
  const WITHIN = 30 * 86400;

  // Build a fetch mock returning the single-item history shape for the requested id.
  function stubHistoryFetch(price = 100) {
    const spy = vi.fn((url: string) => {
      const id = Number(url.split('/').pop()!.split('?')[0].split(',')[0]);
      return Promise.resolve({
        ok: true,
        json: async () => ({ itemID: id, entries: [{ pricePerUnit: price, quantity: 1, timestamp: 1700, hq: false }] }),
      });
    });
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await clearHistoryCache();
  });

  it('fetches on a cold cache and returns the entries', async () => {
    const spy = stubHistoryFetch(123);
    const map = await fetchHistoryWithinCached('Phantom', [5], WITHIN);
    expect(map.get(5)).toEqual([{ pricePerUnit: 123, quantity: 1, timestamp: 1700, hq: false }]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('serves a warm entry from IndexedDB without a second fetch', async () => {
    const spy = stubHistoryFetch();
    await fetchHistoryWithinCached('Phantom', [5], WITHIN); // warms the cache
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockClear();
    const map = await fetchHistoryWithinCached('Phantom', [5], WITHIN); // served from cache
    expect(map.get(5)).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('only fetches the ids missing from the cache', async () => {
    const spy = stubHistoryFetch();
    await fetchHistoryWithinCached('Phantom', [5], WITHIN); // 5 now cached
    spy.mockClear();

    await fetchHistoryWithinCached('Phantom', [5, 6], WITHIN); // only 6 is a miss
    expect(spy).toHaveBeenCalledTimes(1);
    const fetchedUrl = spy.mock.calls[0][0] as string;
    expect(fetchedUrl).toContain('/6?');
    expect(fetchedUrl).not.toContain('/5,6');
  });

  it('refetches once the cached row is older than maxAgeMs', async () => {
    const spy = stubHistoryFetch();
    await fetchHistoryWithinCached('Phantom', [5], WITHIN);
    spy.mockClear();

    // maxAgeMs=0 → the just-written row is already stale → refetch.
    await fetchHistoryWithinCached('Phantom', [5], WITHIN, 0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keys separate windows independently (30d vs 90d do not collide)', async () => {
    const spy = stubHistoryFetch();
    await fetchHistoryWithinCached('Phantom', [5], 30 * 86400);
    spy.mockClear();

    await fetchHistoryWithinCached('Phantom', [5], 90 * 86400); // different window → miss
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
