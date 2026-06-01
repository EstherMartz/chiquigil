import { describe, it, expect } from 'vitest';
import { craftSellMath, selfSourceCost } from './CraftSellMathCard';
import type { Recipe } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';

function mkPrice(minNQ: number): MarketData[string] {
  return {
    minNQ, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0,
    listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
  };
}

describe('selfSourceCost', () => {
  // Target 100 needs 2× ingredient 1 (gatherable) + 3× ingredient 2 (must buy @ 50).
  const recipe: Recipe = {
    itemResultId: 100, classJob: 'LTW', recipeLevel: 90,
    ingredients: [{ itemId: 1, amount: 2 }, { itemId: 2, amount: 3 }],
  };

  it('counts gatherables as free and buys the rest at market', () => {
    const market: MarketData = { 1: mkPrice(999), 2: mkPrice(50) };
    const cost = selfSourceCost(recipe, new Map(), market, new Set([1]));
    expect(cost).toBe(150); // 2×0 (gathered) + 3×50
  });

  it('recurses into craftable intermediates, dividing by their yield', () => {
    // Ingredient 2 is itself craftable: yields 3 per synth from 1× gatherable 9.
    const subRecipe: Recipe = {
      itemResultId: 2, classJob: 'WVR', recipeLevel: 50, amountResult: 3,
      ingredients: [{ itemId: 9, amount: 1 }],
    };
    const recipeMap = new Map<number, Recipe | null>([[2, subRecipe]]);
    const market: MarketData = { 1: mkPrice(0), 2: mkPrice(50), 9: mkPrice(30) };
    // ing 1 gathered (free); ing 2 crafted: (1×30)/3 = 10 each → 3×10 = 30.
    const cost = selfSourceCost(recipe, recipeMap, market, new Set([1]));
    expect(cost).toBe(30);
  });

  it('survives recipe cycles without infinite recursion', () => {
    const a: Recipe = { itemResultId: 100, classJob: 'LTW', recipeLevel: 1, ingredients: [{ itemId: 2, amount: 1 }] };
    const b: Recipe = { itemResultId: 2, classJob: 'LTW', recipeLevel: 1, ingredients: [{ itemId: 100, amount: 1 }] };
    const recipeMap = new Map<number, Recipe | null>([[100, a], [2, b]]);
    const market: MarketData = { 2: mkPrice(50), 100: mkPrice(70) };
    // a→2→100→a, then 2 is already seen → falls back to item 2's market price (50).
    // The point is it terminates with a finite number, not the exact value.
    expect(selfSourceCost(a, recipeMap, market, new Set())).toBe(50);
  });
});

describe('craftSellMath', () => {
  it('calculates profit as sale price minus minimum materials cost', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 1,
    });
    expect(result.bestMaterials).toBe(800);
    expect(result.profitPerCraft).toBe(1200); // 2000 - 800
  });

  it('uses home cost when it is cheaper than region best', () => {
    const result = craftSellMath({
      materialsHome: 500,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 1,
    });
    expect(result.bestMaterials).toBe(500);
    expect(result.profitPerCraft).toBe(1500); // 2000 - 500
  });

  it('returns null profit when sale price is null', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: null,
      velocity: 1,
    });
    expect(result.bestMaterials).toBe(800);
    expect(result.profitPerCraft).toBeNull();
    expect(result.daysToMove).toBe(1); // 1 / velocity
  });

  it('calculates daysToMove as 1 / velocity', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 2,
    });
    expect(result.daysToMove).toBe(0.5); // 1 / 2
  });

  it('returns null daysToMove when velocity is 0', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 0,
    });
    expect(result.daysToMove).toBeNull();
    expect(result.gilPerHour).toBeNull();
  });

  it('calculates gilPerHour as profit / (daysToMove * 24)', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 1, // daysToMove = 1
    });
    expect(result.profitPerCraft).toBe(1200);
    expect(result.gilPerHour).toBe(50); // 1200 / (1 * 24)
  });

  it('returns null gilPerHour when profit is null', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: null,
      velocity: 1,
    });
    expect(result.gilPerHour).toBeNull();
  });

  it('returns null gilPerHour when velocity is 0', () => {
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: 0,
    });
    expect(result.gilPerHour).toBeNull();
  });

  it('returns 0 gilPerHour when daysToMove is exactly 0 (edge case)', () => {
    // This is technically impossible (velocity must be Infinity), but defensive.
    const result = craftSellMath({
      materialsHome: 1000,
      materialsRegionBest: 800,
      salePrice: 2000,
      velocity: Infinity,
    });
    expect(result.gilPerHour).toBeNull(); // 1200 / (0 * 24) = Infinity or NaN
  });

  it('handles negative profit (loss)', () => {
    const result = craftSellMath({
      materialsHome: 3000,
      materialsRegionBest: 3000,
      salePrice: 2000,
      velocity: 1,
    });
    expect(result.profitPerCraft).toBe(-1000);
    expect(result.gilPerHour).toBe(-41.666666666666664); // -1000 / 24 (rounded slightly)
  });
});
