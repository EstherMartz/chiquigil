import { describe, it, expect } from 'vitest';
import { clearsInDays, isListingCountCapped, formatClearDays } from './supplyDepth';
import { LISTINGS_CAP } from '../../lib/universalis';

describe('clearsInDays', () => {
  it('is listings divided by velocity', () => {
    expect(clearsInDays(10, 2)).toBe(5);
    expect(clearsInDays(3, 6)).toBe(0.5);
  });

  it('returns null when nothing is selling', () => {
    expect(clearsInDays(10, 0)).toBeNull();
    expect(clearsInDays(10, -1)).toBeNull();
  });

  it('returns 0 when there are no listings', () => {
    expect(clearsInDays(0, 5)).toBe(0);
  });
});

describe('isListingCountCapped', () => {
  it('flags counts at or above the fetch cap as a lower bound', () => {
    expect(isListingCountCapped(LISTINGS_CAP)).toBe(true);
    expect(isListingCountCapped(LISTINGS_CAP - 1)).toBe(false);
  });
});

describe('formatClearDays', () => {
  it('renders not-moving, sold-out, and capped cases', () => {
    expect(formatClearDays(10, 0)).toBe('not moving');
    expect(formatClearDays(0, 5)).toBe('sold out');
    expect(formatClearDays(LISTINGS_CAP, 10)).toMatch(/^≥/);
    expect(formatClearDays(6, 2)).toBe('~3.0d');
  });
});
