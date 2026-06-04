// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { BotSnapshots } from '../bot/loadSnapshots';
import type { MarketData } from '../lib/universalis';
import type { Recipe } from '../lib/recipes';
import { classifyIngredientSource, jobNameOf, priceRecipe } from './_item-sources-core';

function fakeSnapshots(over: Partial<BotSnapshots> = {}): BotSnapshots {
  return {
    itemsById: new Map(),
    namesById: new Map<number, string>([[5106, 'Bronze Ingot'], [2, 'Fire Shard']]),
    recipes: new Map(),
    gcSupplyIds: new Set(),
    vendorMap: new Map<number, number>(),
    specialShop: { byCurrency: new Map() },
    gatheringCatalog: new Map(),
    ...over,
  } as BotSnapshots;
}

describe('classifyIngredientSource', () => {
  it('prefers vendor, then gather, then craft, else mb', () => {
    const snaps = fakeSnapshots({
      vendorMap: new Map([[10, 5]]),
      gatheringCatalog: new Map([[20, { level: 1, timed: false } as any]]),
      recipes: new Map([[30, {} as Recipe]]),
    });
    expect(classifyIngredientSource(10, snaps)).toBe('vendor');
    expect(classifyIngredientSource(20, snaps)).toBe('gather');
    expect(classifyIngredientSource(30, snaps)).toBe('craft');
    expect(classifyIngredientSource(99, snaps)).toBe('mb');
  });

  it('vendor wins even when the item is also gatherable', () => {
    const snaps = fakeSnapshots({
      vendorMap: new Map([[10, 5]]),
      gatheringCatalog: new Map([[10, { level: 1, timed: false } as any]]),
    });
    expect(classifyIngredientSource(10, snaps)).toBe('vendor');
  });
});

describe('jobNameOf', () => {
  it('maps known crafter codes and falls back to the raw code', () => {
    expect(jobNameOf('CRP')).toBe('Carpenter');
    expect(jobNameOf('ALC')).toBe('Alchemist');
    expect(jobNameOf('ANY')).toBe('Any Crafter');
    expect(jobNameOf('XYZ')).toBe('XYZ');
  });
});

describe('priceRecipe', () => {
  const recipe: Recipe = {
    itemResultId: 5056,
    classJob: 'BSM',
    recipeLevel: 1,
    ingredients: [
      { itemId: 5106, amount: 2 },
      { itemId: 2, amount: 1 },
    ],
    amountResult: 1,
  };

  it('prices ingredients (minNQ → minHQ → null) and sums the material cost', () => {
    const phantom = {
      '5106': { minNQ: 100, minHQ: 150 },
      '2': { minNQ: null, minHQ: 7 },
    } as unknown as MarketData;
    const snaps = fakeSnapshots({ vendorMap: new Map([[2, 1]]) });

    const out = priceRecipe(recipe, phantom, snaps);

    expect(out.ingredients[0]).toMatchObject({
      itemId: 5106, itemName: 'Bronze Ingot', qty: 2, unitPrice: 100, source: 'mb',
    });
    expect(out.ingredients[1]).toMatchObject({
      itemId: 2, itemName: 'Fire Shard', qty: 1, unitPrice: 7, source: 'vendor',
    });
    expect(out.materialCost).toBe(207);
  });

  it('treats missing market entries as 0 cost with null unitPrice', () => {
    const out = priceRecipe(recipe, {} as MarketData, fakeSnapshots());
    expect(out.ingredients[0].unitPrice).toBeNull();
    expect(out.materialCost).toBe(0);
  });
});
