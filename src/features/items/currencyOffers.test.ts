import { describe, it, expect } from 'vitest';
import { findItemCurrencyOffers } from './currencyOffers';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import type { CurrencyId } from '../../lib/currencies';

function mkShop(entries: Partial<Record<CurrencyId | string, Array<{ itemId: number; costPerUnit: number; receiveQty?: number; isHq?: boolean }>>>): SpecialShopSnapshot {
  const byCurrency = new Map();
  for (const [cur, list] of Object.entries(entries)) {
    byCurrency.set(cur, list!.map((e) => ({
      itemId: e.itemId, receiveQty: e.receiveQty ?? 1, costPerUnit: e.costPerUnit, isHq: e.isHq ?? false,
    })));
  }
  return { byCurrency };
}

describe('findItemCurrencyOffers', () => {
  it('returns [] when item is not in any bucket', () => {
    const shop = mkShop({ poetics: [{ itemId: 200, costPerUnit: 10 }] });
    expect(findItemCurrencyOffers(100, shop)).toEqual([]);
  });

  it('returns one offer when item is in one bucket with one matching entry', () => {
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const offers = findItemCurrencyOffers(100, shop);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toEqual({
      currency: { id: 'poetics', label: 'Allagan Tomestone of Poetics', shortLabel: 'Poetics', itemId: 28 },
      costPerUnit: 10,
      isHq: false,
    });
  });

  it('picks the lowest costPerUnit when one bucket has multiple matching entries (and preserves that entry isHq)', () => {
    const shop = mkShop({ poetics: [
      { itemId: 100, costPerUnit: 50, isHq: false },
      { itemId: 100, costPerUnit: 10, isHq: true },
      { itemId: 100, costPerUnit: 25, isHq: false },
    ]});
    const offers = findItemCurrencyOffers(100, shop);
    expect(offers).toHaveLength(1);
    expect(offers[0].costPerUnit).toBe(10);
    expect(offers[0].isHq).toBe(true);
  });

  it('returns one offer per matching currency bucket, sorted by costPerUnit ascending', () => {
    const shop = mkShop({
      poetics: [{ itemId: 100, costPerUnit: 50 }],
      mgp: [{ itemId: 100, costPerUnit: 5000 }],
      whiteCrafter: [{ itemId: 100, costPerUnit: 5 }],
    });
    const offers = findItemCurrencyOffers(100, shop);
    expect(offers.map((o) => o.currency.id)).toEqual(['whiteCrafter', 'poetics', 'mgp']);
  });

  it('preserves isHq flag from the chosen entry', () => {
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10, isHq: true }] });
    expect(findItemCurrencyOffers(100, shop)[0].isHq).toBe(true);
  });

  it('silently skips a bucket whose currency id is not in the CURRENCIES catalog (defensive)', () => {
    const shop = mkShop({
      bogus: [{ itemId: 100, costPerUnit: 5 }],
      poetics: [{ itemId: 100, costPerUnit: 10 }],
    });
    const offers = findItemCurrencyOffers(100, shop);
    expect(offers).toHaveLength(1);
    expect(offers[0].currency.id).toBe('poetics');
  });
});
