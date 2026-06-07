import type { MarketData } from '../lib/universalis';

export type OpportunityKind = 'crash' | 'spike' | 'empty';

export interface Opportunity {
  itemId: number;
  kind: OpportunityKind;
  /** World holding the DC-cheapest listing (crash/spike); '' for empty (DC-wide). */
  world: string;
  /** recent average price (crash/spike); null for empty. */
  oldValue: number | null;
  /** current DC-cheapest price (crash/spike) or current listingCount (empty). */
  newValue: number | null;
  /** signed % of the current price vs the recent average (crash/spike); null for empty. */
  changePct: number | null;
  velocity: number;
  /** current price × velocity (rough liquidity weight); 0 for empty. */
  gilPerDay: number;
  /** when this deal was first seen in the feed (preserved by mergeDeals). */
  detectedAt: number;
}

export interface OpportunitiesFile {
  ts: number;
  opportunities: Opportunity[];
}

const EMPTY_MAX = 2; // shelf counts as "empty" at or below this many DC-wide listings
// Ignore illiquid items — a price that's "cheap vs its average" on something nobody buys
// isn't a real opportunity. Matches the traded-set floor so full and cold scans agree.
const MIN_VELOCITY = 1;

/**
 * Scan a DC-scope snapshot for the deals that exist **right now** — items whose
 * DC-cheapest currently sits a real margin (`dealPct`, default 25%) below/above the
 * item's own recent average (`avgNQ`, ~7-day), or that are down to their last couple of
 * DC-wide listings. This is a snapshot of the current state (no diff against a previous
 * blob), so the feed reliably has content. Only liquid items (velocity ≥ MIN_VELOCITY)
 * are considered. `empty` wins when an item is both a price deal and nearly sold out.
 */
export function scanDeals(data: MarketData, now: number, dealPct = 25): Opportunity[] {
  const out: Opportunity[] = [];
  for (const [idStr, n] of Object.entries(data)) {
    if (n.velocity < MIN_VELOCITY) continue; // liquid items only
    const itemId = Number(idStr);

    // empty: a selling item down to <= EMPTY_MAX listings DC-wide (craft/sell into the gap)
    if (n.listingCount <= EMPTY_MAX) {
      out.push({
        itemId, kind: 'empty', world: '',
        oldValue: null, newValue: n.listingCount,
        changePct: null, velocity: n.velocity, gilPerDay: 0, detectedAt: now,
      });
      continue; // empty wins over a price deal
    }

    const avg = n.avgNQ;
    if (avg == null || avg <= 0 || n.minNQ == null) continue;
    const dealLine = avg * (1 - dealPct / 100);  // buy when the cheapest is at/below this
    const spikeLine = avg * (1 + dealPct / 100); // sell when the cheapest is at/above this

    let kind: OpportunityKind | null = null;
    if (n.minNQ <= dealLine) kind = 'crash';
    else if (n.minNQ >= spikeLine) kind = 'spike';
    if (!kind) continue;

    out.push({
      itemId, kind,
      world: n.worldListings[0]?.world ?? '',
      oldValue: Math.round(avg), newValue: n.minNQ,
      changePct: Math.round(((n.minNQ - avg) / avg) * 100 * 10) / 10,
      velocity: n.velocity,
      gilPerDay: Math.round(n.minNQ * n.velocity),
      detectedAt: now,
    });
  }
  return out;
}

/**
 * Reconcile the freshly-scanned current deals with the previous feed: the result IS the
 * current set (deals that no longer hold simply drop off), but an item still present keeps
 * its **first-seen** `detectedAt` so the "Seen" column reads how long it's been a deal.
 * New deals keep the `detectedAt` that `scanDeals` already stamped on them. Sorted
 * freshest-first.
 */
export function mergeDeals(existing: Opportunity[], current: Opportunity[]): Opportunity[] {
  const seenAt = new Map<string, number>();
  const keyOf = (o: Opportunity) => `${o.itemId}:${o.kind}`;
  for (const o of existing) seenAt.set(keyOf(o), o.detectedAt);
  return current
    .map((o) => {
      const first = seenAt.get(keyOf(o));
      return first != null && first < o.detectedAt ? { ...o, detectedAt: first } : o;
    })
    .sort((a, b) => b.detectedAt - a.detectedAt);
}
