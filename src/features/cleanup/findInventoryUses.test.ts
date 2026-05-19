import { describe, it, expect } from 'vitest';
import { findInventoryUses } from './findInventoryUses';
import type { Recipe } from '../../lib/recipes';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketBundle } from '../watchlist/useMarketData';
import type { InventoryEntry } from './types';

const items = new Map<number, SnapshotItem>([
  [1, { id: 1, name: 'Output Cheap', sc: 1, ui: 1, ilvl: 1, canHq: false }],
  [2, { id: 2, name: 'Output Pricey', sc: 1, ui: 1, ilvl: 1, canHq: false }],
  [3, { id: 3, name: 'Output Free', sc: 1, ui: 1, ilvl: 1, canHq: false }],
  [10, { id: 10, name: 'Ingredient A', sc: 1, ui: 1, ilvl: 1, canHq: false }],
  [11, { id: 11, name: 'Ingredient B', sc: 1, ui: 1, ilvl: 1, canHq: false }],
]);

function recipe(outputId: number, ingredients: Array<[number, number]>): Recipe {
  return {
    itemResultId: outputId,
    classJob: 'CRP',
    recipeLevel: 1,
    ingredients: ingredients.map(([itemId, amount]) => ({ itemId, amount })),
  };
}

function market(prices: Record<number, number>): MarketBundle {
  const phantom: Record<number, unknown> = {};
  for (const [id, nq] of Object.entries(prices)) {
    phantom[Number(id)] = {
      medianNQ: nq, medianHQ: null, minNQ: nq, minHQ: null,
      recentSalesNQ: 10, recentSalesHQ: 0,
      listingCount: 5, listingCountNQ: 5, listingCountHQ: 0,
      worldListings: [],
    };
  }
  return { phantom: phantom as never, dc: {}, region: {} } as MarketBundle;
}

const inv = (rows: Array<Omit<InventoryEntry, 'name' | 'locations'>>): InventoryEntry[] =>
  rows.map((r) => ({ ...r, name: items.get(r.itemId)?.name ?? '', locations: ['bag'] }));

describe('findInventoryUses', () => {
  it('returns recipes that use each inventory item as an ingredient', () => {
    const recipes = new Map<number, Recipe>([
      [1, recipe(1, [[10, 2]])],
      [2, recipe(2, [[10, 1], [11, 3]])],
    ]);
    const out = findInventoryUses(inv([{ itemId: 10, qty: 1, isHq: false }]), recipes, market({ 1: 50, 2: 5000 }), items);
    const usesForA = out.get(10);
    expect(usesForA).toHaveLength(2);
    // Sorted by output unit price desc: 5000 (output 2) before 50 (output 1).
    expect(usesForA![0].outputItemId).toBe(2);
    expect(usesForA![0].outputUnitPrice).toBe(5000);
    expect(usesForA![0].amountNeeded).toBe(1);
    expect(usesForA![1].outputItemId).toBe(1);
  });

  it('ignores profitability and missing-ingredient feasibility', () => {
    // User has only one ingredient; recipe needs many others. Still appears.
    const recipes = new Map<number, Recipe>([[2, recipe(2, [[10, 1], [11, 1], [12, 1], [13, 1], [14, 1]])]]);
    const out = findInventoryUses(inv([{ itemId: 10, qty: 1, isHq: false }]), recipes, market({ 2: 100 }), items);
    expect(out.get(10)).toHaveLength(1);
    expect(out.get(10)![0].outputItemId).toBe(2);
  });

  it('includes recipes whose output has no MB price (sorted last)', () => {
    const recipes = new Map<number, Recipe>([
      [1, recipe(1, [[10, 1]])],
      [3, recipe(3, [[10, 1]])],
    ]);
    const out = findInventoryUses(inv([{ itemId: 10, qty: 1, isHq: false }]), recipes, market({ 1: 50 }), items);
    expect(out.get(10)).toHaveLength(2);
    expect(out.get(10)![0].outputItemId).toBe(1);   // priced 50
    expect(out.get(10)![1].outputItemId).toBe(3);   // priced 0 (no MB data)
    expect(out.get(10)![1].outputUnitPrice).toBe(0);
  });

  it('caps each item at 5 entries', () => {
    const recipes = new Map<number, Recipe>();
    for (let i = 100; i < 110; i++) {
      const item: SnapshotItem = { id: i, name: 'Output ' + i, sc: 1, ui: 1, ilvl: 1, canHq: false };
      items.set(i, item);
      recipes.set(i, recipe(i, [[10, 1]]));
    }
    const prices: Record<number, number> = {};
    for (let i = 100; i < 110; i++) prices[i] = i * 10;
    const out = findInventoryUses(inv([{ itemId: 10, qty: 1, isHq: false }]), recipes, market(prices), items);
    expect(out.get(10)).toHaveLength(5);
    // Cleanup the items map for other tests.
    for (let i = 100; i < 110; i++) items.delete(i);
  });

  it('skips unrecognized inventory rows (itemId=0)', () => {
    const recipes = new Map<number, Recipe>([[1, recipe(1, [[10, 1]])]]);
    const out = findInventoryUses(
      [{ itemId: 0, name: 'Mystery', qty: 1, isHq: false, locations: ['bag'] }],
      recipes,
      market({ 1: 50 }),
      items,
    );
    expect(out.size).toBe(0);
  });
});
