import { describe, it, expect } from 'vitest';
import { listPlay, craftPlay, arbPlay, vendorPlay } from './plays';
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

describe('listPlay', () => {
  it('produces a baseline list play with zero cost and null roi', () => {
    const p = listPlay(mkt({ minNQ: 100, avgNQ: 110, recentSalesNQ: 5, velocity: 4 }), NOW);
    expect(p).not.toBeNull();
    expect(p!.kind).toBe('list');
    expect(p!.cost).toBe(0);
    expect(p!.roi).toBeNull();
  });
  it('returns null when there is no usable home price', () => {
    expect(listPlay(mkt({}), NOW)).toBeNull();
  });
});

describe('craftPlay', () => {
  it('produces an HQ craft play priced at the HQ market', () => {
    const m = mkt({ minHQ: 1000, avgHQ: 1000, recentSalesHQ: 10, velocity: 5, listingCount: 0 });
    const p = craftPlay(m, recipe, 400, 'HQ', NOW);
    expect(p!.quality).toBe('HQ');
    expect(p!.cost).toBe(400);
    expect(p!.netPerUnit).toBe(550); // 1000*0.95 - 400
  });
  it('returns null when not profitable after tax', () => {
    const m = mkt({ minNQ: 100, avgNQ: 100, recentSalesNQ: 10, velocity: 5 });
    expect(craftPlay(m, recipe, 400, 'NQ', NOW)).toBeNull();
  });
});

describe('arbPlay', () => {
  it('fires when a foreign listing is well below home', () => {
    const m = mkt({
      minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5,
      worldListings: [{ world: 'Lich', price: 500, hq: false }, { world: 'Home', price: 1000, hq: false }],
    });
    const p = arbPlay(m, m, 'Home', false, NOW);
    expect(p!.kind).toBe('arb');
    expect(p!.cost).toBe(500);
  });
  it('returns null when foreign is not cheap enough', () => {
    const m = mkt({
      minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5,
      worldListings: [{ world: 'Lich', price: 900, hq: false }],
    });
    expect(arbPlay(m, m, 'Home', false, NOW)).toBeNull();
  });
  it('ignores a cheap foreign listing of the wrong quality (no NQ→HQ arb)', () => {
    const m = mkt({
      minHQ: 2000, avgHQ: 2000, recentSalesHQ: 10, velocity: 5,
      worldListings: [
        { world: 'Lich', price: 300, hq: false }, // cheap NQ — must be ignored when selling HQ
        { world: 'Lich', price: 1900, hq: true },  // HQ, but not below the ARB_DISCOUNT threshold of home HQ
      ],
    });
    expect(arbPlay(m, m, 'Home', true, NOW)).toBeNull();
  });
  it('uses a cheap foreign HQ listing when selling HQ', () => {
    const m = mkt({
      minHQ: 2000, avgHQ: 2000, recentSalesHQ: 10, velocity: 5,
      worldListings: [
        { world: 'Lich', price: 300, hq: false }, // NQ, ignored
        { world: 'Lich', price: 1000, hq: true },  // HQ, below 0.7*2000=1400 → valid arb
      ],
    });
    const p = arbPlay(m, m, 'Home', true, NOW);
    expect(p!.cost).toBe(1000);
  });
});

describe('vendorPlay', () => {
  it('fires when the NPC price beats the taxed market', () => {
    const m = mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5 });
    const p = vendorPlay(m, 200, false, NOW);
    expect(p!.kind).toBe('vendor');
    expect(p!.cost).toBe(200);
    expect(p!.netPerUnit).toBe(750); // 1000*0.95 - 200
  });
  it('returns null without a vendor price', () => {
    expect(vendorPlay(mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 5 }), undefined, false, NOW)).toBeNull();
  });
});
