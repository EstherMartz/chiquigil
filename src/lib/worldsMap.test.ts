import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWorlds, dcWorldIds } from './worldsMap';

beforeEach(() => vi.unstubAllGlobals());

describe('worldsMap', () => {
  it('fetchWorlds parses the /api/v2/worlds list into an id→name map', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ id: 401, name: 'Phantom' }, { id: 71, name: 'Moogle' }],
    }));
    const map = await fetchWorlds();
    expect(map.get(401)).toBe('Phantom');
    expect(map.get(71)).toBe('Moogle');
  });

  it('fetchWorlds throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchWorlds()).rejects.toThrow();
  });

  it('dcWorldIds returns the (sorted) ids whose names are in that DC', () => {
    const map = new Map<number, string>([
      [401, 'Phantom'], [71, 'Moogle'], [21, 'Ravana'], [97, 'Ragnarok'],
    ]);
    expect(dcWorldIds('Chaos', map)).toEqual([71, 97, 401]);
    expect(dcWorldIds('NotADc', map)).toEqual([]);
  });
});
