import { describe, it, expect } from 'vitest';
import {
  applyTax, captureShare, effectiveUnitsPerDay, robustSellPrice, MB_TAX,
  confidence, riskLabel, playMetrics,
} from './pricing';
import type { MarketItem } from '../../../lib/universalis';

function mkt(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0,
    listingCount: 0, worldListings: [], ...over,
  } as MarketItem;
}

describe('applyTax', () => {
  it('subtracts the 5% marketboard tax', () => {
    expect(MB_TAX).toBe(0.05);
    expect(applyTax(1000)).toBe(950);
  });
});

describe('captureShare', () => {
  it('is full with no competition and a fair share otherwise', () => {
    expect(captureShare(0)).toBe(1);
    expect(captureShare(3)).toBe(0.25);
  });
  it('clamps negative listing counts to full share', () => {
    expect(captureShare(-5)).toBe(1);
  });
});

describe('effectiveUnitsPerDay', () => {
  it('is velocity times capture share', () => {
    expect(effectiveUnitsPerDay(8, 3)).toBe(2);
  });
});

describe('robustSellPrice', () => {
  it('anchors on recent-sale average, undercutting to the lowest listing', () => {
    const m = mkt({ minNQ: 90, avgNQ: 100, recentSalesNQ: 5 });
    expect(robustSellPrice(m, 'NQ')).toBe(90);
  });
  it('caps at the average when the lowest listing is above it', () => {
    const m = mkt({ minNQ: 130, avgNQ: 100, recentSalesNQ: 5 });
    expect(robustSellPrice(m, 'NQ')).toBe(100);
  });
  it('falls back to the lowest listing when there are no recent sales', () => {
    const m = mkt({ minHQ: 200, avgHQ: 180, recentSalesHQ: 0 });
    expect(robustSellPrice(m, 'HQ')).toBe(200);
  });
  it('returns null when neither a listing nor an average exists', () => {
    expect(robustSellPrice(mkt({}), 'NQ')).toBeNull();
  });
});

const DAY = 86_400_000;
const NOW = 1_000 * DAY; // arbitrary fixed "now" in ms

describe('confidence', () => {
  it('is high for fresh data with healthy sales', () => {
    const m = mkt({ lastUploadTime: NOW - 2 * 3_600_000, recentSalesNQ: 10, velocity: 6 });
    expect(confidence(m, 'NQ', NOW)).toBeCloseTo(1, 5);
  });
  it('is zero when the upload time is unknown', () => {
    const m = mkt({ lastUploadTime: 0, recentSalesNQ: 10, velocity: 6 });
    expect(confidence(m, 'NQ', NOW)).toBe(0);
  });
  it('decays toward zero as data ages past the stale window', () => {
    const m = mkt({ lastUploadTime: NOW - 14 * DAY, recentSalesNQ: 10, velocity: 6 });
    expect(confidence(m, 'NQ', NOW)).toBeCloseTo(0, 5);
  });
  it('is low when there are no real sales even if data is fresh', () => {
    const m = mkt({ lastUploadTime: NOW - 1_000, recentSalesNQ: 0, velocity: 0 });
    expect(confidence(m, 'NQ', NOW)).toBe(0);
  });
});

describe('riskLabel', () => {
  it('flags low-confidence data regardless of velocity', () => {
    expect(riskLabel(0.2, 10)).toMatch(/Low confidence/);
  });
  it('labels strong movers', () => {
    expect(riskLabel(0.9, 6)).toMatch(/Strong/);
  });
  it('labels steady and slow sellers', () => {
    expect(riskLabel(0.9, 2)).toMatch(/Steady/);
    expect(riskLabel(0.9, 0.2)).toMatch(/Slow/);
  });
});

describe('playMetrics', () => {
  it('computes tax-aware net, throughput, gil/day, and roi', () => {
    const m = mkt({ lastUploadTime: NOW - 1_000, recentSalesNQ: 10, velocity: 8, listingCount: 3 });
    const r = playMetrics(1000, 400, m, 'NQ', NOW);
    expect(r.netPerUnit).toBe(550);            // 1000*0.95 - 400
    expect(r.effectiveUnitsPerDay).toBe(2);    // 8 * 1/(1+3)
    expect(r.gilPerDay).toBe(1100);            // 550 * 2
    expect(r.roi).toBeCloseTo(1.375, 5);       // 550 / 400
  });
  it('returns null roi when cost is zero', () => {
    const m = mkt({ lastUploadTime: NOW - 1_000, recentSalesNQ: 10, velocity: 8 });
    expect(playMetrics(1000, 0, m, 'NQ', NOW).roi).toBeNull();
  });
});
