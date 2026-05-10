import { describe, it, expect } from 'vitest';
import { computeRawScore, normalizeScores } from './score';

describe('computeRawScore', () => {
  it('returns refPrice * velocity', () => {
    expect(computeRawScore({ refPrice: 1000, velocity: 3 })).toBe(3000);
  });
  it('returns 0 when no price', () => {
    expect(computeRawScore({ refPrice: 0, velocity: 5 })).toBe(0);
  });
  it('returns 0 when no velocity', () => {
    expect(computeRawScore({ refPrice: 1000, velocity: 0 })).toBe(0);
  });
});

describe('normalizeScores', () => {
  it('scales raw scores to 0-100 against the max', () => {
    expect(normalizeScores([0, 50, 100, 200])).toEqual([0, 25, 50, 100]);
  });
  it('returns zeros when all raw scores are 0', () => {
    expect(normalizeScores([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
