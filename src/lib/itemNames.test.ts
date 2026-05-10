import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildNamesUrl, parseNamesResponse, fetchItemNames } from './itemNames';

describe('buildNamesUrl', () => {
  it('builds a rows-by-id URL', () => {
    expect(buildNamesUrl([1, 2, 3])).toBe(
      'https://v2.xivapi.com/api/sheet/Item?rows=1,2,3&fields=Name&limit=200'
    );
  });
});

describe('parseNamesResponse', () => {
  it('returns a map of id → Name', () => {
    const raw = {
      rows: [
        { row_id: 1, fields: { Name: 'Bronze Ingot' } },
        { row_id: 2, fields: { Name: 'Wind Shard' } },
      ],
    };
    expect(parseNamesResponse(raw)).toEqual(new Map([[1, 'Bronze Ingot'], [2, 'Wind Shard']]));
  });

  it('drops rows missing a Name', () => {
    const raw = { rows: [{ row_id: 1 }, { row_id: 2, fields: {} }] };
    expect(parseNamesResponse(raw)).toEqual(new Map());
  });
});

describe('fetchItemNames', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns empty map for empty input', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchItemNames([])).toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on non-OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchItemNames([1])).rejects.toThrow('XIVAPI 500');
  });
});
