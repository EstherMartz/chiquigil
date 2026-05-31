import { describe, it, expect } from 'vitest';
import { buildCandidates } from './buildCandidates';
import type { WatchlistRow } from '../watchlist/buildRows';

const baseRow: WatchlistRow = {
  id: 0, name: '', crafter: 'LTW', lvl: 100, cat: 'Raid',
  pMinNQ: null, pMinHQ: null, pAvgNQ: null, pAvgHQ: null, pSpd: 0, pListings: 0,
  dcMinNQ: null, dcMinHQ: null, dcSpd: 5,
  refPrice: 0, rawScore: 0, score: 0, staleDays: null, craftStatus: 'ok',
  craftable: true, materialCost: 100, salePrice: 1000, profit: 900, gilPerDay: 4500,
  clearDays: null, delta: null,
};

describe('buildCandidates', () => {
  it('drops sale-only and unresolved rows', () => {
    const rows: WatchlistRow[] = [
      { ...baseRow, id: 1 },
      { ...baseRow, id: 2, craftable: false },
      { ...baseRow, id: 3, craftable: null },
    ];
    const candidates = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {} });
    expect(candidates.map((c) => c.id)).toEqual([1]);
  });

  it('drops rows below the min profit threshold', () => {
    const rows: WatchlistRow[] = [
      { ...baseRow, id: 1, profit: 500 },
      { ...baseRow, id: 2, profit: 50_000 },
    ];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {}, minProfit: 1000 });
    expect(c.map((x) => x.id)).toEqual([2]);
  });

  it('locks to a single crafter when crafterLock is set', () => {
    const rows: WatchlistRow[] = [
      { ...baseRow, id: 1, crafter: 'LTW' },
      { ...baseRow, id: 2, crafter: 'WVR' },
    ];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {}, crafterLock: 'LTW' });
    expect(c.map((x) => x.id)).toEqual([1]);
  });

  it('drops rows whose craft status is not ok (locked items)', () => {
    const rows: WatchlistRow[] = [
      { ...baseRow, id: 1, craftStatus: 'ok' },
      { ...baseRow, id: 2, craftStatus: 'short' },
      { ...baseRow, id: 3, craftStatus: 'no' },
    ];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {} });
    expect(c.map((x) => x.id)).toEqual([1]);
  });

  it('uses defaultCraftSeconds when no per-item override', () => {
    const rows = [{ ...baseRow, id: 1, lvl: 100 }];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {} });
    expect(c[0].craftSeconds).toBe(110);
    expect(c[0].gilPerMinute).toBe(900 / (110 / 60));
  });

  it('uses per-item override when present', () => {
    const rows = [{ ...baseRow, id: 1, lvl: 100, profit: 900 }];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: { 1: { craftTimeSeconds: 30 } } });
    expect(c[0].craftSeconds).toBe(30);
    expect(c[0].gilPerMinute).toBe(900 / 0.5);
  });

  it('drops rows with zero or negative profit', () => {
    const rows: WatchlistRow[] = [
      { ...baseRow, id: 1, profit: 100 },
      { ...baseRow, id: 2, profit: 0 },
      { ...baseRow, id: 3, profit: -500 },
    ];
    const c = buildCandidates(rows, { baseSeconds: 60, perItemFlags: {} });
    expect(c.map((x) => x.id)).toEqual([1]);
  });
});
