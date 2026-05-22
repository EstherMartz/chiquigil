import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { Recipe } from '../../lib/recipes';

const MIN_VELOCITY = 0.1;

export interface HeatmapCell {
  id: number;
  name: string;
  area: number;
  salePrice: number;
  velocity: number;
  margin: number | null;
  craftable: boolean;
}

function salePrice(m: MarketItem): number {
  return m.medianNQ ?? m.medianHQ ?? m.minNQ ?? m.minHQ ?? 0;
}

function ingredientCost(recipe: Recipe, market: MarketData): number | null {
  let total = 0;
  for (const ing of recipe.ingredients) {
    const m = market[String(ing.itemId)];
    if (!m) return null;
    const price = m.minNQ ?? m.minHQ ?? 0;
    if (price === 0) return null;
    total += price * ing.amount;
  }
  return total;
}

export function buildHeatmapCells(
  items: SnapshotItem[],
  market: MarketData,
  recipes: Map<number, Recipe>,
): HeatmapCell[] {
  const out: HeatmapCell[] = [];
  for (const item of items) {
    const m = market[String(item.id)];
    if (!m || m.velocity < MIN_VELOCITY) continue;
    const price = salePrice(m);
    if (price <= 0) continue;

    const recipe = recipes.get(item.id);
    let margin: number | null = null;
    let craftable = false;
    if (recipe) {
      const matCost = ingredientCost(recipe, market);
      if (matCost != null && matCost > 0) {
        margin = (price - matCost) / price;
        craftable = true;
      }
    }

    out.push({
      id: item.id,
      name: item.name,
      area: m.velocity,
      salePrice: price,
      velocity: m.velocity,
      margin,
      craftable,
    });
  }
  return out;
}
