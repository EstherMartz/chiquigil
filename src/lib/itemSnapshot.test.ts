import { describe, it, expect } from 'vitest';
import { parseItemSheetPage } from './itemSnapshot';

describe('parseItemSheetPage', () => {
  it('extracts SnapshotItem for marketable rows', () => {
    const raw = {
      rows: [
        {
          row_id: 1234,
          fields: {
            Name: 'Faerie Round Table',
            ItemSearchCategory: { value: 56 },
            ItemUICategory: { value: 65 },
            LevelItem: { value: 90 },
            CanBeHq: false,
          },
        },
      ],
    };
    const out = parseItemSheetPage(raw);
    expect(out).toEqual([
      { id: 1234, name: 'Faerie Round Table', sc: 56, ui: 65, ilvl: 90, canHq: false },
    ]);
  });

  it('drops rows with ItemSearchCategory.value === 0', () => {
    const raw = {
      rows: [
        { row_id: 0, fields: { Name: '', ItemSearchCategory: { value: 0 }, ItemUICategory: { value: 0 }, LevelItem: { value: 0 }, CanBeHq: false } },
        { row_id: 1, fields: { Name: 'Gil', ItemSearchCategory: { value: 0 }, ItemUICategory: { value: 0 }, LevelItem: { value: 0 }, CanBeHq: false } },
      ],
    };
    expect(parseItemSheetPage(raw)).toEqual([]);
  });

  it('drops rows with no Name', () => {
    const raw = {
      rows: [
        { row_id: 7, fields: { Name: '', ItemSearchCategory: { value: 56 }, ItemUICategory: { value: 65 }, LevelItem: { value: 0 }, CanBeHq: false } },
      ],
    };
    expect(parseItemSheetPage(raw)).toEqual([]);
  });

  it('treats missing CanBeHq as false', () => {
    const raw = {
      rows: [
        { row_id: 9, fields: { Name: 'A', ItemSearchCategory: { value: 56 }, ItemUICategory: { value: 65 }, LevelItem: { value: 1 } } },
      ],
    };
    expect(parseItemSheetPage(raw)[0].canHq).toBe(false);
  });
});
