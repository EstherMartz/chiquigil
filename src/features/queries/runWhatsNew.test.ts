import { describe, it, expect } from 'vitest';
import { runWhatsNew } from './runWhatsNew';
import { defaultWhatsNewFilter } from './types';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';

function item(id: number, name: string): SnapshotItem {
  return { id, name, sc: 1, ui: 1, ilvl: 1, canHq: true };
}

function market(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: 100, medianHQ: null,
    recentSalesNQ: 3, recentSalesHQ: 0, velocity: 2, lastUploadTime: 0, listingCount: 5,
    worldListings: [], averagePriceNQ: 100, averagePriceHQ: null, lastSaleMs: 1000, ...over,
  };
}

const NOW = 1000 + 86_400_000; // exactly 1 day after lastSaleMs=1000

describe('runWhatsNew', () => {
  const items = new Map<number, SnapshotItem>([
    [1, item(1, 'Alpha')],
    [2, item(2, 'Beta')],
    [3, item(3, 'Gamma')], // untradeable: no market entry
  ]);
  const data: MarketData = {
    '1': market({ velocity: 5, medianNQ: 200, recentSalesNQ: 4 }),
    '2': market({ velocity: 1, medianNQ: 50, recentSalesNQ: 2 }),
  };
  const recipeKeys = new Set<number>([2]);

  it('builds rows for tradeable new items, sorted by velocity desc', () => {
    const rows = runWhatsNew([1, 2, 3], items, data, recipeKeys, defaultWhatsNewFilter(), NOW);
    expect(rows.map((r) => r.id)).toEqual([1, 2]); // 3 dropped (tradeableOnly, no market)
    expect(rows[0].velocity).toBe(5);
    expect(rows[0].price).toBe(200);
    expect(rows[0].daysSinceLastSale).toBe(1);
  });

  it('flags craftable rows', () => {
    const rows = runWhatsNew([1, 2], items, data, recipeKeys, defaultWhatsNewFilter(), NOW);
    expect(rows.find((r) => r.id === 2)!.craftable).toBe(true);
    expect(rows.find((r) => r.id === 1)!.craftable).toBe(false);
  });

  it('includes untradeable items with null price when tradeableOnly is false', () => {
    const filter = { ...defaultWhatsNewFilter(), tradeableOnly: false, sort: 'name' as const };
    const rows = runWhatsNew([1, 2, 3], items, data, recipeKeys, filter, NOW);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]); // name asc: Alpha, Beta, Gamma
    expect(rows.find((r) => r.id === 3)!.price).toBeNull();
    expect(rows.find((r) => r.id === 3)!.velocity).toBe(0);
  });

  it('drops rows below minVelocity', () => {
    const filter = { ...defaultWhatsNewFilter(), minVelocity: 2 };
    const rows = runWhatsNew([1, 2], items, data, recipeKeys, filter, NOW);
    expect(rows.map((r) => r.id)).toEqual([1]); // item 2 velocity 1 < 2
  });
});
