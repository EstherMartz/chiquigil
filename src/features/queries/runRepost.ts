import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, WorldListing } from '../../lib/universalis';
import { passesMarketGate } from './commonFilters';
import type { HqMode, QueryFilter, QuerySort, RepostRow } from './types';

interface TierCandidate {
  cheapest: number;
  wall: number;
  isHq: boolean;
}

function findGapForTier(listings: WorldListing[], isHq: boolean): TierCandidate | null {
  const prices = listings.filter((l) => l.hq === isHq).map((l) => l.price).sort((a, b) => a - b);
  if (prices.length < 2) return null;
  const cheapest = prices[0];
  const wall = prices.find((p) => p > cheapest);
  if (wall == null) return null;
  return { cheapest, wall, isHq };
}

function tiersToCheck(hq: HqMode, canHq: boolean): boolean[] {
  if (hq === 'nq') return [false];
  if (hq === 'hq') return canHq ? [true] : [];
  return canHq ? [true, false] : [false];
}

function compare(a: RepostRow, b: RepostRow, sort: QuerySort): number {
  switch (sort) {
    case 'gilFlow':   return b.gilPerDay - a.gilPerDay;
    case 'discount':  return b.gapPct - a.gapPct;
    case 'unitPrice': return b.cheapest - a.cheapest;
    case 'velocity':  return b.velocity - a.velocity;
  }
}

export function runRepost(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  filter: QueryFilter,
): RepostRow[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: RepostRow[] = [];

  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    const m = priceMap[item.id];
    if (!m) continue;
    if (!passesMarketGate(m, { minVelocity: filter.minVelocity, maxListings: filter.maxListings ?? null })) continue;

    const tiers = tiersToCheck(filter.hq, item.canHq);
    const candidates: TierCandidate[] = [];
    for (const isHq of tiers) {
      const c = findGapForTier(m.worldListings, isHq);
      if (c) candidates.push(c);
    }
    if (candidates.length === 0) continue;

    const best = candidates.reduce((a, b) => ((a.wall - a.cheapest) >= (b.wall - b.cheapest) ? a : b));
    const gap = best.wall - best.cheapest;
    const gapPct = Math.round((gap / best.wall) * 100);
    const taxedProfit = Math.round(best.wall * 0.95 - best.cheapest);

    if (filter.minGap != null && gap < filter.minGap) continue;
    if (gapPct < filter.minDealPct) continue;
    if (taxedProfit <= 0) continue;
    if (filter.minPrice != null && best.cheapest < filter.minPrice) continue;
    if (filter.maxPrice != null && best.cheapest > filter.maxPrice) continue;

    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      cheapest: best.cheapest,
      wall: best.wall,
      gap,
      gapPct,
      taxedProfit,
      velocity: m.velocity,
      gilPerDay: taxedProfit * m.velocity,
      hq: best.isHq,
    });
  }

  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
