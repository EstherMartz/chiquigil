import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMarketData, buildMarketUrl, parseMarketResponse } from './universalis';

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
      velocity: 0, lastUploadTime: 0, listingCount: 0,
      worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    });
  });
});

describe('fetchMarketData', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('throws when response not OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchMarketData('Phantom', [1])).rejects.toThrow('Universalis 500');
  });

  it('returns parsed data on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: { '1': { listings: [{ hq: false, pricePerUnit: 99 }], recentHistory: [], regularSaleVelocity: 1, lastUploadTime: 1 } } }),
    }));
    const out = await fetchMarketData('Phantom', [1]);
    expect(out['1'].minNQ).toBe(99);
  });
});
