import { describe, it, expect } from 'vitest';
import { explode } from './craftExplode';
import type { Recipe } from '../lib/recipes';

function mkRecipe(itemId: number, ingredients: { itemId: number; amount: number }[]): Recipe {
  return { itemResultId: itemId, classJob: 'CRP', recipeLevel: 1, ingredients };
}

describe('explode', () => {
  it('recurses fully by default (deep tree)', () => {
    const recipes = new Map<number, Recipe>([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
    ]);
    const { crafts, leaves } = explode(100, 1, recipes);
    expect(crafts.has(100)).toBe(true);
    expect(crafts.has(50)).toBe(true);
    expect(leaves.get(10)).toBe(8);
    expect(leaves.has(50)).toBe(false);
  });

  it('treats a forceLeaf node as a leaf and stops recursing it', () => {
    const recipes = new Map<number, Recipe>([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
    ]);
    const { crafts, leaves } = explode(100, 1, recipes, {
      forceLeaf: (id) => id === 50,
    });
    expect(crafts.has(50)).toBe(false);
    expect(leaves.get(50)).toBe(2);
    expect(leaves.has(10)).toBe(false);
  });

  it('never forces the top-level target to a leaf', () => {
    const recipes = new Map<number, Recipe>([
      [100, mkRecipe(100, [{ itemId: 10, amount: 3 }])],
    ]);
    const { crafts } = explode(100, 1, recipes, { forceLeaf: () => true });
    expect(crafts.has(100)).toBe(true);
  });
});
