import { describe, it, expect } from 'vitest';
import { depthBuckets } from './depth';
import type { WorldListing } from '../../lib/universalis';

const l = (price: number, quantity: number, seller: string, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller });

describe('depthBuckets', () => {
  it('returns [] for empty input', () => {
    expect(depthBuckets([], false)).toEqual([]);
  });

  it('returns [] when no listing matches the requested quality', () => {
    expect(depthBuckets([l(100, 1, 'A')], true)).toEqual([]);
  });

  it('buckets by price and aggregates units + distinct sellers', () => {
    const listings = [
      l(100, 1, 'A'), l(100, 2, 'A'), l(110, 1, 'B'), l(120, 1, 'C'), l(200, 5, 'D'),
    ];
    expect(depthBuckets(listings, false)).toEqual([
      { priceLow: 100, priceHigh: 113, units: 4, sellers: 2, listings: 3 },
      { priceLow: 113, priceHigh: 125, units: 1, sellers: 1, listings: 1 },
      { priceLow: 188, priceHigh: 200, units: 5, sellers: 1, listings: 1 },
    ]);
  });

  it('collapses a single price point into one bucket', () => {
    expect(depthBuckets([l(50, 1, 'A'), l(50, 1, 'B')], false)).toEqual([
      { priceLow: 50, priceHigh: 50, units: 2, sellers: 2, listings: 2 },
    ]);
  });

  it('defaults missing quantity to 1', () => {
    const noQty = { world: 'Phantom', price: 80, hq: false } as WorldListing;
    expect(depthBuckets([noQty], false)).toEqual([
      { priceLow: 80, priceHigh: 80, units: 1, sellers: 0, listings: 1 },
    ]);
  });
});
