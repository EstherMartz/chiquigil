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

const EFFORT_RANK: Record<Effort, number> = { none: 0, craft: 1, 'gather-craft': 2 };

export function daysToClear(card: PathCard, qty: number): number {
  if (card.kind === 'vendor') return 0;
  return card.unitsMovedPerDay > 0 ? qty / card.unitsMovedPerDay : Infinity;
}

export function pickWinner(cards: PathCard[], qty: number): string | null {
  if (cards.length === 0) return null;
  const ranked = [...cards].sort((a, b) => {
    if (b.gilPerDay !== a.gilPerDay) return b.gilPerDay - a.gilPerDay;
    const da = daysToClear(a, qty);
    const db = daysToClear(b, qty);
    if (da !== db) return da - db;
    return EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort];
  });
  return ranked[0].id;
}

export interface QtyWarnings { overcrowding?: string; flood?: string }

export function quantityWarnings(card: PathCard, qty: number): QtyWarnings {
  if (qty <= 1) return {};
  const out: QtyWarnings = {};
  if (card.kind !== 'vendor') {
    const d = daysToClear(card, qty);
    if (Number.isFinite(d) && d > 14) {
      out.overcrowding = `At ${card.unitsMovedPerDay.toFixed(1)}/day, ${qty} units would take ~${d.toFixed(1)} days to sell. Consider splitting or choosing a faster path.`;
    }
    if (card.velocity > 0 && qty > card.velocity * 7) {
      out.flood = 'Crafting this many would likely flood the market.';
    }
  }
  return out;
}

function fmtK(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
}

function clearsPhrase(card: PathCard, qty: number): string {
  const d = daysToClear(card, qty);
  if (card.kind === 'vendor') return 'clears instantly';
  if (!Number.isFinite(d)) return 'no recent demand';
  if (d < 1) return 'clears in under a day';
  return `clears in ~${d.toFixed(1)} days`;
}

export function buildSummaryLine(cards: PathCard[], winnerId: string | null, qty: number): string {
  const winner = cards.find((c) => c.id === winnerId);
  if (!winner) return 'No viable path found.';
  let line = `Best play: ${winner.label} — ${fmtK(winner.gilPerDay)}/day, ${clearsPhrase(winner, qty)}.`;
  const runnerUp = cards
    .filter((c) => c.id !== winner.id && c.kind !== 'vendor')
    .sort((a, b) => b.profitPerUnit - a.profitPerUnit)[0];
  if (runnerUp && runnerUp.profitPerUnit > winner.profitPerUnit) {
    line += ` ${runnerUp.label} yields more per unit but ${clearsPhrase(runnerUp, qty)}.`;
  }
  return line;
}
