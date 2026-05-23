import { describe, it, expect } from 'vitest';
import { colorFromDelta, colorFromPoints } from './sparklineColor';

describe('colorFromDelta', () => {
  it('returns green for rising (delta > 5)', () => {
    expect(colorFromDelta(10)).toBe('#4ade80');
  });
  it('returns red for falling (delta < -5)', () => {
    expect(colorFromDelta(-10)).toBe('#f87171');
  });
  it('returns amber for stable', () => {
    expect(colorFromDelta(3)).toBe('#c9a84c');
  });
  it('returns grey for null', () => {
    expect(colorFromDelta(null)).toBe('#6b7280');
  });
});

describe('colorFromPoints', () => {
  it('returns green when last > first', () => {
    expect(colorFromPoints([100, null, 200])).toBe('#4ade80');
  });
  it('returns red when last < first', () => {
    expect(colorFromPoints([200, null, 100])).toBe('#f87171');
  });
  it('returns grey when equal', () => {
    expect(colorFromPoints([100, 100])).toBe('#6b7280');
  });
  it('returns grey for insufficient points', () => {
    expect(colorFromPoints([null, null, 100])).toBe('#6b7280');
  });
});
