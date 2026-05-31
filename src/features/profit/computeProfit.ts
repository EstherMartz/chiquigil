import type { Recipe, Ingredient } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';
import { applyTax } from '../items/verdict/pricing';

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
  /** Gross marketboard sale price (what a buyer pays), before tax. */
  salePrice: number;
  /** Sale price the seller actually keeps — net of the 5% MB tax when applied. */
  netSalePrice: number;
  /** netSalePrice − materialCost. Net of tax unless applyMarketTax is false. */
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
  applyMarketTax = true,
): ProfitResult | null {
  if (!recipe) return null;
  const materialCost = computeMaterialCost(recipe, recipeMap, dc, flags, phantom);
  const salePrice = salePriceFor(item.id, phantom, dc);
  const netSalePrice = applyMarketTax ? applyTax(salePrice) : salePrice;
  return { materialCost, salePrice, netSalePrice, profit: netSalePrice - materialCost };
}
