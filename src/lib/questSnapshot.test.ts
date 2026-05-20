import { describe, it, expect } from 'vitest';
import { parseQuestSheetPage, type RawQuestSheetPage } from './questSnapshot';

describe('parseQuestSheetPage', () => {
  it('returns [] for empty page', () => {
    expect(parseQuestSheetPage({ rows: [] })).toEqual([]);
  });

  it('extracts a single-item quest', () => {
    const raw: RawQuestSheetPage = {
      rows: [
        {
          row_id: 65821,
          fields: {
            Name: 'Way of the Gladiator',
            ClassJobLevel: [1, 0],
            ItemCatalyst: [
              { value: 4, fields: { Name: 'Wind Shard' } },
              { value: 0, fields: { Name: '' } },
              { value: 0, fields: { Name: '' } },
            ],
            ItemCountCatalyst: [10, 0, 0],
            ClassJobCategory0: { fields: { Name: 'All Classes' } },
          },
        },
      ],
    };
    expect(parseQuestSheetPage(raw)).toEqual([
      {
        questId: 65821,
        questName: 'Way of the Gladiator',
        categoryName: 'All Classes',
        level: 1,
        requiredItems: [{ itemId: 4, itemName: 'Wind Shard', qty: 10 }],
      },
    ]);
  });

  it('extracts a multi-item quest (2 used slots, 1 empty)', () => {
    const raw: RawQuestSheetPage = {
      rows: [
        {
          row_id: 65674,
          fields: {
            Name: 'Way of the Carpenter',
            ClassJobLevel: [1, 0],
            ItemCatalyst: [
              { value: 4, fields: { Name: 'Wind Shard' } },
              { value: 3, fields: { Name: 'Ice Shard' } },
              { value: 0, fields: { Name: '' } },
            ],
            ItemCountCatalyst: [100, 50, 0],
            ClassJobCategory0: { fields: { Name: 'All Classes' } },
          },
        },
      ],
    };
    const out = parseQuestSheetPage(raw);
    expect(out).toHaveLength(1);
    expect(out[0].requiredItems).toEqual([
      { itemId: 4, itemName: 'Wind Shard', qty: 100 },
      { itemId: 3, itemName: 'Ice Shard', qty: 50 },
    ]);
  });

  it('drops quest rows with no item turn-ins', () => {
    const raw: RawQuestSheetPage = {
      rows: [
        {
          row_id: 1,
          fields: {
            Name: 'Story Quest',
            ClassJobLevel: [50, 0],
            ItemCatalyst: [
              { value: 0, fields: { Name: '' } },
              { value: 0, fields: { Name: '' } },
              { value: 0, fields: { Name: '' } },
            ],
            ItemCountCatalyst: [0, 0, 0],
            ClassJobCategory0: { fields: { Name: 'All Classes' } },
          },
        },
      ],
    };
    expect(parseQuestSheetPage(raw)).toEqual([]);
  });

  it('drops individual slots where itemId=0 or qty=0', () => {
    const raw: RawQuestSheetPage = {
      rows: [
        {
          row_id: 1,
          fields: {
            Name: 'Mixed Slot Quest',
            ClassJobLevel: [20, 0],
            ItemCatalyst: [
              { value: 100, fields: { Name: 'Item A' } },
              { value: 0, fields: { Name: '' } },           // empty slot
              { value: 200, fields: { Name: 'Item B' } },
            ],
            ItemCountCatalyst: [1, 0, 3],
            ClassJobCategory0: { fields: { Name: 'Disciple of the Hand' } },
          },
        },
      ],
    };
    const out = parseQuestSheetPage(raw);
    expect(out[0].requiredItems).toEqual([
      { itemId: 100, itemName: 'Item A', qty: 1 },
      { itemId: 200, itemName: 'Item B', qty: 3 },
    ]);
  });

  it('preserves categoryName from ClassJobCategory0', () => {
    const raw: RawQuestSheetPage = {
      rows: [
        {
          row_id: 1,
          fields: {
            Name: 'Test',
            ClassJobLevel: [5, 0],
            ItemCatalyst: [{ value: 1, fields: { Name: 'X' } }, { value: 0, fields: { Name: '' } }, { value: 0, fields: { Name: '' } }],
            ItemCountCatalyst: [1, 0, 0],
            ClassJobCategory0: { fields: { Name: 'Carpenter' } },
          },
        },
      ],
    };
    expect(parseQuestSheetPage(raw)[0].categoryName).toBe('Carpenter');
  });

  it('defaults categoryName to empty string when ClassJobCategory0 is missing', () => {
    const raw: RawQuestSheetPage = {
      rows: [
        {
          row_id: 1,
          fields: {
            Name: 'No category',
            ClassJobLevel: [5, 0],
            ItemCatalyst: [{ value: 1, fields: { Name: 'X' } }, { value: 0, fields: { Name: '' } }, { value: 0, fields: { Name: '' } }],
            ItemCountCatalyst: [1, 0, 0],
          },
        },
      ],
    };
    expect(parseQuestSheetPage(raw)[0].categoryName).toBe('');
  });

  it('handles missing itemName gracefully (defaults to empty string)', () => {
    const raw: RawQuestSheetPage = {
      rows: [
        {
          row_id: 1,
          fields: {
            Name: 'Test',
            ClassJobLevel: [5, 0],
            ItemCatalyst: [{ value: 999 }, { value: 0 }, { value: 0 }],
            ItemCountCatalyst: [1, 0, 0],
            ClassJobCategory0: { fields: { Name: 'All Classes' } },
          },
        },
      ],
    };
    expect(parseQuestSheetPage(raw)[0].requiredItems[0]).toEqual({
      itemId: 999, itemName: '', qty: 1,
    });
  });
});
