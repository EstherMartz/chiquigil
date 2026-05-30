import { describe, it, expect } from 'vitest';
import { buildHousingRow, housingMaterialCost, sortHousingRows, type HousingRow } from './spikeSignal';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketItem, MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { HistoryEntry } from '../../lib/universalisHistory';

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

function mkt(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: NOW - 1_000,
    listingCount: 0, worldListings: [], ...over,
  } as MarketItem;
}
function item(id: number, canHq = true): SnapshotItem {
  return { id, name: `i${id}`, sc: 56, ui: 0, ilvl: 1, canHq } as SnapshotItem;
}
const recipe = { itemResultId: 1, classJob: 'CRP', recipeLevel: 1, ingredients: [{ itemId: 10, amount: 2 }] } as Recipe;

describe('housingMaterialCost', () => {
  it('sums lowest ingredient prices times amount', () => {
    const market: MarketData = { '10': mkt({ minNQ: 50 }) };
    expect(housingMaterialCost(recipe, market)).toBe(100);
  });
  it('treats missing ingredient market as zero', () => {
    expect(housingMaterialCost(recipe, {})).toBe(0);
  });
});

describe('buildHousingRow', () => {
  it('computes craft margin and gil/day when a recipe is present', () => {
    const r = buildHousingRow({
      item: item(1), market: mkt({ minHQ: 1000, avgHQ: 1000, recentSalesHQ: 10, velocity: 8, listingCount: 3 }),
      recipe, materialCost: 400, history: undefined, now: NOW,
    });
    expect(r.price).toBe(1000);
    expect(r.craftMargin).toBe(550);
    expect(r.craftGilPerDay).toBe(1100);
    expect(r.momentumPct).toBeNull();
  });
  it('leaves craft fields null with no recipe and computes momentum from history', () => {
    const history: HistoryEntry[] = [
      { pricePerUnit: 120, quantity: 1, timestamp: (NOW - 2 * DAY) / 1000, hq: false },
      { pricePerUnit: 100, quantity: 1, timestamp: (NOW - 9 * DAY) / 1000, hq: false },
    ];
    const r = buildHousingRow({
      item: item(2, false), market: mkt({ minNQ: 120, avgNQ: 120, recentSalesNQ: 5, velocity: 2 }),
      recipe: undefined, materialCost: 0, history, now: NOW,
    });
    expect(r.craftMargin).toBeNull();
    expect(r.craftGilPerDay).toBeNull();
    expect(r.momentumPct).toBeCloseTo(20, 5);
  });
});

describe('sortHousingRows', () => {
  const rows: HousingRow[] = [
    { id: 1, name: 'a', price: 1, velocity: 1, momentumPct: 5, craftMargin: null, craftGilPerDay: 100 },
    { id: 2, name: 'b', price: 1, velocity: 1, momentumPct: 50, craftMargin: null, craftGilPerDay: 10 },
    { id: 3, name: 'c', price: 1, velocity: 1, momentumPct: null, craftMargin: null, craftGilPerDay: null },
  ];
  it('sorts by a numeric key descending, nulls last', () => {
    expect(sortHousingRows(rows, 'momentumPct').map((r) => r.id)).toEqual([2, 1, 3]);
    expect(sortHousingRows(rows, 'craftGilPerDay').map((r) => r.id)).toEqual([1, 2, 3]);
  });
});
