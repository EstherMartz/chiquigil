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

export function housingMaterialCost(recipe: Recipe, market: MarketData): number {
  let total = 0;
  for (const ing of recipe.ingredients) {
    const m = market[String(ing.itemId)];
    const px = m ? (m.minNQ ?? m.minHQ ?? 0) : 0;
    total += px * ing.amount;
  }
  return total;
}

export function buildHousingRow(input: {
  item: SnapshotItem;
  market: MarketItem | undefined;
  recipe: Recipe | undefined;
  materialCost: number;
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
  if (recipe && materialCost > 0 && price != null) {
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
