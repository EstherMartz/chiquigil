import { describe, it, expect } from 'vitest';
import { runCleanup } from './runCleanup';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketBundle } from '../watchlist/useMarketData';
import type { InventoryEntry, CraftOpportunity } from './types';

const items = new Map<number, SnapshotItem>([
  [1, { id: 1, name: 'Vendor Junk', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 50 }],
  [2, { id: 2, name: 'Discardable', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 0 }],
  [3, { id: 3, name: 'MB Goods', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 5 }],
  [4, { id: 4, name: 'Craft Mat', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 2 }],
]);

function market(prices: Record<number, { nq: number; recent: number; listings: number }>): MarketBundle {
  const phantom: Record<number, unknown> = {};
  for (const [id, p] of Object.entries(prices)) {
    phantom[Number(id)] = {
      medianNQ: p.nq, medianHQ: null, minNQ: p.nq, minHQ: null,
      recentSalesNQ: p.recent, recentSalesHQ: 0,
      listingCount: p.listings, listingCountNQ: p.listings, listingCountHQ: 0,
      worldListings: [],
    };
  }
  return { phantom: phantom as never, dc: {}, region: {} } as MarketBundle;
}

const inv = (rows: Array<Omit<InventoryEntry, 'name' | 'locations'>>): InventoryEntry[] =>
  rows.map((r) => ({ ...r, name: items.get(r.itemId)?.name ?? '', locations: ['bag'] }));

describe('runCleanup', () => {
  it('puts items with priceLow > 0 and no MB activity in the vendor bucket', () => {
    const result = runCleanup({
      inventory: inv([{ itemId: 1, qty: 3, isHq: false }]),
      market: market({}),
      items,
      craftOpportunities: new Map(),
      unrecognized: [],
    });
    expect(result.vendor).toHaveLength(1);
    expect(result.vendor[0].vendorRevenue).toBe(150);
    expect(result.craft).toHaveLength(0);
    expect(result.sellMb).toHaveLength(0);
    expect(result.discard).toHaveLength(0);
  });

  it('puts items with priceLow=0 and no MB activity in discard', () => {
    const result = runCleanup({
      inventory: inv([{ itemId: 2, qty: 5, isHq: false }]),
      market: market({}),
      items,
      craftOpportunities: new Map(),
      unrecognized: [],
    });
    expect(result.discard).toHaveLength(1);
    expect(result.discard[0].vendorRevenue).toBe(0);
  });

  it('routes high-MB items to the sellMb bucket', () => {
    const result = runCleanup({
      inventory: inv([{ itemId: 3, qty: 2, isHq: false }]),
      market: market({ 3: { nq: 1000, recent: 10, listings: 5 } }),
      items,
      craftOpportunities: new Map(),
      unrecognized: [],
    });
    expect(result.sellMb).toHaveLength(1);
    expect(result.sellMb[0].mbRevenue).toBe(2000);
  });

  it('suppresses MB bucket when revenue is within 10% of vendor (not worth listing)', () => {
    const result = runCleanup({
      inventory: inv([{ itemId: 1, qty: 3, isHq: false }]),  // vendor 150
      market: market({ 1: { nq: 53, recent: 10, listings: 5 } }),  // 53*3=159, only 6% above vendor
      items,
      craftOpportunities: new Map(),
      unrecognized: [],
    });
    expect(result.sellMb).toHaveLength(0);
    expect(result.vendor).toHaveLength(1);
  });

  it('routes to the sellMb bucket when MB beats vendor by more than 10%', () => {
    const result = runCleanup({
      inventory: inv([{ itemId: 1, qty: 3, isHq: false }]),  // vendor 150
      market: market({ 1: { nq: 60, recent: 10, listings: 5 } }),  // 60*3=180, 20% above
      items,
      craftOpportunities: new Map(),
      unrecognized: [],
    });
    expect(result.sellMb).toHaveLength(1);
    expect(result.vendor).toHaveLength(0);
  });

  it('prefers craft over MB / vendor when craft profit is highest', () => {
    const opp: CraftOpportunity = {
      outputItemId: 99, outputName: 'Crafted', outputUnitPrice: 10000,
      netProfit: 9000, usedFromInventory: [{ itemId: 4, name: 'Craft Mat', amount: 1 }], missingIngredients: [],
    };
    const result = runCleanup({
      inventory: inv([{ itemId: 4, qty: 1, isHq: false }]),  // vendor 2, no MB
      market: market({}),
      items,
      craftOpportunities: new Map([[4, [opp]]]),
      unrecognized: [],
    });
    expect(result.craft).toHaveLength(1);
    expect(result.craft[0].bestCraft?.netProfit).toBe(9000);
    expect(result.craft[0].runnerUp?.action).toBe('vendor');
  });

  it('breaks ties craft > mb > vendor when scores are equal', () => {
    const opp: CraftOpportunity = {
      outputItemId: 99, outputName: 'Crafted', outputUnitPrice: 100,
      netProfit: 100, usedFromInventory: [{ itemId: 1, name: 'Vendor Junk', amount: 1 }], missingIngredients: [],
    };
    const result = runCleanup({
      inventory: inv([{ itemId: 1, qty: 2, isHq: false }]),  // vendor 100
      market: market({ 1: { nq: 50, recent: 10, listings: 5 } }),  // MB 100
      items,
      craftOpportunities: new Map([[1, [opp]]]),  // craft 100
      unrecognized: [],
    });
    expect(result.craft).toHaveLength(1);
  });

  it('passes unrecognized entries through to result.unrecognized', () => {
    const ghost: InventoryEntry = { itemId: 0, name: 'Ghost', qty: 1, isHq: false, locations: ['bag'] };
    const result = runCleanup({
      inventory: [],
      market: market({}),
      items,
      craftOpportunities: new Map(),
      unrecognized: [ghost],
    });
    expect(result.unrecognized).toEqual([ghost]);
  });

  it('sorts each bucket by descending value', () => {
    const result = runCleanup({
      inventory: inv([
        { itemId: 1, qty: 1, isHq: false },  // vendor 50
        { itemId: 1, qty: 5, isHq: false }   // (merged in parser normally; here we let it stand)
      ]),
      market: market({}),
      items,
      craftOpportunities: new Map(),
      unrecognized: [],
    });
    expect(result.vendor.map((r) => r.vendorRevenue)).toEqual([250, 50]);
  });
});
