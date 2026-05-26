import type { Recipe } from '../../lib/recipes';
import type { CrafterCode } from '../items/types';

export interface IngredientStatus {
  itemId: number;
  name: string;
  needed: number;
  have: number;
  fulfilled: boolean;
  source: 'vendor' | 'market' | 'gather' | 'unknown';
  unitPrice: number | null;
}

export interface CraftableRow {
  recipeItemId: number;
  name: string;
  classJob: CrafterCode;
  recipeLevel: number;
  amountResult: number;
  totalIngredients: number;
  missingCount: number;
  completeness: number;
  ingredients: IngredientStatus[];
}

export interface CraftableFilter {
  maxMissing: number;
  marketableOnly?: boolean;
  velocityMap?: Map<number, number>;
  vendorMap?: Map<number, number>;
  gatheringSet?: Set<number>;
}

export function findCraftableFromInventory(
  inventory: Map<number, number>,
  recipes: Map<number, Recipe>,
  namesById: Map<number, string>,
  filter: CraftableFilter,
): CraftableRow[] {
  const { maxMissing, marketableOnly, velocityMap, vendorMap, gatheringSet } = filter;
  const rows: CraftableRow[] = [];

  for (const [itemId, recipe] of recipes) {
    const ingredients: IngredientStatus[] = [];
    let missingCount = 0;

    for (const ing of recipe.ingredients) {
      const have = inventory.get(ing.itemId) ?? 0;
      const fulfilled = have >= ing.amount;
      if (!fulfilled) missingCount++;

      let source: IngredientStatus['source'] = 'unknown';
      let unitPrice: number | null = null;
      if (!fulfilled) {
        if (vendorMap?.has(ing.itemId)) {
          source = 'vendor';
          unitPrice = vendorMap.get(ing.itemId)!;
        } else if (gatheringSet?.has(ing.itemId)) {
          source = 'gather';
        } else {
          source = 'market';
        }
      }

      ingredients.push({
        itemId: ing.itemId,
        name: namesById.get(ing.itemId) ?? `Item #${ing.itemId}`,
        needed: ing.amount,
        have,
        fulfilled,
        source,
        unitPrice,
      });
    }

    if (missingCount > maxMissing) continue;
    if (marketableOnly && velocityMap && !velocityMap.has(itemId)) continue;

    const totalIngredients = recipe.ingredients.length;
    const completeness = totalIngredients > 0 ? (totalIngredients - missingCount) / totalIngredients : 1;

    rows.push({
      recipeItemId: itemId,
      name: namesById.get(itemId) ?? `Item #${itemId}`,
      classJob: recipe.classJob,
      recipeLevel: recipe.recipeLevel,
      amountResult: recipe.amountResult ?? 1,
      totalIngredients,
      missingCount,
      completeness,
      ingredients,
    });
  }

  rows.sort((a, b) => b.completeness - a.completeness || b.recipeLevel - a.recipeLevel);
  return rows;
}
