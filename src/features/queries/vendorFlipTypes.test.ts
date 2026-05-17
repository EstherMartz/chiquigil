import { describe, it, expect } from 'vitest';
import { defaultVendorFlipFilter, type VendorFlipFilter, type VendorFlipSort } from './types';

describe('defaultVendorFlipFilter', () => {
  it('returns the documented defaults', () => {
    const f: VendorFlipFilter = defaultVendorFlipFilter();
    expect(f.searchCategories).toEqual([]);
    expect(f.minProfit).toBe(500);
    expect(f.minMarkup).toBe(2.0);
    expect(f.minVelocity).toBe(0.5);
    expect(f.maxListings).toBeNull();
    expect(f.hq).toBe('either');
    expect(f.sort).toBe<VendorFlipSort>('profitPerDay');
    expect(f.limit).toBe(200);
  });
});
