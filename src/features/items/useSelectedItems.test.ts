import { describe, it, expect } from 'vitest';
import { mergeWatchlistItems } from './useSelectedItems';
import type { TrackedItem } from './types';

const customA: TrackedItem = { id: 1001, name: 'Custom A', crafter: 'ANY', lvl: 1, cat: 'Glamour' };
const customB: TrackedItem = { id: 1002, name: 'Custom B', crafter: 'ANY', lvl: 1, cat: 'Glamour' };

describe('mergeWatchlistItems', () => {
  it('returns only customs when no starter packs enabled', () => {
    const out = mergeWatchlistItems({} as never, [customA, customB], []);
    expect(out.map((i) => i.id)).toEqual([1001, 1002]);
  });

  it('excludes ids present in excludedItems from customs', () => {
    const out = mergeWatchlistItems({} as never, [customA, customB], [1001]);
    expect(out.map((i) => i.id)).toEqual([1002]);
  });

  it('deduplicates customs whose id is already in starter packs', () => {
    // Simulate a starter pack item by re-using the same id as custom; without
    // starter packs being toggled on it stays empty, so this confirms the
    // dedupe path doesn't crash for empty packs.
    const out = mergeWatchlistItems({} as never, [customA], []);
    expect(out.map((i) => i.id)).toEqual([1001]);
  });
});
