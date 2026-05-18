import type { MarketItem } from './universalis';

export const MIN_RECENT_SALES = 5;
export const MAX_LISTING_RATIO = 5;
export const TRIM_FRACTION = 0.1;

/**
 * Trimmed median: sort, drop floor(n * TRIM_FRACTION) entries from each end,
 * then return the median of what's left. For length < 10 the trim count is 0,
 * so this degrades to a plain median. Returns null for empty input.
 *
 * Defensive against laundered/joke sales contaminating either end of the
 * recent-history distribution. Does not mutate input.
 */
export function trimmedMedian(prices: number[]): number | null {
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const k = Math.floor(sorted.length * TRIM_FRACTION);
  const trimmed = sorted.slice(k, sorted.length - k);
  const n = trimmed.length;
  if (n === 0) return sorted[Math.floor(sorted.length / 2)]; // degenerate; shouldn't happen with floor()
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (trimmed[mid - 1] + trimmed[mid]) / 2 : trimmed[mid];
}

export type HqMode = 'hq' | 'nq' | 'either';

export interface TrustedSaleTier { unit: number; isHq: boolean }

interface Candidate { rawMin: number | null; median: number | null; recent: number; isHq: boolean }

function buildCandidates(m: MarketItem, hq: HqMode, canHq: boolean): Candidate[] {
  const out: Candidate[] = [];
  if ((hq === 'hq' || hq === 'either') && canHq) {
    out.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  }
  if (hq === 'nq' || hq === 'either') {
    out.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  }
  return out;
}

function passesTrustFilter(c: Candidate): boolean {
  if (c.rawMin == null) return false;
  if (c.recent < MIN_RECENT_SALES) return false;
  if (c.median == null) return false;
  if (c.rawMin > c.median * MAX_LISTING_RATIO) return false;
  return true;
}

function toTier(c: Candidate): TrustedSaleTier {
  // passesTrustFilter guarantees rawMin/median non-null when reached.
  return { unit: Math.min(c.rawMin!, c.median!), isHq: c.isHq };
}

export function pickHighestTrustedTier(
  m: MarketItem,
  hq: HqMode,
  canHq: boolean,
): TrustedSaleTier | null {
  let best: TrustedSaleTier | null = null;
  for (const c of buildCandidates(m, hq, canHq)) {
    if (!passesTrustFilter(c)) continue;
    const tier = toTier(c);
    if (!best || tier.unit > best.unit) best = tier;
  }
  return best;
}

export function pickFirstTrustedTier(
  m: MarketItem,
  hq: HqMode,
  canHq: boolean,
): TrustedSaleTier | null {
  for (const c of buildCandidates(m, hq, canHq)) {
    if (!passesTrustFilter(c)) continue;
    return toTier(c);
  }
  return null;
}
