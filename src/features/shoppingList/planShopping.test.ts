import { describe, it, expect } from 'vitest';
import { planShopping } from './planShopping';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { ShoppingListItem } from './shoppingListStore';
import type { SnapshotItem } from '../../lib/itemSnapshot';

function mkMarketItem(listings: { world: string; price: number; hq?: boolean }[], minNQ?: number | null, minHQ?: number | null): MarketItem {
  return {
    minNQ: minNQ ?? null,
    minHQ: minHQ ?? null,
    avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0,
    velocity: 0,
    lastUploadTime: 0,
    listingCount: listings.length,
    worldListings: listings.map((l) => ({ world: l.world, price: l.price, hq: !!l.hq })),
    averagePriceNQ: null, averagePriceHQ: null,
  };
}

function mkSnapshotItem(id: number, name: string, canHq = true): SnapshotItem {
  return { id, name, sc: 1, ui: 1, ilvl: 1, canHq };
}

describe('planShopping', () => {
  it('returns empty plan for empty demand', () => {
    const plan = planShopping(new Map(), [], {}, []);
    expect(plan.perIngredient).toEqual([]);
    expect(plan.byWorldSummary).toEqual([]);
    expect(plan.rollup).toEqual({ spend: 0, revenue: 0, profit: 0, missingIngredients: 0 });
  });

  it('picks the cheapest world per ingredient (NQ only, ignores HQ listings)', () => {
    const demand = new Map([[5, 3]]);
    const prices: MarketData = {
      5: mkMarketItem([
        { world: 'Phantom', price: 100 },
        { world: 'Odin', price: 60 },
        { world: 'Odin', price: 30, hq: true }, // HQ — must be ignored
      ]),
    };
    const plan = planShopping(demand, [], prices, []);
    expect(plan.perIngredient).toEqual([
      { id: 5, qty: 3, bestWorld: 'Odin', bestPrice: 60, isLightDc: true, listingCount: 3 },
    ]);
  });

  it('flags Light DC stops', () => {
    const demand = new Map([[5, 1]]);
    const prices: MarketData = { 5: mkMarketItem([{ world: 'Twintania', price: 99 }]) };
    const plan = planShopping(demand, [], prices, []);
    expect(plan.perIngredient[0].isLightDc).toBe(true);
  });

  it('flags Chaos stops as not Light DC', () => {
    const demand = new Map([[5, 1]]);
    const prices: MarketData = { 5: mkMarketItem([{ world: 'Phantom', price: 99 }]) };
    const plan = planShopping(demand, [], prices, []);
    expect(plan.perIngredient[0].isLightDc).toBe(false);
  });

  it('marks ingredient as missing when there are no NQ listings on any EU world', () => {
    const demand = new Map([[5, 2]]);
    const prices: MarketData = { 5: mkMarketItem([{ world: 'Bahamut', price: 50 }]) }; // JP world
    const plan = planShopping(demand, [], prices, []);
    expect(plan.perIngredient).toEqual([
      { id: 5, qty: 2, bestWorld: null, bestPrice: null, isLightDc: false, listingCount: 0 },
    ]);
    expect(plan.rollup.missingIngredients).toBe(1);
    expect(plan.rollup.spend).toBe(0);
  });

  it('groups ingredients by world into summary cards sorted by total desc', () => {
    const demand = new Map([[5, 2], [6, 3], [7, 1]]);
    const prices: MarketData = {
      5: mkMarketItem([{ world: 'Phantom', price: 100 }]),    // 200
      6: mkMarketItem([{ world: 'Odin', price: 50 }]),         // 150
      7: mkMarketItem([{ world: 'Phantom', price: 30 }]),     // 30
    };
    const plan = planShopping(demand, [], prices, []);
    expect(plan.byWorldSummary).toHaveLength(2);
    expect(plan.byWorldSummary[0].world).toBe('Phantom');
    expect(plan.byWorldSummary[0].total).toBe(230);
    expect(plan.byWorldSummary[0].isLightDc).toBe(false);
    expect(plan.byWorldSummary[0].ingredients).toEqual([
      { id: 5, qty: 2, price: 100 },
      { id: 7, qty: 1, price: 30 },
    ]);
    expect(plan.byWorldSummary[1].world).toBe('Odin');
    expect(plan.byWorldSummary[1].total).toBe(150);
    expect(plan.byWorldSummary[1].isLightDc).toBe(true);
  });

  it('rolls up spend = Σ(qty × bestPrice) excluding missing ingredients', () => {
    const demand = new Map([[5, 2], [6, 3]]);
    const prices: MarketData = {
      5: mkMarketItem([{ world: 'Phantom', price: 100 }]),    // 200
      6: mkMarketItem([{ world: 'Bahamut', price: 999 }]),    // missing (not EU)
    };
    const plan = planShopping(demand, [], prices, []);
    expect(plan.rollup.spend).toBe(200);
    expect(plan.rollup.missingIngredients).toBe(1);
  });

  it('computes revenue from item HQ home price × craft qty (canHq=true)', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 2, craftIntermediates: false }];
    const snapshot: SnapshotItem[] = [mkSnapshotItem(100, 'Widget', true)];
    const prices: MarketData = {
      100: mkMarketItem([{ world: 'Phantom', price: 500, hq: true }], null, 500),
    };
    const plan = planShopping(new Map(), items, prices, snapshot);
    expect(plan.rollup.revenue).toBe(1000); // 500 × 2
  });

  it('uses NQ price when item is not HQ-capable', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 3, craftIntermediates: false }];
    const snapshot: SnapshotItem[] = [mkSnapshotItem(100, 'NQ Only', false)];
    const prices: MarketData = {
      100: mkMarketItem([{ world: 'Phantom', price: 200 }], 200, null),
    };
    const plan = planShopping(new Map(), items, prices, snapshot);
    expect(plan.rollup.revenue).toBe(600); // 200 × 3
  });

  it('contributes 0 revenue when item has no price anywhere in EU', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: false }];
    const snapshot: SnapshotItem[] = [mkSnapshotItem(100, 'No Market', true)];
    const prices: MarketData = { 100: mkMarketItem([], null, null) };
    const plan = planShopping(new Map(), items, prices, snapshot);
    expect(plan.rollup.revenue).toBe(0);
  });

  it('profit = revenue − spend', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: false }];
    const snapshot: SnapshotItem[] = [mkSnapshotItem(100, 'X', true)];
    const demand = new Map([[5, 2]]);
    const prices: MarketData = {
      100: mkMarketItem([{ world: 'Phantom', price: 500, hq: true }], null, 500),
      5: mkMarketItem([{ world: 'Phantom', price: 100 }]),
    };
    const plan = planShopping(demand, items, prices, snapshot);
    expect(plan.rollup.spend).toBe(200);
    expect(plan.rollup.revenue).toBe(500);
    expect(plan.rollup.profit).toBe(300);
  });
});
