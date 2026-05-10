import type { Recipe, Ingredient } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';

export interface PerItemFlags {
  craftIntermediates?: boolean;
  craftTimeSeconds?: number;
}
export type FlagMap = Record<number, PerItemFlags | undefined>;

function unitCost(itemId: number, dc: MarketData, phantom: MarketData): number {
  const d = dc[itemId];
  if (d?.minNQ != null) return d.minNQ;
  const p = phantom[itemId];
  if (p?.avgNQ != null) return p.avgNQ;
  return 0;
}

export function computeMaterialCost(
  recipe: Recipe,
  recipeMap: Map<number, Recipe | null>,
  marketDc: MarketData,
  flags: FlagMap,
  phantom: MarketData = {},
  depth = 0,
): number {
  let total = 0;
  for (const ing of recipe.ingredients) {
    total += ingredientCost(ing, recipeMap, marketDc, flags, phantom, depth);
  }
  return total;
}

function ingredientCost(
  ing: Ingredient,
  recipeMap: Map<number, Recipe | null>,
  dc: MarketData,
  flags: FlagMap,
  phantom: MarketData,
  depth: number,
): number {
  const subRecipe = recipeMap.get(ing.itemId);
  const wantsCraft = flags[ing.itemId]?.craftIntermediates;
  if (wantsCraft && subRecipe && depth === 0) {
    return computeMaterialCost(subRecipe, recipeMap, dc, flags, phantom, depth + 1) * ing.amount;
  }
  return unitCost(ing.itemId, dc, phantom) * ing.amount;
}

export interface ProfitResult {
  materialCost: number;
  salePrice: number;
  profit: number;
}

function salePriceFor(itemId: number, phantom: MarketData, dc: MarketData): number {
  const d = dc[itemId];
  if (d?.minHQ != null) return d.minHQ;
  if (d?.minNQ != null) return d.minNQ;
  const p = phantom[itemId];
  if (p?.avgHQ != null) return p.avgHQ;
  if (p?.avgNQ != null) return p.avgNQ;
  return 0;
}

export function computeProfit(
  item: { id: number },
  recipe: Recipe | null,
  recipeMap: Map<number, Recipe | null>,
  phantom: MarketData,
  dc: MarketData,
  flags: FlagMap,
): ProfitResult | null {
  if (!recipe) return null;
  const materialCost = computeMaterialCost(recipe, recipeMap, dc, flags, phantom);
  const salePrice = salePriceFor(item.id, phantom, dc);
  return { materialCost, salePrice, profit: salePrice - materialCost };
}
