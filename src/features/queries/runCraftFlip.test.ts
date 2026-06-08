import { describe, it, expect } from 'vitest';
import { narrowForCraftFlip, runCraftFlip } from './runCraftFlip';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { QueryFilter } from './types';
import type { CrafterLevels } from '../../features/items/craftStatus';

const snapshot: SnapshotItem[] = [
  { id: 1, name: 'Glamour Top', sc: 56, ui: 65, ilvl: 90, canHq: true },
  { id: 2, name: 'Cheap Dye',    sc: 56, ui: 65, ilvl: 50, canHq: false },
  { id: 3, name: 'No Recipe',    sc: 56, ui: 65, ilvl: 50, canHq: true },
];

function mkPrice(p: Partial<MarketData[string]>): MarketData[string] {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0,
    velocity: 0, lastUploadTime: Date.now(), listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...p,
  };
}

const baseFilter: QueryFilter = {
  searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0,
  minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
  scope: 'home', maxListings: null, mode: 'craft', minGap: null, trainedEye: false,
};

// Recipes: item 1 costs (50 NQ ingredient × 2); item 3 has no recipe.
const recipe1: Recipe = {
  itemResultId: 1, classJob: 'LTW', recipeLevel: 90,
  ingredients: [{ itemId: 99, amount: 2 }],
};

const recipeMap = new Map<number, Recipe | null>([
  [1, recipe1],
  [3, null],
]);

describe('narrowForCraftFlip', () => {
  it('keeps items that pass velocity, listingCount, tier, and trust checks', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      2: mkPrice({ minNQ: 100, medianNQ: 120, recentSalesNQ: 8,
                   velocity: 5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, minVelocity: 1, maxListings: 2 });
    expect(out.sort()).toEqual([1, 2]);
  });

  it('drops items with no price-map entry', () => {
    const out = narrowForCraftFlip(snapshot, {}, baseFilter);
    expect(out).toEqual([]);
  });

  it('drops items exceeding maxListings', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 100, medianHQ: 120, recentSalesHQ: 8,
                   velocity: 1, listingCount: 5 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, maxListings: 2 });
    expect(out).toEqual([]);
  });

  it('drops items below minVelocity', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 100, medianHQ: 120, recentSalesHQ: 8,
                   velocity: 0.5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('honors hq=hq by dropping items where item.canHq is false', () => {
    const priceMap: MarketData = {
      2: mkPrice({ minNQ: 100, medianNQ: 120, recentSalesNQ: 8,
                   velocity: 5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, hq: 'hq' });
    expect(out).toEqual([]);
  });

  it('rejects items below MIN_RECENT_SALES (data-confidence floor)', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1000, recentSalesHQ: 4,  // 4 < 5
                   velocity: 1, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, hq: 'hq', minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('rejects items whose tier has no median (null)', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: null, recentSalesHQ: 0,
                   velocity: 1, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, hq: 'hq', minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('rejects items where minListing exceeds MAX_LISTING_RATIO × median', () => {
    // 2.5M HQ vs. 15k median = 166× — Leather Wristbands case.
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 2_500_000, medianHQ: 15_000, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, hq: 'hq', minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it("with hq='either', falls back to NQ when the HQ tier fails the trust check", () => {
    // HQ tier fails the outlier ratio, but NQ tier is healthy.
    const priceMap: MarketData = {
      1: mkPrice({
        minHQ: 2_500_000, medianHQ: 15_000, recentSalesHQ: 8,
        minNQ: 100, medianNQ: 120, recentSalesNQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, hq: 'either', minVelocity: 1 });
    expect(out).toEqual([1]); // kept via NQ tier
  });
});

describe('runCraftFlip', () => {
  it('drops items with no recipe in recipeMap (undefined or null)', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      3: mkPrice({ minHQ:  500, medianHQ:  600, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('computes materialCost, profit, and gilPerDay using the trusted unit price', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 2, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out).toHaveLength(1);
    // Trusted tier picks min(minListing, median) = min(1000, 1200) = 1000.
    expect(out[0].unitPrice).toBe(1000);
    expect(out[0].materialCost).toBe(100); // 50 × 2
    expect(out[0].profit).toBe(900);
    expect(out[0].gilPerDay).toBe(1800);   // 900 × 2
    expect(out[0].hq).toBe(true);
  });

  it('drops items with profit ≤ 0', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 50, medianHQ: 60, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 100, medianNQ: 120, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('caps unit price at the trusted median when minListing exceeds it (but within ratio)', () => {
    // minHQ 4000 vs medianHQ 1500 → ratio 2.67 < 5, so kept. Unit price capped to 1500.
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 4000, medianHQ: 1500, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out).toHaveLength(1);
    expect(out[0].unitPrice).toBe(1500); // capped to median, NOT 4000
    expect(out[0].profit).toBe(1400);    // 1500 - 100
  });

  it('drops items with an outlier listing (minListing > MAX_LISTING_RATIO × median)', () => {
    // Leather Wristbands case: 10M listing on a 1500-median item.
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 10_000_000, medianHQ: 1500, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('sorts by gilFlow desc and slices to limit', () => {
    const recipe2: Recipe = {
      itemResultId: 2, classJob: 'WVR', recipeLevel: 50,
      ingredients: [{ itemId: 99, amount: 1 }],
    };
    const rm = new Map<number, Recipe | null>([[1, recipe1], [2, recipe2]]);
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 2, listingCount: 1 }),
      2: mkPrice({ minNQ: 5000, medianNQ: 6000, recentSalesNQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    // item 1: profit (1000 - 100) × 2 = 1800
    // item 2: profit (5000 -  50) × 1 = 4950
    const out = runCraftFlip(snapshot, priceMap, rm,
      { ...baseFilter, minVelocity: 1, limit: 2 });
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });

  it('trainedEye=false is a no-op (regression test)', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1, trainedEye: false });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('trainedEye=true with sufficient crafter level passes the item', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    const levels: CrafterLevels = {
      CRP: 30, BSM: 30, ARM: 30, GSM: 30,
      LTW: 100, WVR: 30, ALC: 30, CUL: 30,
    };
    // recipe1: classJob='LTW', recipeLevel=90, crafterLevel=100
    // 90 <= 100 - 10 → true, passes
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1, trainedEye: true }, levels);
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('trainedEye=true with insufficient crafter level drops the item', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    const levels: CrafterLevels = {
      CRP: 30, BSM: 30, ARM: 30, GSM: 30,
      LTW: 85, WVR: 30, ALC: 30, CUL: 30,
    };
    // recipe1: classJob='LTW', recipeLevel=90, crafterLevel=85
    // 90 <= 85 - 10 → false, filtered out
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1, trainedEye: true }, levels);
    expect(out).toEqual([]);
  });

  it('trainedEye=true without levels parameter drops all items', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    // trainedEye=true but levels undefined
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1, trainedEye: true });
    expect(out).toEqual([]);
  });

  it('populates competitor-listing fields on the row', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8, velocity: 4, listingCount: 3,
        worldListings: [
          { world: 'Phantom', price: 1000, hq: true, quantity: 2, seller: 'A' },
          { world: 'Phantom', price: 1300, hq: true, quantity: 1, seller: 'B' },
          { world: 'Phantom', price: 1400, hq: true, quantity: 1, seller: 'C' },
        ],
      }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8, listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap, { ...baseFilter, minVelocity: 1 });
    expect(out).toHaveLength(1);
    const r = out[0];
    expect(r.gap).toBe(300);                 // 1300 - 1000
    expect(r.gapPct).toBeCloseTo(0.3, 5);
    expect(r.hasSecondTier).toBe(true);
    expect(r.sellerCount).toBe(3);
    expect(r.clearDays).toBeCloseTo(3 / 4, 5); // listingCount/velocity
    expect(['OPEN', 'HEALTHY', 'CROWDED', 'DOMINATED', 'EMPTY']).toContain(r.risk);
  });

  it("sort 'risk' orders worst-first (DOMINATED before OPEN)", () => {
    const recipe2: Recipe = { itemResultId: 2, classJob: 'WVR', recipeLevel: 50, ingredients: [{ itemId: 99, amount: 1 }] };
    const rm = new Map<number, Recipe | null>([[1, recipe1], [2, recipe2]]);
    const priceMap: MarketData = {
      // item 1: dominated (one seller >60%)
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8, velocity: 4, listingCount: 4,
        worldListings: [
          { world: 'Phantom', price: 1000, hq: true, quantity: 9, seller: 'A' },
          { world: 'Phantom', price: 1001, hq: true, quantity: 1, seller: 'B' },
          { world: 'Phantom', price: 1002, hq: true, quantity: 1, seller: 'C' },
        ] }),
      // item 2: open (single listing/seller)
      2: mkPrice({ minNQ: 5000, medianNQ: 6000, recentSalesNQ: 8, velocity: 1, listingCount: 1,
        worldListings: [{ world: 'Phantom', price: 5000, hq: false, quantity: 1, seller: 'Z' }] }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8, listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, rm, { ...baseFilter, minVelocity: 1, sort: 'risk' });
    expect(out.map((r) => r.risk)).toEqual(['DOMINATED', 'OPEN']);
  });
});
