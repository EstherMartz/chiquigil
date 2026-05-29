import { describe, it, expect } from 'vitest';
import {
  applyTax, captureShare, effectiveUnitsPerDay, robustSellPrice, MB_TAX,
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
