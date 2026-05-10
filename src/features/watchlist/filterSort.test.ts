import { describe, it, expect } from 'vitest';
import { filterAndSort } from './filterSort';
import type { WatchlistRow } from './buildRows';

const base: WatchlistRow = {
  id: 0, name: '', crafter: 'LTW', lvl: 100, cat: 'Raid',
  pMinNQ: null, pMinHQ: null, pAvgNQ: null, pAvgHQ: null, pSpd: 0, pListings: 0,
  dcMinNQ: null, dcMinHQ: null, dcSpd: 0,
  refPrice: 0, rawScore: 0, score: 0, staleDays: null, craftStatus: 'ok',
};

const rows: WatchlistRow[] = [
  { ...base, id: 1, name: 'Alpha',  cat: 'Raid',     dcSpd: 4, score: 80, rawScore: 80 },
  { ...base, id: 2, name: 'Beta',   cat: 'Tincture', crafter: 'ALC', dcSpd: 2, score: 50, rawScore: 50 },
  { ...base, id: 3, name: 'Gamma',  cat: 'Tincture', crafter: 'ALC', dcSpd: 5, score: 90, rawScore: 90 },
];

describe('filterAndSort', () => {
  it('filters by category', () => {
    const out = filterAndSort(rows, { catFilter: 'Tincture', craftFilter: 'All', search: '', sortKey: 'name', sortDir: 'asc' });
    expect(out.map((r) => r.id)).toEqual([2, 3]);
  });
  it('filters by crafter', () => {
    const out = filterAndSort(rows, { catFilter: 'All', craftFilter: 'LTW', search: '', sortKey: 'name', sortDir: 'asc' });
    expect(out.map((r) => r.id)).toEqual([1]);
  });
  it('filters by search (case-insensitive substring)', () => {
    const out = filterAndSort(rows, { catFilter: 'All', craftFilter: 'All', search: 'BET', sortKey: 'name', sortDir: 'asc' });
    expect(out.map((r) => r.id)).toEqual([2]);
  });
  it('sorts by score desc by default', () => {
    const out = filterAndSort(rows, { catFilter: 'All', craftFilter: 'All', search: '', sortKey: 'score', sortDir: 'desc' });
    expect(out.map((r) => r.id)).toEqual([3, 1, 2]);
  });
  it('sorts by name asc', () => {
    const out = filterAndSort(rows, { catFilter: 'All', craftFilter: 'All', search: '', sortKey: 'name', sortDir: 'asc' });
    expect(out.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});
