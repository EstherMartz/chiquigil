import { describe, it, expect } from 'vitest';
import { runEmptyShelf } from './runEmptyShelf';
import { defaultEmptyShelfFilter, type EmptyShelfFilter } from './types';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketItem, MarketData } from '../../lib/universalis';

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

const item = (id: number, sc = 1, canHq = true): SnapshotItem =>
  ({ id, name: `Item ${id}`, sc, canHq } as SnapshotItem);

const mkt = (over: Partial<MarketItem>): MarketItem => ({
  minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
  recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
  worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null, ...over,
} as MarketItem);

const filt = (over: Partial<EmptyShelfFilter> = {}): EmptyShelfFilter => ({ ...defaultEmptyShelfFilter(), ...over });

describe('runEmptyShelf', () => {
  it('keeps sold-out, still-selling items and computes recency, price, gil/day', () => {
    const snap = [item(100)];
    const market: MarketData = { 100: mkt({ listingCount: 0, velocity: 1, medianNQ: 1000, recentSalesNQ: 5, lastSaleMs: NOW - 2 * DAY }) };
    const rows = runEmptyShelf(snap, market, filt(), NOW);
    expect(rows).toEqual([{
      id: 100, name: 'Item 100', sc: 1, hq: false,
      suggestedPrice: 1000, velocity: 1, lastSaleMs: NOW - 2 * DAY,
      daysSinceLastSale: 2, estGilPerDay: 1000,
    }]);
  });

  it('drops items that still have listings above maxListings', () => {
    const market: MarketData = { 200: mkt({ listingCount: 3, velocity: 1, medianNQ: 500, lastSaleMs: NOW }) };
    expect(runEmptyShelf([item(200)], market, filt(), NOW)).toEqual([]);
  });

  it('drops items below minVelocity', () => {
    const market: MarketData = { 300: mkt({ listingCount: 0, velocity: 0.05, medianNQ: 9000, lastSaleMs: NOW }) };
    expect(runEmptyShelf([item(300)], market, filt(), NOW)).toEqual([]);
  });

  it('drops items whose last sale is older than maxDaysSinceSale, keeps unknown-recency rows', () => {
    const snap = [item(1), item(2)];
    const market: MarketData = {
      1: mkt({ listingCount: 0, velocity: 1, medianNQ: 100, lastSaleMs: NOW - 60 * DAY }),
      2: mkt({ listingCount: 0, velocity: 1, medianNQ: 100, lastSaleMs: null }),
    };
    const rows = runEmptyShelf(snap, market, filt({ maxDaysSinceSale: 30 }), NOW);
    expect(rows.map((r) => r.id)).toEqual([2]);
    expect(rows[0].daysSinceLastSale).toBeNull();
  });

  it('either-mode picks the tier with more recent sales', () => {
    const market: MarketData = { 5: mkt({ listingCount: 0, velocity: 1, medianNQ: 1000, recentSalesNQ: 2, medianHQ: 5000, recentSalesHQ: 10, lastSaleMs: NOW }) };
    const rows = runEmptyShelf([item(5)], market, filt({ hq: 'either' }), NOW);
    expect(rows[0].hq).toBe(true);
    expect(rows[0].suggestedPrice).toBe(5000);
  });

  it('sorts by freshness with unknown recency last', () => {
    const snap = [item(1), item(2), item(3)];
    const market: MarketData = {
      1: mkt({ listingCount: 0, velocity: 1, medianNQ: 100, lastSaleMs: NOW - 9 * DAY }),
      2: mkt({ listingCount: 0, velocity: 1, medianNQ: 100, lastSaleMs: null }),
      3: mkt({ listingCount: 0, velocity: 1, medianNQ: 100, lastSaleMs: NOW - 1 * DAY }),
    };
    const rows = runEmptyShelf(snap, market, filt({ maxDaysSinceSale: null, sort: 'freshness' }), NOW);
    expect(rows.map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it('honors the limit', () => {
    const snap = [item(1), item(2), item(3)];
    const market: MarketData = Object.fromEntries(
      snap.map((s, i) => [s.id, mkt({ listingCount: 0, velocity: 1, medianNQ: 100 * (i + 1), lastSaleMs: NOW })]),
    );
    expect(runEmptyShelf(snap, market, filt({ sort: 'suggestedPrice', limit: 2 }), NOW)).toHaveLength(2);
  });
});
