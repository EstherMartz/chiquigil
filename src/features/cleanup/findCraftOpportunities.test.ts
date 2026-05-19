import { describe, it, expect } from 'vitest';
import { findCraftOpportunities } from './findCraftOpportunities';
import type { Recipe } from '../../lib/recipes';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketBundle } from '../watchlist/useMarketData';
import type { InventoryEntry } from './types';

// Stub items: every item canHq=false for simpler test math.
const items = new Map<number, SnapshotItem>([
  [1, { id: 1, name: 'Output', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 5 }],
  [2, { id: 2, name: 'Ing A', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 1 }],
  [3, { id: 3, name: 'Ing B', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 1 }],
  [4, { id: 4, name: 'Ing C', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 1 }],
  [5, { id: 5, name: 'Ing D', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 1 }],
]);

function recipe(outputId: number, ingredients: Array<[number, number]>): Recipe {
  return {
    itemResultId: outputId,
    classJob: 'CRP',
    recipeLevel: 50,
    ingredients: ingredients.map(([itemId, amount]) => ({ itemId, amount })),
  };
}

function market(prices: Record<number, { nq: number; recent: number; minNQ: number }>): MarketBundle {
  const phantom: Record<number, unknown> = {};
  for (const [id, p] of Object.entries(prices)) {
    phantom[Number(id)] = {
      medianNQ: p.nq, medianHQ: null, minNQ: p.minNQ, minHQ: null,
      recentSalesNQ: p.recent, recentSalesHQ: 0,
      listingCount: 5, listingCountNQ: 5, listingCountHQ: 0,
      worldListings: [],
    };
  }
  return { phantom: phantom as never, dc: {}, region: {} } as MarketBundle;
}

const inv = (rows: Array<Omit<InventoryEntry, 'name' | 'locations'>>): InventoryEntry[] =>
  rows.map((r) => ({ ...r, name: items.get(r.itemId)?.name ?? '', locations: ['bag'] }));

describe('findCraftOpportunities', () => {
  it('returns one opportunity per inventory item that unlocks a profitable full craft', () => {
    const recipes = new Map<number, Recipe>([[1, recipe(1, [[2, 2], [3, 1]])]]);
    const m = market({ 1: { nq: 100, recent: 10, minNQ: 100 } });
    const inventory = inv([
      { itemId: 2, qty: 10, isHq: false },
      { itemId: 3, qty: 10, isHq: false },
    ]);
    const out = findCraftOpportunities(inventory, recipes, m, items);
    // ing A (id=2) and ing B (id=3) both unlock recipe 1
    const optsForA = out.get(2) ?? [];
    expect(optsForA).toHaveLength(1);
    expect(optsForA[0].outputItemId).toBe(1);
    expect(optsForA[0].missingIngredients).toHaveLength(0);
    // netProfit = 100 - (2 * 0) - (1 * 0)  [no MB price for ingredients -> opp cost falls back to priceLow=1 per unit]
    // = 100 - (2*1 + 1*1) = 97
    expect(optsForA[0].netProfit).toBe(97);
  });

  it('factors in MB cost of up to 2 missing ingredients', () => {
    const recipes = new Map<number, Recipe>([[1, recipe(1, [[2, 1], [3, 1], [4, 1]])]]);
    const m = market({
      1: { nq: 200, recent: 10, minNQ: 200 },
      3: { nq: 30, recent: 10, minNQ: 30 },  // missing ing B available on MB at 30
      4: { nq: 20, recent: 10, minNQ: 20 },  // missing ing C available on MB at 20
    });
    const inventory = inv([{ itemId: 2, qty: 1, isHq: false }]);
    const out = findCraftOpportunities(inventory, recipes, m, items);
    const opts = out.get(2) ?? [];
    expect(opts).toHaveLength(1);
    expect(opts[0].missingIngredients).toHaveLength(2);
    // 200 - (1 used * max(noMB, 1 priceLow)=1) - (1*30 + 1*20) = 149
    expect(opts[0].netProfit).toBe(149);
  });

  it('skips recipes with 3+ missing ingredients', () => {
    const recipes = new Map<number, Recipe>([[1, recipe(1, [[2, 1], [3, 1], [4, 1], [5, 1]])]]);
    const m = market({
      1: { nq: 500, recent: 10, minNQ: 500 },
      3: { nq: 1, recent: 10, minNQ: 1 },
      4: { nq: 1, recent: 10, minNQ: 1 },
      5: { nq: 1, recent: 10, minNQ: 1 },
    });
    const inventory = inv([{ itemId: 2, qty: 1, isHq: false }]);
    const out = findCraftOpportunities(inventory, recipes, m, items);
    expect(out.get(2) ?? []).toHaveLength(0);
  });

  it('skips recipes whose output has no trusted MB tier', () => {
    const recipes = new Map<number, Recipe>([[1, recipe(1, [[2, 1]])]]);
    const m = market({});  // no MB data at all
    const inventory = inv([{ itemId: 2, qty: 1, isHq: false }]);
    const out = findCraftOpportunities(inventory, recipes, m, items);
    expect(out.get(2) ?? []).toHaveLength(0);
  });

  it('skips recipes when a missing ingredient has no MB tier (unpriced)', () => {
    const recipes = new Map<number, Recipe>([[1, recipe(1, [[2, 1], [3, 1]])]]);
    const m = market({ 1: { nq: 100, recent: 10, minNQ: 100 } });  // no price for ing B
    const inventory = inv([{ itemId: 2, qty: 1, isHq: false }]);
    const out = findCraftOpportunities(inventory, recipes, m, items);
    expect(out.get(2) ?? []).toHaveLength(0);
  });

  it('keeps recipes whose net profit is zero or negative (surfaced for exploration)', () => {
    const recipes = new Map<number, Recipe>([[1, recipe(1, [[2, 1]])]]);
    const m = market({ 1: { nq: 1, recent: 10, minNQ: 1 } });  // output 1g, opp cost 1g -> 0 net
    const inventory = inv([{ itemId: 2, qty: 1, isHq: false }]);
    const out = findCraftOpportunities(inventory, recipes, m, items);
    const opts = out.get(2) ?? [];
    expect(opts).toHaveLength(1);
    expect(opts[0].netProfit).toBe(0);
  });

  it('pools HQ and NQ inventory of the same item when checking ingredient coverage', () => {
    const recipes = new Map<number, Recipe>([[1, recipe(1, [[2, 4]])]]);
    const m = market({ 1: { nq: 100, recent: 10, minNQ: 100 } });
    const inventory = inv([
      { itemId: 2, qty: 2, isHq: false },
      { itemId: 2, qty: 2, isHq: true },
    ]);
    const out = findCraftOpportunities(inventory, recipes, m, items);
    // Either the NQ or HQ row's bucket should carry an opportunity; both unlock the same recipe.
    const nqOpts = out.get(2) ?? [];
    expect(nqOpts).toHaveLength(1);
    expect(nqOpts[0].outputItemId).toBe(1);
  });

  it('ranks multiple opportunities for the same inventory item by netProfit DESC', () => {
    const recipes = new Map<number, Recipe>([
      [1, recipe(1, [[2, 1]])],
      [3, recipe(3, [[2, 1]])],
    ]);
    const m = market({
      1: { nq: 100, recent: 10, minNQ: 100 },
      3: { nq: 200, recent: 10, minNQ: 200 },
    });
    const inventory = inv([{ itemId: 2, qty: 1, isHq: false }]);
    const out = findCraftOpportunities(inventory, recipes, m, items);
    const opts = out.get(2) ?? [];
    expect(opts).toHaveLength(2);
    expect(opts[0].outputItemId).toBe(3);  // higher profit first
    expect(opts[0].netProfit).toBeGreaterThan(opts[1].netProfit);
  });
});
