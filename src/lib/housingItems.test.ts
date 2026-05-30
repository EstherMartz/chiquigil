import { describe, it, expect } from 'vitest';
import {
  isHousingItem, furnishingCandidates, materialCandidates, allHousingCandidates,
} from './housingItems';
import type { SnapshotItem } from './itemSnapshot';
import type { Recipe } from './recipes';

function item(id: number, sc: number): SnapshotItem {
  return { id, name: `i${id}`, sc, ui: 0, ilvl: 1, canHq: true } as SnapshotItem;
}
function recipe(itemResultId: number, ingredientIds: number[]): Recipe {
  return {
    itemResultId, classJob: 'CRP', recipeLevel: 1,
    ingredients: ingredientIds.map((itemId) => ({ itemId, amount: 1 })),
  } as Recipe;
}

describe('isHousingItem', () => {
  it('recognizes housing search categories and rejects others', () => {
    expect(isHousingItem(56)).toBe(true);
    expect(isHousingItem(54)).toBe(false);
  });
});

describe('furnishingCandidates', () => {
  it('returns only housing items that have a recipe', () => {
    const items = [item(1, 56), item(2, 56), item(3, 54)];
    const recipes = new Map<number, Recipe>([[1, recipe(1, [10, 11])]]);
    expect(furnishingCandidates(items, recipes)).toEqual([1]);
  });
});

describe('materialCandidates', () => {
  it('returns the deduped ingredient ids of the given furnishings', () => {
    const recipes = new Map<number, Recipe>([
      [1, recipe(1, [10, 11])],
      [2, recipe(2, [11, 12])],
    ]);
    expect(materialCandidates(recipes, [1, 2]).sort((a, b) => a - b)).toEqual([10, 11, 12]);
  });
});

describe('allHousingCandidates', () => {
  it('returns every housing-category item regardless of recipe', () => {
    const items = [item(1, 56), item(2, 65), item(3, 54)];
    expect(allHousingCandidates(items)).toEqual([1, 2]);
  });
});
