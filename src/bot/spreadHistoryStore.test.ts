import { describe, it, expect } from 'vitest';
import { foldCycleForBundle } from './spreadHistoryStore';
import type { MarketData } from '../lib/universalis';
import type { SpreadHistoryMap } from '../lib/spreadHistory';
import { spreadKey } from '../lib/spreadHistory';

function mkItem(listings: { world: string; price: number }[]): MarketData[string] {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: listings.map((l) => ({ world: l.world, price: l.price, hq: false })),
    averagePriceNQ: null, averagePriceHQ: null,
  };
}

describe('foldCycleForBundle', () => {
  it('records a positive net spread vs the home floor as cycle 1', () => {
    const dc: MarketData = {
      100: mkItem([
        { world: 'Omega', price: 800 },
        { world: 'Phantom', price: 2400 },
      ]),
    };
    const next = foldCycleForBundle(dc, 'Phantom', {}, 1000);
    expect(next[spreadKey(100, 'Omega')]).toEqual({ firstSeenAt: 1000, cycleCount: 1 });
    expect(next[spreadKey(100, 'Phantom')]).toBeUndefined();
  });

  it('increments an existing consecutive entry', () => {
    const dc: MarketData = { 100: mkItem([{ world: 'Omega', price: 800 }, { world: 'Phantom', price: 2400 }]) };
    const prev: SpreadHistoryMap = { [spreadKey(100, 'Omega')]: { firstSeenAt: 500, cycleCount: 3 } };
    const next = foldCycleForBundle(dc, 'Phantom', prev, 9999);
    expect(next[spreadKey(100, 'Omega')]).toEqual({ firstSeenAt: 500, cycleCount: 4 });
  });

  it('drops an entry whose spread vanished this cycle', () => {
    const dc: MarketData = { 100: mkItem([{ world: 'Omega', price: 2500 }, { world: 'Phantom', price: 2400 }]) };
    const prev: SpreadHistoryMap = { [spreadKey(100, 'Omega')]: { firstSeenAt: 500, cycleCount: 3 } };
    const next = foldCycleForBundle(dc, 'Phantom', prev, 9999);
    expect(next[spreadKey(100, 'Omega')]).toBeUndefined();
  });

  it('ignores items lacking a home-world listing', () => {
    const dc: MarketData = { 100: mkItem([{ world: 'Omega', price: 800 }]) };
    const next = foldCycleForBundle(dc, 'Phantom', {}, 1000);
    expect(Object.keys(next)).toHaveLength(0);
  });
});
