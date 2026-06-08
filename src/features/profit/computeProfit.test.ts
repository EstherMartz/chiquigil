import { describe, it, expect } from 'vitest';
import { computeMaterialCost, computeMaterialLeaves, computeProfit } from './computeProfit';
import type { Recipe } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';

function mkMarket(prices: Record<number, { dcMin?: number; pAvgNQ?: number }>): MarketData {
  const out: MarketData = {};
  for (const [id, p] of Object.entries(prices)) {
    out[id] = {
      minNQ: p.dcMin ?? null,
      minHQ: null,
      avgNQ: p.pAvgNQ ?? null,
      avgHQ: null,
      medianNQ: null,
      medianHQ: null,
      recentSalesNQ: 0,
      recentSalesHQ: 0,
      velocity: 0,
      lastUploadTime: 0,
      listingCount: p.dcMin != null ? 1 : 0,
      worldListings: [],
      averagePriceNQ: null,
      averagePriceHQ: null,
    };
  }
  return out;
}

const recipeA: Recipe = {
  itemResultId: 100,
  classJob: 'LTW',
  recipeLevel: 100,
  ingredients: [
    { itemId: 1, amount: 2 },
    { itemId: 2, amount: 3 },
  ],
};

describe('computeMaterialCost', () => {
  it('sums DC NQ min × amount per ingredient (default: buy intermediates)', () => {
    const market = mkMarket({ 1: { dcMin: 50 }, 2: { dcMin: 30 } });
    expect(computeMaterialCost(recipeA, new Map(), market, {})).toBe(50 * 2 + 30 * 3);
  });

  it('falls back to Phantom NQ avg when DC has no listing', () => {
    const dc = mkMarket({ 2: { dcMin: 30 } });
    const phantom = mkMarket({ 1: { pAvgNQ: 60 } });
    expect(computeMaterialCost(recipeA, new Map(), dc, {}, phantom)).toBe(60 * 2 + 30 * 3);
  });

  it('returns 0 for an ingredient with no market data at all', () => {
    const market = mkMarket({ 2: { dcMin: 30 } });
    expect(computeMaterialCost(recipeA, new Map(), market, {})).toBe(0 * 2 + 30 * 3);
  });

  it('recurses one level when craftIntermediates is set AND a recipe exists for the intermediate', () => {
    const recipeB: Recipe = {
      itemResultId: 1, classJob: 'LTW', recipeLevel: 50,
      ingredients: [{ itemId: 10, amount: 4 }, { itemId: 11, amount: 1 }],
    };
    const recipeMap = new Map<number, Recipe | null>([[1, recipeB]]);
    const market = mkMarket({
      1: { dcMin: 100 },
      10: { dcMin: 5 }, 11: { dcMin: 8 },
      2: { dcMin: 30 },
    });
    const flags = { 1: { craftIntermediates: true } };
    // recipe A: 2 × (cost of crafting 1) + 3 × 30 = 2 × (4×5 + 1×8) + 90 = 2 × 28 + 90 = 146
    expect(computeMaterialCost(recipeA, recipeMap, market, flags)).toBe(146);
  });

  it('does NOT recurse beyond one level (Phase 2 cap)', () => {
    const recipeB: Recipe = {
      itemResultId: 1, classJob: 'LTW', recipeLevel: 50,
      ingredients: [{ itemId: 10, amount: 4 }],
    };
    const recipeC: Recipe = {
      itemResultId: 10, classJob: 'CRP', recipeLevel: 30,
      ingredients: [{ itemId: 100, amount: 1 }],
    };
    const recipeMap = new Map<number, Recipe | null>([[1, recipeB], [10, recipeC]]);
    const market = mkMarket({ 10: { dcMin: 5 }, 100: { dcMin: 1 }, 2: { dcMin: 30 } });
    const flags = { 1: { craftIntermediates: true }, 10: { craftIntermediates: true } };
    // recipe A: 2 × (4 × market(10) = 4×5 = 20) + 3 × 30 = 40 + 90 = 130
    expect(computeMaterialCost(recipeA, recipeMap, market, flags)).toBe(130);
  });
});

describe('computeMaterialLeaves', () => {
  it('returns one leaf per direct ingredient and sums to computeMaterialCost', () => {
    const recipe: Recipe = {
      itemResultId: 1, classJob: 'LTW', recipeLevel: 90,
      ingredients: [{ itemId: 99, amount: 2 }, { itemId: 88, amount: 3 }],
    };
    const market = mkMarket({ 99: { dcMin: 50 }, 88: { dcMin: 10 } });
    const recipeMap = new Map<number, Recipe | null>([[1, recipe]]);

    const leaves = computeMaterialLeaves(recipe, recipeMap, market, {});
    expect(leaves).toEqual([
      { itemId: 99, qty: 2, unitPrice: 50 },
      { itemId: 88, qty: 3, unitPrice: 10 },
    ]);
    const sum = leaves.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    expect(sum).toBe(computeMaterialCost(recipe, recipeMap, market, {}));
    expect(sum).toBe(130); // 2*50 + 3*10
  });

  it('decomposes a crafted intermediate when craftIntermediates flag is set, multiplying qty through', () => {
    const parent: Recipe = {
      itemResultId: 1, classJob: 'WVR', recipeLevel: 90,
      ingredients: [{ itemId: 5, amount: 2 }], // 2× intermediate
    };
    const intermediate: Recipe = {
      itemResultId: 5, classJob: 'WVR', recipeLevel: 50,
      ingredients: [{ itemId: 99, amount: 3 }], // each needs 3× raw
    };
    const market = mkMarket({ 5: { dcMin: 1000 }, 99: { dcMin: 10 } });
    const recipeMap = new Map<number, Recipe | null>([[1, parent], [5, intermediate]]);

    expect(computeMaterialLeaves(parent, recipeMap, market, {})).toEqual([
      { itemId: 5, qty: 2, unitPrice: 1000 },
    ]);

    const leaves = computeMaterialLeaves(parent, recipeMap, market, { 5: { craftIntermediates: true } });
    expect(leaves).toEqual([{ itemId: 99, qty: 6, unitPrice: 10 }]);
    expect(leaves.reduce((s, l) => s + l.qty * l.unitPrice, 0)).toBe(60);
  });
});

describe('computeProfit', () => {
  it('returns null when no recipe', () => {
    const market = mkMarket({});
    expect(computeProfit({ id: 100 } as never, null, new Map(), market, market, {})).toBeNull();
  });

  it('nets the 5% marketboard tax out of profit by default', () => {
    const dcMarket = mkMarket({ 100: { dcMin: 500 }, 1: { dcMin: 50 }, 2: { dcMin: 30 } });
    const phantomMarket = mkMarket({});
    const result = computeProfit({ id: 100 } as never, recipeA, new Map(), phantomMarket, dcMarket, {});
    // material = 50×2 + 30×3 = 190; sale = 500; net sale = 475; profit = 285
    expect(result).toEqual({ materialCost: 190, salePrice: 500, netSalePrice: 475, profit: 285 });
  });

  it('returns gross profit = salePrice - materialCost when tax is disabled', () => {
    const dcMarket = mkMarket({ 100: { dcMin: 500 }, 1: { dcMin: 50 }, 2: { dcMin: 30 } });
    const phantomMarket = mkMarket({});
    const result = computeProfit({ id: 100 } as never, recipeA, new Map(), phantomMarket, dcMarket, {}, false);
    // material = 190; sale = 500; profit = 310 (no tax)
    expect(result).toEqual({ materialCost: 190, salePrice: 500, netSalePrice: 500, profit: 310 });
  });
});
