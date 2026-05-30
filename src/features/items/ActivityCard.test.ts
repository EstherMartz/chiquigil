import { describe, it, expect } from 'vitest';
import { supplyDepth } from './ActivityCard';

describe('supplyDepth', () => {
  it('flags items that are listed but not selling', () => {
    expect(supplyDepth(5, 0)).toEqual({ days: null, note: 'listed but not selling' });
  });

  it('reports no recent sales when nothing is listed or selling', () => {
    expect(supplyDepth(0, 0)).toEqual({ days: null, note: 'no recent sales' });
  });

  it('reports sold out when selling but none listed', () => {
    expect(supplyDepth(0, 5)).toEqual({ days: 0, note: 'sold out — none listed' });
  });

  it('clears in under a day for high demand vs supply', () => {
    // 10 listed, sells 6710/day → clears almost instantly
    const r = supplyDepth(10, 6710);
    expect(r.note).toBe('clears in under a day');
    expect(r.days).toBeLessThan(1);
  });

  it('reports days to clear for a moderate book', () => {
    // 10 listed, 2/day → ~5 days
    expect(supplyDepth(10, 2)).toEqual({ days: 5, note: '~5d to clear' });
  });

  it('flags oversupply when the book would take weeks to clear', () => {
    // 10 listed, 0.5/day → 20 days
    const r = supplyDepth(10, 0.5);
    expect(r.note).toBe('oversupplied · ~20d to clear');
    expect(r.days).toBe(20);
  });
});
