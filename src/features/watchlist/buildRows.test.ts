import { describe, it, expect } from 'vitest';
import { buildRows } from './buildRows';
import type { TrackedItem } from '../items/types';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';

const items: TrackedItem[] = [
  { id: 1, name: 'A', crafter: 'LTW', lvl: 100, cat: 'Raid' },
  { id: 2, name: 'B', crafter: 'WVR', lvl: 100, cat: 'Raid' },
];

const extra = { worldListings: [], averagePriceNQ: null, averagePriceHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0 };

const phantom: MarketData = {
  '1': { minNQ: 100, minHQ: 200, avgNQ: 110, avgHQ: 220, velocity: 1, lastUploadTime: Date.now(), listingCount: 1, ...extra },
  '2': { minNQ: 50,  minHQ: null, avgNQ: 55,  avgHQ: null, velocity: 0.2, lastUploadTime: Date.now(), listingCount: 1, ...extra },
};

const dc: MarketData = {
  '1': { minNQ: 90,  minHQ: 180, avgNQ: 95,  avgHQ: 200, velocity: 5, lastUploadTime: Date.now(), listingCount: 5, ...extra },
  '2': { minNQ: 40,  minHQ: null, avgNQ: 45,  avgHQ: null, velocity: 1, lastUploadTime: Date.now(), listingCount: 2, ...extra },
};

const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };

describe('buildRows', () => {
  it('produces one row per item with phantom + dc + score + craftStatus', () => {
    const rows = buildRows(items, phantom, dc, levels, new Map(), {}, Date.now());
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(1);
    expect(rows[0].dcMinHQ).toBe(180);
    expect(rows[0].pAvgHQ).toBe(220);
    expect(rows[0].dcSpd).toBe(5);
    expect(rows[0].craftStatus).toBe('ok');
  });

  it('refPrice prefers DC HQ → DC NQ → Phantom HQ avg → Phantom NQ avg', () => {
    const rows = buildRows(items, phantom, dc, levels, new Map(), {}, Date.now());
    expect(rows[0].refPrice).toBe(180);
    expect(rows[1].refPrice).toBe(40);
  });

  it('normalizes scores 0-100 against the max raw score', () => {
    const rows = buildRows(items, phantom, dc, levels, new Map(), {}, Date.now());
    // raw: row0 = 180*5 = 900, row1 = 40*1 = 40
    expect(rows[0].score).toBe(100);
    expect(rows[1].score).toBe(Math.round((40 / 900) * 100));
  });

  it('flags stale when last upload is > 3 days old', () => {
    const now = 10_000_000_000_000;
    const oldTs = now - (4 * 86_400_000);
    const stalePhantom: MarketData = { '1': { ...phantom['1'], lastUploadTime: oldTs }, '2': phantom['2'] };
    const staleDc: MarketData = { '1': { ...dc['1'], lastUploadTime: oldTs }, '2': dc['2'] };
    const rows = buildRows(items, stalePhantom, staleDc, levels, new Map(), {}, now);
    expect(rows[0].staleDays).toBeGreaterThan(3);
  });
});

describe('buildRows with recipes', () => {
  const recipe1: Recipe = {
    itemResultId: 1,
    classJob: 'LTW',
    recipeLevel: 100,
    ingredients: [{ itemId: 99, amount: 2 }],
  };

  it('marks rows as craftable when a recipe is present and computes profit', () => {
    const items: TrackedItem[] = [{ id: 1, name: 'Crafted', crafter: 'LTW', lvl: 100, cat: 'Raid' }];
    const phantom: MarketData = {
      '1': { minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, velocity: 0, lastUploadTime: Date.now(), listingCount: 0, ...extra },
    };
    const dc: MarketData = {
      '1': { minNQ: null, minHQ: 1000, avgNQ: null, avgHQ: null, velocity: 4, lastUploadTime: Date.now(), listingCount: 1, ...extra },
      '99': { minNQ: 100, minHQ: null, avgNQ: null, avgHQ: null, velocity: 0, lastUploadTime: Date.now(), listingCount: 1, ...extra },
    };
    const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };
    const recipeMap = new Map([[1, recipe1]]);
    const rows = buildRows(items, phantom, dc, levels, recipeMap, {}, Date.now());
    // material = 100 × 2 = 200; sale = 1000 (HQ); profit = 800; gil/day = 800 × 4 = 3200
    expect(rows[0].craftable).toBe(true);
    expect(rows[0].materialCost).toBe(200);
    expect(rows[0].salePrice).toBe(1000);
    expect(rows[0].profit).toBe(800);
    expect(rows[0].gilPerDay).toBe(3200);
  });

  it('marks rows as sale-only when recipeMap returns null and computes gilPerDay from unit × velocity', () => {
    const items: TrackedItem[] = [{ id: 1, name: 'Materia XII', crafter: 'ANY', lvl: 100, cat: 'Materia' }];
    const phantom: MarketData = {
      '1': { minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, velocity: 0, lastUploadTime: Date.now(), listingCount: 0, ...extra },
    };
    const dc: MarketData = {
      '1': { minNQ: 50_000, minHQ: null, avgNQ: null, avgHQ: null, velocity: 2, lastUploadTime: Date.now(), listingCount: 1, ...extra },
    };
    const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };
    const recipeMap = new Map<number, Recipe | null>([[1, null]]);
    const rows = buildRows(items, phantom, dc, levels, recipeMap, {}, Date.now());
    expect(rows[0].craftable).toBe(false);
    expect(rows[0].profit).toBeNull();
    expect(rows[0].materialCost).toBeNull();
    // 50_000 × 2 = 100_000
    expect(rows[0].gilPerDay).toBe(100_000);
  });

  it('sale-only with zero velocity or no price keeps gilPerDay null', () => {
    const items: TrackedItem[] = [
      { id: 1, name: 'No velocity', crafter: 'ANY', lvl: 100, cat: 'Materia' },
      { id: 2, name: 'No price', crafter: 'ANY', lvl: 100, cat: 'Materia' },
    ];
    const phantom: MarketData = {};
    const dc: MarketData = {
      '1': { minNQ: 50_000, minHQ: null, avgNQ: null, avgHQ: null, velocity: 0, lastUploadTime: Date.now(), listingCount: 1, ...extra },
      '2': { minNQ: null,   minHQ: null, avgNQ: null, avgHQ: null, velocity: 3, lastUploadTime: Date.now(), listingCount: 0, ...extra },
    };
    const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };
    const recipeMap = new Map<number, Recipe | null>([[1, null], [2, null]]);
    const rows = buildRows(items, phantom, dc, levels, recipeMap, {}, Date.now());
    expect(rows[0].gilPerDay).toBeNull();
    expect(rows[1].gilPerDay).toBeNull();
  });

  it('treats unresolved recipe (not in map) as not-yet-known: craftable null, profit null', () => {
    const items: TrackedItem[] = [{ id: 1, name: 'Unknown', crafter: 'LTW', lvl: 100, cat: 'Raid' }];
    const phantom: MarketData = {};
    const dc: MarketData = {
      '1': { minNQ: 100, minHQ: null, avgNQ: null, avgHQ: null, velocity: 0, lastUploadTime: Date.now(), listingCount: 1, ...extra },
    };
    const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };
    const rows = buildRows(items, phantom, dc, levels, new Map(), {}, Date.now());
    expect(rows[0].craftable).toBeNull();
    expect(rows[0].profit).toBeNull();
  });
});
