import { describe, it, expect } from 'vitest';
import { newIdsSince } from './whatsNewDiff';

describe('newIdsSince', () => {
  it('returns IDs present in next but absent in prev, ascending', () => {
    expect(newIdsSince([1, 2, 3], [3, 2, 5, 1, 4])).toEqual([4, 5]);
  });

  it('ignores IDs removed since prev', () => {
    expect(newIdsSince([1, 2, 3], [2, 3])).toEqual([]);
  });

  it('returns empty when the sets are equal', () => {
    expect(newIdsSince([5, 6], [6, 5])).toEqual([]);
  });

  it('returns all of next when prev is empty', () => {
    expect(newIdsSince([], [9, 7, 8])).toEqual([7, 8, 9]);
  });
});
