import { describe, it, expect } from 'vitest';
import { applyListingUpdate, applySaleUpdate } from './marketPatch';
import type { MarketItem } from './universalis';

function item(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null, ...over,
  };
}

describe('applyListingUpdate', () => {
  it('replaces only the target world\'s listings and recomputes the cheapest', () => {
    const base = item({
      minNQ: 100, listingCount: 2,
      worldListings: [
        { world: 'Moogle', price: 100, hq: false },
        { world: 'Phantom', price: 120, hq: false },
      ],
    });
    const next = applyListingUpdate(base, [{ pricePerUnit: 90, hq: false, quantity: 3, retainerName: 'Bob' }], 'Phantom');
    expect(next.worldListings).toEqual([
      { world: 'Phantom', price: 90, hq: false, quantity: 3, seller: 'Bob' },
      { world: 'Moogle', price: 100, hq: false },
    ]);
    expect(next.minNQ).toBe(90);
    expect(next.listingCount).toBe(2);
    expect(base.minNQ).toBe(100); // immutable
  });

  it('tracks NQ and HQ cheapest separately', () => {
    const base = item({ worldListings: [{ world: 'Moogle', price: 100, hq: false }] });
    const next = applyListingUpdate(base, [{ pricePerUnit: 500, hq: true }], 'Phantom');
    expect(next.minNQ).toBe(100);
    expect(next.minHQ).toBe(500);
  });

  it('removes a world\'s listings when the update is empty', () => {
    const base = item({ worldListings: [{ world: 'Phantom', price: 90, hq: false }, { world: 'Moogle', price: 100, hq: false }] });
    const next = applyListingUpdate(base, [], 'Phantom');
    expect(next.worldListings).toEqual([{ world: 'Moogle', price: 100, hq: false }]);
    expect(next.minNQ).toBe(100);
  });
});

describe('applySaleUpdate', () => {
  it('advances lastSaleMs and bumps the matching recent-sales counter', () => {
    const base = item({ lastSaleMs: 1000, recentSalesNQ: 2, recentSalesHQ: 1 });
    const next = applySaleUpdate(base, { pricePerUnit: 50, hq: false, timestamp: 5 }, 9_999);
    expect(next.lastSaleMs).toBe(5000);
    expect(next.recentSalesNQ).toBe(3);
    expect(next.recentSalesHQ).toBe(1);
  });

  it('keeps the newer lastSaleMs and falls back to now when no timestamp', () => {
    const base = item({ lastSaleMs: 8000, recentSalesHQ: 0 });
    const next = applySaleUpdate(base, { pricePerUnit: 50, hq: true }, 9_999);
    expect(next.lastSaleMs).toBe(9_999);
    expect(next.recentSalesHQ).toBe(1);
  });
});
