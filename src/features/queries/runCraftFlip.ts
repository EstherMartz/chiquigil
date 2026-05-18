import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { CrafterLevels } from '../items/craftStatus';
import { pickFirstTrustedTier } from '../../lib/priceTrust';
import { computeMaterialCost } from '../profit/computeProfit';
import { passesMarketGate } from './commonFilters';
import type { CraftFlipRow, QueryFilter, QuerySort } from './types';

export function narrowForCraftFlip(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  filter: QueryFilter,
): number[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: number[] = [];
  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.hq === 'hq' && !item.canHq) continue;
    const m = priceMap[item.id];
    if (!m) continue;
    if (!passesMarketGate(m, { minVelocity: filter.minVelocity, maxListings: filter.maxListings ?? null })) continue;
    if (pickFirstTrustedTier(m, filter.hq, item.canHq) == null) continue;
    out.push(item.id);
  }
  return out;
}

function compare(a: CraftFlipRow, b: CraftFlipRow, sort: QuerySort): number {
  switch (sort) {
    case 'gilFlow':   return b.gilPerDay - a.gilPerDay;
    case 'velocity':  return b.velocity - a.velocity;
    case 'unitPrice': return b.unitPrice - a.unitPrice;
    case 'discount':
      return (b.profit / Math.max(1, b.unitPrice)) - (a.profit / Math.max(1, a.unitPrice));
  }
}

export function runCraftFlip(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  recipeMap: Map<number, Recipe | null>,
  filter: QueryFilter,
  levels?: CrafterLevels,
): CraftFlipRow[] {
  const narrowed = new Set(narrowForCraftFlip(snapshot, priceMap, filter));
  const out: CraftFlipRow[] = [];

  for (const item of snapshot) {
    if (!narrowed.has(item.id)) continue;
    const recipe = recipeMap.get(item.id);
    if (!recipe) continue;

    if (filter.trainedEye) {
      if (!levels) continue;
      if (recipe.classJob === 'ANY') continue;
      const crafterLevel = levels[recipe.classJob];
      if (crafterLevel == null) continue;
      if (recipe.recipeLevel > crafterLevel - 10) continue;
    }

    const m = priceMap[item.id];
    const tier = pickFirstTrustedTier(m, filter.hq, item.canHq);
    if (!tier) continue;

    const materialCost = computeMaterialCost(recipe, recipeMap, priceMap, {});
    const profit = tier.unit - materialCost;
    if (profit <= 0) continue;
    if (filter.minPrice != null && tier.unit < filter.minPrice) continue;
    if (filter.maxPrice != null && tier.unit > filter.maxPrice) continue;

    out.push({
      id: item.id, name: item.name, sc: item.sc,
      unitPrice: tier.unit,
      materialCost,
      profit,
      velocity: m.velocity,
      gilPerDay: profit * m.velocity,
      hq: tier.isHq,
    });
  }

  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
