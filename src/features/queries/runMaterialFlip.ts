import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
import type { HqMode, MaterialFlipFilter, MaterialFlipRow } from './types';
import { dcOf, CHAOS_WORLDS, EU_WORLDS } from '../../lib/europeWorlds';

interface SaleTier { unit: number; isHq: boolean }

function pickTrustedSaleTier(m: MarketItem, hq: HqMode, canHq: boolean): SaleTier | null {
  const candidates: Array<{ rawMin: number | null; median: number | null; recent: number; isHq: boolean }> = [];
  if ((hq === 'hq' || hq === 'either') && canHq) {
    candidates.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  }
  if (hq === 'nq' || hq === 'either') {
    candidates.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  }
  for (const c of candidates) {
    if (c.rawMin == null) continue;
    if (c.recent < MIN_RECENT_SALES) continue;
    if (c.median == null) continue;
    if (c.rawMin > c.median * MAX_LISTING_RATIO) continue;
    return { unit: Math.min(c.rawMin, c.median), isHq: c.isHq };
  }
  return null;
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
    if (sale.velocity < filter.minVelocity) continue;
    if (filter.maxListings != null && sale.listingCount > filter.maxListings) continue;

    const tier = pickTrustedSaleTier(sale, filter.hq, item.canHq);
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
  return out;
}
