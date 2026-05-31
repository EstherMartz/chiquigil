import type { WatchlistRow } from '../watchlist/buildRows';
import type { WorldListing } from '../../lib/universalis';
import { detectAlert } from '../watchlist/alerts';

// ── Portfolio KPI strip ──────────────────────────────────────────────────

export interface PortfolioTotals {
  /** Σ gil/day across every row that has a value — the watchlist's daily potential. */
  totalGilPerDay: number;
  /** Σ net profit/unit across craftable rows — one "full sweep" payout. */
  totalProfitPerUnit: number;
  craftableCount: number;
  saleOnlyCount: number;
  trackedCount: number;
  /** Median net margin across craftable rows (0–1), or null when none priced. */
  medianMargin: number | null;
  alertCount: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Net margin (0–1) for a craftable row, or null when it can't be computed. */
export function rowMargin(r: WatchlistRow): number | null {
  if (r.craftable !== true || r.profit == null || r.salePrice == null || r.salePrice <= 0) return null;
  return r.profit / r.salePrice;
}

export function portfolioTotals(rows: WatchlistRow[]): PortfolioTotals {
  let totalGilPerDay = 0;
  let totalProfitPerUnit = 0;
  let craftableCount = 0;
  let saleOnlyCount = 0;
  let alertCount = 0;
  const margins: number[] = [];

  for (const r of rows) {
    if (r.gilPerDay != null) totalGilPerDay += r.gilPerDay;
    if (r.craftable === true) {
      craftableCount++;
      if (r.profit != null) totalProfitPerUnit += r.profit;
      const m = rowMargin(r);
      if (m != null) margins.push(m);
    } else if (r.craftable === false) {
      saleOnlyCount++;
    }
    if (detectAlert(r) != null) alertCount++;
  }

  return {
    totalGilPerDay: Math.round(totalGilPerDay),
    totalProfitPerUnit: Math.round(totalProfitPerUnit),
    craftableCount,
    saleOnlyCount,
    trackedCount: rows.length,
    medianMargin: median(margins),
    alertCount,
  };
}

// ── Margin distribution histogram ────────────────────────────────────────

export interface MarginBucket {
  label: string;
  /** Inclusive lower / exclusive upper bound in margin fraction (Infinity for the top bin). */
  min: number;
  max: number;
  count: number;
  /** Hex fill for a Recharts <Cell>. */
  fill: string;
}

const BUCKET_DEFS: Omit<MarginBucket, 'count'>[] = [
  { label: '< 0%',   min: -Infinity, max: 0,        fill: '#b5524e' },
  { label: '0–10%',  min: 0,         max: 0.1,      fill: '#9a8f7a' },
  { label: '10–25%', min: 0.1,       max: 0.25,     fill: '#d4a857' },
  { label: '25–40%', min: 0.25,      max: 0.4,      fill: '#b9b06a' },
  { label: '40%+',   min: 0.4,       max: Infinity, fill: '#7ab06f' },
];

export function marginBuckets(rows: WatchlistRow[]): MarginBucket[] {
  const buckets = BUCKET_DEFS.map((b) => ({ ...b, count: 0 }));
  for (const r of rows) {
    const m = rowMargin(r);
    if (m == null) continue;
    const bucket = buckets.find((b) => m >= b.min && m < b.max);
    if (bucket) bucket.count++;
  }
  return buckets;
}

// ── Leaderboards ─────────────────────────────────────────────────────────

export function gilPerDayLeaders(rows: WatchlistRow[], n: number): WatchlistRow[] {
  return rows
    .filter((r) => r.gilPerDay != null && r.gilPerDay > 0)
    .sort((a, b) => (b.gilPerDay ?? 0) - (a.gilPerDay ?? 0))
    .slice(0, n);
}

export function velocityLeaders(rows: WatchlistRow[], n: number): WatchlistRow[] {
  return rows
    .filter((r) => r.dcSpd > 0)
    .sort((a, b) => b.dcSpd - a.dcSpd)
    .slice(0, n);
}

// ── Concentration ────────────────────────────────────────────────────────

export interface Concentration {
  topN: number;
  /** Fraction (0–1) of total gil/day the top-N rows account for. */
  topShare: number;
  total: number;
  leaders: WatchlistRow[];
}

export function concentration(rows: WatchlistRow[], n: number): Concentration {
  const leaders = gilPerDayLeaders(rows, n);
  const total = rows.reduce((sum, r) => sum + (r.gilPerDay ?? 0), 0);
  const topSum = leaders.reduce((sum, r) => sum + (r.gilPerDay ?? 0), 0);
  return { topN: leaders.length, topShare: total > 0 ? topSum / total : 0, total, leaders };
}

// ── "What changed" digest ────────────────────────────────────────────────

export interface MoversDigest {
  gainers: WatchlistRow[];
  losers: WatchlistRow[];
  stale: WatchlistRow[];
}

export function moversDigest(rows: WatchlistRow[], limit = 6): MoversDigest {
  const gainers: WatchlistRow[] = [];
  const losers: WatchlistRow[] = [];
  const stale: WatchlistRow[] = [];
  for (const r of rows) {
    const alert = detectAlert(r);
    if (alert === 'spike') gainers.push(r);
    else if (alert === 'crashed') losers.push(r);
    else if (alert === 'stale') stale.push(r);
  }
  gainers.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  losers.sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));
  stale.sort((a, b) => (b.staleDays ?? 0) - (a.staleDays ?? 0));
  return {
    gainers: gainers.slice(0, limit),
    losers: losers.slice(0, limit),
    stale: stale.slice(0, limit),
  };
}

// ── Cross-world spread ───────────────────────────────────────────────────

export interface WorldSpread {
  id: number;
  name: string;
  homeFloor: number;
  bestWorld: string;
  bestPrice: number;
  /** homeFloor − bestPrice: gross gil/unit saved by sourcing off-world. */
  spread: number;
  /** spread / homeFloor. */
  spreadPct: number;
  velocity: number;
}

function cheapestByWorld(listings: WorldListing[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of listings) {
    if (l.price <= 0 || !l.world) continue;
    const cur = m.get(l.world);
    if (cur == null || l.price < cur) m.set(l.world, l.price);
  }
  return m;
}

/**
 * Items worth buying on a cheaper world inside the DC and reselling at home.
 * `listingsById` is the DC-scope worldListings per item; `homeWorld` is the
 * seller's world. Returns the top-N by absolute spread, positive spread only.
 */
export function spreadByWorld(
  rows: WatchlistRow[],
  listingsById: Map<number, WorldListing[]>,
  homeWorld: string,
  n: number,
): WorldSpread[] {
  const out: WorldSpread[] = [];
  for (const r of rows) {
    const listings = listingsById.get(r.id);
    if (!listings || listings.length === 0) continue;
    const byWorld = cheapestByWorld(listings);
    const homeFloor = byWorld.get(homeWorld);
    if (homeFloor == null || homeFloor <= 0) continue;

    let bestWorld = '';
    let bestPrice = Infinity;
    for (const [world, price] of byWorld) {
      if (world === homeWorld) continue;
      if (price < bestPrice) { bestPrice = price; bestWorld = world; }
    }
    if (!bestWorld || bestPrice >= homeFloor) continue;

    const spread = homeFloor - bestPrice;
    out.push({
      id: r.id, name: r.name, homeFloor, bestWorld, bestPrice,
      spread, spreadPct: spread / homeFloor, velocity: r.dcSpd,
    });
  }
  return out.sort((a, b) => b.spread - a.spread).slice(0, n);
}
