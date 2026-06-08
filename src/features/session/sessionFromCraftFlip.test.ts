import { describe, it, expect } from 'vitest';
import { sessionCandidatesFromCraftFlip } from './sessionFromCraftFlip';
import type { CraftFlipRow } from '../queries/types';
import type { Recipe } from '../../lib/recipes';

function row(over: Partial<CraftFlipRow> = {}): CraftFlipRow {
  return {
    id: 1, name: 'Sample', sc: 4,
    unitPrice: 1000, materialCost: 400, profit: 600,
    velocity: 2, gilPerDay: 1200, hq: false,
    sourcing: null, selfSourceGilPerDay: 1200,
    ...over,
  };
}

function recipe(over: Partial<Recipe> = {}): Recipe {
  return {
    itemResultId: 1, classJob: 'LTW', recipeLevel: 90, ingredients: [], ...over,
  };
}

const HIGH_LEVELS = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };
const LOW_LEVELS  = { CRP: 50,  BSM: 50,  ARM: 50,  GSM: 50,  LTW: 50,  WVR: 50,  ALC: 50,  CUL: 50  };

describe('sessionCandidatesFromCraftFlip', () => {
  it('returns a candidate with crafter/lvl from the recipe', () => {
    const out = sessionCandidatesFromCraftFlip(
      [row({ id: 1, name: 'Crafted Boot', profit: 500, velocity: 3 })],
      { recipeMap: new Map([[1, recipe({ classJob: 'WVR', recipeLevel: 80 })]]),
        priceMap: {}, levels: HIGH_LEVELS, baseSeconds: 60, perItemFlags: {} },
    );
    expect(out).toHaveLength(1);
    expect(out[0].crafter).toBe('WVR');
    expect(out[0].lvl).toBe(80);
    expect(out[0].profit).toBe(500);
    expect(out[0].velocity).toBe(3);
  });

  it('drops items with no recipe in the map', () => {
    const out = sessionCandidatesFromCraftFlip(
      [row({ id: 5 })],
      { recipeMap: new Map([[5, null]]),
        priceMap: {}, levels: HIGH_LEVELS, baseSeconds: 60, perItemFlags: {} },
    );
    expect(out).toEqual([]);
  });

  it('drops items where craftStatus !== ok (level too low)', () => {
    const out = sessionCandidatesFromCraftFlip(
      [row({ id: 1 })],
      { recipeMap: new Map([[1, recipe({ classJob: 'LTW', recipeLevel: 90 })]]),
        priceMap: {}, levels: LOW_LEVELS, baseSeconds: 60, perItemFlags: {} },
    );
    expect(out).toEqual([]);
  });

  it('respects minProfit', () => {
    const out = sessionCandidatesFromCraftFlip(
      [row({ id: 1, profit: 100 }), row({ id: 2, name: 'B', profit: 500 })],
      { recipeMap: new Map([
          [1, recipe()],
          [2, recipe({ itemResultId: 2 })],
        ]),
        priceMap: {}, levels: HIGH_LEVELS, baseSeconds: 60, perItemFlags: {}, minProfit: 300 },
    );
    expect(out.map((c) => c.id)).toEqual([2]);
  });

  it('respects crafterLock', () => {
    const out = sessionCandidatesFromCraftFlip(
      [row({ id: 1 }), row({ id: 2, name: 'B' })],
      { recipeMap: new Map([
          [1, recipe({ classJob: 'LTW' })],
          [2, recipe({ itemResultId: 2, classJob: 'WVR' })],
        ]),
        priceMap: {}, levels: HIGH_LEVELS, baseSeconds: 60, perItemFlags: {}, crafterLock: 'WVR' },
    );
    expect(out.map((c) => c.id)).toEqual([2]);
  });

  it('uses per-item craftTimeSeconds override when set', () => {
    const out = sessionCandidatesFromCraftFlip(
      [row({ id: 1, profit: 600 })],
      { recipeMap: new Map([[1, recipe()]]),
        priceMap: {}, levels: HIGH_LEVELS, baseSeconds: 60, perItemFlags: { 1: { craftTimeSeconds: 30 } } },
    );
    expect(out[0].craftSeconds).toBe(30);
    expect(out[0].gilPerMinute).toBe(600 / (30 / 60));
  });

  it('carries listingCount from priceMap onto the candidate', () => {
    const out = sessionCandidatesFromCraftFlip(
      [row({ id: 1, profit: 500 })],
      { recipeMap: new Map([[1, recipe()]]),
        priceMap: {
          '1': {
            minNQ: 1000, minHQ: null, avgNQ: 1100, avgHQ: null,
            medianNQ: null, medianHQ: null,
            recentSalesNQ: 0, recentSalesHQ: 0,
            velocity: 2, lastUploadTime: 0, listingCount: 7,
            worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
          },
        },
        levels: HIGH_LEVELS, baseSeconds: 60, perItemFlags: {} },
    );
    expect(out[0].listingCount).toBe(7);
  });

  it('drops items with profit ≤ 0', () => {
    const out = sessionCandidatesFromCraftFlip(
      [row({ id: 1, profit: 0 }), row({ id: 2, name: 'B', profit: -100 })],
      { recipeMap: new Map([
          [1, recipe()],
          [2, recipe({ itemResultId: 2 })],
        ]),
        priceMap: {}, levels: HIGH_LEVELS, baseSeconds: 60, perItemFlags: {} },
    );
    expect(out).toEqual([]);
  });
});
