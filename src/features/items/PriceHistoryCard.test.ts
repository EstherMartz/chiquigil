import { describe, it, expect } from 'vitest';
import { priceHistoryStats } from './PriceHistoryCard';
import type { HistoryEntry } from '../../lib/universalisHistory';

describe('priceHistoryStats', () => {
  const NOW_MS = 1000 * 24 * 60 * 60 * 1000; // 1000 days from epoch for easier math

  it('returns empty points when no entries', () => {
    const stats = priceHistoryStats([], 100, 30, NOW_MS);
    expect(stats.points).toEqual([]);
    expect(stats.salesInRange).toBe(0);
  });

  it('filters entries by rangeDays correctly', () => {
    const oneMonthAgo = NOW_MS - 30 * 24 * 60 * 60 * 1000;
    const twoMonthsAgo = NOW_MS - 60 * 24 * 60 * 60 * 1000;
    const threeMonthsAgo = NOW_MS - 90 * 24 * 60 * 60 * 1000;

    const entries: HistoryEntry[] = [
      { timestamp: Math.floor(twoMonthsAgo / 1000), pricePerUnit: 100, quantity: 1, hq: false },
      { timestamp: Math.floor(oneMonthAgo / 1000), pricePerUnit: 110, quantity: 1, hq: false },
      { timestamp: Math.floor(threeMonthsAgo / 1000), pricePerUnit: 90, quantity: 1, hq: false },
    ];

    // 30-day window
    const stats30 = priceHistoryStats(entries, 120, 30, NOW_MS);
    expect(stats30.salesInRange).toBe(1); // only oneMonthAgo entry is within 30 days

    // 90-day window
    const stats90 = priceHistoryStats(entries, 120, 90, NOW_MS);
    expect(stats90.salesInRange).toBe(3); // all entries within 90 days

    // ALL (null range)
    const statsAll = priceHistoryStats(entries, 120, null, NOW_MS);
    expect(statsAll.salesInRange).toBe(3); // all entries
  });

  it('calculates deltaPct as (current - oldest) / oldest * 100', () => {
    const twoMonthsAgo = NOW_MS - 60 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = NOW_MS - 30 * 24 * 60 * 60 * 1000;

    const entries: HistoryEntry[] = [
      { timestamp: Math.floor(twoMonthsAgo / 1000), pricePerUnit: 100, quantity: 1, hq: false },
      { timestamp: Math.floor(oneMonthAgo / 1000), pricePerUnit: 120, quantity: 1, hq: false },
    ];

    const stats = priceHistoryStats(entries, 120, 90, NOW_MS);
    // (120 - 100) / 100 * 100 = 20%
    expect(stats.deltaPct).toBe(20);
  });

  it('computes deltaPct as negative when price went down', () => {
    const twoMonthsAgo = NOW_MS - 60 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = NOW_MS - 30 * 24 * 60 * 60 * 1000;

    const entries: HistoryEntry[] = [
      { timestamp: Math.floor(twoMonthsAgo / 1000), pricePerUnit: 100, quantity: 1, hq: false },
      { timestamp: Math.floor(oneMonthAgo / 1000), pricePerUnit: 80, quantity: 1, hq: false },
    ];

    const stats = priceHistoryStats(entries, 80, 90, NOW_MS);
    // (80 - 100) / 100 * 100 = -20%
    expect(stats.deltaPct).toBe(-20);
  });

  it('returns null deltaPct when current price is null', () => {
    const oneMonthAgo = NOW_MS - 30 * 24 * 60 * 60 * 1000;
    const entries: HistoryEntry[] = [
      { timestamp: Math.floor(oneMonthAgo / 1000), pricePerUnit: 100, quantity: 1, hq: false },
    ];

    const stats = priceHistoryStats(entries, null, 30, NOW_MS);
    expect(stats.deltaPct).toBeNull();
  });

  it('calculates oldestAgeDays correctly', () => {
    const thirtyDaysAgo = NOW_MS - 30 * 24 * 60 * 60 * 1000;
    const fifteenDaysAgo = NOW_MS - 15 * 24 * 60 * 60 * 1000;

    const entries: HistoryEntry[] = [
      { timestamp: Math.floor(thirtyDaysAgo / 1000), pricePerUnit: 100, quantity: 1, hq: false },
      { timestamp: Math.floor(fifteenDaysAgo / 1000), pricePerUnit: 110, quantity: 1, hq: false },
    ];

    const stats = priceHistoryStats(entries, 120, 30, NOW_MS);
    expect(stats.oldestAgeDays).toBe(30);
  });

  it('counts salesIn30d independently of range filter', () => {
    const twoMonthsAgo = NOW_MS - 60 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = NOW_MS - 30 * 24 * 60 * 60 * 1000;

    const entries: HistoryEntry[] = [
      { timestamp: Math.floor(twoMonthsAgo / 1000), pricePerUnit: 100, quantity: 1, hq: false },
      { timestamp: Math.floor(oneMonthAgo / 1000), pricePerUnit: 110, quantity: 1, hq: false },
    ];

    // 90-day range: sees both entries
    const stats90 = priceHistoryStats(entries, 120, 90, NOW_MS);
    expect(stats90.salesIn30d).toBe(1); // only oneMonthAgo within 30d

    // 7-day range: sees none of them
    const stats7 = priceHistoryStats(entries, 120, 7, NOW_MS);
    expect(stats7.salesInRange).toBe(0);
    expect(stats7.salesIn30d).toBe(1); // but 30d window still sees oneMonthAgo
  });

  it('separates NQ and HQ prices in chart points', () => {
    const now = NOW_MS;
    const entries: HistoryEntry[] = [
      { timestamp: Math.floor((now - 1000) / 1000), pricePerUnit: 100, quantity: 1, hq: false },
      { timestamp: Math.floor((now - 500) / 1000), pricePerUnit: 120, quantity: 1, hq: true },
    ];

    const stats = priceHistoryStats(entries, 120, 30, now);
    expect(stats.points).toHaveLength(2);
    expect(stats.points[0].nq).toBe(100);
    expect(stats.points[0].hq).toBeNull();
    expect(stats.points[1].nq).toBeNull();
    expect(stats.points[1].hq).toBe(120);
  });

  it('buckets sales by day with quantity-weighted price and total volume', () => {
    const day1 = NOW_MS - 2 * 24 * 60 * 60 * 1000;
    const day2 = NOW_MS - 1 * 24 * 60 * 60 * 1000;
    const entries: HistoryEntry[] = [
      // Day 1: NQ 100 x2 and NQ 200 x8 → weighted mean (100*2+200*8)/10 = 180, vol 10
      { timestamp: Math.floor(day1 / 1000), pricePerUnit: 100, quantity: 2, hq: false },
      { timestamp: Math.floor((day1 + 5000) / 1000), pricePerUnit: 200, quantity: 8, hq: false },
      // Day 2: HQ 500 x1, vol 1
      { timestamp: Math.floor(day2 / 1000), pricePerUnit: 500, quantity: 1, hq: true },
    ];
    const stats = priceHistoryStats(entries, 500, 30, NOW_MS);
    expect(stats.daily).toHaveLength(2);
    expect(stats.daily[0]).toMatchObject({ priceNQ: 180, priceHQ: null, volume: 10 });
    expect(stats.daily[1]).toMatchObject({ priceNQ: null, priceHQ: 500, volume: 1 });
    expect(stats.maxVolume).toBe(10);
  });

  it('returns empty daily + zero maxVolume when no sales in range', () => {
    const stats = priceHistoryStats([], 100, 30, NOW_MS);
    expect(stats.daily).toEqual([]);
    expect(stats.maxVolume).toBe(0);
  });

  it('returns null deltaPct when oldest price is 0', () => {
    const oneMonthAgo = NOW_MS - 30 * 24 * 60 * 60 * 1000;
    const entries: HistoryEntry[] = [
      { timestamp: Math.floor(oneMonthAgo / 1000), pricePerUnit: 0, quantity: 1, hq: false },
    ];

    const stats = priceHistoryStats(entries, 100, 30, NOW_MS);
    expect(stats.deltaPct).toBeNull();
  });

  it('handles empty points array when no sales in range', () => {
    const twoMonthsAgo = NOW_MS - 60 * 24 * 60 * 60 * 1000;
    const entries: HistoryEntry[] = [
      { timestamp: Math.floor(twoMonthsAgo / 1000), pricePerUnit: 100, quantity: 1, hq: false },
    ];

    const stats = priceHistoryStats(entries, 120, 7, NOW_MS);
    expect(stats.points).toEqual([]);
    expect(stats.salesInRange).toBe(0);
  });
});
