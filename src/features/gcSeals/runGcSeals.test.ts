import { describe, it, expect } from 'vitest';
import { runGcSeals, type GcSealsFilter } from './runGcSeals';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem, WorldListing } from '../../lib/universalis';

function mkSale(p: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0,
    velocity: 0, lastUploadTime: Date.now(), listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...p,
  };
}

function listing(world: string, price: number, hq = false): WorldListing {
  return { world, price, hq };
}

const baseFilter: GcSealsFilter = { maxPrice: 2000, scope: 'home' };

describe('runGcSeals', () => {
  it('drops non-equippable items (e.g. sc 7 = Materials)', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Crystal', sc: 7, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [listing('Phantom', 100)] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toEqual([]);
  });

  it('drops items with ilvl < 45', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Low Gear', sc: 33, ui: 0, ilvl: 44, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [listing('Phantom', 100)] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toEqual([]);
  });

  it('drops items with no listings', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Gear', sc: 33, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {};
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toEqual([]);
  });

  it('drops items above maxPrice', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Expensive', sc: 33, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [listing('Phantom', 3000)] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toEqual([]);
  });

  it('respects maxPrice when below threshold', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Cheap', sc: 33, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [listing('Phantom', 1000)] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toHaveLength(1);
    expect(out[0].price).toBe(1000);
  });

  it('filters by NQ only (ignores HQ listings)', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Gear', sc: 33, ui: 0, ilvl: 90, canHq: true },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [
        listing('Phantom', 5000, true),  // HQ, expensive
        listing('Phantom', 100, false),  // NQ, cheap
      ] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toHaveLength(1);
    expect(out[0].price).toBe(100);
  });

  it('picks the cheapest NQ listing across worlds', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Gear', sc: 33, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [
        listing('Phantom', 500),
        listing('Lich', 200),
        listing('Omega', 300),
      ] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', { maxPrice: 2000, scope: 'dc' });
    expect(out).toHaveLength(1);
    expect(out[0].world).toBe('Lich');
    expect(out[0].price).toBe(200);
  });

  it('respects scope=home: only home-world listings', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Gear', sc: 33, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [
        listing('Lich', 200),    // cheapest, but not home
        listing('Phantom', 500), // home world
      ] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toHaveLength(1);
    expect(out[0].world).toBe('Phantom');
    expect(out[0].price).toBe(500);
  });

  it('treats empty-world listings as home (Universalis omits worldName on single-world queries)', () => {
    // When the home scope is fetched, Universalis returns a single-world payload
    // whose listings carry no worldName, so they parse to world === ''. Those
    // rows ARE home-world listings and must not be filtered out.
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Gear', sc: 33, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [listing('', 500), listing('', 800)] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toHaveLength(1);
    expect(out[0].price).toBe(500);
  });

  it('drops items with no home-world listing when scope=home', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Gear', sc: 33, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [
        listing('Lich', 200),
        listing('Omega', 300),
      ] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toEqual([]);
  });

  it('computes seals correctly (ilvl 90 → 188 seals)', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Gear', sc: 33, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [listing('Phantom', 100)] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toHaveLength(1);
    expect(out[0].seals).toBe(188);
  });

  it('computes sealsPerGil correctly', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Gear', sc: 33, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [listing('Phantom', 100)] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toHaveLength(1);
    // 188 seals / 100 gil = 1.88
    expect(out[0].sealsPerGil).toBeCloseTo(1.88);
  });

  it('sorts by sealsPerGil descending (best deals first)', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Good Deal', sc: 33, ui: 0, ilvl: 110, canHq: false },
      { id: 2, name: 'Bad Deal', sc: 33, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [listing('Phantom', 500)] }), // 282 / 500 = 0.564
      2: mkSale({ worldListings: [listing('Phantom', 100)] }), // 188 / 100 = 1.88
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', baseFilter);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe(2); // 1.88 > 0.564
    expect(out[1].id).toBe(1);
  });

  it('handles multiple items and finds cheapest across all', () => {
    const snapshot: SnapshotItem[] = [
      { id: 1, name: 'Armor1', sc: 33, ui: 0, ilvl: 90, canHq: false },
      { id: 2, name: 'Armor2', sc: 33, ui: 0, ilvl: 90, canHq: false },
    ];
    const priceMap: MarketData = {
      1: mkSale({ worldListings: [
        listing('Phantom', 1000),
        listing('Lich', 500),
      ] }),
      2: mkSale({ worldListings: [
        listing('Phantom', 200),
      ] }),
    };
    const out = runGcSeals(snapshot, priceMap, 'Phantom', { ...baseFilter, scope: 'dc' });
    expect(out).toHaveLength(2);
    // Item 2: 188/200 = 0.94
    // Item 1: 188/500 = 0.376 (Lich is cheaper via DC scope)
    expect(out[0].id).toBe(2); // higher sealsPerGil
    expect(out[1].id).toBe(1);
  });
});
