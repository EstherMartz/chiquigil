import { describe, it, expect } from 'vitest';
import { applyShoppingOverrides, type ChosenSource } from './applyShoppingOverrides';
import type { IngredientSurvey } from './shoppingListSurvey';
import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { ShoppingListItem } from './shoppingListStore';

function mkSurvey(overrides: Partial<IngredientSurvey> & Pick<IngredientSurvey, 'id' | 'qty'>): IngredientSurvey {
  return {
    mb: null, npc: null, currency: null, autoSource: null,
    ...overrides,
  };
}

function mkSnap(id: number, name = `Item${id}`, canHq = false): SnapshotItem {
  return { id, name, sc: 1, ui: 1, ilvl: 1, canHq };
}

function mkMarket(minNQ: number) {
  return {
    minNQ, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: minNQ, medianHQ: null,
    recentSalesNQ: 10, recentSalesHQ: 0, velocity: 1,
    lastUploadTime: 0, listingCount: 1,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
  };
}

describe('applyShoppingOverrides', () => {
  it('returns empty plan for empty survey', () => {
    const plan = applyShoppingOverrides([], [], [], {}, new Map());
    expect(plan.perIngredient).toEqual([]);
    expect(plan.byWorldSummary).toEqual([]);
    expect(plan.rollup).toEqual({ spend: 0, revenue: 0, profit: 0, missingIngredients: 0 });
  });

  it('with no overrides, behaves like the old planShopping (MB-only case)', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 3, mb: { world: 'Phantom', price: 100, count: 4, isLightDc: false }, autoSource: 'mb' }),
      mkSurvey({ id: 6, qty: 2, mb: { world: 'Odin', price: 50, count: 1, isLightDc: true }, autoSource: 'mb' }),
    ];
    const plan = applyShoppingOverrides(survey, [], [], {}, new Map());
    expect(plan.perIngredient).toEqual([
      { id: 5, qty: 3, bestWorld: 'Phantom', bestPrice: 100, isLightDc: false, listingCount: 4 },
      { id: 6, qty: 2, bestWorld: 'Odin', bestPrice: 50, isLightDc: true, listingCount: 1 },
    ]);
    expect(plan.rollup.spend).toBe(400);
    expect(plan.byWorldSummary).toHaveLength(2);
  });

  it('override flips MB→NPC for one ingredient → spend updates, NPC card appears', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 3,
        mb: { world: 'Phantom', price: 100, count: 4, isLightDc: false },
        npc: { price: 80 },
        autoSource: 'mb' }),
    ];
    const overrides = new Map<number, ChosenSource>([[5, 'npc']]);
    const plan = applyShoppingOverrides(survey, [], [], {}, overrides);
    expect(plan.perIngredient[0]).toEqual({
      id: 5, qty: 3, bestWorld: 'NPC vendor', bestPrice: 80, isLightDc: false, listingCount: 0,
    });
    expect(plan.rollup.spend).toBe(240);
    expect(plan.byWorldSummary).toHaveLength(1);
    expect(plan.byWorldSummary[0].world).toBe('NPC vendor');
    expect(plan.byWorldSummary[0].total).toBe(240);
  });

  it('override targets npc when survey has no npc → falls back to autoSource (mb)', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 1,
        mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false },
        autoSource: 'mb' }),
    ];
    const overrides = new Map<number, ChosenSource>([[5, 'npc']]);
    const plan = applyShoppingOverrides(survey, [], [], {}, overrides);
    expect(plan.perIngredient[0].bestWorld).toBe('Phantom');
    expect(plan.perIngredient[0].bestPrice).toBe(100);
  });

  it('override targets mb when survey has no mb → falls back to npc', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 1, npc: { price: 80 }, autoSource: 'npc' }),
    ];
    const overrides = new Map<number, ChosenSource>([[5, 'mb']]);
    const plan = applyShoppingOverrides(survey, [], [], {}, overrides);
    expect(plan.perIngredient[0].bestWorld).toBe('NPC vendor');
    expect(plan.perIngredient[0].bestPrice).toBe(80);
  });

  it('rollup.spend sums both MB and NPC totals', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 2, mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false }, autoSource: 'mb' }),
      mkSurvey({ id: 6, qty: 3, npc: { price: 80 }, autoSource: 'npc' }),
    ];
    const plan = applyShoppingOverrides(survey, [], [], {}, new Map());
    expect(plan.rollup.spend).toBe(200 + 240);
    expect(plan.byWorldSummary.map((c) => c.world).sort()).toEqual(['NPC vendor', 'Phantom']);
  });

  it('byWorldSummary places NPC vendor card alongside real worlds, sorted by total desc', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 1, mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false }, autoSource: 'mb' }),
      mkSurvey({ id: 6, qty: 10, npc: { price: 50 }, autoSource: 'npc' }),
      mkSurvey({ id: 7, qty: 2, mb: { world: 'Odin', price: 50, count: 1, isLightDc: true }, autoSource: 'mb' }),
    ];
    const plan = applyShoppingOverrides(survey, [], [], {}, new Map());
    expect(plan.byWorldSummary.map((c) => c.world)).toEqual(['NPC vendor', 'Phantom', 'Odin']);
  });

  it('revenue computation uses itemRevenueUnit (HQ-min-price preference)', () => {
    const items: ShoppingListItem[] = [{ id: 99, qty: 2, craftIntermediates: false }];
    const snapshot: SnapshotItem[] = [mkSnap(99, 'Gizmo', true)];
    const prices: MarketData = {
      99: { ...mkMarket(500), minHQ: 2000, medianHQ: 2000 },
    };
    const plan = applyShoppingOverrides([], items, snapshot, prices, new Map());
    expect(plan.rollup.revenue).toBe(4000);
  });

  it('revenue falls back to cheapest EU NQ world listing when minNQ/minHQ are null', () => {
    const items: ShoppingListItem[] = [{ id: 99, qty: 2, craftIntermediates: false }];
    const snapshot: SnapshotItem[] = [mkSnap(99, 'Output', false)];
    const prices: MarketData = {
      99: {
        minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
        medianNQ: null, medianHQ: null,
        recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0,
        lastUploadTime: 0, listingCount: 2,
        worldListings: [
          { world: 'Phantom', price: 800, hq: false },
          { world: 'Odin', price: 1200, hq: false },
        ],
        averagePriceNQ: null, averagePriceHQ: null,
      },
    };
    const plan = applyShoppingOverrides([], items, snapshot, prices, new Map());
    expect(plan.rollup.revenue).toBe(1600);  // 800 (cheapest EU NQ) * 2
  });

  it('ingredient with no sources → missingIngredients++, bestWorld null', () => {
    const survey: IngredientSurvey[] = [mkSurvey({ id: 5, qty: 1 })];
    const plan = applyShoppingOverrides(survey, [], [], {}, new Map());
    expect(plan.perIngredient[0]).toEqual({
      id: 5, qty: 1, bestWorld: null, bestPrice: null, isLightDc: false, listingCount: 0,
    });
    expect(plan.rollup.missingIngredients).toBe(1);
    expect(plan.rollup.spend).toBe(0);
  });
});
