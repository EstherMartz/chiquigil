import { describe, it, expect } from 'vitest';
import { selectHotIds } from './hotSet';
import type { MarketItem, MarketData } from '../lib/universalis';
import type { MarketBundle } from './marketFetch';

function item(velocity: number): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0,
    velocity, lastUploadTime: 0, listingCount: 0, worldListings: [],
    averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null,
  };
}
function data(entries: Record<number, number>): MarketData {
  const out: MarketData = {};
  for (const [id, v] of Object.entries(entries)) out[id] = item(v);
  return out;
}

describe('selectHotIds', () => {
  it('selects ids at or above the threshold in any scope, sorted & deduped', () => {
    const bundle: MarketBundle = {
      phantom: data({ 1: 12, 2: 3 }),
      dc: data({ 2: 11, 3: 0 }),
      region: data({ 1: 1, 4: 50 }),
    };
    expect(selectHotIds(bundle, 10)).toEqual([1, 2, 4]);
  });

  it('returns empty when nothing clears the threshold', () => {
    const bundle: MarketBundle = { phantom: data({ 1: 1 }), dc: {}, region: {} };
    expect(selectHotIds(bundle, 10)).toEqual([]);
  });
});
