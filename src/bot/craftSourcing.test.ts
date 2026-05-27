import { describe, it, expect } from 'vitest';
import { buildBreakdown, type SourcingDeps } from './craftSourcing';
import type { CompanyCraftRecipe } from '../lib/companyCraftSnapshot';
import type { MarketBundle } from '../features/watchlist/useMarketData';

function emptyDeps(over: Partial<SourcingDeps> = {}): SourcingDeps {
  return {
    recipes: new Map(),
    namesById: new Map(),
    vendorMap: new Map(),
    specialShop: { byCurrency: new Map() },
    gatheringCatalog: new Map(),
    companyCraft: new Map(),
    ...over,
  };
}

const emptyMarket: MarketBundle = { phantom: {}, dc: {}, region: {} };

describe('buildBreakdown (workshop fallback)', () => {
  it('emits one workshop task + leaves when only companyCraft matches', () => {
    const cc: CompanyCraftRecipe = {
      resultItemId: 31600,
      resultName: 'Tatanora Hull',
      ingredients: [
        { itemId: 5106, qty: 6 },
        { itemId: 5107, qty: 10 },
      ],
    };
    const deps = emptyDeps({
      companyCraft: new Map([[31600, cc]]),
      namesById: new Map([[31600, 'Tatanora Hull'], [5106, 'Iron Ore'], [5107, 'Hardsilver Ore']]),
    });
    const out = buildBreakdown(31600, 1, emptyMarket, deps);
    expect(out.crafts).toHaveLength(1);
    expect(out.crafts[0]).toEqual({
      itemId: 31600,
      itemName: 'Tatanora Hull',
      qtyNeeded: 1,
      source: 'workshop',
      meta: {},
    });
    const acquireIds = out.acquire.map((t) => t.itemId).sort();
    expect(acquireIds).toEqual([5106, 5107]);
  });

  it('multiplies workshop ingredients by targetQty', () => {
    const cc: CompanyCraftRecipe = {
      resultItemId: 100,
      resultName: 'Submarine Panel',
      ingredients: [{ itemId: 50, qty: 3 }],
    };
    const deps = emptyDeps({
      companyCraft: new Map([[100, cc]]),
      namesById: new Map([[100, 'Submarine Panel'], [50, 'Steel']]),
    });
    const out = buildBreakdown(100, 4, emptyMarket, deps);
    expect(out.crafts[0].qtyNeeded).toBe(4);
    expect(out.acquire[0].qtyNeeded).toBe(12); // 3 × 4
  });

  it('prefers recipes over companyCraft when both exist (tie-breaker)', () => {
    const deps = emptyDeps({
      recipes: new Map(),       // populated below
      companyCraft: new Map([[
        7,
        { resultItemId: 7, resultName: 'X', ingredients: [{ itemId: 99, qty: 1 }] } as CompanyCraftRecipe,
      ]]),
      namesById: new Map([[7, 'X']]),
    });
    // Stub a recipe so the standard path wins.
    deps.recipes.set(7, {
      itemResultId: 7,
      ingredients: [],
      classJob: 'CRP',
      recipeLevel: 1,
      stars: 0,
      difficulty: 0,
      quality: 0,
      durability: 0,
      requiredCraftsmanship: 0,
      requiredControl: 0,
      amountResult: 1,
    } as any);
    const out = buildBreakdown(7, 1, emptyMarket, deps);
    expect(out.crafts[0].source).toBe('craft');     // not 'workshop'
  });

  it('returns empty breakdown when neither recipes nor companyCraft match', () => {
    const out = buildBreakdown(999, 1, emptyMarket, emptyDeps());
    expect(out.crafts).toEqual([]);
    expect(out.acquire).toEqual([]);
  });
});
