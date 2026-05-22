import { describe, it, expect } from 'vitest';
import { scoreCraftPool, buildDiversifiedBatch } from './buildBatch';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';

const snapshot: SnapshotItem[] = [
  { id: 1, name: 'Sword',  sc: 1, ui: 1, ilvl: 90, canHq: true },
  { id: 2, name: 'Table',  sc: 2, ui: 2, ilvl: 50, canHq: true },
  { id: 3, name: 'Meal',   sc: 3, ui: 3, ilvl: 50, canHq: true },
  { id: 4, name: 'Shield', sc: 1, ui: 1, ilvl: 80, canHq: true },
  { id: 5, name: 'Chair',  sc: 2, ui: 2, ilvl: 50, canHq: true },
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

const recipeMap = new Map<number, Recipe | null>([
  [1, { itemResultId: 1, classJob: 'BSM', recipeLevel: 90, ingredients: [{ itemId: 99, amount: 1 }] }],
  [2, { itemResultId: 2, classJob: 'CRP', recipeLevel: 50, ingredients: [{ itemId: 99, amount: 1 }] }],
  [3, { itemResultId: 3, classJob: 'CUL', recipeLevel: 50, ingredients: [{ itemId: 99, amount: 1 }] }],
  [4, { itemResultId: 4, classJob: 'BSM', recipeLevel: 80, ingredients: [{ itemId: 99, amount: 2 }] }],
  [5, { itemResultId: 5, classJob: 'CRP', recipeLevel: 50, ingredients: [{ itemId: 99, amount: 1 }] }],
]);

// All items use ingredient 99 priced at 50 NQ.
const basePrices: MarketData = {
  99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8, listingCount: 1 }),
};

function withPrices(items: Record<number, Partial<MarketData[string]>>): MarketData {
  const out: MarketData = { ...basePrices };
  for (const [id, p] of Object.entries(items)) {
    out[Number(id)] = mkPrice(p);
  }
  return out;
}

describe('scoreCraftPool', () => {
  it('returns all profitable items with correct fields', () => {
    const prices = withPrices({
      1: { minHQ: 500, medianHQ: 600, recentSalesHQ: 8, velocity: 2, listingCount: 1 },
      2: { minHQ: 300, medianHQ: 360, recentSalesHQ: 8, velocity: 3, listingCount: 1 },
    });
    const pool = scoreCraftPool(snapshot, prices, recipeMap);
    expect(pool).toHaveLength(2);

    const sword = pool.find((r) => r.id === 1)!;
    expect(sword.materialCost).toBe(50);   // 50 × 1
    expect(sword.salePrice).toBe(500);
    expect(sword.profit).toBe(450);
    expect(sword.velocity).toBe(2);
    expect(sword.gilPerDay).toBe(900);
  });

  it('excludes items with no recipe', () => {
    const snap = [...snapshot, { id: 6, name: 'Orphan', sc: 1, ui: 1, ilvl: 50, canHq: true }];
    const prices = withPrices({
      6: { minHQ: 500, medianHQ: 600, recentSalesHQ: 8, velocity: 1, listingCount: 1 },
    });
    const pool = scoreCraftPool(snap, prices, recipeMap);
    expect(pool.find((r) => r.id === 6)).toBeUndefined();
  });

  it('excludes items with profit <= 0', () => {
    const prices = withPrices({
      1: { minHQ: 30, medianHQ: 40, recentSalesHQ: 8, velocity: 1, listingCount: 1 },
    });
    const pool = scoreCraftPool(snapshot, prices, recipeMap);
    expect(pool.find((r) => r.id === 1)).toBeUndefined();
  });

  it('excludes items with velocity < 0.3', () => {
    const prices = withPrices({
      1: { minHQ: 500, medianHQ: 600, recentSalesHQ: 8, velocity: 0.2, listingCount: 1 },
    });
    const pool = scoreCraftPool(snapshot, prices, recipeMap);
    expect(pool.find((r) => r.id === 1)).toBeUndefined();
  });
});

describe('buildDiversifiedBatch', () => {
  // All 5 items profitable. Sword: 900 gpd, Table: 750, Meal: 450, Shield: 800, Chair: 600
  const allPrices = withPrices({
    1: { minHQ: 500, medianHQ: 600, recentSalesHQ: 8, velocity: 2,   listingCount: 1 },  // profit 450 × 2 = 900 gpd
    2: { minHQ: 300, medianHQ: 360, recentSalesHQ: 8, velocity: 3,   listingCount: 1 },  // profit 250 × 3 = 750 gpd
    3: { minHQ: 200, medianHQ: 240, recentSalesHQ: 8, velocity: 3,   listingCount: 1 },  // profit 150 × 3 = 450 gpd
    4: { minHQ: 500, medianHQ: 600, recentSalesHQ: 8, velocity: 1.6, listingCount: 1 },  // profit 400 × 1.6 = 640 gpd  (sc=1 same as Sword)
    5: { minHQ: 250, medianHQ: 300, recentSalesHQ: 8, velocity: 3,   listingCount: 1 },  // profit 200 × 3 = 600 gpd  (sc=2 same as Table)
  });

  it('picks top item by gilPerDay first', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    const result = buildDiversifiedBatch(pool, { budget: 10000, batchSize: 1 });
    expect(result.items[0].id).toBe(1); // Sword has highest gilPerDay (900)
  });

  it('penalizes same-category items — diversifies across categories', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    const result = buildDiversifiedBatch(pool, { budget: 10000, batchSize: 3 });
    const ids = result.items.map((r) => r.id);
    // Pick 1: Sword (sc=1, 900 gpd). Pick 2: Table (sc=2, 750 gpd) beats Shield (sc=1, 640×0.5=320).
    // Pick 3: Meal (sc=3, 450 gpd) beats Shield (sc=1, 640×0.5=320) and Chair (sc=2, 600×0.5=300).
    expect(ids).toEqual([1, 2, 3]);
  });

  it('respects budget — skips items too expensive for remaining budget', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    // Budget only covers 1 item
    const result = buildDiversifiedBatch(pool, { budget: 60, batchSize: 5 });
    expect(result.items).toHaveLength(1);
    expect(result.budgetRemaining).toBe(10); // 60 - 50
  });

  it('computes summary fields correctly', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    const result = buildDiversifiedBatch(pool, { budget: 10000, batchSize: 2 });
    expect(result.totalCost).toBe(result.items.reduce((s, i) => s + i.materialCost, 0));
    expect(result.expectedRevenue).toBe(
      result.items.reduce((s, i) => s + i.salePrice * Math.min(i.velocity, 1), 0),
    );
    expect(result.expectedProfit).toBe(result.expectedRevenue - result.totalCost);
    expect(result.budgetRemaining).toBe(10000 - result.totalCost);
  });

  it('returns empty batch when no items fit budget', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    const result = buildDiversifiedBatch(pool, { budget: 5, batchSize: 5 });
    expect(result.items).toEqual([]);
    expect(result.totalCost).toBe(0);
    expect(result.budgetRemaining).toBe(5);
  });

  it('returns empty batch when pool is empty', () => {
    const result = buildDiversifiedBatch([], { budget: 10000, batchSize: 5 });
    expect(result.items).toEqual([]);
  });

  it('categoryBreakdown counts items per sc', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    const result = buildDiversifiedBatch(pool, { budget: 10000, batchSize: 5 });
    // 5 items: sc=1 (Sword, Shield), sc=2 (Table, Chair), sc=3 (Meal)
    expect(result.categoryBreakdown[1]).toBe(2);
    expect(result.categoryBreakdown[2]).toBe(2);
    expect(result.categoryBreakdown[3]).toBe(1);
  });
});
