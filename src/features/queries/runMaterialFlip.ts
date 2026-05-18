import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import { pickFirstTrustedTier } from '../../lib/priceTrust';
import { descBy } from '../../lib/sort';
import { passesMarketGate } from './commonFilters';
import type { MaterialFlipFilter, MaterialFlipRow, MaterialFlipSort } from './types';
import { dcOf, CHAOS_WORLDS, EU_WORLDS } from '../../lib/europeWorlds';

export const MATERIAL_FLIP_COMPARATORS: Record<MaterialFlipSort, (a: MaterialFlipRow, b: MaterialFlipRow) => number> = {
  gilSavedPerDay: descBy((r) => r.gilSavedPerDay),
  savePerCraft:   descBy((r) => r.perIngredientSavings),
  pctDiscount:    descBy((r) => r.pctDiscount),
  salePrice:      descBy((r) => r.salePrice),
  velocity:       descBy((r) => r.velocity),
};

export function narrowForMaterialFlip(
  snapshot: SnapshotItem[],
  saleMap: MarketData,
  filter: MaterialFlipFilter,
): number[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: number[] = [];
  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.hq === 'hq' && !item.canHq) continue;
    const m = saleMap[item.id];
    if (!m) continue;
    if (!passesMarketGate(m, { minVelocity: filter.minVelocity, maxListings: filter.maxListings ?? null })) continue;
    if (pickFirstTrustedTier(m, filter.hq, item.canHq) == null) continue;
    out.push(item.id);
  }
  return out;
}

function homeIngredientPrice(m: MarketItem | undefined, homeWorld: string): number {
  if (!m) return 0;
  const nq = m.worldListings.filter((l) => !l.hq && l.world === homeWorld);
  if (nq.length) return Math.min(...nq.map((l) => l.price));
  return 0;
}

function bestRegionIngredientPrice(m: MarketItem | undefined, worldFilter: (w: string) => boolean): number | null {
  if (!m) return null;
  const nq = m.worldListings.filter((l) => !l.hq && worldFilter(l.world));
  if (nq.length === 0) return null;
  return Math.min(...nq.map((l) => l.price));
}


function findBestSingleStop(
  ingredients: { itemId: number; amount: number }[],
  ingMap: MarketData,
  candidateWorlds: Iterable<string>,
  homeWorld: string,
  homeMatCost: number,
): { world: string; cost: number } {
  let best = { world: homeWorld, cost: homeMatCost };
  for (const world of candidateWorlds) {
    let total = 0;
    let complete = true;
    for (const ing of ingredients) {
      const m = ingMap[ing.itemId];
      if (!m) { complete = false; break; }
      const here = m.worldListings.filter((l) => !l.hq && l.world === world);
      if (here.length === 0) { complete = false; break; }
      total += Math.min(...here.map((l) => l.price)) * ing.amount;
    }
    if (complete && total < best.cost) best = { world, cost: total };
  }
  return best;
}

export function runMaterialFlip(
  snapshot: SnapshotItem[],
  saleMap: MarketData,
  ingMap: MarketData,
  recipeMap: Map<number, Recipe | null>,
  homeWorld: string,
  filter: MaterialFlipFilter,
): MaterialFlipRow[] {
  const out: MaterialFlipRow[] = [];
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;

  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.hq === 'hq' && !item.canHq) continue;

    const sale = saleMap[item.id];
    if (!sale) continue;
    if (!passesMarketGate(sale, { minVelocity: filter.minVelocity, maxListings: filter.maxListings ?? null })) continue;

    const tier = pickFirstTrustedTier(sale, filter.hq, item.canHq);
    if (!tier) continue;

    const recipe = recipeMap.get(item.id);
    if (!recipe) continue;

    const candidateWorlds = filter.includeLightDc ? EU_WORLDS : CHAOS_WORLDS;
    const worldFilter = (w: string) => candidateWorlds.has(w);

    let homeMatCost = 0;
    let bestPerIngredientCost = 0;
    for (const ing of recipe.ingredients) {
      const ingMarket = ingMap[ing.itemId];
      const homeUnit = homeIngredientPrice(ingMarket, homeWorld);
      const bestUnit = bestRegionIngredientPrice(ingMarket, worldFilter);
      homeMatCost += homeUnit * ing.amount;
      bestPerIngredientCost += (bestUnit ?? homeUnit) * ing.amount;
    }

    const perIngredientSavings = homeMatCost - bestPerIngredientCost;
    if (perIngredientSavings < filter.minSavings) continue;

    const singleStop = findBestSingleStop(
      recipe.ingredients, ingMap, candidateWorlds, homeWorld, homeMatCost,
    );

    out.push({
      id: item.id, name: item.name, sc: item.sc, hq: tier.isHq,
      salePrice: tier.unit, velocity: sale.velocity,
      homeMatCost, bestPerIngredientCost, perIngredientSavings,
      bestSingleWorld: singleStop.world,
      singleStopCost: singleStop.cost,
      singleStopSavings: homeMatCost - singleStop.cost,
      needsDcTravel: dcOf(singleStop.world) === 'Light',
      gilSavedPerDay: perIngredientSavings * sale.velocity,
      pctDiscount: perIngredientSavings / Math.max(1, homeMatCost),
    });
  }
  out.sort((a, b) => {
    const cmp = MATERIAL_FLIP_COMPARATORS[filter.sort](a, b);
    return cmp !== 0 ? cmp : a.id - b.id;  // stable tie-break by id asc
  });
  return out.slice(0, filter.limit);
}
