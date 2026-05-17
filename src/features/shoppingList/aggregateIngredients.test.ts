import { describe, it, expect } from 'vitest';
import { aggregateIngredients } from './aggregateIngredients';
import type { Recipe } from '../../lib/recipes';
import type { ShoppingListItem } from './shoppingListStore';

function mkRecipe(itemId: number, ingredients: { itemId: number; amount: number }[]): Recipe {
  return { itemResultId: itemId, classJob: 'CRP', recipeLevel: 1, ingredients };
}

describe('aggregateIngredients', () => {
  it('returns empty for empty list', () => {
    const result = aggregateIngredients([], new Map());
    expect(result.demand.size).toBe(0);
    expect(result.missingRecipes).toEqual([]);
  });

  it('sums one item × qty 1', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: false }];
    const recipes = new Map([[100, mkRecipe(100, [{ itemId: 5, amount: 3 }])]]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(5)).toBe(3);
  });

  it('multiplies ingredient amount by craft qty', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 4, craftIntermediates: false }];
    const recipes = new Map([[100, mkRecipe(100, [{ itemId: 5, amount: 3 }])]]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(5)).toBe(12);
  });

  it('sums overlapping ingredients across multiple items', () => {
    const items: ShoppingListItem[] = [
      { id: 100, qty: 1, craftIntermediates: false },
      { id: 200, qty: 2, craftIntermediates: false },
    ];
    const recipes = new Map([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
      [200, mkRecipe(200, [{ itemId: 5, amount: 4 }, { itemId: 6, amount: 1 }])],
    ]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(5)).toBe(3 + 4 * 2); // 11
    expect(result.demand.get(6)).toBe(2);
  });

  it('recurses into sub-recipe when craftIntermediates=true', () => {
    // 100 needs 2× of 50; 50 is itself craftable from 4× of 10.
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: true }];
    const recipes = new Map([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
    ]);
    const result = aggregateIngredients(items, recipes);
    // 50 should NOT appear in demand (we craft it from raws).
    expect(result.demand.has(50)).toBe(false);
    expect(result.demand.get(10)).toBe(2 * 4); // 8
  });

  it('falls back to buying sub-ingredient when it has no recipe', () => {
    // craftIntermediates=true but 50 has no recipe → just buy 50.
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: true }];
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, null],
    ]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(50)).toBe(2);
  });

  it('only recurses one level deep', () => {
    // 100 → 2× of 50 → 4× of 10 → 7× of 1.  With one-level recursion,
    // 10 should appear in demand (we DO NOT recurse further into 10's recipe).
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: true }];
    const recipes = new Map([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
      [10, mkRecipe(10, [{ itemId: 1, amount: 7 }])],
    ]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(10)).toBe(8);
    expect(result.demand.has(1)).toBe(false);
  });

  it('skips items with missing recipes and reports them', () => {
    const items: ShoppingListItem[] = [
      { id: 100, qty: 1, craftIntermediates: false },
      { id: 999, qty: 1, craftIntermediates: false },
    ];
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
      [999, null],
    ]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(5)).toBe(3);
    expect(result.missingRecipes).toEqual([999]);
  });
});
