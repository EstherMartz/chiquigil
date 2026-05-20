import { describe, it, expect } from 'vitest';
import { runQuestItemFlip, defaultQuestItemFilter } from './runQuestItemFlip';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SnapshotQuest } from '../../lib/questSnapshot';
import type { SnapshotItem } from '../../lib/itemSnapshot';

function mkQuest(overrides: Partial<SnapshotQuest> = {}): SnapshotQuest {
  return {
    questId: 1,
    questName: 'Test Quest',
    categoryName: 'All Classes',
    level: 5,
    requiredItems: [{ itemId: 100, itemName: 'Test Item', qty: 3 }],
    ...overrides,
  };
}

function mkItem(id: number, name: string, canHq = true): SnapshotItem {
  return { id, name, sc: 1, ui: 1, ilvl: 1, canHq };
}

function mkMarket(opts: {
  minNQ?: number | null; minHQ?: number | null;
  medianNQ?: number | null; medianHQ?: number | null;
  velocity?: number; listingCount?: number;
}): MarketItem {
  return {
    minNQ: opts.minNQ ?? null,
    minHQ: opts.minHQ ?? null,
    avgNQ: null, avgHQ: null,
    medianNQ: opts.medianNQ ?? opts.minNQ ?? null,
    medianHQ: opts.medianHQ ?? opts.minHQ ?? null,
    recentSalesNQ: 10, recentSalesHQ: 10,
    velocity: opts.velocity ?? 5,
    lastUploadTime: 0,
    listingCount: opts.listingCount ?? 5,
    worldListings: [],
    averagePriceNQ: null, averagePriceHQ: null,
  };
}

describe('runQuestItemFlip', () => {
  it('returns [] for empty snapshot', () => {
    expect(runQuestItemFlip([], new Map(), {}, defaultQuestItemFilter())).toEqual([]);
  });

  it('produces one row per (quest x required item)', () => {
    const snapshot: SnapshotQuest[] = [
      mkQuest({
        requiredItems: [
          { itemId: 100, itemName: 'A', qty: 3 },
          { itemId: 200, itemName: 'B', qty: 5 },
        ],
      }),
    ];
    const items = new Map([[100, mkItem(100, 'A')], [200, mkItem(200, 'B')]]);
    const market: MarketData = {
      100: mkMarket({ minHQ: 2400, medianHQ: 2400 }),
      200: mkMarket({ minNQ: 280, medianNQ: 280 }),
    };
    const out = runQuestItemFlip(snapshot, items, market, defaultQuestItemFilter());
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.itemId).sort()).toEqual([100, 200]);
  });

  it('totalRevenue when hq=hq uses HQ tier only', () => {
    const snapshot = [mkQuest({ requiredItems: [{ itemId: 100, itemName: 'X', qty: 3 }] })];
    const items = new Map([[100, mkItem(100, 'X')]]);
    const market: MarketData = { 100: mkMarket({ minHQ: 2000, medianHQ: 2000, minNQ: 100, medianNQ: 100 }) };
    const out = runQuestItemFlip(snapshot, items, market, { ...defaultQuestItemFilter(), hq: 'hq' });
    expect(out[0].totalRevenue).toBe(6000); // 3 × 2000 (HQ)
  });

  it('totalRevenue when hq=nq uses NQ tier only', () => {
    const snapshot = [mkQuest({ requiredItems: [{ itemId: 100, itemName: 'X', qty: 4 }] })];
    const items = new Map([[100, mkItem(100, 'X')]]);
    const market: MarketData = { 100: mkMarket({ minHQ: 2000, medianHQ: 2000, minNQ: 100, medianNQ: 100 }) };
    const out = runQuestItemFlip(snapshot, items, market, { ...defaultQuestItemFilter(), hq: 'nq' });
    expect(out[0].totalRevenue).toBe(400); // 4 × 100 (NQ)
  });

  it('totalRevenue when hq=either uses max(NQ, HQ)', () => {
    const snapshot = [mkQuest({ requiredItems: [{ itemId: 100, itemName: 'X', qty: 4 }] })];
    const items = new Map([[100, mkItem(100, 'X')]]);
    const market: MarketData = { 100: mkMarket({ minHQ: 500, medianHQ: 500, minNQ: 700, medianNQ: 700 }) };
    const out = runQuestItemFlip(snapshot, items, market, { ...defaultQuestItemFilter(), hq: 'either' });
    expect(out[0].totalRevenue).toBe(2800); // 4 × 700 (NQ higher)
  });

  it('null prices yield totalRevenue=0 but row is still kept', () => {
    const snapshot = [mkQuest({ requiredItems: [{ itemId: 100, itemName: 'X', qty: 3 }] })];
    const items = new Map([[100, mkItem(100, 'X')]]);
    const out = runQuestItemFlip(snapshot, items, {}, defaultQuestItemFilter());
    expect(out).toHaveLength(1);
    expect(out[0].totalRevenue).toBe(0);
    expect(out[0].nqPrice).toBeNull();
    expect(out[0].hqPrice).toBeNull();
  });

  it('filters by categoryName substring (case-insensitive)', () => {
    const snapshot = [
      mkQuest({ questId: 1, categoryName: 'Carpenter' }),
      mkQuest({ questId: 2, categoryName: 'Disciple of the Hand' }),
      mkQuest({ questId: 3, categoryName: 'All Classes' }),
    ];
    const items = new Map([[100, mkItem(100, 'X')]]);
    const market: MarketData = { 100: mkMarket({ minHQ: 1000, medianHQ: 1000 }) };
    const out = runQuestItemFlip(snapshot, items, market, { ...defaultQuestItemFilter(), categorySearch: 'disciple' });
    expect(out).toHaveLength(1);
    expect(out[0].categoryName).toBe('Disciple of the Hand');
  });

  it('filters by search substring on itemName (case-insensitive)', () => {
    const snapshot = [
      mkQuest({ questId: 1, requiredItems: [{ itemId: 100, itemName: 'Maple Lumber', qty: 1 }] }),
      mkQuest({ questId: 2, requiredItems: [{ itemId: 200, itemName: 'Ash Lumber', qty: 1 }] }),
    ];
    const items = new Map([[100, mkItem(100, 'Maple Lumber')], [200, mkItem(200, 'Ash Lumber')]]);
    const market: MarketData = {
      100: mkMarket({ minHQ: 1000, medianHQ: 1000 }),
      200: mkMarket({ minHQ: 1000, medianHQ: 1000 }),
    };
    const out = runQuestItemFlip(snapshot, items, market, { ...defaultQuestItemFilter(), search: 'maple' });
    expect(out).toHaveLength(1);
    expect(out[0].itemName).toBe('Maple Lumber');
  });

  it('filters by minListings', () => {
    const snapshot = [
      mkQuest({ questId: 1, requiredItems: [{ itemId: 100, itemName: 'A', qty: 1 }] }),
      mkQuest({ questId: 2, requiredItems: [{ itemId: 200, itemName: 'B', qty: 1 }] }),
    ];
    const items = new Map([[100, mkItem(100, 'A')], [200, mkItem(200, 'B')]]);
    const market: MarketData = {
      100: mkMarket({ minHQ: 1000, medianHQ: 1000, listingCount: 1 }),
      200: mkMarket({ minHQ: 1000, medianHQ: 1000, listingCount: 5 }),
    };
    const out = runQuestItemFlip(snapshot, items, market, { ...defaultQuestItemFilter(), minListings: 3 });
    expect(out).toHaveLength(1);
    expect(out[0].itemId).toBe(200);
  });

  it('default sort: totalRevenue DESC, tie-break by velocity DESC, then itemId ASC', () => {
    const snapshot = [
      mkQuest({ questId: 1, requiredItems: [{ itemId: 100, itemName: 'A', qty: 1 }] }),
      mkQuest({ questId: 2, requiredItems: [{ itemId: 200, itemName: 'B', qty: 1 }] }),
      mkQuest({ questId: 3, requiredItems: [{ itemId: 300, itemName: 'C', qty: 1 }] }),
    ];
    const items = new Map([[100, mkItem(100, 'A')], [200, mkItem(200, 'B')], [300, mkItem(300, 'C')]]);
    const market: MarketData = {
      100: mkMarket({ minHQ: 1000, medianHQ: 1000, velocity: 1 }),  // rev 1000 vel 1
      200: mkMarket({ minHQ: 2000, medianHQ: 2000, velocity: 5 }),  // rev 2000 vel 5
      300: mkMarket({ minHQ: 1000, medianHQ: 1000, velocity: 10 }), // rev 1000 vel 10
    };
    const out = runQuestItemFlip(snapshot, items, market, defaultQuestItemFilter());
    expect(out.map((r) => r.itemId)).toEqual([200, 300, 100]);
  });

  it('uses item.canHq when picking trusted tier (canHq=false skips HQ)', () => {
    const snapshot = [mkQuest({ requiredItems: [{ itemId: 100, itemName: 'NoHQItem', qty: 1 }] })];
    const items = new Map([[100, mkItem(100, 'NoHQItem', false)]]); // canHq=false
    const market: MarketData = { 100: mkMarket({ minHQ: 5000, medianHQ: 5000, minNQ: 100, medianNQ: 100 }) };
    const out = runQuestItemFlip(snapshot, items, market, { ...defaultQuestItemFilter(), hq: 'either' });
    // canHq=false → HQ tier excluded by pickHighestTrustedTier; only NQ counted
    expect(out[0].hqPrice).toBeNull();
    expect(out[0].nqPrice).toBe(100);
  });
});
