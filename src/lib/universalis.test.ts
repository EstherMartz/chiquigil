import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchMarketData,
  buildMarketUrl,
  parseMarketResponse,
  _resetMarketCacheForTests,
} from './universalis';
import { clearMarketCache } from './recipeCache';

describe('buildMarketUrl', () => {
  it('builds a Phantom URL with all item ids comma-separated', () => {
    expect(buildMarketUrl('Phantom', [1, 2, 3])).toBe(
      'https://universalis.app/api/v2/Phantom/1,2,3?listings=10&entries=15'
    );
  });

  it('builds a Chaos DC URL', () => {
    expect(buildMarketUrl('Chaos', [42])).toBe(
      'https://universalis.app/api/v2/Chaos/42?listings=10&entries=15'
    );
  });
});

describe('parseMarketResponse', () => {
  it('extracts min NQ, min HQ, average HQ, velocity, and lastUploadTime per item', () => {
    const raw = {
      items: {
        '100': {
          listings: [
            { hq: false, pricePerUnit: 50, worldName: 'Phantom' },
            { hq: true, pricePerUnit: 200, worldName: 'Phantom' },
            { hq: true, pricePerUnit: 180, worldName: 'Lich' },
          ],
          recentHistory: [
            { hq: false, pricePerUnit: 60 },
            { hq: true, pricePerUnit: 190 },
          ],
          regularSaleVelocity: 4.2,
          lastUploadTime: 1715000000000,
          averagePriceNQ: 70,
          averagePriceHQ: 210,
        },
      },
    };
    const out = parseMarketResponse(raw);
    expect(out['100']).toEqual({
      minNQ: 50,
      minHQ: 180,
      avgNQ: 60,
      avgHQ: 190,
      medianNQ: 60,        // only 1 NQ history entry, median is itself
      medianHQ: 190,       // only 1 HQ history entry
      recentSalesNQ: 1,
      recentSalesHQ: 1,
      velocity: 4.2,
      lastUploadTime: 1715000000000,
      listingCount: 3,
      worldListings: [
        { world: 'Phantom', price: 50, hq: false },
        { world: 'Phantom', price: 200, hq: true },
        { world: 'Lich', price: 180, hq: true },
      ],
      averagePriceNQ: 70,
      averagePriceHQ: 210,
    });
  });

  it('returns null prices when no matching listings', () => {
    const out = parseMarketResponse({ items: { '7': { listings: [], recentHistory: [], regularSaleVelocity: 0, lastUploadTime: 0 } } });
    expect(out['7']).toEqual({
      minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
      medianNQ: null, medianHQ: null,
      recentSalesNQ: 0, recentSalesHQ: 0,
      velocity: 0, lastUploadTime: 0, listingCount: 0,
      worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    });
  });

  it('computes per-tier trimmed median + recent-sales count from recentHistory', () => {
    // 6 NQ entries, 6 HQ entries. With 6 entries the trim count is floor(0.6) = 0
    // (no trimming), so the median is the average of the two middle sorted values.
    const raw = {
      items: {
        '200': {
          listings: [],
          recentHistory: [
            { hq: false, pricePerUnit: 100 },
            { hq: false, pricePerUnit: 100 },
            { hq: false, pricePerUnit: 100 },
            { hq: false, pricePerUnit: 110 },
            { hq: false, pricePerUnit: 120 },
            { hq: false, pricePerUnit: 1_000_000 }, // RMT-shaped outlier — but no trim at n=6.
            { hq: true,  pricePerUnit: 500 },
            { hq: true,  pricePerUnit: 500 },
            { hq: true,  pricePerUnit: 600 },
            { hq: true,  pricePerUnit: 600 },
            { hq: true,  pricePerUnit: 700 },
            { hq: true,  pricePerUnit: 700 },
          ],
          regularSaleVelocity: 5,
          lastUploadTime: 1,
        },
      },
    };
    const out = parseMarketResponse(raw);
    expect(out['200'].recentSalesNQ).toBe(6);
    expect(out['200'].recentSalesHQ).toBe(6);
    // NQ sorted: [100, 100, 100, 110, 120, 1_000_000] → median of middle two = (100 + 110)/2 = 105.
    expect(out['200'].medianNQ).toBe(105);
    // HQ sorted: [500, 500, 600, 600, 700, 700] → median = (600 + 600)/2 = 600.
    expect(out['200'].medianHQ).toBe(600);
  });

  it('trims outliers from a 10-entry per-tier history', () => {
    // 10 HQ entries: trim count = floor(1.0) = 1 each side; one extreme outlier on each end.
    const hq = [1, 100, 100, 100, 100, 100, 100, 100, 100, 1_000_000];
    const raw = {
      items: {
        '201': {
          listings: [],
          recentHistory: hq.map((p) => ({ hq: true, pricePerUnit: p })),
          regularSaleVelocity: 5,
          lastUploadTime: 1,
        },
      },
    };
    const out = parseMarketResponse(raw);
    expect(out['201'].recentSalesHQ).toBe(10);
    // After trim of 1 each side: [100, 100, 100, 100, 100, 100, 100, 100] → median = 100.
    expect(out['201'].medianHQ).toBe(100);
    expect(out['201'].medianNQ).toBeNull();
    expect(out['201'].recentSalesNQ).toBe(0);
  });
});

describe('fetchMarketData (cache-only)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    _resetMarketCacheForTests();
    await clearMarketCache();
  });

  it('short-circuits to empty result for empty id list', async () => {
    const out = await fetchMarketData('Phantom', []);
    expect(out).toEqual({});
  });

  it('returns empty placeholders for uncached items (no network call)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const out = await fetchMarketData('Phantom', [1, 2]);
    expect(out['1'].minNQ).toBeNull();
    expect(out['2'].minNQ).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
