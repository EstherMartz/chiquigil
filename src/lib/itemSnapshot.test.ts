import { describe, it, expect, vi } from 'vitest';
import { fetchItemSnapshot, parseItemSheetPage } from './itemSnapshot';

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

  it('keeps untradeable rows (sc=0) as long as they have a name', () => {
    // Cleanup helper needs to recognize tools / weapons / tomestones etc.
    // even though they're not marketboard-listable.
    const raw = {
      rows: [
        { row_id: 0, fields: { Name: '', ItemSearchCategory: { value: 0 }, ItemUICategory: { value: 0 }, LevelItem: { value: 0 }, CanBeHq: false } },
        { row_id: 1, fields: { Name: 'Gil', ItemSearchCategory: { value: 0 }, ItemUICategory: { value: 0 }, LevelItem: { value: 0 }, CanBeHq: false } },
      ],
    };
    const out = parseItemSheetPage(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 1, name: 'Gil', sc: 0 });
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

  it('extracts priceLow when XIVAPI returns it', () => {
    const page = {
      rows: [
        {
          row_id: 7,
          fields: {
            Name: 'Cobalt Ingot',
            ItemSearchCategory: { value: 60 },
            ItemUICategory: { value: 47 },
            LevelItem: { value: 50 },
            CanBeHq: true,
            PriceLow: 17,
          },
        },
        {
          row_id: 8,
          fields: {
            Name: 'Bag-only Item',
            ItemSearchCategory: { value: 60 },
            ItemUICategory: { value: 47 },
            LevelItem: { value: 1 },
            CanBeHq: false,
            PriceLow: 0,
          },
        },
      ],
    };
    const out = parseItemSheetPage(page);
    expect(out[0].priceLow).toBe(17);
    expect(out[1].priceLow).toBeUndefined();
  });
});

describe('fetchItemSnapshot', () => {
  it('pages until an empty page comes back, merging results', async () => {
    const pages = [
      { rows: [{ row_id: 1, fields: { Name: 'A', ItemSearchCategory: { value: 56 }, ItemUICategory: { value: 65 }, LevelItem: { value: 1 }, CanBeHq: false } }] },
      { rows: [{ row_id: 2, fields: { Name: 'B', ItemSearchCategory: { value: 56 }, ItemUICategory: { value: 65 }, LevelItem: { value: 2 }, CanBeHq: true } }] },
      { rows: [] },
    ];
    const fetchSpy = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => pages.shift() }));
    vi.stubGlobal('fetch', fetchSpy);

    const out = await fetchItemSnapshot();
    expect(out.map((i) => i.id)).toEqual([1, 2]);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('invokes progress callback after each non-empty page', async () => {
    const pages = [
      { rows: [{ row_id: 1, fields: { Name: 'A', ItemSearchCategory: { value: 1 }, ItemUICategory: { value: 1 }, LevelItem: { value: 1 } } }] },
      { rows: [{ row_id: 2, fields: { Name: 'B', ItemSearchCategory: { value: 1 }, ItemUICategory: { value: 1 }, LevelItem: { value: 1 } } }] },
      { rows: [] },
    ];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: true, json: async () => pages.shift() })));

    const progress: number[] = [];
    await fetchItemSnapshot({ onProgress: (n) => progress.push(n) });
    expect(progress).toEqual([1, 2]);
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(fetchItemSnapshot()).rejects.toThrow(/XIVAPI 400/);
  });
});
