import { describe, it, expect } from 'vitest';
import { DROP_RATES, expectedGil } from './dropRates';

describe('DROP_RATES', () => {
  it('maps all three tiers', () => {
    expect(DROP_RATES.common).toBe(0.30);
    expect(DROP_RATES.uncommon).toBe(0.15);
    expect(DROP_RATES.rare).toBe(0.05);
  });
});

describe('expectedGil', () => {
  it('computes expected value for a loot item', () => {
    // common item worth 500 gil → 0.30 × 500 = 150
    expect(expectedGil('common', 500)).toBe(150);
  });

  it('returns 0 when price is null', () => {
    expect(expectedGil('rare', null)).toBe(0);
  });
});
