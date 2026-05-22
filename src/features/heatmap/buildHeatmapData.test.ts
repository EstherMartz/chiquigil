import { describe, it, expect } from 'vitest';
import { buildHeatmapCells } from './buildHeatmapData';
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
});
