import type { Recipe } from '../../lib/recipes';
import type { MarketItem, MarketData } from '../../lib/universalis';

/** Cheapest currency offer for an item, if any (label for display + cost in that currency). */
export type CurrencyResolver = (itemId: number) => { label: string; cost: number } | null;

/** Home-world material cost of one craft: sum of each ingredient's cheapest listing × amount. */
export function recipeMaterialCostHome(
  recipe: Recipe,
  homeMarket: Record<string, MarketItem | undefined> | undefined,
): number {
  if (!homeMarket) return 0;
  let total = 0;
  for (const ing of recipe.ingredients) {
    const m = homeMarket[String(ing.itemId)];
    const px = m?.minNQ ?? m?.minHQ ?? 0;
    total += px * ing.amount;
  }
  return total;
}

/**
 * Cheapest single world to buy every ingredient at once (region scope). Falls back
 * to the home basket cost if no single world stocks the whole recipe.
 */
export function findBestSingleStopFor(
  ingredients: Recipe['ingredients'],
  regionByIngId: Record<string, MarketItem | undefined>,
  homeWorld: string,
  homeBasketCost: number,
): { world: string; cost: number } {
  let best = { world: homeWorld, cost: homeBasketCost };
  const worlds = new Set<string>();
  for (const ing of ingredients) {
    const m = regionByIngId[ing.itemId];
    if (!m) continue;
    for (const l of m.worldListings) if (!l.hq) worlds.add(l.world);
  }
  for (const world of worlds) {
    let total = 0;
    let complete = true;
    for (const ing of ingredients) {
      const m = regionByIngId[ing.itemId];
      const here = m?.worldListings.filter((l) => !l.hq && l.world === world) ?? [];
      if (here.length === 0) { complete = false; break; }
      total += Math.min(...here.map((l) => l.price)) * ing.amount;
    }
    if (complete && total < best.cost) best = { world, cost: total };
  }
  return best;
}

function marketUnit(itemId: number, market: MarketData): number {
  const m = market[itemId];
  return m?.minNQ ?? m?.minHQ ?? 0;
}

/**
 * Gil cost to *self-source* one unit: gatherable and currency-obtainable
 * ingredients cost 0 gil (earned by playing — costs time/currency, not gil),
 * craftable ones recurse into their own self-source cost (÷ the sub-recipe's
 * yield), everything else falls back to its market buy price. Full-depth, with
 * cycle protection. Returns the floor cost in gil of making one yourself.
 */
export function selfSourceCost(
  recipe: Recipe,
  recipeMap: Map<number, Recipe | null>,
  market: MarketData,
  gatherableIds: Set<number>,
  currencyOf: CurrencyResolver = () => null,
  seen: Set<number> = new Set(),
): number {
  let total = 0;
  for (const ing of recipe.ingredients) {
    total += selfSourceUnit(ing.itemId, recipeMap, market, gatherableIds, currencyOf, seen) * ing.amount;
  }
  return total;
}

function selfSourceUnit(
  itemId: number,
  recipeMap: Map<number, Recipe | null>,
  market: MarketData,
  gatherableIds: Set<number>,
  currencyOf: CurrencyResolver,
  seen: Set<number>,
): number {
  if (gatherableIds.has(itemId)) return 0;
  if (currencyOf(itemId)) return 0;
  const sub = recipeMap.get(itemId);
  if (sub && !seen.has(itemId)) {
    const next = new Set(seen).add(itemId);
    const perBatch = selfSourceCost(sub, recipeMap, market, gatherableIds, currencyOf, next);
    return perBatch / (sub.amountResult ?? 1);
  }
  return marketUnit(itemId, market);
}

export type IngredientSourceKind = 'gather' | 'currency' | 'craft' | 'buy';

export interface BreakdownRow {
  itemId: number;
  amount: number;
  kind: IngredientSourceKind;
  /** Self-source cost per unit (0 for gather/currency, sub-cost÷yield for craft, market for buy). */
  unitCost: number;
  lineCost: number;
  /** Sub-recipe yield (units per synth) for craftable rows — for the "÷N" hint. */
  yield?: number;
  /** For currency rows: the currency label + cost per unit (e.g. "P-Craft", 120). */
  currencyLabel?: string;
  currencyCost?: number;
  /** Nested breakdown of a craftable ingredient's own mats (full depth). */
  children?: BreakdownRow[];
}

/**
 * Recursive self-source breakdown: each ingredient classified gather / currency
 * / craft / buy with its per-unit + line cost, craftable ingredients carrying
 * their own nested children (full depth, cycle-guarded). Mirrors selfSourceCost
 * so the tree's costs reconcile with it.
 */
export function selfSourceBreakdown(
  recipe: Recipe,
  recipeMap: Map<number, Recipe | null>,
  market: MarketData,
  gatherableIds: Set<number>,
  currencyOf: CurrencyResolver = () => null,
  seen: Set<number> = new Set([recipe.itemResultId]),
): BreakdownRow[] {
  return recipe.ingredients.map((ing) => {
    const gatherable = gatherableIds.has(ing.itemId);
    const offer = gatherable ? null : currencyOf(ing.itemId);
    const sub = recipeMap.get(ing.itemId);
    const craftable = !gatherable && !offer && !!sub && !seen.has(ing.itemId);
    const kind: IngredientSourceKind = gatherable ? 'gather'
      : offer ? 'currency'
      : craftable ? 'craft'
      : 'buy';

    const unitCost = selfSourceUnit(ing.itemId, recipeMap, market, gatherableIds, currencyOf, new Set(seen));
    const row: BreakdownRow = {
      itemId: ing.itemId, amount: ing.amount, kind, unitCost, lineCost: unitCost * ing.amount,
    };
    if (offer) {
      row.currencyLabel = offer.label;
      row.currencyCost = offer.cost;
    }
    if (craftable && sub) {
      row.yield = sub.amountResult ?? 1;
      row.children = selfSourceBreakdown(sub, recipeMap, market, gatherableIds, currencyOf, new Set(seen).add(ing.itemId));
    }
    return row;
  });
}
