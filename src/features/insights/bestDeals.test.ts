import { describe, it, expect } from 'vitest';
import { findBestDeals } from './bestDeals';
import type { MarketData } from '../../lib/universalis';
import type { TrackedItem } from '../items/types';

const items: TrackedItem[] = [
  { id: 1, name: 'A', crafter: 'LTW', lvl: 100, cat: 'Raid' },
  { id: 2, name: 'B', crafter: 'LTW', lvl: 100, cat: 'Raid' },
];

function dcWith(per: Record<number, { minNQ: number | null; avgNQ: number | null }>): MarketData {
  const out: MarketData = {};
  for (const [id, p] of Object.entries(per)) {
    out[id] = {
      minNQ: p.minNQ, minHQ: null, avgNQ: null, avgHQ: null,
      medianNQ: null, medianHQ: null,
      recentSalesNQ: 0, recentSalesHQ: 0,
      velocity: 0, lastUploadTime: Date.now(), listingCount: 0,
      worldListings: [], averagePriceNQ: p.avgNQ, averagePriceHQ: null,
    };
  }
  return out;
}

describe('findBestDeals', () => {
  it('returns items where current min < avg by minDealPct', () => {
    const dc = dcWith({
      1: { minNQ: 60, avgNQ: 100 },
      2: { minNQ: 95, avgNQ: 100 },
    });
    const out = findBestDeals(items, dc, { minDealPct: 20 });
    expect(out.map((r) => r.id)).toEqual([1]);
    expect(out[0].dealPct).toBe(40);
  });

  it('skips items without average price', () => {
    const dc = dcWith({ 1: { minNQ: 60, avgNQ: null } });
    expect(findBestDeals(items, dc, { minDealPct: 0 })).toEqual([]);
  });

  it('skips items without current min price', () => {
    const dc = dcWith({ 1: { minNQ: null, avgNQ: 100 } });
    expect(findBestDeals(items, dc, { minDealPct: 0 })).toEqual([]);
  });

  it('sorts by dealPct descending', () => {
    const dc = dcWith({
      1: { minNQ: 70, avgNQ: 100 },
      2: { minNQ: 50, avgNQ: 100 },
    });
    const out = findBestDeals(items, dc, { minDealPct: 20 });
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
});
