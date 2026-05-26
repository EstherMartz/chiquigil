import { describe, it, expect } from 'vitest';
import { findCraftableFromInventory } from './findCraftable';
import type { Recipe } from '../../lib/recipes';

function recipe(itemResultId: number, ingredients: Array<{ itemId: number; amount: number }>, classJob = 'BSM' as const, recipeLevel = 50): Recipe {
  return { itemResultId, classJob, recipeLevel, ingredients };
}

describe('findCraftableFromInventory', () => {
  const namesById = new Map([[1, 'Iron Ingot'], [10, 'Iron Ore'], [11, 'Fire Crystal'], [12, 'Wind Crystal'], [20, 'Steel Ingot'], [30, 'Mythril Ingot']]);

  it('returns 100% craftable recipe when all ingredients are owned', () => {
    const inventory = new Map([[10, 5], [11, 3]]);
    const recipes = new Map([[1, recipe(1, [{ itemId: 10, amount: 3 }, { itemId: 11, amount: 1 }])]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipeItemId).toBe(1);
    expect(rows[0].missingCount).toBe(0);
    expect(rows[0].completeness).toBe(1);
    expect(rows[0].ingredients[0].fulfilled).toBe(true);
    expect(rows[0].ingredients[1].fulfilled).toBe(true);
  });

  it('returns recipe missing 1 ingredient when maxMissing >= 1', () => {
    const inventory = new Map([[10, 5]]); // has ore, no crystal
    const recipes = new Map([[1, recipe(1, [{ itemId: 10, amount: 3 }, { itemId: 11, amount: 1 }])]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].missingCount).toBe(1);
    expect(rows[0].completeness).toBe(0.5);
  });

  it('excludes recipe when missing exceeds maxMissing', () => {
    const inventory = new Map<number, number>(); // empty
    const recipes = new Map([[1, recipe(1, [{ itemId: 10, amount: 3 }, { itemId: 11, amount: 1 }])]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 1 });
    expect(rows).toHaveLength(0);
  });

  it('sorts by completeness desc then recipeLevel desc', () => {
    const inventory = new Map([[10, 5], [11, 3]]);
    const recipes = new Map([
      [1, recipe(1, [{ itemId: 10, amount: 1 }, { itemId: 11, amount: 1 }], 'BSM', 30)],  // 100% complete, lvl 30
      [20, recipe(20, [{ itemId: 10, amount: 1 }, { itemId: 11, amount: 1 }], 'BSM', 50)], // 100% complete, lvl 50
      [30, recipe(30, [{ itemId: 10, amount: 1 }, { itemId: 12, amount: 1 }], 'BSM', 90)], // 50% complete, lvl 90
    ]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 1 });
    expect(rows[0].recipeItemId).toBe(20); // 100%, lvl 50
    expect(rows[1].recipeItemId).toBe(1);  // 100%, lvl 30
    expect(rows[2].recipeItemId).toBe(30); // 50%, lvl 90
  });

  it('counts ingredient types not quantities for missingCount', () => {
    // Has 1 ore but needs 10 — this is NOT a missing type, just insufficient qty
    // Wait, spec says missing = where have < need. So this IS missing.
    // Actually no: "Count missing ingredient types (where have < need)"
    // So if you have 1 but need 10, that type IS missing.
    const inventory = new Map([[10, 1]]);
    const recipes = new Map([[1, recipe(1, [{ itemId: 10, amount: 10 }, { itemId: 11, amount: 1 }])]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 2 });
    expect(rows).toHaveLength(1);
    expect(rows[0].missingCount).toBe(2); // both types are short
  });

  it('marks ingredient as fulfilled when have >= need', () => {
    const inventory = new Map([[10, 3], [11, 1]]);
    const recipes = new Map([[1, recipe(1, [{ itemId: 10, amount: 3 }, { itemId: 11, amount: 1 }])]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 0 });
    expect(rows[0].ingredients.every(i => i.fulfilled)).toBe(true);
  });

  it('skips excluded ingredients (e.g. crystals) from counts and ingredient list', () => {
    // Recipe needs 3 ore + 1 fire crystal. Inventory has 3 ore, no crystal.
    // With crystal excluded, recipe should be 100% complete with 1 ingredient.
    const inventory = new Map([[10, 3]]);
    const recipes = new Map([[1, recipe(1, [{ itemId: 10, amount: 3 }, { itemId: 11, amount: 1 }])]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, {
      maxMissing: 0,
      excludeIngredientIds: new Set([11, 12]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].missingCount).toBe(0);
    expect(rows[0].totalIngredients).toBe(1);
    expect(rows[0].completeness).toBe(1);
    expect(rows[0].ingredients).toHaveLength(1);
    expect(rows[0].ingredients[0].itemId).toBe(10);
  });

  it('filters marketable only when velocity data is provided', () => {
    const inventory = new Map([[10, 5], [11, 3]]);
    const recipes = new Map([
      [1, recipe(1, [{ itemId: 10, amount: 1 }])],
      [20, recipe(20, [{ itemId: 10, amount: 1 }])],
    ]);
    // Item 1 has velocity, item 20 does not
    const velocityMap = new Map<number, number>([[1, 5.0]]);
    const rows = findCraftableFromInventory(inventory, recipes, namesById, { maxMissing: 0, marketableOnly: true, velocityMap });
    expect(rows).toHaveLength(1);
    expect(rows[0].recipeItemId).toBe(1);
  });
});
