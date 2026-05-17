import { describe, it, expect } from 'vitest';
import { defaultCurrencyFlipFilter, type CurrencyFlipFilter, type CurrencyFlipSort } from './types';

describe('defaultCurrencyFlipFilter', () => {
  it('returns the documented defaults', () => {
    const f: CurrencyFlipFilter = defaultCurrencyFlipFilter();
    expect(f.currency).toBe('poetics');
    expect(f.minGilPerUnit).toBe(0);
    expect(f.minVelocity).toBe(0);
    expect(f.maxListings).toBeNull();
    expect(f.hq).toBe('either');
    expect(f.sort).toBe<CurrencyFlipSort>('gilPerUnit');
    expect(f.limit).toBe(200);
  });
});
