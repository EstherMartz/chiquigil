import { describe, it, expect } from 'vitest';
import { diffMarket } from './marketDiff';
import type { MarketItem, MarketData } from '../lib/universalis';

function item(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null, ...over,
  };
}
const NOW = 1_000_000;

describe('diffMarket', () => {
  it('emits crash when DC min drops >= 20%', () => {
    const prev: MarketData = { '5': item({ minNQ: 1000, listingCount: 10 }) };
    const next: MarketData = { '5': item({ minNQ: 800, listingCount: 10, velocity: 3, worldListings: [{ world: 'Moogle', price: 800, hq: false }] }) };
    const out = diffMarket(prev, next, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ itemId: 5, kind: 'crash', world: 'Moogle', oldValue: 1000, newValue: 800, changePct: -20, gilPerDay: 2400, detectedAt: NOW });
  });

  it('does not emit for a -19% move', () => {
    const prev: MarketData = { '5': item({ minNQ: 1000, listingCount: 10 }) };
    const next: MarketData = { '5': item({ minNQ: 810, listingCount: 10 }) };
    expect(diffMarket(prev, next, NOW)).toEqual([]);
  });

  it('emits spike when DC min rises >= 20%', () => {
    const prev: MarketData = { '7': item({ minNQ: 1000, listingCount: 5 }) };
    const next: MarketData = { '7': item({ minNQ: 1200, listingCount: 5 }) };
    expect(diffMarket(prev, next, NOW)[0]).toMatchObject({ kind: 'spike', oldValue: 1000, newValue: 1200, changePct: 20 });
  });

  it('emits empty when listingCount drops to <= 2 from above', () => {
    const prev: MarketData = { '9': item({ minNQ: 100, listingCount: 5 }) };
    const next: MarketData = { '9': item({ minNQ: 100, listingCount: 2, velocity: 4 }) };
    expect(diffMarket(prev, next, NOW)[0]).toMatchObject({ kind: 'empty', world: '', oldValue: 5, newValue: 2, changePct: null, gilPerDay: 0 });
  });

  it('does not emit empty for 5 -> 3', () => {
    const prev: MarketData = { '9': item({ minNQ: 100, listingCount: 5 }) };
    const next: MarketData = { '9': item({ minNQ: 100, listingCount: 3 }) };
    expect(diffMarket(prev, next, NOW)).toEqual([]);
  });

  it('empty wins when an item both crashes and empties', () => {
    const prev: MarketData = { '9': item({ minNQ: 1000, listingCount: 5 }) };
    const next: MarketData = { '9': item({ minNQ: 500, listingCount: 1 }) };
    expect(diffMarket(prev, next, NOW)[0].kind).toBe('empty');
  });

  it('skips items with no prev baseline', () => {
    const next: MarketData = { '5': item({ minNQ: 800, listingCount: 10 }) };
    expect(diffMarket({}, next, NOW)).toEqual([]);
  });

  it('skips price kinds when prev minNQ is null but still allows empty', () => {
    const prev: MarketData = { '5': item({ minNQ: null, listingCount: 5 }) };
    const next: MarketData = { '5': item({ minNQ: 800, listingCount: 1 }) };
    expect(diffMarket(prev, next, NOW)[0].kind).toBe('empty');
  });
});
