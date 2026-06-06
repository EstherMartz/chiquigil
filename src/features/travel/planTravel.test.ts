import { describe, it, expect } from 'vitest';
import { planTravel } from './planTravel';
import type { MarketData, MarketItem, WorldListing } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { TravelOpts } from './types';

function mkMarket(p: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0,
    velocity: 0, lastUploadTime: 0, listingCount: 0, worldListings: [],
    averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null,
    ...p,
  };
}

/** A home-world item that passes pickHighestTrustedTier at `unit` gil NQ. */
function homeSell(unit: number, velocity: number): MarketItem {
  return mkMarket({ minNQ: unit, medianNQ: unit, recentSalesNQ: 10, velocity });
}

function listing(price: number, quantity: number, hq = false): WorldListing {
  return { world: 'Lich', price, hq, quantity };
}

const items: SnapshotItem[] = [
  { id: 1, name: 'Widget', sc: 5, ui: 0, ilvl: 100, canHq: true },
  { id: 2, name: 'Gadget', sc: 5, ui: 0, ilvl: 100, canHq: true },
];

const baseOpts: TravelOpts = {
  homeWorld: 'Phantom', budget: null, metric: 'profit',
  hq: 'nq', minVelocity: 0, horizonDays: 7, applyMarketTax: false,
};

describe('planTravel', () => {
  it('buys every profitable unit when budget is unlimited', () => {
    const home: MarketData = { 1: homeSell(1000, 5) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(600, 3)] }) };
    const plan = planTravel([items[0]], dest, home, baseOpts);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].units).toBe(3);
    expect(plan.rows[0].cost).toBe(1800);
    expect(plan.rows[0].profit).toBe(1200); // 3 × (1000 − 600)
    expect(plan.totalProfit).toBe(1200);
  });

  it('respects the budget cap', () => {
    const home: MarketData = { 1: homeSell(1000, 5) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(600, 3)] }) };
    const plan = planTravel([items[0]], dest, home, { ...baseOpts, budget: 1200 });
    expect(plan.rows[0].units).toBe(2); // 2 × 600 = 1200 fits, 3rd would overflow
    expect(plan.totalCost).toBe(1200);
    expect(plan.totalProfit).toBe(800);
  });

  it('applies the 5% market tax to home revenue when enabled', () => {
    const home: MarketData = { 1: homeSell(1000, 5) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(600, 2)] }) };
    const plan = planTravel([items[0]], dest, home, { ...baseOpts, applyMarketTax: true });
    expect(plan.rows[0].homeSell).toBe(950); // 1000 × 0.95
    expect(plan.rows[0].profit).toBe(700);   // 2 × (950 − 600)
  });

  it('drops items whose cheapest listing is not profitable', () => {
    const home: MarketData = { 1: homeSell(1000, 5) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(1100, 5)] }) };
    const plan = planTravel([items[0]], dest, home, baseOpts);
    expect(plan.rows).toHaveLength(0);
  });

  it('caps units at home absorption (velocity × horizon)', () => {
    const home: MarketData = { 1: homeSell(1000, 0.1) }; // ceil(0.1 × 7) = 1
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(600, 9)] }) };
    const plan = planTravel([items[0]], dest, home, baseOpts);
    expect(plan.rows[0].units).toBe(1);
  });

  it('skips items below the velocity floor', () => {
    const home: MarketData = { 1: homeSell(1000, 0.2) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(600, 3)] }) };
    const plan = planTravel([items[0]], dest, home, { ...baseOpts, minVelocity: 1 });
    expect(plan.rows).toHaveLength(0);
  });

  it('treats missing listing quantity as 1', () => {
    const home: MarketData = { 1: homeSell(1000, 5) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [{ world: 'Lich', price: 600, hq: false }] }) };
    const plan = planTravel([items[0]], dest, home, baseOpts);
    expect(plan.rows[0].units).toBe(1);
  });

  it('ROI ordering fills the higher-return item first under a tight budget', () => {
    const home: MarketData = { 1: homeSell(1000, 5), 2: homeSell(200, 5) };
    const dest: MarketData = {
      1: mkMarket({ worldListings: [listing(900, 1)] }),
      2: mkMarket({ worldListings: [listing(100, 1)] }),
    };
    const roiPlan = planTravel(items, dest, home, { ...baseOpts, metric: 'roi', budget: 100 });
    expect(roiPlan.rows).toHaveLength(1);
    expect(roiPlan.rows[0].id).toBe(2); // high-ROI item wins the limited budget
  });

  it('spread metric orders by gross (pre-tax) spread, not net', () => {
    // Item 1 gross spread 920 (2000−1080) but net spread 820 (1900−1080).
    // Item 2 gross spread 900 (1000−100)  but net spread 850 (950−100).
    // Gross ranks item 1 first; net would rank item 2 first. Tax is ON.
    const home: MarketData = { 1: homeSell(2000, 5), 2: homeSell(1000, 5) };
    const dest: MarketData = {
      1: mkMarket({ worldListings: [listing(1080, 1)] }),
      2: mkMarket({ worldListings: [listing(100, 1)] }),
    };
    const plan = planTravel(items, dest, home, { ...baseOpts, metric: 'spread', applyMarketTax: true });
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0].id).toBe(1); // higher gross spread leads
  });
});
