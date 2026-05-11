import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import { computeMaterialCost } from '../profit/computeProfit';
import type { CraftFlipRow, HqMode, QueryFilter, QuerySort } from './types';

function pickTier(m: MarketItem, hq: HqMode, canHq: boolean): { unit: number; isHq: boolean } | null {
  const hqUnit = m.minHQ;
  const nqUnit = m.minNQ;
  if (hq === 'hq') {
    if (!canHq || hqUnit == null) return null;
    return { unit: hqUnit, isHq: true };
  }
  if (hq === 'nq') {
    if (nqUnit == null) return null;
    return { unit: nqUnit, isHq: false };
  }
  // 'either' — prefer HQ when item is HQ-capable and HQ price exists; else NQ.
  if (canHq && hqUnit != null) return { unit: hqUnit, isHq: true };
  if (nqUnit != null) return { unit: nqUnit, isHq: false };
  return null;
}

function hasUsableTier(m: MarketItem, hq: HqMode, canHq: boolean): boolean {
  return pickTier(m, hq, canHq) !== null;
}

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
    if (m.velocity < filter.minVelocity) continue;
    if (filter.maxListings != null && m.listingCount > filter.maxListings) continue;
    if (!hasUsableTier(m, filter.hq, item.canHq)) continue;
    out.push(item.id);
  }
  return out;
}

function compare(a: CraftFlipRow, b: CraftFlipRow, sort: QuerySort): number {
  switch (sort) {
    case 'gilFlow':   return b.gilPerDay - a.gilPerDay;
    case 'velocity':  return b.velocity - a.velocity;
    case 'unitPrice': return b.unitPrice - a.unitPrice;
    case 'discount':  // profit margin desc
      return (b.profit / Math.max(1, b.unitPrice)) - (a.profit / Math.max(1, a.unitPrice));
  }
}

export function runCraftFlip(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  recipeMap: Map<number, Recipe | null>,
  filter: QueryFilter,
): CraftFlipRow[] {
  const narrowed = new Set(narrowForCraftFlip(snapshot, priceMap, filter));
  const out: CraftFlipRow[] = [];

  for (const item of snapshot) {
    if (!narrowed.has(item.id)) continue;
    const recipe = recipeMap.get(item.id);
    if (!recipe) continue;                    // undefined (unresolved) or null (no recipe) — drop

    const m = priceMap[item.id];
    const tier = pickTier(m, filter.hq, item.canHq);
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
