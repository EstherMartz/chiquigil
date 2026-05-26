import { describe, it, expect } from 'vitest';
import { explode } from './explode';
import type { Recipe } from '../../../src/lib/recipes';

function makeRecipe(itemResultId: number, classJob: string, ingredients: { itemId: number; amount: number }[], amountResult = 1): Recipe {
  return {
    itemResultId,
    classJob: classJob as any,
    recipeLevel: 1,
    ingredients,
    amountResult,
  };
}

describe('explode', () => {
  it('handles a simple single-level recipe', () => {
    const recipes = new Map<number, Recipe>();
    // Item 100 requires 2× item 1 + 3× item 2
    recipes.set(100, makeRecipe(100, 'ALC', [
      { itemId: 1, amount: 2 },
      { itemId: 2, amount: 3 },
    ]));

    const result = explode(100, 5, recipes);

    expect(result.crafts.size).toBe(1);
    expect(result.crafts.get(100)).toEqual({ outputQty: 5, craftCount: 5, job: 'ALC' });
    expect(result.leaves.get(1)).toBe(10); // 2 * 5
    expect(result.leaves.get(2)).toBe(15); // 3 * 5
  });

  it('handles nested intermediates', () => {
    const recipes = new Map<number, Recipe>();
    // Item 100 requires 2× item 50
    // Item 50 requires 3× item 1
    recipes.set(100, makeRecipe(100, 'ALC', [{ itemId: 50, amount: 2 }]));
    recipes.set(50, makeRecipe(50, 'BSM', [{ itemId: 1, amount: 3 }]));

    const result = explode(100, 4, recipes);

    expect(result.crafts.size).toBe(2);
    expect(result.crafts.get(100)).toEqual({ outputQty: 4, craftCount: 4, job: 'ALC' });
    // Need 2 * 4 = 8 of item 50
    expect(result.crafts.get(50)).toEqual({ outputQty: 8, craftCount: 8, job: 'BSM' });
    // Need 3 * 8 = 24 of item 1
    expect(result.leaves.get(1)).toBe(24);
  });

  it('respects amountResult (yield per craft)', () => {
    const recipes = new Map<number, Recipe>();
    // Item 100 requires 6× item 50
    // Item 50 yields 3 per craft, requires 2× item 1
    recipes.set(100, makeRecipe(100, 'ALC', [{ itemId: 50, amount: 6 }]));
    recipes.set(50, makeRecipe(50, 'BSM', [{ itemId: 1, amount: 2 }], 3));

    const result = explode(100, 1, recipes);

    // Need 6 of item 50, yields 3 → ceil(6/3) = 2 crafts
    expect(result.crafts.get(50)).toEqual({ outputQty: 6, craftCount: 2, job: 'BSM' });
    // Need 2 * 2 = 4 of item 1 (scale by craftCount, not outputQty)
    expect(result.leaves.get(1)).toBe(4);
  });

  it('treats intermediates as leaves when craftIntermediates=false', () => {
    const recipes = new Map<number, Recipe>();
    recipes.set(100, makeRecipe(100, 'ALC', [{ itemId: 50, amount: 2 }]));
    recipes.set(50, makeRecipe(50, 'BSM', [{ itemId: 1, amount: 3 }]));

    const result = explode(100, 4, recipes, { craftIntermediates: false });

    // Only the target should be crafted
    expect(result.crafts.size).toBe(1);
    expect(result.crafts.has(100)).toBe(true);
    // Item 50 should be a leaf
    expect(result.leaves.get(50)).toBe(8); // 2 * 4
    expect(result.leaves.has(1)).toBe(false); // not recursed into
  });

  it('handles missing recipe — item becomes leaf', () => {
    const recipes = new Map<number, Recipe>();
    // Item 100 requires item 50 which has no recipe
    recipes.set(100, makeRecipe(100, 'ALC', [{ itemId: 50, amount: 3 }]));

    const result = explode(100, 2, recipes);
    expect(result.leaves.get(50)).toBe(6);
  });

  it('handles cycle detection', () => {
    const recipes = new Map<number, Recipe>();
    // Item A requires item B, item B requires item A (cycle)
    recipes.set(100, makeRecipe(100, 'ALC', [{ itemId: 200, amount: 1 }]));
    recipes.set(200, makeRecipe(200, 'BSM', [{ itemId: 100, amount: 1 }]));

    // Should not infinite loop — cycle breaks by treating as leaf
    const result = explode(100, 1, recipes);
    expect(result.crafts.has(100)).toBe(true);
    // Item 200 tries to require item 100 again, but 100 is on the path → leaf
    expect(result.crafts.has(200)).toBe(true);
  });

  it('handles depth cap', () => {
    const recipes = new Map<number, Recipe>();
    // Create a chain of 25 items (exceeds maxDepth=20)
    for (let i = 1; i <= 25; i++) {
      recipes.set(i, makeRecipe(i, 'CRP', [{ itemId: i + 1, amount: 1 }]));
    }

    const result = explode(1, 1, recipes, { maxDepth: 20 });
    // Items beyond depth 20 should become leaves
    const totalCrafts = result.crafts.size;
    expect(totalCrafts).toBeLessThanOrEqual(21); // depth 0 through 20
    expect(result.leaves.size).toBeGreaterThan(0);
  });

  it('accumulates quantities when same item appears multiple times', () => {
    const recipes = new Map<number, Recipe>();
    // Item 100 requires 2× item 50 + 3× item 60
    // Both item 50 and item 60 require item 1
    recipes.set(100, makeRecipe(100, 'ALC', [
      { itemId: 50, amount: 2 },
      { itemId: 60, amount: 3 },
    ]));
    recipes.set(50, makeRecipe(50, 'BSM', [{ itemId: 1, amount: 4 }]));
    recipes.set(60, makeRecipe(60, 'CRP', [{ itemId: 1, amount: 2 }]));

    const result = explode(100, 1, recipes);
    // Item 1 needed: 4*2 (from item 50) + 2*3 (from item 60) = 8 + 6 = 14
    expect(result.leaves.get(1)).toBe(14);
  });

  it('handles target with no recipe (target itself becomes a leaf)', () => {
    const recipes = new Map<number, Recipe>();
    // No recipe for item 100 at all
    const result = explode(100, 5, recipes);
    expect(result.crafts.size).toBe(0);
    expect(result.leaves.get(100)).toBe(5);
  });
});
