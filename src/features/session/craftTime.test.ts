import { describe, it, expect } from 'vitest';
import { defaultCraftSeconds, resolveCraftSeconds } from './craftTime';

describe('defaultCraftSeconds', () => {
  it('returns the base for low-level recipes', () => {
    expect(defaultCraftSeconds(30, 60)).toBe(60);
    expect(defaultCraftSeconds(50, 60)).toBe(60);
  });
  it('adds 1s per recipe level over 50', () => {
    expect(defaultCraftSeconds(70, 60)).toBe(80);
    expect(defaultCraftSeconds(100, 60)).toBe(110);
  });
  it('caps at 180s regardless of recipe level', () => {
    expect(defaultCraftSeconds(770, 60)).toBe(180);
  });
});

describe('resolveCraftSeconds', () => {
  it('uses user override when provided', () => {
    expect(resolveCraftSeconds(100, 60, 90)).toBe(90);
  });
  it('falls back to default heuristic when no override', () => {
    expect(resolveCraftSeconds(100, 60, undefined)).toBe(110);
  });
  it('treats 0 or negative override as no override', () => {
    expect(resolveCraftSeconds(100, 60, 0)).toBe(110);
  });
});
