import { describe, it, expect } from 'vitest';
import { surveyIngredients } from './shoppingListSurvey';
import type { MarketData } from '../../lib/universalis';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import type { CurrencyId } from '../../lib/currencies';

function mkMarket(worldListings: Array<{ world: string; price: number; hq?: boolean }>, listingCount?: number) {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0,
    lastUploadTime: 0,
    listingCount: listingCount ?? worldListings.length,
    worldListings: worldListings.map((l) => ({ world: l.world, price: l.price, hq: l.hq ?? false, quantity: 1, retainerName: 'r' })),
    averagePriceNQ: null, averagePriceHQ: null,
  };
}

function mkShop(entries: Partial<Record<CurrencyId, Array<{ itemId: number; costPerUnit: number; receiveQty?: number; isHq?: boolean }>>>): SpecialShopSnapshot {
  const byCurrency = new Map();
  for (const [cur, list] of Object.entries(entries)) {
    byCurrency.set(cur, list!.map((e) => ({
      itemId: e.itemId, receiveQty: e.receiveQty ?? 1, costPerUnit: e.costPerUnit, isHq: e.isHq ?? false,
    })));
  }
  return { byCurrency };
}

describe('surveyIngredients', () => {
  it('returns [] for empty demand', () => {
    const out = surveyIngredients(new Map(), {}, new Map(), { byCurrency: new Map() });
    expect(out).toEqual([]);
  });

  it('MB-only ingredient → mb populated, autoSource mb', () => {
    const prices: MarketData = { 100: mkMarket([{ world: 'Phantom', price: 1000 }]) };
    const out = surveyIngredients(new Map([[100, 3]]), prices, new Map(), { byCurrency: new Map() });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 100, qty: 3, npc: null, currency: null, autoSource: 'mb',
      mb: { world: 'Phantom', price: 1000, isLightDc: false, count: 1 },
    });
  });

  it('NPC-only ingredient → autoSource npc', () => {
    const out = surveyIngredients(new Map([[100, 2]]), {}, new Map([[100, 500]]), { byCurrency: new Map() });
    expect(out[0]).toMatchObject({
      id: 100, qty: 2, mb: null, currency: null, autoSource: 'npc',
      npc: { price: 500 },
    });
  });

  it('currency-only ingredient → autoSource null, currency populated', () => {
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const out = surveyIngredients(new Map([[100, 1]]), {}, new Map(), shop);
    expect(out[0]).toMatchObject({
      id: 100, qty: 1, mb: null, npc: null, autoSource: null,
      currency: { id: 'poetics', label: 'Allagan Tomestone of Poetics', shortLabel: 'Poetics', costPerUnit: 10 },
    });
  });

  it('all three sources, MB cheaper → autoSource mb', () => {
    const prices: MarketData = { 100: mkMarket([{ world: 'Phantom', price: 400 }]) };
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 5 }] });
    const out = surveyIngredients(new Map([[100, 1]]), prices, new Map([[100, 500]]), shop);
    expect(out[0].autoSource).toBe('mb');
    expect(out[0].mb?.price).toBe(400);
    expect(out[0].npc?.price).toBe(500);
    expect(out[0].currency?.costPerUnit).toBe(5);
  });

  it('all three sources, NPC cheaper by 1 gil → autoSource npc', () => {
    const prices: MarketData = { 100: mkMarket([{ world: 'Phantom', price: 501 }]) };
    const out = surveyIngredients(new Map([[100, 1]]), prices, new Map([[100, 500]]), { byCurrency: new Map() });
    expect(out[0].autoSource).toBe('npc');
  });

  it('MB === NPC price → autoSource mb (MB wins ties)', () => {
    const prices: MarketData = { 100: mkMarket([{ world: 'Phantom', price: 500 }]) };
    const out = surveyIngredients(new Map([[100, 1]]), prices, new Map([[100, 500]]), { byCurrency: new Map() });
    expect(out[0].autoSource).toBe('mb');
  });

  it('currency item with multiple deals in one bucket → picks lowest costPerUnit', () => {
    const shop = mkShop({ poetics: [
      { itemId: 100, costPerUnit: 50 },
      { itemId: 100, costPerUnit: 10 },
      { itemId: 100, costPerUnit: 25 },
    ]});
    const out = surveyIngredients(new Map([[100, 1]]), {}, new Map(), shop);
    expect(out[0].currency?.costPerUnit).toBe(10);
  });

  it('item in multiple currency buckets → picks cheapest costPerUnit; tiebreaks by lexical currency id', () => {
    const shop = mkShop({
      poetics: [{ itemId: 100, costPerUnit: 50 }],
      mgp: [{ itemId: 100, costPerUnit: 50 }],
      whiteCrafter: [{ itemId: 100, costPerUnit: 5 }],
    });
    const out = surveyIngredients(new Map([[100, 1]]), {}, new Map(), shop);
    expect(out[0].currency?.id).toBe('whiteCrafter');
    const shop2 = mkShop({
      poetics: [{ itemId: 200, costPerUnit: 10 }],
      mgp: [{ itemId: 200, costPerUnit: 10 }],
    });
    const out2 = surveyIngredients(new Map([[200, 1]]), {}, new Map(), shop2);
    expect(out2[0].currency?.id).toBe('mgp');
  });

  it('isLightDc bubbles up from cheapestEuNq', () => {
    const prices: MarketData = { 100: mkMarket([{ world: 'Lich', price: 100 }]) };
    const out = surveyIngredients(new Map([[100, 1]]), prices, new Map(), { byCurrency: new Map() });
    expect(out[0].mb?.isLightDc).toBe(true);
  });

  it('sorts output by ascending id', () => {
    const prices: MarketData = {
      300: mkMarket([{ world: 'Phantom', price: 100 }]),
      100: mkMarket([{ world: 'Phantom', price: 100 }]),
      200: mkMarket([{ world: 'Phantom', price: 100 }]),
    };
    const out = surveyIngredients(new Map([[300, 1], [100, 1], [200, 1]]), prices, new Map(), { byCurrency: new Map() });
    expect(out.map((s) => s.id)).toEqual([100, 200, 300]);
  });
});
