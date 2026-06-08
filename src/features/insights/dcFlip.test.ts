import { describe, it, expect } from 'vitest';
import { runDcFlip } from './dcFlip';
import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';

function mkItem(id: number, name: string): SnapshotItem {
  return { id, name, sc: 1, ui: 1, ilvl: 1, canHq: true };
}

function mkDcMarket(id: number, listings: { world: string; price: number; hq: boolean }[]): MarketData {
  return {
    [id]: {
      minNQ: null, minHQ: null, velocity: 0, lastUploadTime: 0,
      avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
      recentSalesNQ: 0, recentSalesHQ: 0, listingCount: 0,
      worldListings: listings.map((l) => ({ world: l.world, price: l.price, hq: l.hq })),
      averagePriceNQ: null, averagePriceHQ: null,
    },
  };
}

function mkHomeMarket(id: number, velocity: number): MarketData {
  return {
    [id]: {
      minNQ: null, minHQ: null, velocity, lastUploadTime: 0,
      avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
      recentSalesNQ: 0, recentSalesHQ: 0, listingCount: 0,
      worldListings: [],
      averagePriceNQ: null, averagePriceHQ: null,
    },
  };
}

describe('runDcFlip', () => {
  it('finds items where DC price < Phantom price by at least minSpread', () => {
    const items = [mkItem(1, 'Iron Ore')];
    const dc = mkDcMarket(1, [
      { world: 'Moogle', price: 800, hq: false },
      { world: 'Phantom', price: 2400, hq: false },
    ]);
    const home = mkHomeMarket(1, 45);
    const rows = runDcFlip(items, dc, home, { homeWorld: 'Phantom', minSpread: 100, minVelocity: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0].buyWorld).toBe('Moogle');
    expect(rows[0].dcPrice).toBe(800);
    expect(rows[0].phantomPrice).toBe(2400);
    expect(rows[0].spread).toBe(1600);
    expect(rows[0].velocity).toBe(45);
  });

  it('excludes items below minSpread', () => {
    const items = [mkItem(1, 'Iron Ore')];
    const dc = mkDcMarket(1, [
      { world: 'Moogle', price: 2300, hq: false },
      { world: 'Phantom', price: 2400, hq: false },
    ]);
    const home = mkHomeMarket(1, 10);
    const rows = runDcFlip(items, dc, home, { homeWorld: 'Phantom', minSpread: 500, minVelocity: 0 });
    expect(rows).toHaveLength(0);
  });

  it('excludes items below minVelocity', () => {
    const items = [mkItem(1, 'Iron Ore')];
    const dc = mkDcMarket(1, [
      { world: 'Moogle', price: 100, hq: false },
      { world: 'Phantom', price: 5000, hq: false },
    ]);
    const home = mkHomeMarket(1, 0.2);
    const rows = runDcFlip(items, dc, home, { homeWorld: 'Phantom', minSpread: 100, minVelocity: 1 });
    expect(rows).toHaveLength(0);
  });

  it('skips items with no Phantom listings', () => {
    const items = [mkItem(1, 'Iron Ore')];
    const dc = mkDcMarket(1, [
      { world: 'Moogle', price: 800, hq: false },
    ]);
    const home = mkHomeMarket(1, 10);
    const rows = runDcFlip(items, dc, home, { homeWorld: 'Phantom', minSpread: 0, minVelocity: 0 });
    expect(rows).toHaveLength(0);
  });

  it('skips items with no non-Phantom listings', () => {
    const items = [mkItem(1, 'Iron Ore')];
    const dc = mkDcMarket(1, [
      { world: 'Phantom', price: 800, hq: false },
    ]);
    const home = mkHomeMarket(1, 10);
    const rows = runDcFlip(items, dc, home, { homeWorld: 'Phantom', minSpread: 0, minVelocity: 0 });
    expect(rows).toHaveLength(0);
  });

  it('sorts by spread descending', () => {
    const items = [mkItem(1, 'Iron Ore'), mkItem(2, 'Gold Ore')];
    const dc: MarketData = {
      ...mkDcMarket(1, [
        { world: 'Moogle', price: 800, hq: false },
        { world: 'Phantom', price: 1200, hq: false },
      ]),
      ...mkDcMarket(2, [
        { world: 'Louisoix', price: 100, hq: false },
        { world: 'Phantom', price: 5000, hq: false },
      ]),
    };
    const home: MarketData = {
      ...mkHomeMarket(1, 10),
      ...mkHomeMarket(2, 5),
    };
    const rows = runDcFlip(items, dc, home, { homeWorld: 'Phantom', minSpread: 0, minVelocity: 0 });
    expect(rows[0].id).toBe(2); // spread 4900 > 400
    expect(rows[1].id).toBe(1);
  });

  it('picks the cheapest non-Phantom world', () => {
    const items = [mkItem(1, 'Iron Ore')];
    const dc = mkDcMarket(1, [
      { world: 'Moogle', price: 1500, hq: false },
      { world: 'Louisoix', price: 800, hq: false },
      { world: 'Phantom', price: 3000, hq: false },
    ]);
    const home = mkHomeMarket(1, 10);
    const rows = runDcFlip(items, dc, home, { homeWorld: 'Phantom', minSpread: 0, minVelocity: 0 });
    expect(rows[0].buyWorld).toBe('Louisoix');
    expect(rows[0].dcPrice).toBe(800);
  });

  it('computes netSpread = applyTax(home) - dcPrice', () => {
    const items = [mkItem(1, 'Iron Ore')];
    const dc = mkDcMarket(1, [
      { world: 'Moogle', price: 800, hq: false },
      { world: 'Phantom', price: 2400, hq: false },
    ]);
    const home = mkHomeMarket(1, 45);
    const rows = runDcFlip(items, dc, home, { homeWorld: 'Phantom', minSpread: 100, minVelocity: 0 });
    // applyTax(2400) = 2280; net = 2280 - 800 = 1480
    expect(rows[0].netSpread).toBe(1480);
    expect(rows[0].spread).toBe(1600); // gross unchanged
  });
});
