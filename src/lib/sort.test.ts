import { describe, it, expect } from 'vitest';
import { descBy } from './sort';

describe('descBy', () => {
  it('sorts numbers descending by the extracted value', () => {
    const rows = [{ x: 5 }, { x: 1 }, { x: 3 }];
    rows.sort(descBy((r) => r.x));
    expect(rows.map((r) => r.x)).toEqual([5, 3, 1]);
  });

  it('returns 0 for equal extracted values (stable when used with Array.sort)', () => {
    const cmp = descBy<{ x: number }>((r) => r.x);
    expect(cmp({ x: 7 }, { x: 7 })).toBe(0);
  });

  it('handles negative numbers and zero', () => {
    const rows = [{ x: -5 }, { x: 0 }, { x: -1 }];
    rows.sort(descBy((r) => r.x));
    expect(rows.map((r) => r.x)).toEqual([0, -1, -5]);
  });
});
