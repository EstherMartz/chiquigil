import type { WorldListing, MarketItem } from '../../lib/universalis';
import type { HistoryEntry } from '../../lib/universalisHistory';
import { soldByStack, listedByStack, mergeStacks } from '../items/stackAnalysis';
import { applyTax, confidence, effectiveUnitsPerDay, riskLabel, robustSellPrice } from '../items/verdict/pricing';
import type { Recipe } from '../../lib/recipes';
import type { Quality } from '../items/verdict/types';

export type PathKind = 'sell-raw' | 'vendor' | 'craft-output' | 'craft-intermediate';
export type Effort = 'none' | 'craft' | 'gather-craft';

export interface StackProfile {
  stackSizes: { stackSize: number; soldLast90d: number; listedNow: number; avgPricePerUnit: number }[];
  dominantStack: number;
  volumeAtBest: number;
  listedAtBest: number;
  supplyGap: boolean;
  listingEventsPerDay: number;
}

export interface PathCard {
  id: string;
  kind: PathKind;
  label: string;
  itemId: number;
  itemName: string;
  salePrice: number;
  matCost: number;
  profitPerUnit: number;
  velocity: number;
  unitsMovedPerDay: number;
  gilPerDay: number;
  timeToSellHours: number;
  stack: StackProfile | null;
  risk: string;
  effort: Effort;
}

/**
 * Derive the per-stack-size profile for one sold item. `dominantStack` is the
 * stack size with the most 90-day UNITS sold (tie-break: larger stack).
 * `supplyGap` uses the strict spec rule: real demand at that size, zero current
 * listings. `listingEventsPerDay` converts the units you can move into discrete
 * listing actions. Returns null when there is no 90-day demand.
 */
export function buildStackProfile(
  history: HistoryEntry[],
  listings: WorldListing[],
  hq: boolean,
  unitsMovedPerDay: number,
): StackProfile | null {
  const sold = soldByStack(history, hq);
  if (sold.length === 0) return null;
  const listed = listedByStack(listings, hq);
  const merged = mergeStacks(sold, listed);

  const dominant = sold.reduce((best, r) =>
    r.units > best.units || (r.units === best.units && r.stack > best.stack) ? r : best,
  );
  const dominantRow = merged.find((r) => r.stack === dominant.stack);
  const listedAtBest = dominantRow?.listedCount ?? 0;
  const volumeAtBest = dominant.units;
  const supplyGap = volumeAtBest > 0 && listedAtBest === 0;
  const listingEventsPerDay = dominant.stack > 0 ? unitsMovedPerDay / dominant.stack : unitsMovedPerDay;

  return {
    stackSizes: merged.map((r) => ({
      stackSize: r.stack,
      soldLast90d: r.units,
      listedNow: r.listedCount,
      avgPricePerUnit: r.medianUnitPrice,
    })),
    dominantStack: dominant.stack,
    volumeAtBest,
    listedAtBest,
    supplyGap,
    listingEventsPerDay,
  };
}

function bestSalePrice(market: MarketItem, hq: boolean): number {
  const robust = robustSellPrice(market, hq ? 'HQ' : 'NQ');
  if (robust != null) return robust;
  const median = hq ? market.medianHQ : market.medianNQ;
  const min = hq ? market.minHQ : market.minNQ;
  return median ?? min ?? 0;
}

export function makeMarketCard(args: {
  id: string;
  kind: Exclude<PathKind, 'vendor'>;
  itemId: number;
  itemName: string;
  market: MarketItem;
  history: HistoryEntry[];
  hq: boolean;
  matCost: number;
  effort: Effort;
  now: number;
}): PathCard {
  const { id, kind, itemId, itemName, market, history, hq, matCost, effort, now } = args;
  const quality: Quality = hq ? 'HQ' : 'NQ';
  const salePrice = bestSalePrice(market, hq);
  const profitPerUnit = applyTax(salePrice) - matCost;
  const velocity = market.velocity;
  const unitsMovedPerDay = effectiveUnitsPerDay(velocity, market.listingCount);
  const gilPerDay = profitPerUnit * unitsMovedPerDay;
  const timeToSellHours = velocity > 0 ? 24 / velocity : Infinity;
  const stack = buildStackProfile(history, market.worldListings, hq, unitsMovedPerDay);
  const risk = riskLabel(confidence(market, quality, now), velocity);
  const label = kind === 'sell-raw' ? 'Sell raw (MB)'
    : kind === 'craft-intermediate' ? 'Craft intermediate'
    : `Craft → ${itemName}`;
  return {
    id, kind, label, itemId, itemName,
    salePrice, matCost, profitPerUnit, velocity,
    unitsMovedPerDay, gilPerDay, timeToSellHours, stack, risk, effort,
  };
}

export function makeVendorCard(itemId: number, itemName: string, priceLow: number): PathCard {
  return {
    id: 'vendor', kind: 'vendor', label: 'Vendor', itemId, itemName,
    salePrice: priceLow, matCost: 0, profitPerUnit: priceLow, velocity: 0,
    unitsMovedPerDay: 0, gilPerDay: 0, timeToSellHours: 0, stack: null,
    risk: 'Instant — vendor', effort: 'none',
  };
}

/** Craft effort: "craft" if every ingredient is buyable on the MB, else "gather-craft". */
export function craftEffort(
  recipe: Recipe,
  homeMarket: Record<string, MarketItem | undefined>,
): Effort {
  for (const ing of recipe.ingredients) {
    const m = homeMarket[String(ing.itemId)];
    const hasPrice = (m?.minNQ ?? m?.minHQ ?? 0) > 0;
    if (!hasPrice) return 'gather-craft';
  }
  return 'craft';
}
