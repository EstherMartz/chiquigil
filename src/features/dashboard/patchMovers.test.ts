import { describe, it, expect } from 'vitest';
import { selectPatchMovers } from './patchMovers';
import type { Recipe } from '../../lib/recipes';
import type { MarketItem, MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { CrafterLevels } from '../items/craftStatus';

// Test helper: build a minimal MarketItem with velocity and price fields
function mkMarket(velocity: number, overrides?: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null,
    minHQ: null,
    avgNQ: null,
    avgHQ: null,
    medianNQ: null,
    medianHQ: null,
    recentSalesNQ: 0,
    recentSalesHQ: 0,
    velocity,
    lastUploadTime: 0,
    listingCount: 0,
    worldListings: [],
    averagePriceNQ: null,
    averagePriceHQ: null,
    ...overrides,
  };
}

// Typical crafter levels for testing
const levels: CrafterLevels = {
  CRP: 90,
  BSM: 85,
  ARM: 80,
  GSM: 75,
  LTW: 90,
  WVR: 85,
  ALC: 80,
  CUL: 95,
};

describe('selectPatchMovers', () => {
  it('excludes non-craftable items (no recipe)', () => {
    const ids = [100];
    const items = new Map<number, SnapshotItem>([
      [100, { id: 100, name: 'No Recipe Item', sc: 1, ui: 0, ilvl: 1, canHq: false }],
    ]);
    const recipes = new Map<number, Recipe>(); // empty
    const market: MarketData = { '100': mkMarket(2.0) };

    const movers = selectPatchMovers(ids, items, recipes, levels, market);
    expect(movers).toHaveLength(0);
  });

  it('excludes under-leveled recipes', () => {
    const ids = [200];
    const items = new Map<number, SnapshotItem>([
      [200, { id: 200, name: 'High-level Item', sc: 1, ui: 0, ilvl: 1, canHq: false }],
    ]);
    const recipes = new Map<number, Recipe>([
      [200, { itemResultId: 200, classJob: 'BSM', recipeLevel: 95, ingredients: [] }],
    ]);
    // user is BSM 85, recipe is 95 => too high
    const market: MarketData = { '200': mkMarket(2.0) };

    const movers = selectPatchMovers(ids, items, recipes, levels, market);
    expect(movers).toHaveLength(0);
  });

  it('excludes items below velocity threshold', () => {
    const ids = [300, 301];
    const items = new Map<number, SnapshotItem>([
      [300, { id: 300, name: 'Low Velocity Item', sc: 1, ui: 0, ilvl: 1, canHq: false }],
      [301, { id: 301, name: 'Threshold Item', sc: 1, ui: 0, ilvl: 1, canHq: false }],
    ]);
    const recipes = new Map<number, Recipe>([
      [300, { itemResultId: 300, classJob: 'CRP', recipeLevel: 90, ingredients: [] }],
      [301, { itemResultId: 301, classJob: 'CRP', recipeLevel: 90, ingredients: [] }],
    ]);
    const market: MarketData = {
      '300': mkMarket(0.3), // below threshold (0.5)
      '301': mkMarket(0.5), // exactly at threshold
    };

    const movers = selectPatchMovers(ids, items, recipes, levels, market);
    expect(movers).toHaveLength(1);
    expect(movers[0].id).toBe(301);
    expect(movers[0].velocity).toBe(0.5);
  });

  it('includes items at or above velocity threshold', () => {
    const ids = [400, 401];
    const items = new Map<number, SnapshotItem>([
      [400, { id: 400, name: 'Normal Mover', sc: 1, ui: 0, ilvl: 1, canHq: false }],
      [401, { id: 401, name: 'High Mover', sc: 1, ui: 0, ilvl: 1, canHq: false }],
    ]);
    const recipes = new Map<number, Recipe>([
      [400, { itemResultId: 400, classJob: 'LTW', recipeLevel: 85, ingredients: [] }],
      [401, { itemResultId: 401, classJob: 'LTW', recipeLevel: 80, ingredients: [] }],
    ]);
    const market: MarketData = {
      '400': mkMarket(0.5),
      '401': mkMarket(2.1),
    };

    const movers = selectPatchMovers(ids, items, recipes, levels, market);
    expect(movers).toHaveLength(2);
    expect(movers[0].id).toBe(401);
    expect(movers[1].id).toBe(400);
  });

  it('sorts by velocity descending, then id ascending', () => {
    const ids = [500, 501, 502];
    const items = new Map<number, SnapshotItem>([
      [500, { id: 500, name: 'Item A', sc: 1, ui: 0, ilvl: 1, canHq: false }],
      [501, { id: 501, name: 'Item B', sc: 1, ui: 0, ilvl: 1, canHq: false }],
      [502, { id: 502, name: 'Item C', sc: 1, ui: 0, ilvl: 1, canHq: false }],
    ]);
    const recipes = new Map<number, Recipe>([
      [500, { itemResultId: 500, classJob: 'CUL', recipeLevel: 90, ingredients: [] }],
      [501, { itemResultId: 501, classJob: 'CUL', recipeLevel: 90, ingredients: [] }],
      [502, { itemResultId: 502, classJob: 'CUL', recipeLevel: 90, ingredients: [] }],
    ]);
    const market: MarketData = {
      '500': mkMarket(1.0),
      '501': mkMarket(3.0),
      '502': mkMarket(3.0), // same as 501, should sort by id
    };

    const movers = selectPatchMovers(ids, items, recipes, levels, market);
    expect(movers).toHaveLength(3);
    expect(movers[0].id).toBe(501); // v=3.0, id=501
    expect(movers[1].id).toBe(502); // v=3.0, id=502 (higher id)
    expect(movers[2].id).toBe(500); // v=1.0
  });

  it('picks price: medianHQ > medianNQ > minHQ > minNQ > averagePriceHQ > averagePriceNQ > null', () => {
    const items = new Map<number, SnapshotItem>();
    const recipes = new Map<number, Recipe>();
    const market: MarketData = {};

    for (let i = 0; i < 7; i++) {
      const id = 600 + i;
      items.set(id, { id, name: `Item ${i}`, sc: 1, ui: 0, ilvl: 1, canHq: false });
      recipes.set(id, { itemResultId: id, classJob: 'CRP', recipeLevel: 80, ingredients: [] });
    }

    // Test each fallthrough case
    market['600'] = mkMarket(1.0, { medianHQ: 5000 });
    expect(selectPatchMovers([600], items, recipes, levels, market)[0].price).toBe(5000);

    market['601'] = mkMarket(1.0, { medianNQ: 4000 });
    expect(selectPatchMovers([601], items, recipes, levels, market)[0].price).toBe(4000);

    market['602'] = mkMarket(1.0, { minHQ: 3000 });
    expect(selectPatchMovers([602], items, recipes, levels, market)[0].price).toBe(3000);

    market['603'] = mkMarket(1.0, { minNQ: 2000 });
    expect(selectPatchMovers([603], items, recipes, levels, market)[0].price).toBe(2000);

    market['604'] = mkMarket(1.0, { averagePriceHQ: 1500 });
    expect(selectPatchMovers([604], items, recipes, levels, market)[0].price).toBe(1500);

    market['605'] = mkMarket(1.0, { averagePriceNQ: 1000 });
    expect(selectPatchMovers([605], items, recipes, levels, market)[0].price).toBe(1000);

    market['606'] = mkMarket(1.0);
    expect(selectPatchMovers([606], items, recipes, levels, market)[0].price).toBeNull();
  });

  it('rounds prices to nearest integer', () => {
    const ids = [700];
    const items = new Map<number, SnapshotItem>([
      [700, { id: 700, name: 'Decimal Price', sc: 1, ui: 0, ilvl: 1, canHq: false }],
    ]);
    const recipes = new Map<number, Recipe>([
      [700, { itemResultId: 700, classJob: 'ALC', recipeLevel: 75, ingredients: [] }],
    ]);
    const market: MarketData = {
      '700': mkMarket(1.0, { medianHQ: 1234.5 }),
    };

    const movers = selectPatchMovers(ids, items, recipes, levels, market);
    expect(movers[0].price).toBe(1235); // rounded up
  });

  it('skips items missing from itemsById', () => {
    const ids = [800, 801];
    const items = new Map<number, SnapshotItem>([
      [801, { id: 801, name: 'Present Item', sc: 1, ui: 0, ilvl: 1, canHq: false }],
    ]);
    const recipes = new Map<number, Recipe>([
      [800, { itemResultId: 800, classJob: 'GSM', recipeLevel: 70, ingredients: [] }],
      [801, { itemResultId: 801, classJob: 'GSM', recipeLevel: 70, ingredients: [] }],
    ]);
    const market: MarketData = {
      '800': mkMarket(2.0),
      '801': mkMarket(2.0),
    };

    const movers = selectPatchMovers(ids, items, recipes, levels, market);
    expect(movers).toHaveLength(1);
    expect(movers[0].id).toBe(801);
  });

  it('includes PatchMover fields correctly', () => {
    const ids = [900];
    const items = new Map<number, SnapshotItem>([
      [900, { id: 900, name: 'Test Item', sc: 1, ui: 0, ilvl: 1, canHq: false }],
    ]);
    const recipes = new Map<number, Recipe>([
      [900, { itemResultId: 900, classJob: 'ARM', recipeLevel: 77, ingredients: [] }],
    ]);
    const market: MarketData = {
      '900': mkMarket(1.5, { medianHQ: 2500 }),
    };

    const movers = selectPatchMovers(ids, items, recipes, levels, market);
    expect(movers).toHaveLength(1);
    const mover = movers[0];
    expect(mover.id).toBe(900);
    expect(mover.name).toBe('Test Item');
    expect(mover.velocity).toBe(1.5);
    expect(mover.price).toBe(2500);
    expect(mover.crafter).toBe('ARM');
    expect(mover.recipeLevel).toBe(77);
  });

  it('handles empty inputs gracefully', () => {
    const items = new Map<number, SnapshotItem>();
    const recipes = new Map<number, Recipe>();
    const market: MarketData = {};

    const movers = selectPatchMovers([], items, recipes, levels, market);
    expect(movers).toHaveLength(0);
  });
});
