import { describe, it, expect } from 'vitest';
import { computeRouteSummary } from './RouteSummary';
import type { Sector } from './submarineTypes';
import type { MarketData } from '../../lib/universalis';

const makeSector = (id: number, letter: string, loot: { itemId: number; name: string; tier: 'common' | 'uncommon' | 'rare' }[]): Sector => ({
  id,
  name: `Sector ${letter}`,
  letter,
  zone: 'Deep-sea Site',
  rankReq: 1,
  durationMin: 180,
  loot,
});

describe('computeRouteSummary', () => {
  it('computes totals and gil per hour', () => {
    const sectors: Sector[] = [
      makeSector(1, 'A', [
        { itemId: 100, name: 'Item A', tier: 'common' },
        { itemId: 200, name: 'Item B', tier: 'rare' },
      ]),
      makeSector(2, 'B', [
        { itemId: 300, name: 'Item C', tier: 'uncommon' },
      ]),
    ];

    const market: MarketData = {
      '100': { minNQ: 1000, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
      '200': { minNQ: 50000, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
      '300': { minNQ: 2000, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
    };

    const result = computeRouteSummary(sectors, market);

    // Sector A: common 1000×0.30 + rare 50000×0.05 = 300 + 2500 = 2800
    // Sector B: uncommon 2000×0.15 = 300
    expect(result.sectors[0].subtotal).toBe(2800);
    expect(result.sectors[1].subtotal).toBe(300);
    expect(result.totalGilPerVoyage).toBe(3100);
    expect(result.totalDurationMin).toBe(360); // 180 + 180
    expect(result.gilPerHour).toBeCloseTo(3100 / 6, 1); // 360 min = 6 hours
  });
});
