import { describe, it, expect } from 'vitest';
import { runVendorFlip } from './runVendorFlip';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { defaultVendorFlipFilter } from './types';

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

describe('runVendorFlip', () => {
  it('returns [] for empty snapshot', () => {
    const rows = runVendorFlip([], new Map(), {}, defaultVendorFlipFilter());
    expect(rows).toEqual([]);
  });

  it('excludes items not in the vendor map', () => {
    const snap = [mkSnap(100, 'X')];
    const prices: MarketData = { 100: mkMarket({ minNQ: 5000 }) };
    const rows = runVendorFlip(snap, new Map(), prices, defaultVendorFlipFilter());
    expect(rows).toEqual([]);
  });

  it('excludes items with no trusted sale tier', () => {
    const snap = [mkSnap(100, 'X')];
    const vendors = new Map([[100, 100]]);
    // No minNQ/minHQ → pickTrustedSaleTier returns null
    const prices: MarketData = { 100: mkMarket({}) };
    const rows = runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter());
    expect(rows).toEqual([]);
  });

  it('includes a profitable NQ flip and computes derived fields', () => {
    const snap = [mkSnap(100, 'Widget', false)];   // canHq=false so HQ tier never considered
    const vendors = new Map([[100, 100]]);          // vendor sells for 100 gil
    const prices: MarketData = { 100: mkMarket({ minNQ: 1000, medianNQ: 1000, recentNQ: 20, velocity: 2 }) };
    const rows = runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter());
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.id).toBe(100);
    expect(r.vendorPrice).toBe(100);
    expect(r.salePrice).toBe(1000);
    expect(r.hq).toBe(false);
    expect(r.profitPerUnit).toBe(900);
    expect(r.markup).toBeCloseTo(10);
    expect(r.profitPerDay).toBeCloseTo(1800);     // 900 × 2
    expect(r.velocity).toBe(2);
  });

  it('hq:"either" picks the higher trusted tier (HQ when item.canHq && minHQ is higher)', () => {
    const snap = [mkSnap(100, 'Widget', true)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({
      minNQ: 800, medianNQ: 800,
      minHQ: 2000, medianHQ: 2000,
    }) };
    const rows = runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter());
    expect(rows).toHaveLength(1);
    expect(rows[0].hq).toBe(true);
    expect(rows[0].salePrice).toBe(2000);
  });

  it('hq:"either" falls back to NQ when item is not HQ-capable', () => {
    const snap = [mkSnap(100, 'Widget', false)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({
      minNQ: 800, medianNQ: 800,
      minHQ: 2000, medianHQ: 2000,   // present but item is not canHq → ignored
    }) };
    const rows = runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter());
    expect(rows[0].hq).toBe(false);
    expect(rows[0].salePrice).toBe(800);
  });

  it('hq:"hq" requires item.canHq and an HQ tier — excludes NQ-only items', () => {
    const snap = [mkSnap(100, 'NQ Only', false)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({ minNQ: 1000, medianNQ: 1000 }) };
    const filter = { ...defaultVendorFlipFilter(), hq: 'hq' as const };
    expect(runVendorFlip(snap, vendors, prices, filter)).toEqual([]);
  });

  it('excludes rows below minProfit', () => {
    const snap = [mkSnap(100, 'X', false)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({ minNQ: 300, medianNQ: 300, velocity: 5 }) };
    // profitPerUnit = 200, minProfit default = 500 → excluded
    expect(runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter())).toEqual([]);
    // Loosen minProfit → included
    const loose = { ...defaultVendorFlipFilter(), minProfit: 100 };
    expect(runVendorFlip(snap, vendors, prices, loose)).toHaveLength(1);
  });

  it('excludes rows below minMarkup', () => {
    const snap = [mkSnap(100, 'X', false)];
    const vendors = new Map([[100, 1000]]);
    const prices: MarketData = { 100: mkMarket({ minNQ: 1800, medianNQ: 1800, velocity: 5 }) };
    // markup = 1.8×, default minMarkup = 2.0 → excluded
    expect(runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter())).toEqual([]);
    const loose = { ...defaultVendorFlipFilter(), minMarkup: 1.5 };
    expect(runVendorFlip(snap, vendors, prices, loose)).toHaveLength(1);
  });

  it('excludes rows below minVelocity', () => {
    const snap = [mkSnap(100, 'X', false)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 0.2 }) };
    expect(runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter())).toEqual([]);
  });

  it('excludes rows above maxListings when set', () => {
    const snap = [mkSnap(100, 'X', false)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 5, listingCount: 100 }) };
    const tight = { ...defaultVendorFlipFilter(), maxListings: 50 };
    expect(runVendorFlip(snap, vendors, prices, tight)).toEqual([]);
    expect(runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter())).toHaveLength(1);
  });

  it('applies searchCategories filter when non-empty', () => {
    const snap = [mkSnap(100, 'A', false, 5), mkSnap(200, 'B', false, 7)];
    const vendors = new Map([[100, 50], [200, 50]]);
    const prices: MarketData = {
      100: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 5 }),
      200: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 5 }),
    };
    const filter = { ...defaultVendorFlipFilter(), searchCategories: [7] };
    const rows = runVendorFlip(snap, vendors, prices, filter);
    expect(rows.map((r) => r.id)).toEqual([200]);
  });

  it('sorts by profitPerDay desc by default with stable id tie-break', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false), mkSnap(3, 'C', false)];
    const vendors = new Map([[1, 100], [2, 100], [3, 100]]);
    const prices: MarketData = {
      1: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 1 }),  // profitPerDay 900
      2: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 5 }),  // profitPerDay 4500
      3: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 1 }),  // profitPerDay 900 — ties with 1, id 1 wins
    };
    const rows = runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter());
    expect(rows.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('honors each sort mode', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false)];
    const vendors = new Map([[1, 100], [2, 500]]);
    const prices: MarketData = {
      1: mkMarket({ minNQ: 600, medianNQ: 600, velocity: 5 }),   // markup 6, profitPerUnit 500, profitPerDay 2500
      2: mkMarket({ minNQ: 2000, medianNQ: 2000, velocity: 1 }), // markup 4, profitPerUnit 1500, profitPerDay 1500
    };
    const base = { ...defaultVendorFlipFilter(), minProfit: 0, minMarkup: 1 };
    expect(runVendorFlip(snap, vendors, prices, { ...base, sort: 'profitPerDay' }).map((r) => r.id)).toEqual([1, 2]);
    expect(runVendorFlip(snap, vendors, prices, { ...base, sort: 'profitPerUnit' }).map((r) => r.id)).toEqual([2, 1]);
    expect(runVendorFlip(snap, vendors, prices, { ...base, sort: 'markup' }).map((r) => r.id)).toEqual([1, 2]);
    expect(runVendorFlip(snap, vendors, prices, { ...base, sort: 'salePrice' }).map((r) => r.id)).toEqual([2, 1]);
    expect(runVendorFlip(snap, vendors, prices, { ...base, sort: 'velocity' }).map((r) => r.id)).toEqual([1, 2]);
  });

  it('applies limit slice after sort', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false), mkSnap(3, 'C', false)];
    const vendors = new Map([[1, 100], [2, 100], [3, 100]]);
    const prices: MarketData = {
      1: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 1 }),
      2: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 5 }),
      3: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 3 }),
    };
    const filter = { ...defaultVendorFlipFilter(), limit: 2 };
    const rows = runVendorFlip(snap, vendors, prices, filter);
    expect(rows.map((r) => r.id)).toEqual([2, 3]);
  });
});
