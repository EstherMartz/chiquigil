import { describe, it, expect } from 'vitest';
import { buildGcSupplyUsedInIndex } from './gcSupplyUsedInIndex';
import type { SnapshotQuest } from './questSnapshot';

const quests: SnapshotQuest[] = [
  {
    questId: 4008, questName: 'GC Supply Lv.40', categoryName: 'BSM', level: 40,
    requiredItems: [
      { itemId: 100, itemName: '', qty: 1 },
      { itemId: 200, itemName: '', qty: 3 },
    ],
  },
  {
    questId: 5009, questName: 'GC Supply Lv.50', categoryName: 'GSM', level: 50,
    requiredItems: [{ itemId: 100, itemName: '', qty: 2 }],
  },
];

describe('buildGcSupplyUsedInIndex', () => {
  it('maps each required item id to its turn-in entries', () => {
    const idx = buildGcSupplyUsedInIndex(quests);
    expect(idx.get(100)).toEqual([
      { level: 40, categoryName: 'BSM', qty: 1 },
      { level: 50, categoryName: 'GSM', qty: 2 },
    ]);
    expect(idx.get(200)).toEqual([{ level: 40, categoryName: 'BSM', qty: 3 }]);
  });

  it('returns an empty map for no quests', () => {
    expect(buildGcSupplyUsedInIndex([]).size).toBe(0);
  });
});
