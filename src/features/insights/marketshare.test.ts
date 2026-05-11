import { describe, it, expect } from 'vitest';
import { rankMarketshare } from './marketshare';
import type { WatchlistRow } from '../watchlist/buildRows';

const base: WatchlistRow = {
  id: 0, name: '', crafter: 'LTW', lvl: 100, cat: 'Raid',
  pMinNQ: null, pMinHQ: null, pAvgNQ: null, pAvgHQ: null, pSpd: 0, pListings: 0,
  dcMinNQ: null, dcMinHQ: null, dcSpd: 0,
  refPrice: 0, rawScore: 0, score: 0, staleDays: null, craftStatus: 'ok',
  craftable: null, materialCost: null, salePrice: null, profit: null, gilPerDay: null,
};

describe('rankMarketshare', () => {
  it('ranks craftable items by gilPerDay desc', () => {
    const rows: WatchlistRow[] = [
      { ...base, id: 1, craftable: true, profit: 100, dcSpd: 1, gilPerDay: 100 },
      { ...base, id: 2, craftable: true, profit: 250, dcSpd: 2, gilPerDay: 500 },
      { ...base, id: 3, craftable: true, profit: 125, dcSpd: 2, gilPerDay: 250 },
    ];
    const out = rankMarketshare(rows);
    expect(out.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('uses dcMin × velocity for sale-only items', () => {
    const rows: WatchlistRow[] = [
      { ...base, id: 1, craftable: false, dcMinNQ: 50_000, dcSpd: 2 },
      { ...base, id: 2, craftable: true, profit: 40_000, dcSpd: 2, gilPerDay: 80_000 },
    ];
    const out = rankMarketshare(rows);
    expect(out.map((r) => r.id)).toEqual([1, 2]);
    expect(out[0].gilFlow).toBe(100_000);
  });

  it('drops items with zero velocity', () => {
    const rows: WatchlistRow[] = [
      { ...base, id: 1, craftable: false, dcMinNQ: 50_000, dcSpd: 0 },
      { ...base, id: 2, craftable: true, profit: 0, dcSpd: 1, gilPerDay: 0 },
      { ...base, id: 3, craftable: true, profit: 25, dcSpd: 2, gilPerDay: 50 },
    ];
    const out = rankMarketshare(rows);
    expect(out.map((r) => r.id)).toEqual([3]);
  });

  it('skips unresolved items', () => {
    const rows: WatchlistRow[] = [
      { ...base, id: 1, craftable: null, dcMinNQ: 50_000, dcSpd: 2 },
    ];
    expect(rankMarketshare(rows)).toEqual([]);
  });
});
