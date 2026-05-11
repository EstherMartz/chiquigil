import { describe, it, expect } from 'vitest';
import { narrowForCraftFlip, runCraftFlip } from './runCraftFlip';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { QueryFilter } from './types';

const snapshot: SnapshotItem[] = [
  { id: 1, name: 'Glamour Top', sc: 56, ui: 65, ilvl: 90, canHq: true },
  { id: 2, name: 'Cheap Dye',    sc: 56, ui: 65, ilvl: 50, canHq: false },
  { id: 3, name: 'No Recipe',    sc: 56, ui: 65, ilvl: 50, canHq: true },
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
  minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
  scope: 'home', maxListings: null, craftableOnly: true,
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
  it('keeps items with velocity ≥ minVelocity, listingCount within cap, and a usable tier', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, averagePriceHQ: 1500, velocity: 1, listingCount: 1 }),
      2: mkPrice({ minNQ: 100,  averagePriceNQ: 200,  velocity: 5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap, { ...baseFilter, minVelocity: 1, maxListings: 2 });
    expect(out.sort()).toEqual([1, 2]);
  });

  it('drops items with no price-map entry', () => {
    const out = narrowForCraftFlip(snapshot, {}, baseFilter);
    expect(out).toEqual([]);
  });

  it('drops items exceeding maxListings', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 100, averagePriceHQ: 200, velocity: 1, listingCount: 5 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap, { ...baseFilter, maxListings: 2 });
    expect(out).toEqual([]);
  });

  it('drops items below minVelocity', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 100, averagePriceHQ: 200, velocity: 0.5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap, { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('honors hq=hq by dropping items where item.canHq is false', () => {
    const priceMap: MarketData = {
      2: mkPrice({ minNQ: 100, averagePriceNQ: 200, velocity: 5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap, { ...baseFilter, hq: 'hq' });
    expect(out).toEqual([]);
  });
});

describe('runCraftFlip', () => {
  it('drops items with no recipe in recipeMap (undefined or null)', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, averagePriceHQ: 1500, velocity: 1, listingCount: 1 }),
      3: mkPrice({ minHQ: 500,  averagePriceHQ: 800,  velocity: 1, listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap, { ...baseFilter, minVelocity: 1 });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('computes materialCost, profit, and gilPerDay', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, averagePriceHQ: 1500, velocity: 2, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, averagePriceNQ: 60, listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap, { ...baseFilter, minVelocity: 1 });
    expect(out).toHaveLength(1);
    expect(out[0].materialCost).toBe(100); // 50 × 2
    expect(out[0].unitPrice).toBe(1000);   // HQ sale (canHq)
    expect(out[0].profit).toBe(900);
    expect(out[0].gilPerDay).toBe(1800);   // 900 × 2
    expect(out[0].hq).toBe(true);
  });

  it('drops items with profit ≤ 0', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 50, averagePriceHQ: 100, velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 100, averagePriceNQ: 120, listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap, { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('sorts by gilFlow desc and slices to limit', () => {
    const recipe2: Recipe = {
      itemResultId: 2, classJob: 'WVR', recipeLevel: 50,
      ingredients: [{ itemId: 99, amount: 1 }],
    };
    const rm = new Map<number, Recipe | null>([[1, recipe1], [2, recipe2]]);
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, averagePriceHQ: 1500, velocity: 2, listingCount: 1 }),
      2: mkPrice({ minNQ: 5000, averagePriceNQ: 6000, velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, averagePriceNQ: 60, listingCount: 1 }),
    };
    // item 1: profit (1000 - 100) × 2 = 1800
    // item 2: profit (5000 -  50) × 1 = 4950
    const out = runCraftFlip(snapshot, priceMap, rm, { ...baseFilter, minVelocity: 1, limit: 2 });
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
});
