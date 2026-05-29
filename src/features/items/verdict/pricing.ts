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

export interface PlayMetrics {
  netPerUnit: number;
  effectiveUnitsPerDay: number;
  gilPerDay: number;
  roi: number | null;
  confidence: number;
}

function ageScore(lastUploadTime: number, now: number): number {
  if (lastUploadTime <= 0) return 0;
  const ageHours = (now - lastUploadTime) / 3_600_000;
  const staleHours = STALE_DAYS * 24;
  if (ageHours <= FRESH_HOURS) return 1;
  if (ageHours >= staleHours) return 0;
  return 1 - (ageHours - FRESH_HOURS) / (staleHours - FRESH_HOURS);
}

function liquidityScore(m: MarketItem, quality: Quality): number {
  const recent = quality === 'HQ' ? m.recentSalesHQ : m.recentSalesNQ;
  const bySales = recent / FULL_LIQUIDITY_SALES;
  const byVelocity = m.velocity / HEALTHY_VELOCITY;
  return clamp01(Math.max(bySales, byVelocity));
}

export function confidence(m: MarketItem, quality: Quality, now: number): number {
  return ageScore(m.lastUploadTime, now) * liquidityScore(m, quality);
}

export function riskLabel(conf: number, velocity: number): string {
  if (conf < CONFIDENCE_LOW) return 'Low confidence — stale or thin data';
  if (velocity >= HEALTHY_VELOCITY) return 'Strong — moves daily';
  if (velocity >= 1) return 'Steady';
  return 'Slow seller';
}

export function playMetrics(
  sellPrice: number, cost: number, m: MarketItem, quality: Quality, now: number,
): PlayMetrics {
  const netPerUnit = applyTax(sellPrice) - cost;
  const units = effectiveUnitsPerDay(m.velocity, m.listingCount);
  return {
    netPerUnit,
    effectiveUnitsPerDay: units,
    gilPerDay: netPerUnit * units,
    roi: cost > 0 ? netPerUnit / cost : null,
    confidence: confidence(m, quality, now),
  };
}
