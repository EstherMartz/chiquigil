import { describe, it, expect } from 'vitest';
import { rankSuggestions } from './suggestions';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';

// Three Materia (sc 57): A = best gil/day, B = lower, plus a no-recipe item.
const snapshot: SnapshotItem[] = [
  { id: 1, name: 'Materia A', sc: 57, ui: 0, ilvl: 100, canHq: false },
  { id: 2, name: 'Materia B', sc: 57, ui: 0, ilvl: 100, canHq: false },
  { id: 3, name: 'Off-cat', sc: 99, ui: 0, ilvl: 100, canHq: false }, // not Materia
];

function mkPrice(p: Partial<MarketData[string]>): MarketData[string] {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null, recentSalesNQ: 5, recentSalesHQ: 0,
    velocity: 0, lastUploadTime: Date.now(), listingCount: 1,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...p,
  };
}

// Ingredient 99 costs 100 NQ. A sells 1000 @ 5/day → profit 800 × 5 = 4000/day.
// B sells 600 @ 2/day → profit 400 × 2 = 800/day.
const market: MarketData = {
  1: mkPrice({ minNQ: 1000, medianNQ: 1000, velocity: 5 }),
  2: mkPrice({ minNQ: 600, medianNQ: 600, velocity: 2 }),
  99: mkPrice({ minNQ: 100, medianNQ: 100, velocity: 0 }),
};

const recipes = new Map<number, Recipe | null>([
  [1, { itemResultId: 1, classJob: 'ALC', recipeLevel: 90, ingredients: [{ itemId: 99, amount: 1 }] }],
  [2, { itemResultId: 2, classJob: 'ALC', recipeLevel: 90, ingredients: [{ itemId: 99, amount: 1 }] }],
]);

describe('rankSuggestions — craft', () => {
  it('ranks untracked craftables in a category by gil/day, tagging cat + crafter', () => {
    const out = rankSuggestions({
      cat: 'Materia', mode: 'craft', snapshot, market, recipes,
      trackedIds: new Set(), excludedIds: new Set(), limit: 5,
    });
    expect(out.map((s) => s.id)).toEqual([1, 2]); // A before B; off-cat excluded
    expect(out[0]).toMatchObject({ cat: 'Materia', mode: 'craft', crafter: 'ALC', lvl: 90 });
    expect(out[0].acquireCost).toBe(100); // material cost
    expect(out[0].gilPerDay).toBeGreaterThan(out[1].gilPerDay);
  });

  it('excludes already-tracked and dismissed items', () => {
    const tracked = rankSuggestions({
      cat: 'Materia', mode: 'craft', snapshot, market, recipes,
      trackedIds: new Set([1]), excludedIds: new Set(), limit: 5,
    });
    expect(tracked.map((s) => s.id)).toEqual([2]);

    const dismissed = rankSuggestions({
      cat: 'Materia', mode: 'craft', snapshot, market, recipes,
      trackedIds: new Set(), excludedIds: new Set([1]), limit: 5,
    });
    expect(dismissed.map((s) => s.id)).toEqual([2]);
  });

  it('respects the limit', () => {
    const out = rankSuggestions({
      cat: 'Materia', mode: 'craft', snapshot, market, recipes,
      trackedIds: new Set(), excludedIds: new Set(), limit: 1,
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
  });

  it('returns [] for a category with no items in the snapshot', () => {
    const out = rankSuggestions({
      cat: 'Fish', mode: 'craft', snapshot, market, recipes,
      trackedIds: new Set(), excludedIds: new Set(), limit: 5,
    });
    expect(out).toEqual([]); // no sc-46 items in the snapshot
  });
});

describe('rankSuggestions — vendor', () => {
  it('ranks vendor flips by profit/day and needs a vendorMap', () => {
    // Materia A buyable from vendor @ 100, sells 1000 @ 5/day → 4500/day.
    const vendorMap = new Map([[1, 100]]);
    const out = rankSuggestions({
      cat: 'Materia', mode: 'vendor', snapshot, market, recipes,
      trackedIds: new Set(), excludedIds: new Set(), limit: 5, vendorMap,
    });
    expect(out.map((s) => s.id)).toEqual([1]);
    expect(out[0]).toMatchObject({ mode: 'vendor', acquireCost: 100 });

    // Without a vendorMap → nothing.
    expect(rankSuggestions({
      cat: 'Materia', mode: 'vendor', snapshot, market, recipes,
      trackedIds: new Set(), excludedIds: new Set(), limit: 5,
    })).toEqual([]);
  });
});

describe('rankSuggestions — gather', () => {
  it('ranks gatherable, non-craftable items by sale × velocity', () => {
    // A gatherable raw mat: sc 57, no recipe, sells 500 @ 4/day → 2000/day.
    const gSnap = [{ id: 10, name: 'Raw Mat', sc: 57, ui: 0, ilvl: 1, canHq: false }];
    const gMarket: MarketData = { 10: mkPrice({ minNQ: 500, medianNQ: 500, velocity: 4 }) };
    const out = rankSuggestions({
      cat: 'Materia', mode: 'gather', snapshot: gSnap, market: gMarket, recipes: new Map(),
      trackedIds: new Set(), excludedIds: new Set(), limit: 5, gatherableIds: new Set([10]),
    });
    expect(out.map((s) => s.id)).toEqual([10]);
    expect(out[0]).toMatchObject({ mode: 'gather', acquireCost: 0 });
    expect(out[0].gilPerDay).toBe(2000);

    // Without gatherableIds → nothing.
    expect(rankSuggestions({
      cat: 'Materia', mode: 'gather', snapshot: gSnap, market: gMarket, recipes: new Map(),
      trackedIds: new Set(), excludedIds: new Set(), limit: 5,
    })).toEqual([]);
  });
});
