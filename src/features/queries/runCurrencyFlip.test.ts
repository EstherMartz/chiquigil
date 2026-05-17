import { describe, it, expect } from 'vitest';
import { runCurrencyFlip } from './runCurrencyFlip';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import { defaultCurrencyFlipFilter } from './types';

function mkSnap(id: number, name: string, canHq = true, sc = 1): SnapshotItem {
  return { id, name, sc, ui: 1, ilvl: 1, canHq };
}

function mkMarket(opts: {
  minNQ?: number | null; minHQ?: number | null;
  medianNQ?: number | null; medianHQ?: number | null;
  recentNQ?: number; recentHQ?: number;
  velocity?: number; listingCount?: number;
}): MarketItem {
  return {
    minNQ: opts.minNQ ?? null,
    minHQ: opts.minHQ ?? null,
    avgNQ: null, avgHQ: null,
    medianNQ: opts.medianNQ ?? opts.minNQ ?? null,
    medianHQ: opts.medianHQ ?? opts.minHQ ?? null,
    recentSalesNQ: opts.recentNQ ?? 10,
    recentSalesHQ: opts.recentHQ ?? 10,
    velocity: opts.velocity ?? 5,
    lastUploadTime: 0,
    listingCount: opts.listingCount ?? 5,
    worldListings: [],
    averagePriceNQ: null, averagePriceHQ: null,
  };
}

function mkShop(entries: Record<string, Array<{ itemId: number; receiveQty?: number; costPerUnit: number; isHq?: boolean }>>): SpecialShopSnapshot {
  const byCurrency = new Map();
  for (const [cur, list] of Object.entries(entries)) {
    byCurrency.set(cur, list.map((e) => ({ itemId: e.itemId, receiveQty: e.receiveQty ?? 1, costPerUnit: e.costPerUnit, isHq: e.isHq ?? false })));
  }
  return { byCurrency };
}

describe('runCurrencyFlip', () => {
  it('returns [] for empty snapshot', () => {
    const rows = runCurrencyFlip([], { byCurrency: new Map() }, {}, defaultCurrencyFlipFilter());
    expect(rows).toEqual([]);
  });

  it('returns [] when selected currency has no entries', () => {
    const snap = [mkSnap(100, 'X')];
    const shop = mkShop({ mgp: [{ itemId: 100, costPerUnit: 50000 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 5000 }) };
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toEqual([]);
  });

  it('excludes entries whose item is missing from item snapshot', () => {
    const snap: SnapshotItem[] = [];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 5 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 5000 }) };
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toEqual([]);
  });

  it('excludes entries with no market data', () => {
    const snap = [mkSnap(100, 'X')];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 5 }] });
    expect(runCurrencyFlip(snap, shop, {}, defaultCurrencyFlipFilter())).toEqual([]);
  });

  it('excludes entries with no trusted sale tier', () => {
    const snap = [mkSnap(100, 'X')];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 5 }] });
    const prices: MarketData = { 100: mkMarket({}) };
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toEqual([]);
  });

  it('computes a profitable NQ flip with derived fields', () => {
    const snap = [mkSnap(100, 'Widget', false)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 5000, medianNQ: 5000, recentNQ: 20, velocity: 2 }) };
    const rows = runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter());
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.id).toBe(100);
    expect(r.costPerUnit).toBe(10);
    expect(r.salePrice).toBe(5000);
    expect(r.hq).toBe(false);
    expect(r.gilPerUnit).toBe(500);
    expect(r.velocity).toBe(2);
  });

  it('hq:"either" picks the higher trusted tier (HQ when canHq && minHQ is higher)', () => {
    const snap = [mkSnap(100, 'Widget', true)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const prices: MarketData = { 100: mkMarket({
      minNQ: 800, medianNQ: 800,
      minHQ: 2000, medianHQ: 2000,
    }) };
    const rows = runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter());
    expect(rows[0].hq).toBe(true);
    expect(rows[0].salePrice).toBe(2000);
  });

  it('HQ-delivery shop entry forces HQ-tier comparison even when filter.hq=nq', () => {
    const snap = [mkSnap(100, 'Widget', true)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10, isHq: true }] });
    const prices: MarketData = { 100: mkMarket({
      minNQ: 800, medianNQ: 800,
      minHQ: 2000, medianHQ: 2000,
    }) };
    const filter = { ...defaultCurrencyFlipFilter(), hq: 'nq' as const };
    const rows = runCurrencyFlip(snap, shop, prices, filter);
    expect(rows).toHaveLength(1);
    expect(rows[0].hq).toBe(true);
    expect(rows[0].salePrice).toBe(2000);
  });

  it('HQ-delivery on non-canHq item still excludes (no HQ tier exists)', () => {
    const snap = [mkSnap(100, 'NQ Only', false)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10, isHq: true }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 1000, medianNQ: 1000 }) };
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toEqual([]);
  });

  it('excludes rows below minGilPerUnit', () => {
    const snap = [mkSnap(100, 'X', false)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 100, medianNQ: 100, velocity: 5 }) };
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toHaveLength(1);
    const tight = { ...defaultCurrencyFlipFilter(), minGilPerUnit: 50 };
    expect(runCurrencyFlip(snap, shop, prices, tight)).toEqual([]);
  });

  it('excludes rows below minVelocity', () => {
    const snap = [mkSnap(100, 'X', false)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 500, medianNQ: 500, velocity: 0.2 }) };
    const tight = { ...defaultCurrencyFlipFilter(), minVelocity: 0.5 };
    expect(runCurrencyFlip(snap, shop, prices, tight)).toEqual([]);
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toHaveLength(1);
  });

  it('excludes rows above maxListings when set', () => {
    const snap = [mkSnap(100, 'X', false)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 500, medianNQ: 500, velocity: 5, listingCount: 100 }) };
    const tight = { ...defaultCurrencyFlipFilter(), maxListings: 50 };
    expect(runCurrencyFlip(snap, shop, prices, tight)).toEqual([]);
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toHaveLength(1);
  });

  it('sorts by gilPerUnit desc by default with stable id tie-break', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false), mkSnap(3, 'C', false)];
    const shop = mkShop({ poetics: [
      { itemId: 1, costPerUnit: 10 },
      { itemId: 2, costPerUnit: 10 },
      { itemId: 3, costPerUnit: 10 },
    ]});
    const prices: MarketData = {
      1: mkMarket({ minNQ: 500, medianNQ: 500 }),
      2: mkMarket({ minNQ: 2000, medianNQ: 2000 }),
      3: mkMarket({ minNQ: 500, medianNQ: 500 }),
    };
    const rows = runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter());
    expect(rows.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('honors each sort mode', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false)];
    const shop = mkShop({ poetics: [
      { itemId: 1, costPerUnit: 5 },
      { itemId: 2, costPerUnit: 50 },
    ]});
    const prices: MarketData = {
      1: mkMarket({ minNQ: 500, medianNQ: 500, velocity: 5 }),
      2: mkMarket({ minNQ: 2000, medianNQ: 2000, velocity: 1 }),
    };
    const base = defaultCurrencyFlipFilter();
    expect(runCurrencyFlip(snap, shop, prices, { ...base, sort: 'gilPerUnit' }).map((r) => r.id)).toEqual([1, 2]);
    expect(runCurrencyFlip(snap, shop, prices, { ...base, sort: 'salePrice' }).map((r) => r.id)).toEqual([2, 1]);
    expect(runCurrencyFlip(snap, shop, prices, { ...base, sort: 'velocity' }).map((r) => r.id)).toEqual([1, 2]);
    expect(runCurrencyFlip(snap, shop, prices, { ...base, sort: 'costPerUnit' }).map((r) => r.id)).toEqual([2, 1]);
  });

  it('applies limit slice after sort', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false), mkSnap(3, 'C', false)];
    const shop = mkShop({ poetics: [
      { itemId: 1, costPerUnit: 10 },
      { itemId: 2, costPerUnit: 10 },
      { itemId: 3, costPerUnit: 10 },
    ]});
    const prices: MarketData = {
      1: mkMarket({ minNQ: 100, medianNQ: 100 }),
      2: mkMarket({ minNQ: 500, medianNQ: 500 }),
      3: mkMarket({ minNQ: 300, medianNQ: 300 }),
    };
    const filter = { ...defaultCurrencyFlipFilter(), limit: 2 };
    const rows = runCurrencyFlip(snap, shop, prices, filter);
    expect(rows.map((r) => r.id)).toEqual([2, 3]);
  });

  it('only includes entries from the selected currency', () => {
    const snap = [mkSnap(100, 'P', false), mkSnap(200, 'M', false)];
    const shop = mkShop({
      poetics: [{ itemId: 100, costPerUnit: 10 }],
      mgp: [{ itemId: 200, costPerUnit: 50000 }],
    });
    const prices: MarketData = {
      100: mkMarket({ minNQ: 1000, medianNQ: 1000 }),
      200: mkMarket({ minNQ: 1000000, medianNQ: 1000000 }),
    };
    const poeticsOnly = runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter());
    expect(poeticsOnly.map((r) => r.id)).toEqual([100]);
    const mgpOnly = runCurrencyFlip(snap, shop, prices, { ...defaultCurrencyFlipFilter(), currency: 'mgp' });
    expect(mgpOnly.map((r) => r.id)).toEqual([200]);
  });
});
