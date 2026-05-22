import { describe, it, expect } from 'vitest';
import { CURRENCIES, getCurrencyById, currencyByItemId, type CurrencyId } from './currencies';

describe('currencies catalog', () => {
  it('exports all currencies', () => {
    expect(CURRENCIES).toHaveLength(CURRENCIES.length);
  });

  it('all entries have unique ids', () => {
    const ids = new Set(CURRENCIES.map((c) => c.id));
    expect(ids.size).toBe(CURRENCIES.length);
  });

  it('all entries have unique itemIds', () => {
    const ids = new Set(CURRENCIES.map((c) => c.itemId));
    expect(ids.size).toBe(CURRENCIES.length);
  });

  it('all itemIds are positive integers', () => {
    for (const c of CURRENCIES) {
      expect(Number.isInteger(c.itemId)).toBe(true);
      expect(c.itemId).toBeGreaterThan(0);
    }
  });

  it('getCurrencyById returns the matching entry', () => {
    expect(getCurrencyById('poetics')?.label).toContain('Poetics');
    expect(getCurrencyById('mgp')?.shortLabel).toBe('MGP');
  });

  it('getCurrencyById returns undefined for unknown id', () => {
    expect(getCurrencyById('nonexistent' as CurrencyId)).toBeUndefined();
  });

  it('currencyByItemId exposes a Map<number, CurrencyId> for the parser', () => {
    expect(currencyByItemId).toBeInstanceOf(Map);
    expect(currencyByItemId.size).toBe(CURRENCIES.length);
    for (const c of CURRENCIES) {
      expect(currencyByItemId.get(c.itemId)).toBe(c.id);
    }
  });
});
