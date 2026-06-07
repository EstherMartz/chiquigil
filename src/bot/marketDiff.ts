import type { MarketData } from '../lib/universalis';

export type OpportunityKind = 'crash' | 'spike' | 'empty';

export interface Opportunity {
  itemId: number;
  kind: OpportunityKind;
  /** World holding the DC-cheapest listing (crash/spike); '' for empty (DC-wide). */
  world: string;
  /** recent average price (crash/spike) or prev listingCount (empty). */
  oldValue: number | null;
  /** current DC-cheapest price (crash/spike) or current listingCount (empty). */
  newValue: number | null;
  /** signed % of the current price vs the recent average (crash/spike); null for empty. */
  changePct: number | null;
  velocity: number;
  /** next minNQ × velocity (rough liquidity weight); 0 for empty. */
  gilPerDay: number;
  detectedAt: number;
}

export interface OpportunitiesFile {
  ts: number;
  opportunities: Opportunity[];
}

// How far the DC-cheapest must sit from the item's own recent average (avgNQ) to count
// as a deal / overprice. A 20%-since-last-blob delta was far too strict (≈0 hits across
// 50k items) because real swings happen gradually; measuring against the stable ~7-day
// average instead catches "cheap vs its norm" reliably.
const DEAL_PCT = 15;
const EMPTY_MAX = 2; // shelf counts as "empty" at or below this many DC-wide listings

/**
 * Diff two DC-scope market snapshots, emitting one opportunity per item that crossed a
 * threshold THIS refresh. `prev`/`next` are the `dc` MarketData (cheapest aggregated
 * across all DC worlds). Price signals fire when the DC-cheapest crosses ±DEAL_PCT of
 * the item's recent average (avgNQ) this refresh — measured against the stable average,
 * but requiring a fresh crossing so the feed stays a delta, not a static ranking. Items
 * with no prev counterpart are skipped. `empty` wins when an item both crosses price AND
 * empties (the rarer, stronger signal).
 */
export function diffMarket(prev: MarketData, next: MarketData, now: number): Opportunity[] {
  const out: Opportunity[] = [];
  for (const [idStr, n] of Object.entries(next)) {
    const p = prev[idStr];
    if (!p) continue; // no baseline
    const itemId = Number(idStr);

    // empty: DC-wide supply dropped to <= EMPTY_MAX from above it
    if (p.listingCount > EMPTY_MAX && n.listingCount <= EMPTY_MAX) {
      out.push({
        itemId, kind: 'empty', world: '',
        oldValue: p.listingCount, newValue: n.listingCount,
        changePct: null, velocity: n.velocity, gilPerDay: 0, detectedAt: now,
      });
      continue; // empty wins over a price move
    }

    // crash/spike: the DC-cheapest crossing its recent-average band this refresh.
    const avg = n.avgNQ;
    if (avg == null || avg <= 0 || p.minNQ == null || n.minNQ == null) continue;
    const dealLine = avg * (1 - DEAL_PCT / 100);  // newly cheap when min drops to/below this
    const spikeLine = avg * (1 + DEAL_PCT / 100); // newly pricey when min rises to/above this

    let kind: OpportunityKind | null = null;
    if (p.minNQ > dealLine && n.minNQ <= dealLine) kind = 'crash';
    else if (p.minNQ < spikeLine && n.minNQ >= spikeLine) kind = 'spike';
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
 * Merge freshly-detected opportunities into the rolling feed: union keyed by
 * item+kind (fresh wins, since fresh.detectedAt >= existing), drop entries older than
 * `ttlMs`, return freshest-first.
 */
export function mergeOpportunities(
  existing: Opportunity[], fresh: Opportunity[], ttlMs: number, now: number,
): Opportunity[] {
  const byKey = new Map<string, Opportunity>();
  const keyOf = (o: Opportunity) => `${o.itemId}:${o.kind}`;
  for (const o of existing) byKey.set(keyOf(o), o);
  for (const o of fresh) byKey.set(keyOf(o), o);
  const cutoff = now - ttlMs;
  return [...byKey.values()]
    .filter((o) => o.detectedAt >= cutoff)
    .sort((a, b) => b.detectedAt - a.detectedAt);
}
