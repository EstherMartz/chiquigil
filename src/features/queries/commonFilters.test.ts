import { describe, it, expect } from 'vitest';
import { passesMarketGate } from './commonFilters';
import type { MarketItem } from '../../lib/universalis';

function mkMarket(velocity: number, listingCount: number): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0,
    velocity, lastUploadTime: 0, listingCount,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
  };
}

describe('passesMarketGate', () => {
  it('passes when velocity meets minimum and maxListings is null', () => {
    expect(passesMarketGate(mkMarket(5, 100), { minVelocity: 1, maxListings: null })).toBe(true);
  });

  it('fails when velocity is below minimum', () => {
    expect(passesMarketGate(mkMarket(0.5, 10), { minVelocity: 1, maxListings: null })).toBe(false);
  });

  it('fails when listingCount exceeds maxListings', () => {
    expect(passesMarketGate(mkMarket(5, 25), { minVelocity: 1, maxListings: 20 })).toBe(false);
  });

  it('passes when listingCount equals maxListings (inclusive upper bound)', () => {
    expect(passesMarketGate(mkMarket(5, 20), { minVelocity: 1, maxListings: 20 })).toBe(true);
  });

  it('passes with minVelocity 0 (no velocity filter)', () => {
    expect(passesMarketGate(mkMarket(0, 100), { minVelocity: 0, maxListings: null })).toBe(true);
  });
});
