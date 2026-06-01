import { describe, it, expect } from 'vitest';
import { concentrationHHI } from './concentration';
import type { WorldListing } from '../../lib/universalis';

const l = (price: number, quantity: number, seller: string, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller });

describe('concentrationHHI', () => {
  it('returns null when no listing has a seller in the tier', () => {
    expect(concentrationHHI([l(100, 1, '')], false)).toBeNull();
  });

  it('returns null when no listing matches the requested quality', () => {
    expect(concentrationHHI([l(100, 1, 'A')], true)).toBeNull();
  });

  it('single seller → hhi 1, risk thin', () => {
    const c = concentrationHHI([l(100, 3, 'A'), l(110, 2, 'A')], false)!;
    expect(c.hhi).toBeCloseTo(1, 5);
    expect(c.topSellerShare).toBeCloseTo(1, 5);
    expect(c.sellerCount).toBe(1);
    expect(c.risk).toBe('thin');
  });

  it('two sellers → risk thin (duopoly)', () => {
    const c = concentrationHHI([l(100, 1, 'A'), l(110, 1, 'B')], false)!;
    expect(c.hhi).toBeCloseTo(0.5, 5);
    expect(c.sellerCount).toBe(2);
    expect(c.risk).toBe('thin');
  });

  it('three uneven sellers → risk moderate', () => {
    const c = concentrationHHI([l(100, 6, 'A'), l(110, 2, 'B'), l(120, 2, 'C')], false)!;
    expect(c.hhi).toBeCloseTo(0.44, 5);
    expect(c.topSellerShare).toBeCloseTo(0.6, 5);
    expect(c.sellerCount).toBe(3);
    expect(c.risk).toBe('moderate');
  });

  it('four even sellers → risk deep', () => {
    const c = concentrationHHI(
      [l(100, 1, 'A'), l(110, 1, 'B'), l(120, 1, 'C'), l(130, 1, 'D')], false,
    )!;
    expect(c.hhi).toBeCloseTo(0.25, 5);
    expect(c.sellerCount).toBe(4);
    expect(c.risk).toBe('deep');
  });

  it('defaults missing quantity to 1', () => {
    const noQty = { world: 'Phantom', price: 80, hq: false, seller: 'A' } as WorldListing;
    const c = concentrationHHI([noQty, l(90, 1, 'B')], false)!;
    expect(c.sellerCount).toBe(2);
    expect(c.hhi).toBeCloseTo(0.5, 5);
  });
});
