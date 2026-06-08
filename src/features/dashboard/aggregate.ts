import type { WatchlistRow } from '../watchlist/buildRows';
import type { ItemCategory } from '../items/types';
import type { WorldListing } from '../../lib/universalis';
import { detectAlert } from '../watchlist/alerts';
import { classifyValue, type FairValueSignal, type HistorySummary } from '../fairvalue/fairValue';

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
  /** Σ gil/day of the items in this bin — the velocity-weighted "so what". */
  gilPerDay: number;
  /** Hex fill for a Recharts <Cell>. */
  fill: string;
}

const BUCKET_DEFS: Omit<MarginBucket, 'count' | 'gilPerDay'>[] = [
  { label: '< 0%',     min: -Infinity, max: 0,        fill: '#b5524e' },
  { label: '0–25%',    min: 0,         max: 0.25,     fill: '#9a8f7a' },
  { label: '25–50%',   min: 0.25,      max: 0.5,      fill: '#d4a857' },
  { label: '50–75%',   min: 0.5,       max: 0.75,     fill: '#c2b15a' },
  { label: '75–100%',  min: 0.75,      max: 1.0,      fill: '#a9b86a' },
  { label: '100–150%', min: 1.0,       max: 1.5,      fill: '#8fb86a' },
  { label: '150–250%', min: 1.5,       max: 2.5,      fill: '#7ab06f' },
  { label: '250%+',    min: 2.5,       max: Infinity, fill: '#5fa37a' },
];

export function marginBuckets(rows: WatchlistRow[]): MarginBucket[] {
  const buckets = BUCKET_DEFS.map((b) => ({ ...b, count: 0, gilPerDay: 0 }));
  for (const r of rows) {
    const m = rowMargin(r);
    if (m == null) continue;
    const bucket = buckets.find((b) => m >= b.min && m < b.max);
    if (bucket) { bucket.count++; bucket.gilPerDay += r.gilPerDay ?? 0; }
  }
  return buckets;
}

// ── Per-row valuation (cheap/rich chip + movers tag) ─────────────────────────

/**
 * Map of itemId → 'cheap' | 'rich' for rows where the fair-value call is
 * confident and decisive (fair/unknown omitted to stay quiet). Shared by the
 * watchlist chip and the dashboard "what changed" tags so they never disagree.
 */
export function valuationMap(
  rows: WatchlistRow[],
  summaryById: Map<number, HistorySummary>,
): Map<number, 'cheap' | 'rich'> {
  const m = new Map<number, 'cheap' | 'rich'>();
  for (const r of rows) {
    const summary = summaryById.get(r.id);
    if (!summary) continue;
    const current = r.dcMinHQ ?? r.dcMinNQ ?? (r.refPrice > 0 ? r.refPrice : null);
    if (current == null) continue;
    const sig = classifyValue({
      current, mean: summary.mean, stdev: summary.stdev, count: summary.count, floor: r.materialCost,
    });
    if (sig.confident && (sig.valuation === 'cheap' || sig.valuation === 'rich')) m.set(r.id, sig.valuation);
  }
  return m;
}

// ── Top pick (the single best action right now) ──────────────────────────────

export interface TopPick {
  row: WatchlistRow;
  margin: number | null;
  gilPerDay: number;
}

/**
 * The craftables to make right now, best first: highest gil/day among items
 * that are actually craftable at the user's levels, move (velocity ≥ 1/day), and
 * turn a profit. gil/day already blends net margin × velocity. Returns up to `n`
 * so the header can cycle through the top few.
 */
export function topPicks(rows: WatchlistRow[], n: number): TopPick[] {
  return rows
    .filter((r) => r.craftable === true && r.craftStatus === 'ok' && r.dcSpd >= 1 && (r.gilPerDay ?? 0) > 0)
    .sort((a, b) => (b.gilPerDay ?? 0) - (a.gilPerDay ?? 0))
    .slice(0, n)
    .map((r) => ({ row: r, margin: rowMargin(r), gilPerDay: r.gilPerDay ?? 0 }));
}

/** The single best craftable action right now, or null. (Convenience over topPicks.) */
export function topPick(rows: WatchlistRow[]): TopPick | null {
  return topPicks(rows, 1)[0] ?? null;
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

export interface CategoryShare {
  cat: ItemCategory;
  gilPerDay: number;
  /** Fraction (0–1) of total portfolio gil/day this category represents. */
  share: number;
  itemCount: number;
}

/**
 * Per-category breakdown of watchlist gil/day, sorted by share descending.
 * Weighted by each item's gil/day — NOT by item count. Categories with zero
 * gil/day are still included (share 0) as long as they have items, so the
 * breakdown reflects what's tracked. Rows are grouped by their stored `cat`.
 */
export function categoryShares(rows: WatchlistRow[]): CategoryShare[] {
  // Group by category and accumulate gil/day and item count
  const byCategory = new Map<ItemCategory, { gilPerDay: number; itemCount: number }>();

  for (const r of rows) {
    const existing = byCategory.get(r.cat) ?? { gilPerDay: 0, itemCount: 0 };
    existing.gilPerDay += r.gilPerDay ?? 0;
    existing.itemCount += 1;
    byCategory.set(r.cat, existing);
  }

  // Compute total for share calculation
  const totalGilPerDay = Array.from(byCategory.values()).reduce((sum, v) => sum + v.gilPerDay, 0);

  // Convert to sorted array
  const shares: CategoryShare[] = Array.from(byCategory.entries()).map(([cat, { gilPerDay, itemCount }]) => ({
    cat,
    gilPerDay,
    share: totalGilPerDay > 0 ? gilPerDay / totalGilPerDay : 0,
    itemCount,
  }));

  // Sort by share descending, tiebreak by gilPerDay descending, then cat ascending
  shares.sort((a, b) => {
    const shareDiff = b.share - a.share;
    if (shareDiff !== 0) return shareDiff;
    const gilDiff = b.gilPerDay - a.gilPerDay;
    if (gilDiff !== 0) return gilDiff;
    return a.cat.localeCompare(b.cat);
  });

  return shares;
}

export interface TopCategory {
  cat: ItemCategory;
  /** Percentage (0–100) of total gil/day. */
  pct: number;
  itemCount: number;
}

/** The single largest category by gil/day share, or null when no gil/day at all. */
export function topCategory(rows: WatchlistRow[]): TopCategory | null {
  const shares = categoryShares(rows);
  if (shares.length === 0) return null;
  const top = shares[0];
  // Return null only if total gil/day is 0 (which means all shares are 0)
  if (top.share === 0) return null;
  return { cat: top.cat, pct: top.share * 100, itemCount: top.itemCount };
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

// ── Value plays (mean-reversion "buy low") ───────────────────────────────────

export interface ValuePlay {
  row: WatchlistRow;
  /** Current cheapest ask used as the price to judge. */
  current: number;
  signal: FairValueSignal;
}

/** Current cheapest ask for a row — what you'd pay to buy now. */
function rowCurrent(r: WatchlistRow): number | null {
  return r.dcMinHQ ?? r.dcMinNQ ?? (r.refPrice > 0 ? r.refPrice : null);
}

/**
 * Watched items trading below their own fair value (most negative z-score
 * first), gated on enough liquidity to be confident AND enough velocity that
 * the item actually moves — a deep discount on something nobody buys is not a
 * play. A flipper's "buy low" list. Uses the per-item distribution summary.
 */
export const VALUE_MIN_VELOCITY = 1;

export function valuePlays(
  rows: WatchlistRow[],
  summaryById: Map<number, HistorySummary>,
  n: number,
): ValuePlay[] {
  const out: ValuePlay[] = [];
  for (const r of rows) {
    const summary = summaryById.get(r.id);
    if (!summary) continue;
    if (r.dcSpd < VALUE_MIN_VELOCITY) continue; // skip stagnant items
    const current = rowCurrent(r);
    if (current == null || current <= 0) continue;
    const signal = classifyValue({
      current, mean: summary.mean, stdev: summary.stdev, count: summary.count,
      floor: r.materialCost,
    });
    if (signal.valuation !== 'cheap') continue;
    out.push({ row: r, current, signal });
  }
  // Rank by opportunity SIZE, not raw % discount: gil you'd capture reverting
  // to fair ≈ (mean − current) × daily velocity. A 56% discount on a 200-gil
  // item that sells 2/day loses to a 20% discount on a 5k item selling 70/day.
  const opportunity = (p: ValuePlay) => {
    const gap = (p.signal.pctVsFair != null ? -p.signal.pctVsFair : 0) * p.current; // gil under fair / unit
    return Math.max(0, gap) * p.row.dcSpd;
  };
  return out.sort((a, b) => opportunity(b) - opportunity(a)).slice(0, n);
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
 * seller's world. Ranks by spread **percentage** (not absolute gil) and drops
 * noise below the minimum gil/percent thresholds, so a +1 gil (0%) row never
 * outranks a small-but-meaningful margin.
 */
export const SPREAD_MIN_GIL = 100;
export const SPREAD_MIN_PCT = 0.02;

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
    const spreadPct = spread / homeFloor;
    // Drop noise: tiny absolute gaps or sub-2% margins aren't worth a trip.
    if (spread < SPREAD_MIN_GIL || spreadPct < SPREAD_MIN_PCT) continue;
    out.push({ id: r.id, name: r.name, homeFloor, bestWorld, bestPrice, spread, spreadPct, velocity: r.dcSpd });
  }
  return out.sort((a, b) => b.spreadPct - a.spreadPct).slice(0, n);
}
