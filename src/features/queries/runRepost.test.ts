import { describe, it, expect } from 'vitest';
import { runRepost } from './runRepost';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { QueryFilter } from './types';

const snapshot: SnapshotItem[] = [
  { id: 1, name: 'Pixie Cotton',  sc: 50, ui: 30, ilvl: 90, canHq: true },
  { id: 2, name: 'Tied Sellers',  sc: 50, ui: 30, ilvl: 90, canHq: true },
  { id: 3, name: 'NQ Only',       sc: 50, ui: 30, ilvl: 1,  canHq: false },
];

function mkPrice(args: { velocity?: number; listingCount?: number; listings: Array<{ price: number; hq: boolean }> }): MarketData[string] {
  const listings = args.listings;
  const nq = listings.filter((l) => !l.hq).map((l) => l.price).sort((a, b) => a - b);
  const hq = listings.filter((l) => l.hq).map((l) => l.price).sort((a, b) => a - b);
  return {
    minNQ: nq[0] ?? null,
    minHQ: hq[0] ?? null,
    avgNQ: null, avgHQ: null,
    velocity: args.velocity ?? 1,
    lastUploadTime: Date.now(),
    listingCount: args.listingCount ?? listings.length,
    worldListings: listings.map((l) => ({ world: 'Phantom', price: l.price, hq: l.hq })),
    averagePriceNQ: null, averagePriceHQ: null,
  };
}

const baseFilter: QueryFilter = {
  searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0,
  minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
  scope: 'home', maxListings: null, mode: 'repost', minGap: null,
};

describe('runRepost', () => {
  it('finds gap between cheapest and next strictly-higher price, taxed at 5%', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        listings: [{ price: 100, hq: false }, { price: 200, hq: false }, { price: 300, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, baseFilter);
    expect(out).toHaveLength(1);
    expect(out[0].cheapest).toBe(100);
    expect(out[0].wall).toBe(200);
    expect(out[0].gap).toBe(100);
    expect(out[0].gapPct).toBe(50); // round(100/200 * 100)
    expect(out[0].taxedProfit).toBe(90); // round(200 * 0.95 - 100)
    expect(out[0].hq).toBe(false);
  });

  it('skips items with all listings tied at the bottom (no wall)', () => {
    const priceMap: MarketData = {
      2: mkPrice({
        listings: [{ price: 100, hq: false }, { price: 100, hq: false }, { price: 100, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, baseFilter);
    expect(out).toEqual([]);
  });

  it('skips items with fewer than 2 listings on the relevant tier', () => {
    const priceMap: MarketData = {
      1: mkPrice({ listings: [{ price: 100, hq: false }] }),
    };
    const out = runRepost(snapshot, priceMap, baseFilter);
    expect(out).toEqual([]);
  });

  it('drops items below minVelocity', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        velocity: 0.5,
        listings: [{ price: 100, hq: false }, { price: 200, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('drops items below minGap (absolute gil)', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        listings: [{ price: 100, hq: false }, { price: 105, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, minGap: 50 });
    expect(out).toEqual([]);
  });

  it('drops items below minDealPct (gap %)', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        listings: [{ price: 100, hq: false }, { price: 105, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, minDealPct: 30 });
    expect(out).toEqual([]);
  });

  it('picks the larger-gap tier when both NQ and HQ qualify (either mode)', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        listings: [
          { price: 100, hq: false }, { price: 110, hq: false },
          { price: 1000, hq: true }, { price: 1500, hq: true },
        ],
      }),
    };
    const out = runRepost(snapshot, priceMap, baseFilter);
    expect(out).toHaveLength(1);
    expect(out[0].hq).toBe(true);
    expect(out[0].cheapest).toBe(1000);
    expect(out[0].wall).toBe(1500);
  });

  it('respects filter.hq=hq by considering only HQ tier', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        listings: [
          { price: 100, hq: false }, { price: 1000, hq: false },
          { price: 200, hq: true }, { price: 300, hq: true },
        ],
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, hq: 'hq' });
    expect(out).toHaveLength(1);
    expect(out[0].hq).toBe(true);
    expect(out[0].cheapest).toBe(200);
  });

  it('respects filter.hq=hq by dropping non-canHq items', () => {
    const priceMap: MarketData = {
      3: mkPrice({
        listings: [{ price: 100, hq: false }, { price: 200, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, hq: 'hq' });
    expect(out).toEqual([]);
  });

  it('sorts by gilFlow desc and slices to limit', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        velocity: 2,
        listings: [{ price: 100, hq: false }, { price: 200, hq: false }],
      }),
      2: mkPrice({
        velocity: 10,
        listings: [{ price: 50, hq: false }, { price: 100, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, limit: 2 });
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
});
