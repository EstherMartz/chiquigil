import { describe, it, expect } from 'vitest';
import { computeMaterialCost, computeProfit } from './computeProfit';
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

describe('computeProfit', () => {
  it('returns null when no recipe', () => {
    const market = mkMarket({});
    expect(computeProfit({ id: 100 } as never, null, new Map(), market, market, {})).toBeNull();
  });

  it('returns profit = salePrice - materialCost', () => {
    const dcMarket = mkMarket({ 100: { dcMin: 500 }, 1: { dcMin: 50 }, 2: { dcMin: 30 } });
    const phantomMarket = mkMarket({});
    const result = computeProfit(
      { id: 100 } as never,
      recipeA,
      new Map(),
      phantomMarket,
      dcMarket,
      {},
    );
    // material = 50×2 + 30×3 = 190; sale = 500; profit = 310
    expect(result).toEqual({ materialCost: 190, salePrice: 500, profit: 310 });
  });
});
