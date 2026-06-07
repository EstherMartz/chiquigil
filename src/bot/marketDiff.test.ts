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
  it('emits crash when the DC-cheapest crosses >=15% below the recent average', () => {
    // avg 1000 -> deal line 850; prev 900 (not yet a deal) -> next 800 (now a deal)
    const prev: MarketData = { '5': item({ minNQ: 900, avgNQ: 1000, listingCount: 10 }) };
    const next: MarketData = { '5': item({ minNQ: 800, avgNQ: 1000, listingCount: 10, velocity: 3, worldListings: [{ world: 'Moogle', price: 800, hq: false }] }) };
    const out = diffMarket(prev, next, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ itemId: 5, kind: 'crash', world: 'Moogle', oldValue: 1000, newValue: 800, changePct: -20, gilPerDay: 2400, detectedAt: NOW });
  });

  it('does not fire when the dip stays above the deal line', () => {
    // avg 1000 -> deal line 850; next 900 is still above it
    const prev: MarketData = { '5': item({ minNQ: 1000, avgNQ: 1000, listingCount: 10 }) };
    const next: MarketData = { '5': item({ minNQ: 900, avgNQ: 1000, listingCount: 10 }) };
    expect(diffMarket(prev, next, NOW)).toEqual([]);
  });

  it('does not re-fire an item already below the deal line (no fresh crossing)', () => {
    const prev: MarketData = { '5': item({ minNQ: 800, avgNQ: 1000, listingCount: 10 }) };
    const next: MarketData = { '5': item({ minNQ: 820, avgNQ: 1000, listingCount: 10 }) };
    expect(diffMarket(prev, next, NOW)).toEqual([]);
  });

  it('emits spike when the DC-cheapest crosses >=15% above the recent average', () => {
    // avg 1000 -> spike line 1150; prev 1100 -> next 1200
    const prev: MarketData = { '7': item({ minNQ: 1100, avgNQ: 1000, listingCount: 5 }) };
    const next: MarketData = { '7': item({ minNQ: 1200, avgNQ: 1000, listingCount: 5 }) };
    expect(diffMarket(prev, next, NOW)[0]).toMatchObject({ kind: 'spike', oldValue: 1000, newValue: 1200, changePct: 20 });
  });

  it('emits empty when listingCount drops to <= 2 from above', () => {
    const prev: MarketData = { '9': item({ minNQ: 100, avgNQ: 100, listingCount: 5 }) };
    const next: MarketData = { '9': item({ minNQ: 100, avgNQ: 100, listingCount: 2, velocity: 4 }) };
    expect(diffMarket(prev, next, NOW)[0]).toMatchObject({ kind: 'empty', world: '', oldValue: 5, newValue: 2, changePct: null, gilPerDay: 0 });
  });

  it('does not emit empty for 5 -> 3', () => {
    const prev: MarketData = { '9': item({ minNQ: 100, avgNQ: 100, listingCount: 5 }) };
    const next: MarketData = { '9': item({ minNQ: 100, avgNQ: 100, listingCount: 3 }) };
    expect(diffMarket(prev, next, NOW)).toEqual([]);
  });

  it('empty wins when an item both crosses price and empties', () => {
    // would be a crash (avg 1000, 1100 -> 500 crosses 850) but the shelf also emptied
    const prev: MarketData = { '9': item({ minNQ: 1100, avgNQ: 1000, listingCount: 5 }) };
    const next: MarketData = { '9': item({ minNQ: 500, avgNQ: 1000, listingCount: 1 }) };
    expect(diffMarket(prev, next, NOW)[0].kind).toBe('empty');
  });

  it('skips items with no prev baseline', () => {
    const next: MarketData = { '5': item({ minNQ: 800, avgNQ: 1000, listingCount: 10 }) };
    expect(diffMarket({}, next, NOW)).toEqual([]);
  });

  it('skips price kinds when the recent average is missing, but still allows empty', () => {
    const prev: MarketData = { '5': item({ minNQ: 1100, avgNQ: null, listingCount: 5 }) };
    const next: MarketData = { '5': item({ minNQ: 500, avgNQ: null, listingCount: 1 }) };
    expect(diffMarket(prev, next, NOW)[0].kind).toBe('empty');
  });
});

import { mergeOpportunities } from './marketDiff';
import type { Opportunity } from './marketDiff';

function opp(over: Partial<Opportunity>): Opportunity {
  return { itemId: 1, kind: 'crash', world: 'Moogle', oldValue: 1000, newValue: 800,
    changePct: -20, velocity: 1, gilPerDay: 800, detectedAt: 0, ...over };
}
const TTL = 2 * 60 * 60 * 1000; // 2h

describe('mergeOpportunities', () => {
  it('fresh overrides existing for the same item+kind', () => {
    const existing = [opp({ itemId: 1, kind: 'crash', newValue: 900, detectedAt: 100 })];
    const fresh = [opp({ itemId: 1, kind: 'crash', newValue: 700, detectedAt: 200 })];
    const out = mergeOpportunities(existing, fresh, TTL, 200);
    expect(out).toHaveLength(1);
    expect(out[0].newValue).toBe(700);
  });

  it('keeps different kinds for the same item separately', () => {
    const existing = [opp({ itemId: 1, kind: 'crash', detectedAt: 100 })];
    const fresh = [opp({ itemId: 1, kind: 'empty', detectedAt: 200 })];
    expect(mergeOpportunities(existing, fresh, TTL, 200)).toHaveLength(2);
  });

  it('drops entries older than the TTL', () => {
    const now = 10 * 60 * 60 * 1000; // 10h
    const existing = [opp({ itemId: 1, detectedAt: now - TTL - 1 })]; // stale
    const fresh = [opp({ itemId: 2, detectedAt: now })];
    const out = mergeOpportunities(existing, fresh, TTL, now);
    expect(out.map((o) => o.itemId)).toEqual([2]);
  });

  it('sorts freshest first', () => {
    const fresh = [opp({ itemId: 1, detectedAt: 100 }), opp({ itemId: 2, detectedAt: 300 }), opp({ itemId: 3, detectedAt: 200 })];
    expect(mergeOpportunities([], fresh, TTL, 300).map((o) => o.itemId)).toEqual([2, 3, 1]);
  });
});
