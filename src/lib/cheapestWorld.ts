import type { MarketItem } from './universalis';

export interface CheapestWorld {
  world: string;
  price: number;
}

/**
 * Find the cheapest world for an item from its per-world listings.
 * Most useful on DC-scope market data, where worldListings spans every world
 * on the data centre — i.e. "where can I buy this cheapest right now".
 *
 * @param m   the market entry (may be undefined/null)
 * @param hq  optionally restrict to HQ (true) or NQ (false) listings; omit for either
 */
export function cheapestWorld(m: MarketItem | undefined | null, hq?: boolean): CheapestWorld | null {
  if (!m || !m.worldListings || m.worldListings.length === 0) return null;
  let best: CheapestWorld | null = null;
  for (const l of m.worldListings) {
    if (hq != null && l.hq !== hq) continue;
    if (l.price <= 0) continue;
    if (best === null || l.price < best.price) best = { world: l.world, price: l.price };
  }
  return best;
}
