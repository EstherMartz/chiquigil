import type { MarketData } from '../lib/universalis';
import { applyTax } from '../features/items/verdict/pricing';
import { foldSpreadCycle, spreadKey, type SpreadHistoryMap } from '../lib/spreadHistory';

/**
 * Fold one refresh cycle into the prior spread-history map.
 *
 * For each item in the DC market data we find the home-world floor and, for every
 * OTHER world's cheapest listing, decide whether a positive NET spread exists
 * (applyTax(homeFloor) - otherPrice > 0). Pairs seen this cycle are incremented;
 * pairs in `prev` not seen this cycle are dropped (reset to New on next detection).
 *
 * Pure — no IO. Keyed (item_id, world); home world is implicit (`homeWorld`).
 */
export function foldCycleForBundle(
  dc: MarketData,
  homeWorld: string,
  prev: SpreadHistoryMap,
  nowMs: number,
): SpreadHistoryMap {
  const next: SpreadHistoryMap = {};
  const seen = new Set<string>();

  for (const [idStr, item] of Object.entries(dc)) {
    const id = Number(idStr);
    const listings = item.worldListings;
    if (!listings || listings.length === 0) continue;

    let homeFloor = Infinity;
    const cheapestByWorld = new Map<string, number>();
    for (const l of listings) {
      if (l.world === homeWorld) homeFloor = Math.min(homeFloor, l.price);
      else {
        const cur = cheapestByWorld.get(l.world);
        if (cur == null || l.price < cur) cheapestByWorld.set(l.world, l.price);
      }
    }
    if (!Number.isFinite(homeFloor)) continue;

    const netHome = applyTax(homeFloor);
    for (const [world, price] of cheapestByWorld) {
      if (netHome - price <= 0) continue;
      const key = spreadKey(id, world);
      seen.add(key);
      const folded = foldSpreadCycle(prev[key], true, nowMs);
      if (folded) next[key] = folded;
    }
  }

  return next;
}
