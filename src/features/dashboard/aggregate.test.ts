import { describe, it, expect } from 'vitest';
import {
  portfolioTotals, marginBuckets, gilPerDayLeaders, concentration,
  moversDigest, spreadByWorld, rowMargin, valuePlays,
} from './aggregate';
import type { WatchlistRow } from '../watchlist/buildRows';
import type { WorldListing } from '../../lib/universalis';
import { summarizeHistory, MIN_SALES } from '../fairvalue/fairValue';
import type { HistoryEntry } from '../../lib/universalisHistory';

function mkRow(over: Partial<WatchlistRow>): WatchlistRow {
  return {
    id: 1, name: 'Item', crafter: 'LTW', lvl: 100, cat: 'Raid',
    pMinNQ: null, pMinHQ: null, pAvgNQ: null, pAvgHQ: null, pSpd: 0, pListings: 0,
    dcMinNQ: null, dcMinHQ: null, dcSpd: 0, refPrice: 0, rawScore: 0, score: 0,
    staleDays: 0, craftStatus: 'ok', craftable: true,
    materialCost: 200, salePrice: 1000, profit: 750, gilPerDay: 3000,
    clearDays: null, delta: null,
    ...over,
  } as WatchlistRow;
}

describe('rowMargin', () => {
  it('is net profit over sale price for craftables', () => {
    expect(rowMargin(mkRow({ profit: 250, salePrice: 1000 }))).toBe(0.25);
  });
  it('is null for sale-only or unpriced rows', () => {
    expect(rowMargin(mkRow({ craftable: false, profit: null }))).toBeNull();
    expect(rowMargin(mkRow({ salePrice: 0 }))).toBeNull();
  });
});

describe('portfolioTotals', () => {
  it('sums gil/day and profit, counts kinds, medians margin, counts alerts', () => {
    const rows = [
      mkRow({ id: 1, profit: 750, salePrice: 1000, gilPerDay: 3000 }),          // margin 0.75
      mkRow({ id: 2, profit: 100, salePrice: 1000, gilPerDay: 500 }),           // margin 0.10
      mkRow({ id: 3, craftable: false, profit: null, gilPerDay: 2000 }),        // sale-only
      mkRow({ id: 4, delta: -30, gilPerDay: 100 }),                             // crashed alert
    ];
    const t = portfolioTotals(rows);
    expect(t.totalGilPerDay).toBe(5600);
    expect(t.totalProfitPerUnit).toBe(750 + 100 + 750); // rows 1,2,4 are craftable
    expect(t.craftableCount).toBe(3);
    expect(t.saleOnlyCount).toBe(1);
    expect(t.trackedCount).toBe(4);
    expect(t.alertCount).toBe(1);
    // craftable margins: 0.75, 0.10, 0.75 → median 0.75
    expect(t.medianMargin).toBe(0.75);
  });
});

describe('marginBuckets', () => {
  it('bins net margins and ignores non-craftables', () => {
    const rows = [
      mkRow({ id: 1, profit: -50, salePrice: 1000 }),   // -5%  → <0
      mkRow({ id: 2, profit: 50, salePrice: 1000 }),    // 5%   → 0–10
      mkRow({ id: 3, profit: 200, salePrice: 1000 }),   // 20%  → 10–25
      mkRow({ id: 4, profit: 500, salePrice: 1000 }),   // 50%  → 40–75
      mkRow({ id: 5, profit: 1000, salePrice: 1000 }),  // 100% → 75–150
      mkRow({ id: 6, profit: 2000, salePrice: 1000 }),  // 200% → 150+
      mkRow({ id: 7, craftable: false, profit: null }),
    ];
    const b = marginBuckets(rows);
    // <0, 0–10, 10–25, 25–40, 40–75, 75–150, 150+
    expect(b.map((x) => x.count)).toEqual([1, 1, 1, 0, 1, 1, 1]);
  });
});

describe('gilPerDayLeaders', () => {
  it('returns top-N by gil/day, positive only', () => {
    const rows = [
      mkRow({ id: 1, gilPerDay: 100 }),
      mkRow({ id: 2, gilPerDay: 5000 }),
      mkRow({ id: 3, gilPerDay: null }),
      mkRow({ id: 4, gilPerDay: 0 }),
    ];
    const top = gilPerDayLeaders(rows, 2);
    expect(top.map((r) => r.id)).toEqual([2, 1]);
  });
});

describe('concentration', () => {
  it('computes top-N share of total gil/day', () => {
    const rows = [
      mkRow({ id: 1, gilPerDay: 6000 }),
      mkRow({ id: 2, gilPerDay: 3000 }),
      mkRow({ id: 3, gilPerDay: 1000 }),
    ];
    const c = concentration(rows, 1);
    expect(c.total).toBe(10000);
    expect(c.topShare).toBe(0.6);
    expect(c.topN).toBe(1);
  });
});

describe('moversDigest', () => {
  it('splits spikes, crashes and stale by magnitude', () => {
    const rows = [
      mkRow({ id: 1, delta: 35 }),
      mkRow({ id: 2, delta: 22 }),
      mkRow({ id: 3, delta: -40 }),
      mkRow({ id: 4, delta: null, staleDays: 12 }),
      mkRow({ id: 5, delta: 5 }),  // no alert
    ];
    const d = moversDigest(rows);
    expect(d.gainers.map((r) => r.id)).toEqual([1, 2]);
    expect(d.losers.map((r) => r.id)).toEqual([3]);
    expect(d.stale.map((r) => r.id)).toEqual([4]);
  });
});

describe('valuePlays', () => {
  // A liquid history centered on 1000 with small spread.
  const hist = (mean: number): HistoryEntry[] =>
    Array.from({ length: MIN_SALES + 2 }, (_, i) => ({
      timestamp: 0, quantity: 1, hq: false,
      pricePerUnit: mean + (i % 2 === 0 ? 50 : -50),
    }));

  it('lists items trading under fair value, cheapest-z first, skips thin items', () => {
    const rows = [
      mkRow({ id: 1, dcMinNQ: 700, materialCost: 400 }),  // way under 1000 → cheap
      mkRow({ id: 2, dcMinNQ: 990, materialCost: 400 }),  // ~fair
      mkRow({ id: 3, dcMinNQ: 600, materialCost: 400 }),  // thin history → excluded
    ];
    const summaries = new Map([
      [1, summarizeHistory(hist(1000))],
      [2, summarizeHistory(hist(1000))],
      [3, summarizeHistory([{ timestamp: 0, pricePerUnit: 1000, quantity: 1, hq: false }])], // 1 sale
    ]);
    const out = valuePlays(rows, summaries, 5);
    expect(out.map((p) => p.row.id)).toEqual([1]);
    expect(out[0].current).toBe(700);
    expect(out[0].signal.valuation).toBe('cheap');
  });

  it('returns nothing without summaries', () => {
    expect(valuePlays([mkRow({ id: 1, dcMinNQ: 700 })], new Map(), 5)).toEqual([]);
  });
});

describe('spreadByWorld', () => {
  it('finds the cheapest off-world source below the home floor', () => {
    const rows = [mkRow({ id: 1, name: 'Widget', dcSpd: 4 })];
    const listings: WorldListing[] = [
      { world: 'Phantom', price: 1000, hq: false },
      { world: 'Phantom', price: 1100, hq: false },
      { world: 'Moogle', price: 700, hq: false },
      { world: 'Omega', price: 800, hq: false },
    ];
    const out = spreadByWorld(rows, new Map([[1, listings]]), 'Phantom', 5);
    expect(out).toHaveLength(1);
    expect(out[0].homeFloor).toBe(1000);
    expect(out[0].bestWorld).toBe('Moogle');
    expect(out[0].bestPrice).toBe(700);
    expect(out[0].spread).toBe(300);
    expect(out[0].spreadPct).toBeCloseTo(0.3);
  });

  it('skips items with no home listing or no cheaper world', () => {
    const rows = [mkRow({ id: 1 }), mkRow({ id: 2 })];
    const noHome = new Map([[1, [{ world: 'Moogle', price: 700, hq: false }]]]);
    expect(spreadByWorld(rows, noHome, 'Phantom', 5)).toHaveLength(0);
    const homeCheapest = new Map([[2, [
      { world: 'Phantom', price: 500, hq: false },
      { world: 'Moogle', price: 700, hq: false },
    ]]]);
    expect(spreadByWorld(rows, homeCheapest, 'Phantom', 5)).toHaveLength(0);
  });
});
