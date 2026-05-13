import { describe, it, expect } from 'vitest';
import { trimmedMedian, MIN_RECENT_SALES, MAX_LISTING_RATIO, TRIM_FRACTION } from './priceTrust';

describe('constants', () => {
  it('exports the agreed values', () => {
    expect(MIN_RECENT_SALES).toBe(5);
    expect(MAX_LISTING_RATIO).toBe(5);
    expect(TRIM_FRACTION).toBe(0.1);
  });
});

describe('trimmedMedian', () => {
  it('returns null for empty input', () => {
    expect(trimmedMedian([])).toBeNull();
  });

  it('returns the only value for length 1', () => {
    expect(trimmedMedian([100])).toBe(100);
  });

  it('returns the mean of two values for length 2', () => {
    expect(trimmedMedian([100, 200])).toBe(150);
  });

  it('returns the middle value for odd length, no trim', () => {
    expect(trimmedMedian([100, 200, 300])).toBe(200);
  });

  it('does not trim when length < 10 (floor(n*0.1) is 0)', () => {
    // Outliers preserved at the bounds, but median is robust to them.
    expect(trimmedMedian([1, 100, 100, 100, 1_000_000])).toBe(100);
  });

  it('trims 1 from each end at length 10-19', () => {
    // Drops the 1 (low) and the 1_000_000 (high). Remainder is all 100s.
    expect(trimmedMedian([1, 100, 100, 100, 100, 100, 100, 100, 100, 1_000_000])).toBe(100);
  });

  it('sorts the input internally (does not mutate)', () => {
    const input = [300, 100, 200];
    const out = trimmedMedian(input);
    expect(out).toBe(200);
    expect(input).toEqual([300, 100, 200]); // unchanged
  });

  it('handles all-equal values', () => {
    expect(trimmedMedian([42, 42, 42, 42, 42])).toBe(42);
  });

  it('averages the two middle values for even length after trim', () => {
    // length 12, trim 1 each side → 10 remaining = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
    // even length → average of two middles = 100
    expect(trimmedMedian([1, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 9999])).toBe(100);
  });
});
