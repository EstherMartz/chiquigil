import type { WorldListing } from '../../lib/universalis';
import type { HistoryEntry } from '../../lib/universalisHistory';
import { soldByStack, listedByStack, mergeStacks } from '../items/stackAnalysis';

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
