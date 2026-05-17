import { describe, it, expect } from 'vitest';
import { narrowForMaterialFlip, runMaterialFlip } from './runMaterialFlip';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem, WorldListing } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import { defaultMaterialFlipFilter, type MaterialFlipFilter } from './types';

const snapshot: SnapshotItem[] = [
  { id: 1, name: 'Glamour Top', sc: 56, ui: 65, ilvl: 90, canHq: true },
];

function mkSale(p: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0,
    velocity: 0, lastUploadTime: Date.now(), listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...p,
  };
}

function listing(world: string, price: number, hq = false): WorldListing {
  return { world, price, hq };
}

const recipe1: Recipe = {
  itemResultId: 1, classJob: 'LTW', recipeLevel: 90,
  ingredients: [{ itemId: 99, amount: 2 }, { itemId: 100, amount: 1 }],
};
const recipes = new Map<number, Recipe | null>([[1, recipe1]]);

const baseFilter: MaterialFlipFilter = {
  ...defaultMaterialFlipFilter(),
  minSavings: 1, // tiny threshold for fixtures
};

describe('runMaterialFlip — per-ingredient cheapest', () => {
  it('computes homeMatCost, bestPerIngredientCost, perIngredientSavings', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 2, listingCount: 1,
        worldListings: [listing('Phantom', 10_000, true)],
      }),
    };
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [
        listing('Phantom', 100), listing('Lich', 60),
      ] }),
      100: mkSale({ worldListings: [
        listing('Phantom', 500), listing('Omega', 400),
      ] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes, 'Phantom', baseFilter);
    expect(out).toHaveLength(1);
    const r = out[0];
    expect(r.homeMatCost).toBe(700);
    expect(r.bestPerIngredientCost).toBe(520);
    expect(r.perIngredientSavings).toBe(180);
    expect(r.salePrice).toBe(10_000);
    expect(r.velocity).toBe(2);
    expect(r.gilSavedPerDay).toBe(360);
    expect(r.pctDiscount).toBeCloseTo(180 / 700);
    expect(r.hq).toBe(true);
  });

  it('drops rows with no trusted sale tier', () => {
    const saleMap: MarketData = {
      1: mkSale({ velocity: 2, listingCount: 1 }),
    };
    const out = runMaterialFlip(snapshot, saleMap, {}, recipes, 'Phantom', baseFilter);
    expect(out).toEqual([]);
  });

  it('drops rows below minSavings', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 2, listingCount: 1,
      }),
    };
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [listing('Phantom', 100)] }),
      100: mkSale({ worldListings: [listing('Phantom', 500)] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes,
      'Phantom', { ...baseFilter, minSavings: 1000 });
    expect(out).toEqual([]);
  });

  it('falls back to home price when ingredient has no region listings', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [listing('Phantom', 100)] }),
      // 100 missing entirely
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes,
      'Phantom', { ...baseFilter, minSavings: 1 });
    expect(out).toEqual([]);  // savings = 0
  });
});

describe('runMaterialFlip — single-stop world', () => {
  it('chooses the world that minimizes the full basket, not the most-cheapest-ingredients world', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    // Lich is cheapest for ingredient 99 (60 vs 100). Omega is cheapest for
    // ingredient 100 (400 vs 500). But Omega's basket (100*2 + 400 = 600) beats
    // Lich's basket (60*2 + 500 = 620). Single-stop should pick Omega.
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [
        listing('Phantom', 100), listing('Lich', 60), listing('Omega', 100),
      ] }),
      100: mkSale({ worldListings: [
        listing('Phantom', 500), listing('Lich', 500), listing('Omega', 400),
      ] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes, 'Phantom', baseFilter);
    expect(out).toHaveLength(1);
    expect(out[0].bestSingleWorld).toBe('Omega');
    expect(out[0].singleStopCost).toBe(600);
    expect(out[0].singleStopSavings).toBe(100);
    expect(out[0].needsDcTravel).toBe(false);
  });

  it('flags needsDcTravel when single-stop winner is on Light DC', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [
        listing('Phantom', 100), listing('Twintania', 40),
      ] }),
      100: mkSale({ worldListings: [
        listing('Phantom', 500), listing('Twintania', 300),
      ] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes, 'Phantom', baseFilter);
    expect(out[0].bestSingleWorld).toBe('Twintania');
    expect(out[0].needsDcTravel).toBe(true);
  });

  it('respects includeLightDc=false by ignoring Light worlds in both calcs', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [
        listing('Phantom', 100), listing('Twintania', 10),
      ] }),
      100: mkSale({ worldListings: [
        listing('Phantom', 500), listing('Omega', 400),
      ] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes,
      'Phantom', { ...baseFilter, includeLightDc: false });
    expect(out).toHaveLength(1);
    expect(out[0].bestPerIngredientCost).toBe(600);
    expect(out[0].bestSingleWorld).toBe('Phantom');
    expect(out[0].singleStopCost).toBe(700);
  });

  it('falls back to home as the single-stop when no other world has all ingredients', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [
        listing('Phantom', 100), listing('Lich', 60),
      ] }),
      100: mkSale({ worldListings: [
        listing('Phantom', 500),
      ] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes, 'Phantom', baseFilter);
    expect(out[0].bestSingleWorld).toBe('Phantom');
    expect(out[0].singleStopCost).toBe(700);
    expect(out[0].singleStopSavings).toBe(0);
    expect(out[0].perIngredientSavings).toBe(80);  // Lich for 99: 700 - (60*2 + 500)
  });
});

describe('narrowForMaterialFlip', () => {
  it('keeps items that pass velocity + listings + sale-tier trust', () => {
    const sale: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 2, listingCount: 1,
      }),
    };
    expect(narrowForMaterialFlip(snapshot, sale, baseFilter)).toEqual([1]);
  });

  it('drops items below minVelocity / over maxListings / no trusted tier', () => {
    const sale: MarketData = {
      1: mkSale({  // no trusted tier
        velocity: 5, listingCount: 1,
      }),
    };
    expect(narrowForMaterialFlip(snapshot, sale, baseFilter)).toEqual([]);
  });
});

describe('runMaterialFlip — sort + slice', () => {
  const twoItems: SnapshotItem[] = [
    { id: 1, name: 'A', sc: 56, ui: 0, ilvl: 90, canHq: true },
    { id: 2, name: 'B', sc: 56, ui: 0, ilvl: 90, canHq: true },
  ];
  const recipeA: Recipe = { itemResultId: 1, classJob: 'LTW', recipeLevel: 90, ingredients: [{ itemId: 99, amount: 1 }] };
  const recipeB: Recipe = { itemResultId: 2, classJob: 'LTW', recipeLevel: 90, ingredients: [{ itemId: 99, amount: 1 }] };
  const rm = new Map<number, Recipe | null>([[1, recipeA], [2, recipeB]]);

  function fixtures(): { sale: MarketData; ing: MarketData } {
    return {
      sale: {
        1: mkSale({ minHQ: 1000, medianHQ: 1000, recentSalesHQ: 8, velocity: 5, listingCount: 1 }),
        2: mkSale({ minHQ: 1000, medianHQ: 1000, recentSalesHQ: 8, velocity: 1, listingCount: 1 }),
      },
      ing: {
        99: mkSale({ worldListings: [listing('Phantom', 100), listing('Lich', 50)] }),
      },
    };
  }

  it('default sort = gilSavedPerDay desc', () => {
    const { sale, ing } = fixtures();
    // Both rows: savings = 50; A velocity 5 → 250/day; B velocity 1 → 50/day
    const out = runMaterialFlip(twoItems, sale, ing, rm, 'Phantom', baseFilter);
    expect(out.map((r) => r.id)).toEqual([1, 2]);
  });

  it('respects limit', () => {
    const { sale, ing } = fixtures();
    const out = runMaterialFlip(twoItems, sale, ing, rm, 'Phantom', { ...baseFilter, limit: 1 });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('sort=pctDiscount sorts by pct desc', () => {
    const { sale, ing } = fixtures();
    // Both items have identical pctDiscount (50/100); tie-break by id asc.
    const out = runMaterialFlip(twoItems, sale, ing, rm, 'Phantom',
      { ...baseFilter, sort: 'pctDiscount' });
    expect(out.map((r) => r.id)).toEqual([1, 2]);
  });
});
