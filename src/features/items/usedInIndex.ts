import type { Recipe } from '../../lib/recipes';
import type { CrafterCode } from './types';

export interface UsedInEntry {
  resultId: number;
  amount: number;
  classJob: CrafterCode;
  recipeLevel: number;
}

/** Reverse index: ingredientId → recipes that consume it. */
export type UsedInIndex = Map<number, UsedInEntry[]>;

/**
 * Build a reverse index from the recipe snapshot so we can answer
 * "which recipes use item X as an ingredient?" in O(1) per lookup
 * instead of scanning every recipe each time.
 */
export function buildUsedInIndex(recipes: Map<number, Recipe>): UsedInIndex {
  const out: UsedInIndex = new Map();
  for (const recipe of recipes.values()) {
    for (const ing of recipe.ingredients) {
      const list = out.get(ing.itemId);
      const entry: UsedInEntry = {
        resultId: recipe.itemResultId,
        amount: ing.amount,
        classJob: recipe.classJob,
        recipeLevel: recipe.recipeLevel,
      };
      if (list) list.push(entry);
      else out.set(ing.itemId, [entry]);
    }
  }
  return out;
}
