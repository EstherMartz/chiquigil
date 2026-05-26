import { describe, it, expect } from 'vitest';
import { buildBreakdown, type SourcingDeps } from './sourcing';
import type { Recipe } from '../../../src/lib/recipes';
import type { MarketBundle } from '../../../src/features/watchlist/useMarketData';
import type { SpecialShopSnapshot, ShopEntry } from '../../../src/lib/specialShopSnapshot';
import type { GatheringInfo } from '../../../src/lib/gatheringCatalog';

function makeRecipe(id: number, job: string, ings: { itemId: number; amount: number }[], amountResult = 1): Recipe {
  return { itemResultId: id, classJob: job as any, recipeLevel: 1, ingredients: ings, amountResult };
}

function makeDeps(overrides: Partial<SourcingDeps> = {}): SourcingDeps {
  return {
    recipes: overrides.recipes ?? new Map(),
    namesById: overrides.namesById ?? new Map(),
    vendorMap: overrides.vendorMap ?? new Map(),
    specialShop: overrides.specialShop ?? { byCurrency: new Map() },
    gatheringCatalog: overrides.gatheringCatalog ?? new Map(),
  };
}

function emptyMarket(): MarketBundle {
  return { phantom: {}, dc: {}, region: {} };
}

describe('buildBreakdown', () => {
  it('produces craft tasks for intermediates and leaf tasks for raw mats', () => {
    const recipes = new Map<number, Recipe>();
    recipes.set(100, makeRecipe(100, 'ALC', [{ itemId: 1, amount: 2 }]));
    const names = new Map([[100, 'Potion'], [1, 'Water']]);

    const result = buildBreakdown(100, 5, emptyMarket(), makeDeps({ recipes, namesById: names }));

    expect(result.crafts.length).toBe(1);
    expect(result.crafts[0].source).toBe('craft');
    expect(result.crafts[0].meta.job).toBe('ALC');
    expect(result.acquire.length).toBe(1);
    expect(result.acquire[0].itemName).toBe('Water');
    expect(result.acquire[0].qtyNeeded).toBe(10);
  });

  it('tags gatherable items as gather source', () => {
    const recipes = new Map<number, Recipe>();
    recipes.set(100, makeRecipe(100, 'BSM', [{ itemId: 1, amount: 3 }]));
    const names = new Map([[100, 'Iron Ingot'], [1, 'Iron Ore']]);
    const gathering = new Map<number, GatheringInfo>([[1, { level: 25, timed: false, hidden: false }]]);

    const result = buildBreakdown(100, 2, emptyMarket(), makeDeps({ recipes, namesById: names, gatheringCatalog: gathering }));

    const ore = result.acquire.find(t => t.itemId === 1)!;
    expect(ore.source).toBe('gather');
    expect(ore.meta.gatherLevel).toBe(25);
  });

  it('prefers cheap vendor over gathering', () => {
    const recipes = new Map<number, Recipe>();
    recipes.set(100, makeRecipe(100, 'BSM', [{ itemId: 1, amount: 3 }]));
    const names = new Map([[100, 'Iron Ingot'], [1, 'Iron Ore']]);
    const gathering = new Map<number, GatheringInfo>([[1, { level: 25, timed: false, hidden: false }]]);
    // Vendor price under threshold (default 100)
    const vendorMap = new Map([[1, 50]]);

    const market = emptyMarket();
    // Need a listing so autoSource = 'npc' when vendor is cheaper
    market.dc = { 1: { worldListings: [{ world: 'Phantom', price: 200, hq: false, qty: 99 }], listingCount: 1, sellCount: 5, sellPerDay: 2, averageSalePrice: 200 } as any };

    const result = buildBreakdown(100, 2, market, makeDeps({ recipes, namesById: names, gatheringCatalog: gathering, vendorMap }));

    const ore = result.acquire.find(t => t.itemId === 1)!;
    expect(ore.source).toBe('vendor');
    expect(ore.meta.price).toBe(50);
  });

  it('tags currency items correctly', () => {
    const recipes = new Map<number, Recipe>();
    recipes.set(100, makeRecipe(100, 'ALC', [{ itemId: 1, amount: 2 }]));
    const names = new Map([[100, 'Potion'], [1, 'Reagent']]);
    const shopEntries: ShopEntry[] = [{ itemId: 1, receiveQty: 1, costPerUnit: 20, isHq: false }];
    const specialShop: SpecialShopSnapshot = { byCurrency: new Map([['poetics', shopEntries]]) };

    const result = buildBreakdown(100, 1, emptyMarket(), makeDeps({ recipes, namesById: names, specialShop }));

    const reagent = result.acquire.find(t => t.itemId === 1)!;
    expect(reagent.source).toBe('currency');
    expect(reagent.meta.currency).toBe('Poetics');
    expect(reagent.meta.costPerUnit).toBe(20);
  });

  it('prefers currency over gathering when available', () => {
    const recipes = new Map<number, Recipe>();
    recipes.set(100, makeRecipe(100, 'ALC', [{ itemId: 1, amount: 2 }]));
    const names = new Map([[100, 'Potion'], [1, 'Reagent']]);
    const gathering = new Map<number, GatheringInfo>([[1, { level: 10, timed: false, hidden: false }]]);
    const shopEntries: ShopEntry[] = [{ itemId: 1, receiveQty: 1, costPerUnit: 5, isHq: false }];
    const specialShop: SpecialShopSnapshot = { byCurrency: new Map([['poetics', shopEntries]]) };

    const result = buildBreakdown(100, 1, emptyMarket(), makeDeps({
      recipes, namesById: names, gatheringCatalog: gathering, specialShop,
    }));

    // Currency takes priority when gatherable + currency both available
    const reagent = result.acquire.find(t => t.itemId === 1)!;
    expect(reagent.source).toBe('currency');
  });

  it('falls back to market when no other source', () => {
    const recipes = new Map<number, Recipe>();
    recipes.set(100, makeRecipe(100, 'ALC', [{ itemId: 1, amount: 2 }]));
    const names = new Map([[100, 'Potion'], [1, 'Reagent']]);

    const result = buildBreakdown(100, 1, emptyMarket(), makeDeps({ recipes, namesById: names }));

    const reagent = result.acquire.find(t => t.itemId === 1)!;
    expect(reagent.source).toBe('market');
  });

  it('passes craftIntermediates=false through to explode', () => {
    const recipes = new Map<number, Recipe>();
    recipes.set(100, makeRecipe(100, 'ALC', [{ itemId: 50, amount: 2 }]));
    recipes.set(50, makeRecipe(50, 'BSM', [{ itemId: 1, amount: 3 }]));
    const names = new Map([[100, 'Potion'], [50, 'Base'], [1, 'Ore']]);

    const result = buildBreakdown(100, 1, emptyMarket(), makeDeps({ recipes, namesById: names }), { craftIntermediates: false });

    // Only target is crafted, intermediate becomes acquire
    expect(result.crafts.length).toBe(1);
    expect(result.crafts[0].itemId).toBe(100);
    const base = result.acquire.find(t => t.itemId === 50)!;
    expect(base).toBeDefined();
    expect(base.source).toBe('market');
  });
});
