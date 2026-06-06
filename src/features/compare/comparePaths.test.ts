import { describe, it, expect } from 'vitest';
import { buildStackProfile, makeMarketCard, makeVendorCard, craftEffort } from './comparePaths';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing, MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';

const sale = (quantity: number, pricePerUnit: number, timestamp: number, hq = false): HistoryEntry =>
  ({ quantity, pricePerUnit, timestamp, hq });
const ls = (quantity: number, price: number, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller: '' });

const mkMarket = (partial: Partial<MarketItem>): MarketItem => ({
  minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
  recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
  worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null,
  ...partial,
});

const recipe = (ingredients: { itemId: number; amount: number }[]): Recipe =>
  ({ itemResultId: 99, classJob: 'CRP', recipeLevel: 1, ingredients, amountResult: 1 });

describe('buildStackProfile', () => {
  it('returns null when there is no demand data', () => {
    expect(buildStackProfile([], [], false, 5)).toBeNull();
  });

  it('picks the dominant stack by units sold and flags a supply gap', () => {
    const history = [
      sale(1, 100, 10), sale(1, 100, 20),
      sale(5, 90, 30), sale(5, 90, 40), sale(5, 90, 50),
    ];
    const listings = [ls(1, 100), ls(1, 110)];
    const profile = buildStackProfile(history, listings, false, 10);
    expect(profile).not.toBeNull();
    expect(profile!.dominantStack).toBe(5);
    expect(profile!.volumeAtBest).toBe(15);
    expect(profile!.listedAtBest).toBe(0);
    expect(profile!.supplyGap).toBe(true);
    expect(profile!.listingEventsPerDay).toBeCloseTo(2);
  });

  it('no supply gap when the dominant stack has current listings', () => {
    const history = [sale(5, 90, 30), sale(5, 90, 40)];
    const listings = [ls(5, 95)];
    const profile = buildStackProfile(history, listings, false, 5);
    expect(profile!.dominantStack).toBe(5);
    expect(profile!.listedAtBest).toBe(1);
    expect(profile!.supplyGap).toBe(false);
  });
});

describe('makeMarketCard', () => {
  it('computes taxed profit, throughput, and gil/day for a sell-raw path', () => {
    const market = mkMarket({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 5, velocity: 4, listingCount: 0 });
    const card = makeMarketCard({
      id: 'sell-raw', kind: 'sell-raw', itemId: 1, itemName: 'Thing',
      market, history: [], hq: false, matCost: 0, effort: 'none', now: 1_000,
    });
    expect(card.salePrice).toBe(1000);
    expect(card.profitPerUnit).toBe(950);
    expect(card.unitsMovedPerDay).toBeCloseTo(4);
    expect(card.gilPerDay).toBeCloseTo(3800);
    expect(card.timeToSellHours).toBeCloseTo(6);
  });

  it('subtracts material cost for a craft path', () => {
    const market = mkMarket({ minNQ: 2000, avgNQ: 2000, recentSalesNQ: 3, velocity: 2, listingCount: 1 });
    const card = makeMarketCard({
      id: 'craft-50', kind: 'craft-output', itemId: 50, itemName: 'Output',
      market, history: [], hq: false, matCost: 500, effort: 'craft', now: 1_000,
    });
    expect(card.profitPerUnit).toBe(1400);
    expect(card.gilPerDay).toBeCloseTo(1400);
  });
});

describe('makeVendorCard', () => {
  it('is an instant zero-throughput path priced at the NPC buyback', () => {
    const card = makeVendorCard(1, 'Thing', 17);
    expect(card.kind).toBe('vendor');
    expect(card.salePrice).toBe(17);
    expect(card.profitPerUnit).toBe(17);
    expect(card.gilPerDay).toBe(0);
    expect(card.timeToSellHours).toBe(0);
    expect(card.stack).toBeNull();
    expect(card.effort).toBe('none');
  });
});

describe('craftEffort', () => {
  it('is "craft" when every ingredient has an MB price', () => {
    const market = { '1': mkMarket({ minNQ: 10 }), '2': mkMarket({ minHQ: 20 }) };
    expect(craftEffort(recipe([{ itemId: 1, amount: 1 }, { itemId: 2, amount: 1 }]), market)).toBe('craft');
  });

  it('is "gather-craft" when an ingredient has no MB price', () => {
    const market = { '1': mkMarket({ minNQ: 10 }), '2': mkMarket({}) };
    expect(craftEffort(recipe([{ itemId: 1, amount: 1 }, { itemId: 2, amount: 1 }]), market)).toBe('gather-craft');
  });
});
