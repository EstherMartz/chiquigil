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
      parts: [{
        name: 'Hull',
        ingredients: [
          { itemId: 5106, qty: 6 },
          { itemId: 5107, qty: 10 },
        ],
      }],
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
    // Single-part item: tasks should NOT carry a partKey.
    expect(out.acquire.every((t) => t.meta.partKey === undefined)).toBe(true);
  });

  it('multiplies workshop ingredients by targetQty', () => {
    const cc: CompanyCraftRecipe = {
      resultItemId: 100,
      resultName: 'Submarine Panel',
      parts: [{ name: 'Hull', ingredients: [{ itemId: 50, qty: 3 }] }],
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
        { resultItemId: 7, resultName: 'X', parts: [{ name: 'Body', ingredients: [{ itemId: 99, qty: 1 }] }] } as CompanyCraftRecipe,
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

  it('explodes craftable workshop ingredients so their gatherable leaves surface', () => {
    // Wall (workshop) needs 2× Ingot. Ingot has a recipe → 1× Ore + 1× Coal.
    // Ore is gatherable. With craftIntermediates default (true), the Ingot
    // should appear as a CRAFTEAR step and the Ore should show in RECOLECTAR.
    const cc: CompanyCraftRecipe = {
      resultItemId: 200,
      resultName: 'Stone Wall',
      parts: [{ name: 'Wall', ingredients: [{ itemId: 100, qty: 2 }] }], // 2× Ingot
    };
    const deps = emptyDeps({
      companyCraft: new Map([[200, cc]]),
      namesById: new Map([
        [200, 'Stone Wall'],
        [100, 'Ingot'],
        [10, 'Ore'],
        [11, 'Coal'],
      ]),
      recipes: new Map([[
        100,
        {
          itemResultId: 100,
          ingredients: [{ itemId: 10, amount: 1 }, { itemId: 11, amount: 1 }],
          classJob: 'BSM',
          amountResult: 1,
        } as any,
      ]]),
      gatheringCatalog: new Map([[10, { level: 50, timed: false } as any]]),
    });
    const out = buildBreakdown(200, 1, emptyMarket, deps);

    // Workshop task plus one CRAFTEAR step (Ingot).
    expect(out.crafts).toHaveLength(2);
    expect(out.crafts[0].source).toBe('workshop');
    expect(out.crafts[1]).toMatchObject({ itemId: 100, source: 'craft', qtyNeeded: 2 });

    // Leaves: Ore (gather) + Coal (market — no gathering catalog entry).
    const ore = out.acquire.find((t) => t.itemId === 10);
    const coal = out.acquire.find((t) => t.itemId === 11);
    expect(ore?.source).toBe('gather');
    expect(coal?.source).toBe('market');
  });

  it('keeps workshop ingredients as flat leaves when craftIntermediates is false', () => {
    const cc: CompanyCraftRecipe = {
      resultItemId: 200,
      resultName: 'Stone Wall',
      parts: [{ name: 'Wall', ingredients: [{ itemId: 100, qty: 2 }] }],
    };
    const deps = emptyDeps({
      companyCraft: new Map([[200, cc]]),
      namesById: new Map([[200, 'Stone Wall'], [100, 'Ingot']]),
      recipes: new Map([[
        100,
        { itemResultId: 100, ingredients: [], classJob: 'BSM', amountResult: 1 } as any,
      ]]),
    });
    const out = buildBreakdown(200, 1, emptyMarket, deps, { craftIntermediates: false });
    expect(out.crafts).toHaveLength(1); // only the workshop task
    expect(out.acquire[0]).toMatchObject({ itemId: 100, qtyNeeded: 2 });
  });

  it('tags craft + acquire tasks with meta.partKey when CompanyCraft has multiple parts', () => {
    // Sub with Hull + Stern. Each part has unique ingredients so we can tell them apart.
    const cc: CompanyCraftRecipe = {
      resultItemId: 500,
      resultName: 'Tatanora',
      parts: [
        { name: 'Hull', ingredients: [{ itemId: 10, qty: 6 }] },
        { name: 'Stern', ingredients: [{ itemId: 20, qty: 4 }] },
      ],
    };
    const deps = emptyDeps({
      companyCraft: new Map([[500, cc]]),
      namesById: new Map([[500, 'Tatanora'], [10, 'Mythril Ore'], [20, 'Cotton Yarn']]),
      gatheringCatalog: new Map([[10, { level: 50, timed: false } as any]]),
    });
    const out = buildBreakdown(500, 1, emptyMarket, deps);

    // Workshop task: still ONE total, no partKey.
    const workshop = out.crafts.find((t) => t.source === 'workshop');
    expect(workshop).toBeDefined();
    expect(workshop?.meta.partKey).toBeUndefined();

    // Each acquire task carries its part's name.
    const ore = out.acquire.find((t) => t.itemId === 10);
    const yarn = out.acquire.find((t) => t.itemId === 20);
    expect(ore?.meta.partKey).toBe('Hull');
    expect(yarn?.meta.partKey).toBe('Stern');
  });
});
