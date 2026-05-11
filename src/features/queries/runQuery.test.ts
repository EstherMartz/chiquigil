import { describe, it, expect } from 'vitest';
import { runQuery } from './runQuery';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { QueryFilter } from './types';

const snapshot: SnapshotItem[] = [
  { id: 1, name: 'A', sc: 56, ui: 65, ilvl: 90, canHq: true },   // furniture, HQ-able
  { id: 2, name: 'B', sc: 56, ui: 65, ilvl: 90, canHq: false },  // furniture, NQ-only
  { id: 3, name: 'C', sc: 44, ui: 30, ilvl: 1,  canHq: true },   // meal, HQ-able
];

function mkPrice(p: Partial<MarketData[string]>): MarketData[string] {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    velocity: 0, lastUploadTime: Date.now(), listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...p,
  };
}

const baseFilter: QueryFilter = {
  searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0,
  minPrice: null, maxPrice: null, sort: 'discount', limit: 100,
};

describe('runQuery', () => {
  it('returns [] if priceMap has no matching items', () => {
    expect(runQuery(snapshot, {}, baseFilter)).toEqual([]);
  });

  it('filters by searchCategories when non-empty', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minNQ: 50, averagePriceNQ: 100 }),
      3: mkPrice({ minNQ: 50, averagePriceNQ: 100 }),
    };
    const out = runQuery(snapshot, priceMap, { ...baseFilter, searchCategories: [44] });
    expect(out.map((r) => r.id)).toEqual([3]);
  });

  it('drops non-HQ-capable items when hq mode is "hq"', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 50, averagePriceHQ: 100 }),
      2: mkPrice({ minNQ: 50, averagePriceNQ: 100 }), // canHq=false
    };
    const out = runQuery(snapshot, priceMap, { ...baseFilter, hq: 'hq' });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('applies minDealPct threshold', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minNQ: 90, averagePriceNQ: 100 }),  // 10% off
      2: mkPrice({ minNQ: 50, averagePriceNQ: 100 }),  // 50% off
    };
    const out = runQuery(snapshot, priceMap, { ...baseFilter, hq: 'nq', minDealPct: 30 });
    expect(out.map((r) => r.id)).toEqual([2]);
  });

  it('applies minVelocity, minPrice, maxPrice', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minNQ: 100, averagePriceNQ: 200, velocity: 1 }),
      2: mkPrice({ minNQ: 100, averagePriceNQ: 200, velocity: 5 }),
      3: mkPrice({ minNQ: 999_999, averagePriceNQ: 2_000_000, velocity: 5 }),
    };
    const f: QueryFilter = { ...baseFilter, hq: 'nq', minVelocity: 3, minPrice: 50, maxPrice: 500_000 };
    const out = runQuery(snapshot, priceMap, f);
    expect(out.map((r) => r.id)).toEqual([2]);
  });

  it('sorts by each mode and slices to limit', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minNQ: 80, averagePriceNQ: 100, velocity: 1 }),  // disc 20, flow 80, vel 1
      2: mkPrice({ minNQ: 50, averagePriceNQ: 100, velocity: 4 }),  // disc 50, flow 200, vel 4
      3: mkPrice({ minNQ: 70, averagePriceNQ: 100, velocity: 2 }),  // disc 30, flow 140, vel 2
    };
    const f = (sort: QueryFilter['sort']): QueryFilter => ({ ...baseFilter, hq: 'nq', sort, limit: 2 });
    expect(runQuery(snapshot, priceMap, f('discount')).map((r) => r.id)).toEqual([2, 3]);
    expect(runQuery(snapshot, priceMap, f('gilFlow')).map((r) => r.id)).toEqual([2, 3]);
    expect(runQuery(snapshot, priceMap, f('velocity')).map((r) => r.id)).toEqual([2, 3]);
    expect(runQuery(snapshot, priceMap, f('unitPrice')).map((r) => r.id)).toEqual([1, 3]);
  });

  it('hq=either uses whichever tier has the lower current min, and tags hq accordingly', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minNQ: 80, averagePriceNQ: 100, minHQ: 60, averagePriceHQ: 200, velocity: 1 }),
    };
    const out = runQuery(snapshot, priceMap, { ...baseFilter, hq: 'either' });
    expect(out[0].hq).toBe(true);
    expect(out[0].unitPrice).toBe(60);
    expect(out[0].averagePrice).toBe(200);
  });
});
