import { describe, it, expect } from 'vitest';
import { computeLevePlan } from './computeLevePlan';
import type { SnapshotLeve } from '../../lib/leveSnapshot';
import type { Recipe } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';

const dohLeve: SnapshotLeve = {
  id: 100, name: 'And Bring Plenty of Ale', level: 30, type: 'doh', classJob: 15,
  city: 'Limsa Lominsa', baseGil: 1000, baseExp: 5000, hqGilMultiplier: 2.0,
  targetItemId: 5001, targetItemQty: 3,
};
const dolLeve: SnapshotLeve = {
  id: 200, name: 'Mining for Memories', level: 20, type: 'dol', classJob: 16,
  city: "Ul'dah", baseGil: 800, baseExp: 3000, hqGilMultiplier: 1.0,
  targetItemId: 5002, targetItemQty: 5,
};
const dowLeve: SnapshotLeve = {
  id: 300, name: 'Slay Wamouras', level: 50, type: 'dow', classJob: 99,
  city: 'Limsa Lominsa', baseGil: 5000, baseExp: 12000, hqGilMultiplier: 1.0,
  targetItemId: null, targetItemQty: null,
};

const recipeForTarget: Recipe = {
  itemResultId: 5001, classJob: 'CUL', recipeLevel: 30,
  ingredients: [{ itemId: 6001, amount: 2 }, { itemId: 6002, amount: 1 }],
};

const recipes = new Map<number, Recipe>([[5001, recipeForTarget]]);

const prices: MarketData = {
  '6001': { minNQ: 50, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
  '6002': { minNQ: 100, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
};

describe('computeLevePlan', () => {
  it('computes net gil for a DoH leve (HQ multiplier × qty − mat cost)', () => {
    const result = computeLevePlan([dohLeve], recipes, prices, { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    expect(result.rows).toHaveLength(1);
    // grossGil = 1000 × 2.0 × 3 = 6000
    // matCost  = (50 × 2 + 100 × 1) × 3 = 200 × 3 = 600
    // netGil   = 6000 − 600 = 5400
    expect(result.rows[0].grossGil).toBe(6000);
    expect(result.rows[0].matCost).toBe(600);
    expect(result.rows[0].netGil).toBe(5400);
    expect(result.rows[0].hasMatCostData).toBe(true);
  });

  it('computes gross gil for a DoL leve (no mat cost)', () => {
    const result = computeLevePlan([dolLeve], recipes, prices, { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    // grossGil = 800 × 5 = 4000
    expect(result.rows[0].grossGil).toBe(4000);
    expect(result.rows[0].matCost).toBeNull();
    expect(result.rows[0].netGil).toBe(4000);
  });

  it('computes gross gil for a DoW leve (flat, no qty)', () => {
    const result = computeLevePlan([dowLeve], recipes, prices, { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    expect(result.rows[0].grossGil).toBe(5000);
    expect(result.rows[0].matCost).toBeNull();
    expect(result.rows[0].netGil).toBe(5000);
  });

  it('sorts by netGil descending in gil mode', () => {
    const result = computeLevePlan([dolLeve, dohLeve, dowLeve], recipes, prices,
      { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    // dohLeve.netGil=5400, dowLeve.netGil=5000, dolLeve.netGil=4000
    expect(result.rows.map((r) => r.id)).toEqual([100, 300, 200]);
  });

  it('sorts by exp descending in exp mode', () => {
    const result = computeLevePlan([dolLeve, dohLeve, dowLeve], recipes, prices,
      { mode: 'exp', jobFilter: 'all', maxLevel: 100 });
    // dowLeve.exp=12000, dohLeve.exp=5000, dolLeve.exp=3000
    expect(result.rows.map((r) => r.id)).toEqual([300, 100, 200]);
  });

  it("filters out leves above maxLevel", () => {
    const result = computeLevePlan([dolLeve, dohLeve, dowLeve], recipes, prices,
      { mode: 'gil', jobFilter: 'all', maxLevel: 25 });
    expect(result.rows.map((r) => r.id)).toEqual([200]); // only dolLeve at level 20
  });

  it('filters by jobFilter=CRP (specific class)', () => {
    const culLeve = { ...dohLeve, id: 101, classJob: 15 }; // CUL
    const crpLeve = { ...dohLeve, id: 102, classJob: 8 }; // CRP
    const result = computeLevePlan([culLeve, crpLeve], recipes, prices,
      { mode: 'gil', jobFilter: 'CRP', maxLevel: 100 });
    expect(result.rows.map((r) => r.id)).toEqual([102]);
  });

  it('filters by jobFilter=doh (category)', () => {
    const result = computeLevePlan([dolLeve, dohLeve, dowLeve], recipes, prices,
      { mode: 'gil', jobFilter: 'doh', maxLevel: 100 });
    expect(result.rows.map((r) => r.id)).toEqual([100]);
  });

  it('flags hasMatCostData=false for DoH with missing recipe', () => {
    const orphanDoh = { ...dohLeve, id: 999, targetItemId: 99_999 };
    const result = computeLevePlan([orphanDoh], recipes, prices,
      { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    expect(result.rows[0].hasMatCostData).toBe(false);
    expect(result.rows[0].matCost).toBeNull();
  });

  it('flags hasMatCostData=false for DoH with missing price on any ingredient', () => {
    const incompletePrices: MarketData = { '6001': prices['6001'] }; // missing 6002
    const result = computeLevePlan([dohLeve], recipes, incompletePrices,
      { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    expect(result.rows[0].hasMatCostData).toBe(false);
    expect(result.rows[0].matCost).toBeNull();
  });

  it('sinks rows with hasMatCostData=false to the bottom in gil mode', () => {
    const incompletePrices: MarketData = { '6001': prices['6001'] };
    const result = computeLevePlan([dohLeve, dolLeve], recipes, incompletePrices,
      { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    // dolLeve has matCost=null but hasMatCostData=true (non-DoH); netGil=4000
    // dohLeve has hasMatCostData=false; sinks below dolLeve
    expect(result.rows.map((r) => r.id)).toEqual([200, 100]);
  });
});
