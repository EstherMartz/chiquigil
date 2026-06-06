import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketItem, MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { HistoryEntry } from '../../lib/universalisHistory';
import { computeWeekDelta } from '../../lib/universalisHistory';
import { robustSellPrice, applyTax, effectiveUnitsPerDay } from '../items/verdict/pricing';

export interface HousingRow {
  id: number;
  name: string;
  price: number | null;
  velocity: number;
  momentumPct: number | null;
  craftMargin: number | null;
  craftGilPerDay: number | null;
}

export type HousingSortKey = 'momentumPct' | 'craftGilPerDay' | 'craftMargin' | 'velocity' | 'price';

/**
 * Unique recipe-ingredient item ids for the given craftable items.
 *
 * The market scan only fetches prices for the candidate furnishings, but
 * housingMaterialCost needs prices for their *ingredients* (which are not
 * furnishings and so are never in the candidate set). Without fetching these,
 * every material cost — and therefore every craft margin / gil-per-day — comes
 * back null. Returns the ingredient ids so the scan can fetch them too.
 */
export function collectRecipeIngredientIds(
  itemIds: number[],
  recipes: Map<number, Recipe | null>,
): number[] {
  const out = new Set<number>();
  for (const id of itemIds) {
    const recipe = recipes.get(id);
    if (!recipe) continue;
    for (const ing of recipe.ingredients) out.add(ing.itemId);
  }
  return [...out];
}

/**
 * Per-unit price for a single ingredient: the DC-wide cheapest current listing
 * (`minNQ ?? minHQ`), falling back to the home-world recent average
 * (`avgNQ ?? avgHQ`) when the mat is momentarily unlisted DC-wide. Both are real
 * price signals — furnishing mats are bought DC-wide (you travel for them), and
 * the home average is a sane estimate when nothing is currently listed. Mirrors
 * the DC-min → home-avg precedence the regular craft views use (`unitCost` in
 * computeProfit). Returns null only when neither signal exists.
 */
function ingredientUnitPrice(dc: MarketItem | undefined, home: MarketItem | undefined): number | null {
  const dcMin = dc?.minNQ ?? dc?.minHQ ?? null;
  if (dcMin != null) return dcMin;
  return home?.avgNQ ?? home?.avgHQ ?? null;
}

/**
 * Total cost of a recipe's ingredients, each priced via ingredientUnitPrice
 * (DC-cheapest, then home-average). Returns `null` if any single ingredient
 * can't be priced at all — a real listing is never 0 gil, so treating a missing
 * mat as free would understate the total and overstate the displayed craft
 * margin; better to surface "—" than a fabricated profit. An empty ingredient
 * list returns 0 (nothing to buy).
 */
export function housingMaterialCost(recipe: Recipe, dcMarket: MarketData, homeMarket: MarketData): number | null {
  let total = 0;
  for (const ing of recipe.ingredients) {
    const px = ingredientUnitPrice(dcMarket[String(ing.itemId)], homeMarket[String(ing.itemId)]);
    if (px == null) return null;
    total += px * ing.amount;
  }
  return total;
}

export function buildHousingRow(input: {
  item: SnapshotItem;
  market: MarketItem | undefined;
  recipe: Recipe | undefined;
  materialCost: number | null;
  history: HistoryEntry[] | undefined;
  now: number;
}): HousingRow {
  const { item, market, recipe, materialCost, history, now } = input;
  const quality = item.canHq ? 'HQ' : 'NQ';
  const price = market ? robustSellPrice(market, quality) : null;
  const velocity = market?.velocity ?? 0;
  const momentumPct = history ? computeWeekDelta(history, now) : null;

  let craftMargin: number | null = null;
  let craftGilPerDay: number | null = null;
  if (recipe && materialCost != null && materialCost > 0 && price != null) {
    craftMargin = applyTax(price) - materialCost;
    const units = market ? effectiveUnitsPerDay(market.velocity, market.listingCount) : 0;
    craftGilPerDay = craftMargin * units;
  }

  return { id: item.id, name: item.name, price, velocity, momentumPct, craftMargin, craftGilPerDay };
}

/** Sort rows by a numeric key descending, with null/undefined values always last. */
export function sortHousingRows(rows: HousingRow[], key: HousingSortKey): HousingRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
}
