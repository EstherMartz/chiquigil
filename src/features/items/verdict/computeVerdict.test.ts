import { describe, it, expect } from 'vitest';
import { computeVerdict } from './computeVerdict';
import type { MarketItem } from '../../../lib/universalis';
import type { Recipe } from '../../../lib/recipes';

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

function mkt(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: NOW - 1_000,
    listingCount: 0, worldListings: [], ...over,
  } as MarketItem;
}
const recipe = { itemResultId: 1, classJob: 'CRP', recipeLevel: 50, ingredients: [] } as unknown as Recipe;

function base(over: Partial<Parameters<typeof computeVerdict>[0]> = {}) {
  return {
    phantom: mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5, listingCount: 1 }),
    region: undefined, recipe: undefined, vendorPrice: undefined,
    materialCost: 0, homeWorld: 'Home', canHq: false, now: NOW, ...over,
  };
}

describe('computeVerdict', () => {
  it('returns an untraded verdict when there is no home price', () => {
    const r = computeVerdict(base({ phantom: mkt({}) }));
    expect(r.best.kind).toBe('untraded');
    expect(r.runnerUp).toBeNull();
  });

  it('falls back to a list verdict with no runner-up when nothing else qualifies', () => {
    const r = computeVerdict(base());
    expect(r.best.kind).toBe('list');
    expect(r.runnerUp).toBeNull();
  });

  it('ranks a profitable craft above a plain list', () => {
    const r = computeVerdict(base({ recipe, materialCost: 200 }));
    expect(r.best.kind).toBe('craft');
    expect(r.runnerUp?.kind).toBe('list');
  });

  it('does not surface NQ craft as the runner-up to HQ craft (same play)', () => {
    const phantom = mkt({
      minNQ: 800, avgNQ: 800, recentSalesNQ: 10,
      minHQ: 1000, avgHQ: 1000, recentSalesHQ: 10, velocity: 5, listingCount: 1,
    });
    const r = computeVerdict(base({ phantom, recipe, materialCost: 200, canHq: true }));
    expect(r.best.kind).toBe('craft');
    if (r.runnerUp) expect(r.runnerUp.kind).not.toBe('craft');
  });

  it('demotes a nominal winner when its data is stale', () => {
    const fresh = computeVerdict(base({ recipe, materialCost: 200 }));
    const stale = computeVerdict(base({
      phantom: mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5, listingCount: 1, lastUploadTime: NOW - 30 * DAY }),
      recipe, materialCost: 200,
    }));
    expect(stale.best.score).toBeLessThan(fresh.best.score);
  });
});
