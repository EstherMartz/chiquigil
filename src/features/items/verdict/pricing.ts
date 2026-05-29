import type { MarketItem } from '../../../lib/universalis';
import type { Quality } from './types';

// ── Tunable constants (centralized for easy adjustment) ──
export const MB_TAX = 0.05;
export const FRESH_HOURS = 24;
export const STALE_DAYS = 14;
export const FULL_LIQUIDITY_SALES = 10;
export const HEALTHY_VELOCITY = 5;
export const CONFIDENCE_LOW = 0.35;
export const BLEND_GIL = 0.5;
export const BLEND_ROI = 0.5;
export const RUNNER_UP_MIN_SCORE = 0.05;
export const ARB_DISCOUNT = 0.7;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export function applyTax(price: number): number {
  return price * (1 - MB_TAX);
}

export function captureShare(listingCount: number): number {
  const n = listingCount > 0 ? listingCount : 0;
  return 1 / (1 + n);
}

export function effectiveUnitsPerDay(velocity: number, listingCount: number): number {
  return velocity * captureShare(listingCount);
}

export function robustSellPrice(m: MarketItem, quality: Quality): number | null {
  const lowest = quality === 'HQ' ? m.minHQ : m.minNQ;
  const avg = quality === 'HQ' ? m.avgHQ : m.avgNQ;
  const recent = quality === 'HQ' ? m.recentSalesHQ : m.recentSalesNQ;
  if (recent > 0 && avg != null) {
    return lowest != null ? Math.min(lowest, avg) : avg;
  }
  if (lowest != null) return lowest;
  return null;
}

// exported for reuse / testing in later tasks
export { clamp01 };
