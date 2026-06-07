import { describe, it, expect } from 'vitest';
import { scanDeals, mergeDeals } from './marketDiff';
import type { Opportunity } from './marketDiff';
import type { MarketItem, MarketData } from '../lib/universalis';

function item(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null, ...over,
  };
}
const NOW = 1_000_000;

describe('scanDeals', () => {
  it('flags a crash (buy) when the DC-cheapest is >=25% below the recent average', () => {
    // avg 1000 -> deal line 750; current min 700 is below it
    const data: MarketData = { '5': item({ minNQ: 700, avgNQ: 1000, listingCount: 10, velocity: 3, worldListings: [{ world: 'Moogle', price: 700, hq: false }] }) };
    const out = scanDeals(data, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ itemId: 5, kind: 'crash', world: 'Moogle', oldValue: 1000, newValue: 700, changePct: -30, gilPerDay: 2100, detectedAt: NOW });
  });

  it('does not flag a price only 20% below average', () => {
    const data: MarketData = { '5': item({ minNQ: 800, avgNQ: 1000, listingCount: 10, velocity: 3 }) };
    expect(scanDeals(data, NOW)).toEqual([]);
  });

  it('flags a spike (sell) when the DC-cheapest is >=25% above the recent average', () => {
    const data: MarketData = { '7': item({ minNQ: 1300, avgNQ: 1000, listingCount: 5, velocity: 2 }) };
    expect(scanDeals(data, NOW)[0]).toMatchObject({ kind: 'spike', oldValue: 1000, newValue: 1300, changePct: 30 });
  });

  it('flags empty when a selling item is down to <= 2 listings', () => {
    const data: MarketData = { '9': item({ minNQ: 100, avgNQ: 100, listingCount: 1, velocity: 4 }) };
    expect(scanDeals(data, NOW)[0]).toMatchObject({ kind: 'empty', world: '', oldValue: null, newValue: 1, changePct: null, gilPerDay: 0 });
  });

  it('does not flag empty for 5 listings', () => {
    const data: MarketData = { '9': item({ minNQ: 100, avgNQ: 100, listingCount: 5, velocity: 4 }) };
    expect(scanDeals(data, NOW)).toEqual([]);
  });

  it('empty wins over a price deal', () => {
    const data: MarketData = { '9': item({ minNQ: 100, avgNQ: 1000, listingCount: 1, velocity: 4 }) };
    expect(scanDeals(data, NOW)[0].kind).toBe('empty');
  });

  it('ignores illiquid items (velocity below the floor)', () => {
    const data: MarketData = { '5': item({ minNQ: 100, avgNQ: 1000, listingCount: 10, velocity: 0.5 }) };
    expect(scanDeals(data, NOW)).toEqual([]);
  });

  it('skips price kinds when the recent average is missing', () => {
    const data: MarketData = { '5': item({ minNQ: 100, avgNQ: null, listingCount: 10, velocity: 3 }) };
    expect(scanDeals(data, NOW)).toEqual([]);
  });

  it('honours a custom dealPct', () => {
    // avg 1000, 10% band -> deal line 900; min 850 qualifies at 10% but not at 25%
    const data: MarketData = { '5': item({ minNQ: 850, avgNQ: 1000, listingCount: 10, velocity: 3 }) };
    expect(scanDeals(data, NOW, 25)).toEqual([]);
    expect(scanDeals(data, NOW, 10)[0].kind).toBe('crash');
  });
});

function opp(over: Partial<Opportunity>): Opportunity {
  return { itemId: 1, kind: 'crash', world: 'Moogle', oldValue: 1000, newValue: 700,
    changePct: -30, velocity: 1, gilPerDay: 700, detectedAt: NOW, ...over };
}

describe('mergeDeals', () => {
  it('keeps the first-seen detectedAt for a deal still present', () => {
    const existing = [opp({ itemId: 1, kind: 'crash', detectedAt: 100 })];
    const current = [opp({ itemId: 1, kind: 'crash', newValue: 650, detectedAt: 500 })];
    const out = mergeDeals(existing, current);
    expect(out).toHaveLength(1);
    expect(out[0].detectedAt).toBe(100); // first-seen preserved
    expect(out[0].newValue).toBe(650);   // but the latest price
  });

  it('drops deals that no longer hold', () => {
    const existing = [opp({ itemId: 1, detectedAt: 100 }), opp({ itemId: 2, detectedAt: 100 })];
    const current = [opp({ itemId: 2, detectedAt: 500 })];
    expect(mergeDeals(existing, current).map((o) => o.itemId)).toEqual([2]);
  });

  it('stamps brand-new deals with now', () => {
    const current = [opp({ itemId: 3, detectedAt: 500 })];
    expect(mergeDeals([], current)[0].detectedAt).toBe(500);
  });

  it('sorts freshest-first', () => {
    const existing = [opp({ itemId: 1, detectedAt: 100 })]; // long-standing
    const current = [opp({ itemId: 1, detectedAt: 900 }), opp({ itemId: 2, detectedAt: 900 })];
    // item 1 keeps detectedAt 100 (older), item 2 is new at 900 -> 2 first
    expect(mergeDeals(existing, current).map((o) => o.itemId)).toEqual([2, 1]);
  });
});
