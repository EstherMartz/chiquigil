import type { Recipe } from '../../lib/recipes';
import type { ShoppingListItem } from './shoppingListStore';

export interface AggregateResult {
  demand: Map<number, number>;       // ingredientId → total qty needed
  missingRecipes: number[];          // list-item ids whose recipe is null/missing
}

export function aggregateIngredients(
  items: ShoppingListItem[],
  recipeMap: Map<number, Recipe | null>,
): AggregateResult {
  const demand = new Map<number, number>();
  const missingRecipes: number[] = [];

  const add = (id: number, qty: number) => {
    demand.set(id, (demand.get(id) ?? 0) + qty);
  };

  for (const listItem of items) {
    const recipe = recipeMap.get(listItem.id);
    if (!recipe) {
      missingRecipes.push(listItem.id);
      continue;
    }
    for (const ing of recipe.ingredients) {
      const totalIngQty = ing.amount * listItem.qty;
      if (listItem.craftIntermediates) {
        const subRecipe = recipeMap.get(ing.itemId);
        if (subRecipe) {
          for (const sub of subRecipe.ingredients) {
            add(sub.itemId, sub.amount * totalIngQty);
          }
          continue;
        }
      }
      add(ing.itemId, totalIngQty);
    }
  }

  return { demand, missingRecipes };
}
