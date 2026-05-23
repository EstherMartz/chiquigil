import { describe, it, expect } from 'vitest';
import { suggestRoute } from './suggestRoute';
import type { Sector } from './submarineTypes';
import type { MarketData } from '../../lib/universalis';

const makeSector = (id: number, letter: string, zone: string, rankReq: number, loot: { itemId: number; name: string; tier: 'common' | 'uncommon' | 'rare' }[]): Sector => ({
  id,
  name: `Sector ${letter}`,
  letter,
  zone,
  rankReq,
  durationMin: 180,
  loot,
});

describe('suggestRoute', () => {
  const sectors: Sector[] = [
    makeSector(1, 'A', 'Deep-sea Site', 1, [{ itemId: 100, name: 'Item A', tier: 'common' }]),
    makeSector(2, 'B', 'Deep-sea Site', 1, [{ itemId: 200, name: 'Item B', tier: 'common' }]),
    makeSector(3, 'C', 'Deep-sea Site', 1, [{ itemId: 300, name: 'Item C', tier: 'rare' }]),
    makeSector(4, 'D', 'Sea of Ash', 1, [{ itemId: 400, name: 'Item D', tier: 'common' }]),
  ];

  const market: MarketData = {
    '100': { minNQ: 500, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
    '200': { minNQ: 1000, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
    '300': { minNQ: 50000, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
    '400': { minNQ: 200, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
  };

  it('picks top N sectors from specified zone by expected value', () => {
    const result = suggestRoute(sectors, market, { rank: 1, slots: 2, zone: 'Deep-sea Site' });
    expect(result.map((s) => s.letter)).toEqual(['C', 'B']);
  });

  it('respects rank filter', () => {
    const highRankSectors = [
      ...sectors,
      makeSector(5, 'E', 'Deep-sea Site', 50, [{ itemId: 500, name: 'Item E', tier: 'common' }]),
    ];
    const result = suggestRoute(highRankSectors, market, { rank: 1, slots: 5, zone: 'Deep-sea Site' });
    expect(result.find((s) => s.letter === 'E')).toBeUndefined();
  });

  it('picks best zone when zone is null', () => {
    const result = suggestRoute(sectors, market, { rank: 1, slots: 1, zone: null });
    // C has highest expected value (rare × 50000 = 2500), so Deep-sea Site wins
    expect(result[0].letter).toBe('C');
  });
});
