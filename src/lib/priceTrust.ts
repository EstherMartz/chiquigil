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
