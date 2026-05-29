import { describe, it, expect } from 'vitest';
import { buildLeveUsedInIndex } from './leveUsedInIndex';
import type { SnapshotLeve } from './leveSnapshot';

function leve(over: Partial<SnapshotLeve>): SnapshotLeve {
  return {
    id: 1, name: 'L', level: 20, type: 'doh', classJob: 15, city: 'X',
    baseGil: 0, baseExp: 0, hqGilMultiplier: 2, targetItemId: null, targetItemQty: null,
    ...over,
  };
}

describe('buildLeveUsedInIndex', () => {
  it('indexes only leves with a target item, mapping target id to entries', () => {
    const leves = [
      leve({ id: 100, name: 'Bake Sale', classJob: 15, level: 20, type: 'doh', targetItemId: 500, targetItemQty: 3 }),
      leve({ id: 101, name: 'No Target', targetItemId: null }),
      leve({ id: 102, name: 'Forge Ahead', classJob: 9, level: 50, type: 'doh', targetItemId: 500, targetItemQty: 1 }),
    ];
    const idx = buildLeveUsedInIndex(leves);
    expect(idx.get(500)).toEqual([
      { leveId: 100, name: 'Bake Sale', level: 20, type: 'doh', jobCode: 'CUL', qty: 3 },
      { leveId: 102, name: 'Forge Ahead', level: 50, type: 'doh', jobCode: 'BSM', qty: 1 },
    ]);
    expect(idx.size).toBe(1);
  });

  it('defaults qty to 1 when targetItemQty is null', () => {
    const idx = buildLeveUsedInIndex([
      leve({ id: 1, targetItemId: 7, targetItemQty: null }),
    ]);
    expect(idx.get(7)?.[0].qty).toBe(1);
  });

  it('returns an empty map for no leves', () => {
    expect(buildLeveUsedInIndex([]).size).toBe(0);
  });
});
