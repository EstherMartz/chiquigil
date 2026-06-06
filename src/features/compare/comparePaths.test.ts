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

import { daysToClear, pickWinner, quantityWarnings, buildSummaryLine } from './comparePaths';
import type { PathCard } from './comparePaths';

const card = (over: Partial<PathCard>): PathCard => ({
  id: 'x', kind: 'sell-raw', label: 'L', itemId: 1, itemName: 'N',
  salePrice: 0, matCost: 0, profitPerUnit: 0, velocity: 0,
  unitsMovedPerDay: 0, gilPerDay: 0, timeToSellHours: 0, stack: null,
  risk: '', effort: 'none', ...over,
});

describe('daysToClear', () => {
  it('is qty / throughput for a market path', () => {
    expect(daysToClear(card({ unitsMovedPerDay: 4 }), 20)).toBe(5);
  });
  it('is 0 (instant) for vendor', () => {
    expect(daysToClear(card({ kind: 'vendor' }), 20)).toBe(0);
  });
  it('is Infinity when a market path has no throughput', () => {
    expect(daysToClear(card({ kind: 'sell-raw', unitsMovedPerDay: 0 }), 20)).toBe(Infinity);
  });
});

describe('pickWinner', () => {
  it('picks the highest gil/day', () => {
    const a = card({ id: 'a', gilPerDay: 100 });
    const b = card({ id: 'b', gilPerDay: 300 });
    expect(pickWinner([a, b], 1)).toBe('b');
  });
  it('falls back to vendor when all market paths lose money', () => {
    const sell = card({ id: 'sell-raw', kind: 'sell-raw', gilPerDay: -50, unitsMovedPerDay: 0 });
    const vendor = card({ id: 'vendor', kind: 'vendor', gilPerDay: 0, profitPerUnit: 12 });
    expect(pickWinner([sell, vendor], 1)).toBe('vendor');
  });
  it('tiebreaks equal gil/day by fewer days to clear', () => {
    const slow = card({ id: 'slow', gilPerDay: 100, unitsMovedPerDay: 1 });
    const fast = card({ id: 'fast', gilPerDay: 100, unitsMovedPerDay: 10 });
    expect(pickWinner([slow, fast], 50)).toBe('fast');
  });
});

describe('quantityWarnings', () => {
  it('flags overcrowding when clearing takes > 14 days', () => {
    const c = card({ kind: 'sell-raw', unitsMovedPerDay: 1, velocity: 1 });
    const w = quantityWarnings(c, 30);
    expect(w.overcrowding).toContain('30');
  });
  it('flags flood when qty exceeds a week of velocity', () => {
    const c = card({ kind: 'craft-output', velocity: 2, unitsMovedPerDay: 2 });
    const w = quantityWarnings(c, 100);
    expect(w.flood).toBeTruthy();
  });
  it('no warnings at quantity 1', () => {
    expect(quantityWarnings(card({ unitsMovedPerDay: 0.01 }), 1)).toEqual({});
  });
});

describe('buildSummaryLine', () => {
  it('names the winning path', () => {
    const sell = card({ id: 'sell-raw', label: 'Sell raw (MB)', gilPerDay: 86_000, unitsMovedPerDay: 50 });
    const craft = card({ id: 'craft-50', label: 'Craft → Ingot', gilPerDay: 40_000, unitsMovedPerDay: 2 });
    const line = buildSummaryLine([sell, craft], 'sell-raw', 1);
    expect(line).toContain('Best play');
    expect(line).toContain('Sell raw (MB)');
  });
});
