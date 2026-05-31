import { LISTINGS_CAP } from '../../lib/universalis';

/**
 * Days to clear the current listing depth at the current sale velocity —
 * a crude "how crowded is this market" signal for flippers. `listingCount`
 * is the number of active listings, `velocity` is sales/day.
 *
 * Returns null when nothing is selling (velocity ≤ 0) since "clears in ∞ days"
 * is better shown as "not moving" by the caller.
 */
export function clearsInDays(listingCount: number, velocity: number): number | null {
  if (velocity <= 0) return null;
  if (listingCount <= 0) return 0;
  return listingCount / velocity;
}

/**
 * True when the listing count is at/above the fetch cap, so the real depth
 * (and therefore clear time) is only a lower bound — show as "≥{cap}".
 */
export function isListingCountCapped(listingCount: number): boolean {
  return listingCount >= LISTINGS_CAP;
}

/** Human-readable clear-time, e.g. "~3.2d", "today", "≥50 listed", or "not moving". */
export function formatClearDays(listingCount: number, velocity: number): string {
  const days = clearsInDays(listingCount, velocity);
  if (days == null) return 'not moving';
  if (days === 0) return 'sold out';
  const capped = isListingCountCapped(listingCount);
  const num = days < 1 ? days.toFixed(1) : days < 10 ? days.toFixed(1) : Math.round(days).toString();
  return `${capped ? '≥' : '~'}${num}d`;
}
