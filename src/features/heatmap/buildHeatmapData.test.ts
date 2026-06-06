import { describe, it, expect } from 'vitest';
import { buildHeatmapCells, CURATED_VIEWS, type HeatmapCell } from './buildHeatmapData';
import type { MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { Recipe } from '../../lib/recipes';

function mkMarket(overrides: Partial<MarketItem> = {}): MarketItem {
  return {
    minNQ: 1000, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: 1000, medianHQ: null,
    recentSalesNQ: 10, recentSalesHQ: 0,
    velocity: 2, lastUploadTime: 0, listingCount: 5,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...overrides,
  };
}

function mkItem(id: number, name: string, sc = 7): SnapshotItem {
  return { id, name, sc, ui: 0, ilvl: 1, canHq: false };
}

describe('buildHeatmapCells', () => {
  it('returns cell with velocity as area', () => {
    const items = [mkItem(100, 'Iron Ore')];
    const market = { '100': mkMarket({ velocity: 5.5 }) };
    const cells = buildHeatmapCells(items, market, new Map());
    expect(cells).toHaveLength(1);
    expect(cells[0].area).toBe(5.5);
    expect(cells[0].name).toBe('Iron Ore');
  });

  it('tags items in specific material subcategories (not just the umbrella id 7)', () => {
    // 48 = Metal, 50 = Cloth — real mats carry these, not the umbrella 7.
    const items = [mkItem(100, 'Iron Ingot', 48), mkItem(101, 'Cotton Cloth', 50)];
    const market = { '100': mkMarket(), '101': mkMarket() };
    const cells = buildHeatmapCells(items, market, new Map());
    expect(cells.every((c) => c.tags.has('material'))).toBe(true);
  });

  it('filters out items with no market data', () => {
    const items = [mkItem(100, 'Iron Ore')];
    const cells = buildHeatmapCells(items, {}, new Map());
    expect(cells).toEqual([]);
  });

  it('filters out items with velocity below threshold', () => {
    const items = [mkItem(100, 'Iron Ore')];
    const market = { '100': mkMarket({ velocity: 0.05 }) };
    const cells = buildHeatmapCells(items, market, new Map());
    expect(cells).toEqual([]);
  });

  it('computes margin for craftable items', () => {
    const items = [mkItem(200, 'Iron Ingot')];
    const market = {
      '200': mkMarket({ medianNQ: 500, velocity: 3 }),
      '100': mkMarket({ minNQ: 100 }),
    };
    const recipes = new Map<number, Recipe>([
      [200, { itemResultId: 200, classJob: 'BSM', recipeLevel: 10, ingredients: [{ itemId: 100, amount: 3 }] }],
    ]);
    const cells = buildHeatmapCells(items, market, recipes);
    expect(cells).toHaveLength(1);
    expect(cells[0].margin).toBeCloseTo(0.4);
    expect(cells[0].craftable).toBe(true);
  });

  it('sets margin to null for non-craftable items', () => {
    const items = [mkItem(100, 'Iron Ore')];
    const market = { '100': mkMarket({ velocity: 2 }) };
    const cells = buildHeatmapCells(items, market, new Map());
    expect(cells[0].margin).toBeNull();
    expect(cells[0].craftable).toBe(false);
  });

  it('handles recipe with missing ingredient prices gracefully', () => {
    const items = [mkItem(200, 'Iron Ingot')];
    const market = {
      '200': mkMarket({ medianNQ: 500, velocity: 3 }),
    };
    const recipes = new Map<number, Recipe>([
      [200, { itemResultId: 200, classJob: 'BSM', recipeLevel: 10, ingredients: [{ itemId: 100, amount: 3 }] }],
    ]);
    const cells = buildHeatmapCells(items, market, recipes);
    expect(cells[0].margin).toBeNull();
  });

  it('classifies craftable items as kind=craft', () => {
    const items = [mkItem(200, 'Iron Ingot')];
    const market = {
      '200': mkMarket({ medianNQ: 500, velocity: 3 }),
      '100': mkMarket({ minNQ: 100 }),
    };
    const recipes = new Map<number, Recipe>([
      [200, { itemResultId: 200, classJob: 'BSM', recipeLevel: 10, ingredients: [{ itemId: 100, amount: 3 }] }],
    ]);
    const cells = buildHeatmapCells(items, market, recipes);
    expect(cells[0].kind).toBe('craft');
  });

  it('classifies vendor-source items as kind=vendor regardless of craftability', () => {
    const items = [mkItem(300, 'Allagan Catalyst')];
    const market = { '300': mkMarket({ velocity: 2 }) };
    const cells = buildHeatmapCells(items, market, new Map(), { vendorIds: new Set([300]) });
    expect(cells[0].kind).toBe('vendor');
  });

  it('classifies gatherable, non-craftable items as kind=gather', () => {
    const items = [mkItem(400, 'Cobalt Ore')];
    const market = { '400': mkMarket({ velocity: 4 }) };
    const cells = buildHeatmapCells(items, market, new Map(), { gatherableIds: new Set([400]) });
    expect(cells[0].kind).toBe('gather');
  });

  it('falls back to kind=flip for items without a source classification', () => {
    const items = [mkItem(500, 'Mystery Item')];
    const market = { '500': mkMarket({ velocity: 1 }) };
    const cells = buildHeatmapCells(items, market, new Map());
    expect(cells[0].kind).toBe('flip');
  });

  it('assigns margin tier S to craftables with margin ≥ 40%', () => {
    const items = [mkItem(200, 'Strong Profit Ingot')];
    const market = {
      '200': mkMarket({ medianNQ: 1000, velocity: 3 }),
      '100': mkMarket({ minNQ: 50 }), // 50 * 3 = 150 cost vs 1000 sale → 85% margin
    };
    const recipes = new Map<number, Recipe>([
      [200, { itemResultId: 200, classJob: 'BSM', recipeLevel: 10, ingredients: [{ itemId: 100, amount: 3 }] }],
    ]);
    const cells = buildHeatmapCells(items, market, recipes);
    expect(cells[0].tier).toBe('S');
  });

  it('assigns tier D to craftables that lose money', () => {
    const items = [mkItem(200, 'Loss Ingot')];
    const market = {
      '200': mkMarket({ medianNQ: 100, velocity: 3 }),
      '100': mkMarket({ minNQ: 200 }), // cost 600 > sale 100 → −500% margin
    };
    const recipes = new Map<number, Recipe>([
      [200, { itemResultId: 200, classJob: 'BSM', recipeLevel: 10, ingredients: [{ itemId: 100, amount: 3 }] }],
    ]);
    const cells = buildHeatmapCells(items, market, recipes);
    expect(cells[0].tier).toBe('D');
  });
});

describe('CURATED_VIEWS hot-crafts preset', () => {
  const hotCrafts = CURATED_VIEWS.find((v) => v.id === 'hot-crafts')!;

  function cell(over: Partial<HeatmapCell>): HeatmapCell {
    return {
      id: 1, name: 'X', area: 1, salePrice: 1000, velocity: 2, margin: 0.5,
      craftable: true, tags: new Set(), kind: 'craft', tier: 'A', ...over,
    };
  }

  it('keeps a profitable, low-velocity craft (vel ≥ 1, not the old ≥ 5 floor)', () => {
    // The previous ≥5/day floor excluded profitable craftables, which on a single
    // home world almost never reach 5 sales/day. A 2/day, 50%-margin craft is a
    // textbook "hot craft" and must survive.
    const out = hotCrafts.apply([cell({ velocity: 2, margin: 0.5 })]);
    expect(out).toHaveLength(1);
  });

  it('drops crafts below the 20% margin floor', () => {
    expect(hotCrafts.apply([cell({ velocity: 5, margin: 0.1 })])).toEqual([]);
  });

  it('drops crafts that barely move (velocity < 1/day)', () => {
    expect(hotCrafts.apply([cell({ velocity: 0.5, margin: 0.8 })])).toEqual([]);
  });

  it('drops non-craft kinds even when margin/velocity qualify', () => {
    expect(hotCrafts.apply([cell({ kind: 'vendor', velocity: 9, margin: 0.9 })])).toEqual([]);
  });
});
