import { describe, it, expect } from 'vitest';
import { runWhatsNew } from './runWhatsNew';
import { defaultWhatsNewFilter } from './types';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { CrafterLevels } from '../items/craftStatus';

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

  it('filters to the selected item-search-categories', () => {
    const catItems = new Map<number, SnapshotItem>([
      [1, { id: 1, name: 'Alpha', sc: 7, ui: 1, ilvl: 1, canHq: true }],
      [2, { id: 2, name: 'Beta', sc: 56, ui: 1, ilvl: 1, canHq: true }],
    ]);
    const catData: MarketData = {
      1: market({ velocity: 5, medianNQ: 200, recentSalesNQ: 4 }),
      2: market({ velocity: 4, medianNQ: 100, recentSalesNQ: 4 }),
    };
    const filter = { ...defaultWhatsNewFilter(), categories: [56] };
    const rows = runWhatsNew([1, 2], catItems, catData, new Set<number>(), filter, NOW);
    expect(rows.map((r) => r.id)).toEqual([2]); // only sc=56 kept
  });

  it('shows all categories when none are selected', () => {
    const catItems = new Map<number, SnapshotItem>([
      [1, { id: 1, name: 'Alpha', sc: 7, ui: 1, ilvl: 1, canHq: true }],
      [2, { id: 2, name: 'Beta', sc: 56, ui: 1, ilvl: 1, canHq: true }],
    ]);
    const catData: MarketData = {
      1: market({ velocity: 5 }),
      2: market({ velocity: 4 }),
    };
    const rows = runWhatsNew([1, 2], catItems, catData, new Set<number>(), defaultWhatsNewFilter(), NOW);
    expect(rows.map((r) => r.id).sort()).toEqual([1, 2]);
  });
});

describe('runWhatsNew — spike & myJobsOnly', () => {
  const NOW = 1000 + 86_400_000;

  describe('spike calculation', () => {
    it('computes spike as velocity / category average', () => {
      // Two items in the same category (sc=10): velocities 8 and 2, avg=5
      // One item alone (sc=20): velocity 3, avg=3, spike=1.0
      const items = new Map<number, SnapshotItem>([
        [1, { id: 1, name: 'Fast', sc: 10, ui: 1, ilvl: 1, canHq: true }],
        [2, { id: 2, name: 'Slow', sc: 10, ui: 1, ilvl: 1, canHq: true }],
        [3, { id: 3, name: 'Solo', sc: 20, ui: 1, ilvl: 1, canHq: true }],
      ]);
      const data: MarketData = {
        1: market({ velocity: 8 }),
        2: market({ velocity: 2 }),
        3: market({ velocity: 3 }),
      };
      const rows = runWhatsNew([1, 2, 3], items, data, new Set(), defaultWhatsNewFilter(), NOW);
      expect(rows).toHaveLength(3);

      const fast = rows.find((r) => r.id === 1)!;
      expect(fast.spike).toBeCloseTo(1.6, 1); // 8 / 5 = 1.6

      const slow = rows.find((r) => r.id === 2)!;
      expect(slow.spike).toBeCloseTo(0.4, 1); // 2 / 5 = 0.4

      const solo = rows.find((r) => r.id === 3)!;
      expect(solo.spike).toBeCloseTo(1.0, 1); // 3 / 3 = 1.0
    });

    it('returns null spike when category has no positive-velocity items', () => {
      const items = new Map<number, SnapshotItem>([
        [1, { id: 1, name: 'Tradeable', sc: 10, ui: 1, ilvl: 1, canHq: true }],
        [2, { id: 2, name: 'Untradeable', sc: 10, ui: 1, ilvl: 1, canHq: true }],
      ]);
      const data: MarketData = {
        1: market({ velocity: 0 }), // zero velocity, still no average
      };
      const filter = { ...defaultWhatsNewFilter(), tradeableOnly: false, minVelocity: 0 };
      const rows = runWhatsNew([1, 2], items, data, new Set(), filter, NOW);
      expect(rows).toHaveLength(2);

      const tradeable = rows.find((r) => r.id === 1)!;
      expect(tradeable.spike).toBeNull(); // category avg is null (no positive velocities)

      const untradeable = rows.find((r) => r.id === 2)!;
      expect(untradeable.spike).toBeNull();
    });

    it('sorts by spike descending', () => {
      const items = new Map<number, SnapshotItem>([
        [1, { id: 1, name: 'Hot', sc: 10, ui: 1, ilvl: 1, canHq: true }],
        [2, { id: 2, name: 'Cold', sc: 10, ui: 1, ilvl: 1, canHq: true }],
      ]);
      const data: MarketData = {
        1: market({ velocity: 10 }),
        2: market({ velocity: 2 }),
      };
      const filter = { ...defaultWhatsNewFilter(), sort: 'spike' as const };
      const rows = runWhatsNew([1, 2], items, data, new Set(), filter, NOW);
      expect(rows.map((r) => r.id)).toEqual([1, 2]); // hot (spike 1.67) before cold (spike 0.33)
    });
  });

  describe('myJobsOnly filter', () => {
    it('keeps items craftable by leveled jobs, drops others', () => {
      const items = new Map<number, SnapshotItem>([
        [1, { id: 1, name: 'CUL lvl 50', sc: 10, ui: 1, ilvl: 1, canHq: true }],
        [2, { id: 2, name: 'CUL lvl 60', sc: 10, ui: 1, ilvl: 1, canHq: true }],
        [3, { id: 3, name: 'No recipe', sc: 10, ui: 1, ilvl: 1, canHq: true }],
      ]);
      const data: MarketData = {
        1: market({ velocity: 1 }),
        2: market({ velocity: 1 }),
        3: market({ velocity: 1 }),
      };
      const recipes = new Map<number, Recipe>([
        [1, { itemResultId: 1, classJob: 'CUL', recipeLevel: 50, ingredients: [] }],
        [2, { itemResultId: 2, classJob: 'CUL', recipeLevel: 60, ingredients: [] }],
      ]);
      const levels: CrafterLevels = {
        CRP: 0, BSM: 0, ARM: 0, GSM: 0, WVR: 0, LTW: 0, CUL: 50, ALC: 0,
      };
      const filter = { ...defaultWhatsNewFilter(), myJobsOnly: true };
      const rows = runWhatsNew([1, 2, 3], items, data, new Set(), filter, NOW, {
        recipes,
        levels,
      });
      expect(rows.map((r) => r.id)).toEqual([1]); // only item 1 (CUL 50, my level)
    });

    it('is a no-op when recipes/levels are missing', () => {
      const items = new Map<number, SnapshotItem>([
        [1, { id: 1, name: 'Item', sc: 10, ui: 1, ilvl: 1, canHq: true }],
      ]);
      const data: MarketData = {
        1: market({ velocity: 1 }),
      };
      const filter = { ...defaultWhatsNewFilter(), myJobsOnly: true };
      // No opts passed at all
      const rows = runWhatsNew([1], items, data, new Set(), filter, NOW);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(1);
    });

    it('is a no-op when only recipes are provided (no levels)', () => {
      const items = new Map<number, SnapshotItem>([
        [1, { id: 1, name: 'Item', sc: 10, ui: 1, ilvl: 1, canHq: true }],
      ]);
      const data: MarketData = {
        1: market({ velocity: 1 }),
      };
      const recipes = new Map<number, Recipe>([
        [1, { itemResultId: 1, classJob: 'CUL', recipeLevel: 50, ingredients: [] }],
      ]);
      const filter = { ...defaultWhatsNewFilter(), myJobsOnly: true };
      const rows = runWhatsNew([1], items, data, new Set(), filter, NOW, { recipes });
      expect(rows).toHaveLength(1); // not filtered
    });
  });
});
