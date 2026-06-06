import { describe, it, expect } from 'vitest';
import { recipeMaterialCostHome, findBestSingleStopFor, selfSourceCost } from './materialCost';
import type { Recipe } from '../../lib/recipes';
import type { MarketItem, MarketData } from '../../lib/universalis';

const mkMarket = (partial: Partial<MarketItem>): MarketItem => ({
  minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
  recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
  worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null,
  ...partial,
});

const recipe = (ingredients: { itemId: number; amount: number }[]): Recipe =>
  ({ itemResultId: 99, classJob: 'CRP', recipeLevel: 1, ingredients, amountResult: 1 });

describe('recipeMaterialCostHome', () => {
  it('sums cheapest listing × amount over ingredients', () => {
    const market: Record<string, MarketItem | undefined> = {
      '1': mkMarket({ minNQ: 100 }),
      '2': mkMarket({ minNQ: null, minHQ: 50 }),
    };
    expect(recipeMaterialCostHome(recipe([{ itemId: 1, amount: 2 }, { itemId: 2, amount: 3 }]), market)).toBe(350);
  });

  it('returns 0 when market is undefined', () => {
    expect(recipeMaterialCostHome(recipe([{ itemId: 1, amount: 1 }]), undefined)).toBe(0);
  });
});

describe('findBestSingleStopFor', () => {
  it('picks the single world that stocks every ingredient cheapest', () => {
    const region: Record<string, MarketItem | undefined> = {
      '1': mkMarket({ worldListings: [
        { world: 'Cerberus', price: 80, hq: false, quantity: 1 },
        { world: 'Moogle', price: 120, hq: false, quantity: 1 },
      ] }),
      '2': mkMarket({ worldListings: [
        { world: 'Cerberus', price: 40, hq: false, quantity: 1 },
        { world: 'Moogle', price: 30, hq: false, quantity: 1 },
      ] }),
    };
    const r = findBestSingleStopFor([{ itemId: 1, amount: 1 }, { itemId: 2, amount: 1 }], region, 'Phantom', 999);
    expect(r).toEqual({ world: 'Cerberus', cost: 120 });
  });
});

describe('selfSourceCost', () => {
  it('gatherable ingredients cost 0', () => {
    const market: MarketData = { '1': mkMarket({ minNQ: 500 }) };
    expect(selfSourceCost(recipe([{ itemId: 1, amount: 3 }]), new Map(), market, new Set([1]))).toBe(0);
  });

  it('non-gatherable falls back to market buy price', () => {
    const market: MarketData = { '1': mkMarket({ minNQ: 500 }) };
    expect(selfSourceCost(recipe([{ itemId: 1, amount: 2 }]), new Map(), market, new Set())).toBe(1000);
  });
});
