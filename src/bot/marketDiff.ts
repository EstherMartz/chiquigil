import type { MarketData } from '../lib/universalis';

export type OpportunityKind = 'crash' | 'spike' | 'empty';

export interface Opportunity {
  itemId: number;
  kind: OpportunityKind;
  /** World holding the DC-cheapest listing (crash/spike); '' for empty (DC-wide). */
  world: string;
  /** prev minNQ (crash/spike) or prev listingCount (empty). */
  oldValue: number | null;
  /** next minNQ (crash/spike) or next listingCount (empty). */
  newValue: number | null;
  /** Signed % move for crash/spike; null for empty. */
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

// Thresholds mirror src/features/watchlist/alerts.ts (kept in sync intentionally).
const SPIKE_PCT = 20;
const CRASH_PCT = -20;
const EMPTY_MAX = 2; // shelf counts as "empty" at or below this many DC-wide listings

/**
 * Diff two DC-scope market snapshots, emitting one opportunity per item that crossed
 * a threshold this refresh. `prev`/`next` are the `dc` MarketData (cheapest aggregated
 * across all DC worlds). Items with no prev counterpart are skipped. `empty` wins when
 * an item both moved price AND emptied (the rarer, stronger signal).
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

    // crash/spike: needs a positive prev baseline and a next price
    if (p.minNQ != null && p.minNQ > 0 && n.minNQ != null) {
      const changePct = ((n.minNQ - p.minNQ) / p.minNQ) * 100;
      const kind: OpportunityKind | null =
        changePct <= CRASH_PCT ? 'crash' : changePct >= SPIKE_PCT ? 'spike' : null;
      if (kind) {
        out.push({
          itemId, kind,
          world: n.worldListings[0]?.world ?? '',
          oldValue: p.minNQ, newValue: n.minNQ,
          changePct: Math.round(changePct * 10) / 10,
          velocity: n.velocity,
          gilPerDay: Math.round(n.minNQ * n.velocity),
          detectedAt: now,
        });
      }
    }
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
