import { describe, it, expect } from 'vitest';
import { buildUsedInIndex } from './usedInIndex';
import type { Recipe } from '../../lib/recipes';

function r(itemResultId: number, ingredients: [number, number][], classJob: Recipe['classJob'] = 'CRP', recipeLevel = 50): Recipe {
  return {
    itemResultId,
    classJob,
    recipeLevel,
    ingredients: ingredients.map(([itemId, amount]) => ({ itemId, amount })),
  };
}

describe('buildUsedInIndex', () => {
  it('returns an empty index for an empty recipe map', () => {
    expect(buildUsedInIndex(new Map())).toEqual(new Map());
  });

  it('maps each ingredient to every recipe that consumes it', () => {
    const recipes = new Map<number, Recipe>([
      [100, r(100, [[1, 3], [2, 1]], 'CRP', 60)],
      [200, r(200, [[1, 5]], 'WVR', 70)],
      [300, r(300, [[2, 2], [3, 4]], 'ALC', 80)],
    ]);
    const idx = buildUsedInIndex(recipes);
    expect(idx.get(1)).toEqual([
      { resultId: 100, amount: 3, classJob: 'CRP', recipeLevel: 60 },
      { resultId: 200, amount: 5, classJob: 'WVR', recipeLevel: 70 },
    ]);
    expect(idx.get(2)).toEqual([
      { resultId: 100, amount: 1, classJob: 'CRP', recipeLevel: 60 },
      { resultId: 300, amount: 2, classJob: 'ALC', recipeLevel: 80 },
    ]);
    expect(idx.get(3)).toEqual([
      { resultId: 300, amount: 4, classJob: 'ALC', recipeLevel: 80 },
    ]);
    expect(idx.get(999)).toBeUndefined();
  });
});
