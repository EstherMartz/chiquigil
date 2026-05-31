import type { HistoryEntry } from '../../lib/universalisHistory';

// ── Tunable thresholds (centralized) ─────────────────────────────────────────
/** Minimum sales before we'll make a confident fair-value call. */
export const MIN_SALES = 8;
/** z-score bounds for cheap / rich. */
export const Z_CHEAP = -0.7;
export const Z_RICH = 0.7;
/** Coefficient-of-variation bands for the volatility tag. */
export const CV_LOW = 0.15;
export const CV_MED = 0.4;
/** Within this fraction of the vendor price counts as "near the ceiling". */
export const NEAR_CEILING_PCT = 0.05;

// ── History rollup (per-sale) ────────────────────────────────────────────────

export interface HistorySummary {
  count: number;
  mean: number | null;   // simple mean of sale unit prices
  stdev: number | null;  // population stdev of sale prices
  vwap: number | null;   // quantity-weighted mean
  median: number | null;
}

/**
 * Distribution stats over raw sale entries. Lets callers that already hold
 * history (the watchlist hook) get a fair-value basis without the full chart
 * machinery. Pure.
 */
export function summarizeHistory(entries: HistoryEntry[]): HistorySummary {
  const count = entries.length;
  if (count === 0) return { count: 0, mean: null, stdev: null, vwap: null, median: null };

  const prices = entries.map((e) => e.pricePerUnit);
  const mean = prices.reduce((a, b) => a + b, 0) / count;
  const stdev = Math.sqrt(prices.reduce((s, p) => s + (p - mean) ** 2, 0) / count);

  let vwapSum = 0;
  let vwapQty = 0;
  for (const e of entries) { vwapSum += e.pricePerUnit * e.quantity; vwapQty += e.quantity; }
  const vwap = vwapQty > 0 ? Math.round(vwapSum / vwapQty) : Math.round(mean);

  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return { count, mean, stdev, vwap, median };
}

// ── Fair-value classification ────────────────────────────────────────────────

export type Valuation = 'cheap' | 'fair' | 'rich' | 'unknown';
export type Volatility = 'low' | 'med' | 'high';

export interface FairValueInput {
  /** Price being judged — the current floor ask. */
  current: number | null;
  mean: number | null;
  stdev: number | null;
  count: number;
  /** Optional VWAP-band edges (item page has these); used as an OR signal. */
  bandLo?: number | null;
  bandHi?: number | null;
  /** Fundamental bounds. */
  floor?: number | null;    // craft material cost
  ceiling?: number | null;  // vendor price
  /** Freshness gate (default true). */
  fresh?: boolean;
}

export interface FairValueSignal {
  valuation: Valuation;
  zScore: number | null;
  /** (current − mean) / mean, signed. */
  pctVsFair: number | null;
  volatility: Volatility | null;
  floor: number | null;
  ceiling: number | null;
  belowFloor: boolean;
  nearCeiling: boolean;
  confident: boolean;
  verdict: string;
}

function classifyVolatility(mean: number, stdev: number): Volatility {
  const cv = mean > 0 ? stdev / mean : 0;
  if (cv < CV_LOW) return 'low';
  if (cv < CV_MED) return 'med';
  return 'high';
}

export function classifyValue(input: FairValueInput): FairValueSignal {
  const { current, mean, stdev, count, bandLo, bandHi, floor = null, ceiling = null, fresh = true } = input;

  const belowFloor = floor != null && current != null && current < floor;
  const nearCeiling = ceiling != null && current != null && current >= ceiling * (1 - NEAR_CEILING_PCT);

  const confident =
    fresh && count >= MIN_SALES && mean != null && stdev != null && current != null;

  const zScore = (stdev != null && stdev > 0 && mean != null && current != null)
    ? (current - mean) / stdev
    : null;
  const pctVsFair = (mean != null && mean > 0 && current != null)
    ? (current - mean) / mean
    : null;
  const volatility = (mean != null && stdev != null && mean > 0)
    ? classifyVolatility(mean, stdev)
    : null;

  let valuation: Valuation;
  if (!confident) {
    valuation = 'unknown';
  } else {
    const cheap = (zScore != null && zScore <= Z_CHEAP) || (bandLo != null && current! < bandLo);
    const rich = (zScore != null && zScore >= Z_RICH) || (bandHi != null && current! > bandHi);
    valuation = cheap ? 'cheap' : rich ? 'rich' : 'fair';
  }

  return {
    valuation, zScore, pctVsFair, volatility,
    floor, ceiling, belowFloor, nearCeiling, confident,
    verdict: buildVerdict({ valuation, pctVsFair, volatility, belowFloor, nearCeiling, count }),
  };
}

function buildVerdict(s: {
  valuation: Valuation; pctVsFair: number | null; volatility: Volatility | null;
  belowFloor: boolean; nearCeiling: boolean; count: number;
}): string {
  if (s.valuation === 'unknown') {
    return s.count === 0 ? 'No recent sales — fair value unknown.' : 'Too few sales to judge fair value.';
  }

  const pct = s.pctVsFair != null ? Math.round(Math.abs(s.pctVsFair) * 100) : null;
  const dir = (s.pctVsFair ?? 0) < 0 ? 'under' : 'over';
  const lead = pct != null && pct >= 1 ? `${pct}% ${dir} fair value` : 'around fair value';

  const action = s.valuation === 'cheap' ? 'accumulate'
    : s.valuation === 'rich' ? 'sell / hold off buying'
    : 'fairly priced';

  const parts = [lead];
  if (s.volatility) parts.push(`${s.volatility} volatility`);
  parts.push(action);

  const caveats: string[] = [];
  if (s.belowFloor) caveats.push('below craft cost');
  if (s.nearCeiling) caveats.push('near vendor ceiling — capped upside');

  return parts.join(' · ') + (caveats.length ? ` (${caveats.join('; ')})` : '');
}
