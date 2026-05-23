import { describe, it, expect } from 'vitest';
import { computeIndicator } from './LootPricer';

describe('computeIndicator', () => {
  it('returns SELL when velocity >= 1 and price >= 100', () => {
    expect(computeIndicator(500, 400, 2)).toBe('SELL');
  });

  it('returns HOLD when velocity >= 1 and price is depressed below 80% of average', () => {
    expect(computeIndicator(100, 200, 2)).toBe('HOLD');
  });

  it('returns SKIP when velocity < 1', () => {
    expect(computeIndicator(500, 400, 0.5)).toBe('SKIP');
  });

  it('returns SKIP when price < 100', () => {
    expect(computeIndicator(50, 40, 5)).toBe('SKIP');
  });

  it('returns SKIP when price is null', () => {
    expect(computeIndicator(null, null, 0)).toBe('SKIP');
  });
});
