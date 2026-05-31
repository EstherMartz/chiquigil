import { describe, it, expect } from 'vitest';
import { filterAndSort } from './filterSort';
import type { WatchlistRow } from './buildRows';

const base: WatchlistRow = {
  id: 0, name: '', crafter: 'LTW', lvl: 100, cat: 'Raid',
  pMinNQ: null, pMinHQ: null, pAvgNQ: null, pAvgHQ: null, pSpd: 0, pListings: 0,
  dcMinNQ: null, dcMinHQ: null, dcSpd: 0,
  refPrice: 0, rawScore: 0, score: 0, staleDays: null, craftStatus: 'ok',
  craftable: null, materialCost: null, salePrice: null, profit: null, gilPerDay: null,
  clearDays: null, delta: null,
};

const rows: WatchlistRow[] = [
  { ...base, id: 1, name: 'Alpha',  cat: 'Raid',     dcSpd: 4, score: 80, rawScore: 80 },
  { ...base, id: 2, name: 'Beta',   cat: 'Tincture', crafter: 'ALC', dcSpd: 2, score: 50, rawScore: 50 },
  { ...base, id: 3, name: 'Gamma',  cat: 'Tincture', crafter: 'ALC', dcSpd: 5, score: 90, rawScore: 90 },
];

describe('filterAndSort', () => {
  it('filters by category', () => {
    const out = filterAndSort(rows, { catFilter: 'Tincture', search: '', sortKey: 'name', sortDir: 'asc' });
    expect(out.map((r) => r.id)).toEqual([2, 3]);
  });
  it('filters by search (case-insensitive substring)', () => {
    const out = filterAndSort(rows, { catFilter: 'All', search: 'BET', sortKey: 'name', sortDir: 'asc' });
    expect(out.map((r) => r.id)).toEqual([2]);
  });
  it('sorts by score desc by default', () => {
    const out = filterAndSort(rows, { catFilter: 'All', search: '', sortKey: 'score', sortDir: 'desc' });
    expect(out.map((r) => r.id)).toEqual([3, 1, 2]);
  });
  it('sorts by name asc', () => {
    const out = filterAndSort(rows, { catFilter: 'All', search: '', sortKey: 'name', sortDir: 'asc' });
    expect(out.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('sorts by gilDay desc with null gilPerDay last', () => {
    const rowsWithProfit = [
      { ...base, id: 1, gilPerDay: 100 },
      { ...base, id: 2, gilPerDay: null },
      { ...base, id: 3, gilPerDay: 500 },
    ];
    const out = filterAndSort(rowsWithProfit, { catFilter: 'All', search: '', sortKey: 'gilDay', sortDir: 'desc' });
    expect(out.map((r) => r.id)).toEqual([3, 1, 2]);
  });
});
