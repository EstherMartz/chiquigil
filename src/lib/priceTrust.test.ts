import { describe, it, expect } from 'vitest';
import {
  trimmedMedian,
  MIN_RECENT_SALES,
  MAX_LISTING_RATIO,
  TRIM_FRACTION,
  pickHighestTrustedTier,
  pickFirstTrustedTier,
  type TrustedSaleTier,
} from './priceTrust';
import type { MarketItem } from './universalis';

describe('constants', () => {
  it('exports the agreed values', () => {
    expect(MIN_RECENT_SALES).toBe(5);
    expect(MAX_LISTING_RATIO).toBe(5);
    expect(TRIM_FRACTION).toBe(0.1);
  });
});

describe('trimmedMedian', () => {
  it('returns null for empty input', () => {
    expect(trimmedMedian([])).toBeNull();
  });

  it('returns the only value for length 1', () => {
    expect(trimmedMedian([100])).toBe(100);
  });

  it('returns the mean of two values for length 2', () => {
    expect(trimmedMedian([100, 200])).toBe(150);
  });

  it('returns the middle value for odd length, no trim', () => {
    expect(trimmedMedian([100, 200, 300])).toBe(200);
  });

  it('does not trim when length < 10 (floor(n*0.1) is 0)', () => {
    // Outliers preserved at the bounds, but median is robust to them.
    expect(trimmedMedian([1, 100, 100, 100, 1_000_000])).toBe(100);
  });

  it('trims 1 from each end at length 10-19', () => {
    // Drops the 1 (low) and the 1_000_000 (high). Remainder is all 100s.
    expect(trimmedMedian([1, 100, 100, 100, 100, 100, 100, 100, 100, 1_000_000])).toBe(100);
  });

  it('sorts the input internally (does not mutate)', () => {
    const input = [300, 100, 200];
    const out = trimmedMedian(input);
    expect(out).toBe(200);
    expect(input).toEqual([300, 100, 200]); // unchanged
  });

  it('handles all-equal values', () => {
    expect(trimmedMedian([42, 42, 42, 42, 42])).toBe(42);
  });

  it('averages the two middle values for even length after trim', () => {
    // length 12, trim 1 each side → 10 remaining = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
    // even length → average of two middles = 100
    expect(trimmedMedian([1, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 9999])).toBe(100);
  });
});

function mkMarket(opts: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0,
    lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...opts,
  };
}

describe('pickHighestTrustedTier', () => {
  it('hq=nq with only NQ trusted → returns NQ tier', () => {
    const m = mkMarket({ minNQ: 500, medianNQ: 500, recentSalesNQ: 20 });
    const tier = pickHighestTrustedTier(m, 'nq', false);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 500, isHq: false });
  });

  it('hq=hq + canHq + only HQ trusted → returns HQ tier', () => {
    const m = mkMarket({ minHQ: 2000, medianHQ: 2000, recentSalesHQ: 20 });
    const tier = pickHighestTrustedTier(m, 'hq', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 2000, isHq: true });
  });

  it('hq=hq + canHq=false → returns null (HQ candidate excluded)', () => {
    const m = mkMarket({ minHQ: 2000, medianHQ: 2000, recentSalesHQ: 20 });
    expect(pickHighestTrustedTier(m, 'hq', false)).toBeNull();
  });

  it('hq=either + canHq + both trusted, HQ higher → returns HQ', () => {
    const m = mkMarket({
      minNQ: 500, medianNQ: 500, recentSalesNQ: 20,
      minHQ: 2000, medianHQ: 2000, recentSalesHQ: 20,
    });
    const tier = pickHighestTrustedTier(m, 'either', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 2000, isHq: true });
  });

  it('hq=either + canHq + both trusted, NQ higher → returns NQ', () => {
    const m = mkMarket({
      minNQ: 5000, medianNQ: 5000, recentSalesNQ: 20,
      minHQ: 2000, medianHQ: 2000, recentSalesHQ: 20,
    });
    const tier = pickHighestTrustedTier(m, 'either', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 5000, isHq: false });
  });

  it('hq=either + canHq + HQ rejected by low recent → returns NQ', () => {
    const m = mkMarket({
      minNQ: 500, medianNQ: 500, recentSalesNQ: 20,
      minHQ: 2000, medianHQ: 2000, recentSalesHQ: 1,
    });
    const tier = pickHighestTrustedTier(m, 'either', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 500, isHq: false });
  });

  it('rejects candidate where rawMin > median × MAX_LISTING_RATIO (outlier)', () => {
    const m = mkMarket({
      minNQ: 100000, medianNQ: 500, recentSalesNQ: 20,
    });
    expect(pickHighestTrustedTier(m, 'nq', false)).toBeNull();
  });

  it('returns null when neither candidate is trusted', () => {
    const m = mkMarket({});
    expect(pickHighestTrustedTier(m, 'either', true)).toBeNull();
  });
});

describe('pickFirstTrustedTier', () => {
  it('hq=either + canHq + both trusted → returns HQ (first in candidate order, regardless of which unit is higher)', () => {
    const m = mkMarket({
      minNQ: 5000, medianNQ: 5000, recentSalesNQ: 20,
      minHQ: 2000, medianHQ: 2000, recentSalesHQ: 20,
    });
    const tier = pickFirstTrustedTier(m, 'either', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 2000, isHq: true });
  });

  it('hq=either + canHq + HQ rejected (low recent) → falls through to NQ', () => {
    const m = mkMarket({
      minNQ: 500, medianNQ: 500, recentSalesNQ: 20,
      minHQ: 2000, medianHQ: 2000, recentSalesHQ: 1,
    });
    const tier = pickFirstTrustedTier(m, 'either', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 500, isHq: false });
  });
});
