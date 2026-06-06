import { describe, it, expect } from 'vitest';
import { resolveList, type ResolveDeps } from './resolveList';
import type { Recipe } from '../../lib/recipes';
import type { SnapshotItem } from '../../lib/itemSnapshot';

// Tree: Sword(1) -> 2x Ingot(craft) + 1x FireShard(crystal)
//       Ingot -> 3x Ore(gather) + 1x Flux(vendor)
const recipes = new Map<number, Recipe | null>([
  [1, { itemResultId: 1, classJob: 'BSM', recipeLevel: 90, ingredients: [
    { itemId: 2, amount: 2 }, { itemId: 7, amount: 1 },
  ], amountResult: 1, stats: { durability: 80, progress: 1, quality: 1, stars: 4, requiredCraftsmanship: 0, requiredControl: 0 } }],
  [2, { itemResultId: 2, classJob: 'BSM', recipeLevel: 50, ingredients: [
    { itemId: 3, amount: 3 }, { itemId: 4, amount: 1 },
  ], amountResult: 1 }],
]);

const itemsById = new Map<number, SnapshotItem>([
  [1, { id: 1, name: 'Sword', sc: 5, ui: 0, ilvl: 600, canHq: true, rarity: 1 }],
  [2, { id: 2, name: 'Ingot', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
  [3, { id: 3, name: 'Ore', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
  [4, { id: 4, name: 'Flux', sc: 9, ui: 0, ilvl: 1, canHq: false, rarity: 1 }],
  [7, { id: 7, name: 'Fire Shard', sc: 58, ui: 0, ilvl: 1, canHq: false, rarity: 1 }],
] as [number, SnapshotItem][]);

const deps: ResolveDeps = {
  recipes,
  gathering: new Map([[3, { level: 50, timed: false, hidden: false }]]),
  vendorMap: new Map([[4, 100]]),
  specialShop: { byCurrency: new Map() },
  itemsById,
};

describe('resolveList', () => {
  it('groups final items, sub-crafts by depth, gathered, vendor and crystals', () => {
    const r = resolveList([{ itemId: 1, qty: 1, isHq: false }], deps);

    expect(r.finalItems).toHaveLength(1);
    expect(r.finalItems[0]).toMatchObject({ itemId: 1, qty: 1, job: 'BSM', recipeLevel: 90, stars: 4 });

    const lvl1 = r.subCraftsByDepth.get(1)!;
    expect(lvl1.map((x) => x.itemId)).toContain(2);
    const ingot = lvl1.find((x) => x.itemId === 2)!;
    expect(ingot).toMatchObject({ requiredQty: 2, source: 'Crafted', depth: 1, recipeLevel: 50 });
    expect(ingot.usedToCraft).toEqual(['Sword']);

    const ore = r.gathered.find((x) => x.itemId === 3)!;
    expect(ore).toMatchObject({ requiredQty: 6, source: 'Gathered' });

    const flux = r.otherAcquired.find((x) => x.itemId === 4)!;
    expect(flux).toMatchObject({ requiredQty: 2, source: 'Vendor' });

    expect(r.crystals.map((x) => x.itemId)).toEqual([7]);
    expect(r.crystals[0].source).toBe('Crystal');
  });

  it('flags timed gathers and aggregates "used to craft" across final items', () => {
    const r = resolveList(
      [{ itemId: 1, qty: 1, isHq: false }, { itemId: 2, qty: 5, isHq: false }],
      { ...deps, gathering: new Map([[3, { level: 50, timed: true, hidden: false }]]) },
    );
    const ore = r.gathered.find((x) => x.itemId === 3)!;
    expect(ore.source).toBe('TimedGather');
    const ingot = r.subCraftsByDepth.get(1)!.find((x) => x.itemId === 2)!;
    expect(ingot.usedToCraft).toEqual(['Sword']);
  });
});
