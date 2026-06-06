import { describe, it, expect } from 'vitest';
import { validateBreakdownItems, buildListBreakdown } from './_list-breakdown-core';
import type { ResolveDeps } from '../features/craftLists/resolveList';
import type { Recipe } from '../lib/recipes';
import type { SnapshotItem } from '../lib/itemSnapshot';

const recipes = new Map<number, Recipe | null>([
  [1, { itemResultId: 1, classJob: 'BSM', recipeLevel: 90, ingredients: [
    { itemId: 2, amount: 2 }, { itemId: 7, amount: 1 },
  ], amountResult: 1, stats: { durability: 80, progress: 1, quality: 1, stars: 4, requiredCraftsmanship: 0, requiredControl: 0 } }],
  [2, { itemResultId: 2, classJob: 'BSM', recipeLevel: 50, ingredients: [{ itemId: 3, amount: 3 }], amountResult: 1 }],
]);
const itemsById = new Map<number, SnapshotItem>([
  [1, { id: 1, name: 'Sword', sc: 5, ui: 0, ilvl: 600, canHq: true, rarity: 1 }],
  [2, { id: 2, name: 'Ingot', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
  [3, { id: 3, name: 'Ore', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
  [7, { id: 7, name: 'Fire Shard', sc: 58, ui: 0, ilvl: 1, canHq: false, rarity: 1 }],
] as [number, SnapshotItem][]);
const deps: ResolveDeps = {
  recipes, gathering: new Map([[3, { level: 50, timed: false, hidden: false }]]),
  vendorMap: new Map(), specialShop: { byCurrency: new Map() }, itemsById,
};

describe('validateBreakdownItems', () => {
  it('accepts a valid list and maps hq', () => {
    const items = validateBreakdownItems([{ itemId: 1, qty: 2, hq: true }]);
    expect(items).toEqual([{ itemId: 1, qty: 2, isHq: true }]);
  });
  it('rejects empty / oversized / bad qty / bad id', () => {
    expect(validateBreakdownItems([])).toBeNull();
    expect(validateBreakdownItems('nope')).toBeNull();
    expect(validateBreakdownItems([{ itemId: 0, qty: 1 }])).toBeNull();
    expect(validateBreakdownItems([{ itemId: 1, qty: 0 }])).toBeNull();
    expect(validateBreakdownItems(Array.from({ length: 201 }, () => ({ itemId: 1, qty: 1 })))).toBeNull();
  });
});

describe('buildListBreakdown', () => {
  it('returns finalItems + flat ingredients with depth/source', () => {
    const out = buildListBreakdown([{ itemId: 1, qty: 1, isHq: false }], deps);
    expect(out.finalItems).toEqual([
      { itemId: 1, itemName: 'Sword', qty: 1, isHq: false, job: 'BSM', recipeLevel: 90, stars: 4 },
    ]);
    const ingot = out.ingredients.find((i) => i.itemId === 2)!;
    expect(ingot).toMatchObject({ requiredQty: 2, source: 'Crafted', depth: 1, usedToCraft: ['Sword'] });
    const ore = out.ingredients.find((i) => i.itemId === 3)!;
    expect(ore).toMatchObject({ requiredQty: 6, source: 'Gathered' });
    expect(out.ingredients.find((i) => i.itemId === 7)!.source).toBe('Crystal');
  });
});
