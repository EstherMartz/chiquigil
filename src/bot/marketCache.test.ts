import { describe, it, expect, vi, beforeEach } from 'vitest';

const put = vi.fn();
const head = vi.fn();
vi.mock('@vercel/blob', () => ({ put: (...a: unknown[]) => put(...a), head: (...a: unknown[]) => head(...a) }));

import { writeMarketCache, writeBlobJson, readBlobJson } from './marketCache';

beforeEach(() => { put.mockReset(); head.mockReset(); vi.unstubAllGlobals(); });

describe('blob helpers', () => {
  it('writeMarketCache defaults to market-cache.json and returns the url', async () => {
    put.mockResolvedValue({ url: 'https://blob/market-cache.json' });
    const url = await writeMarketCache({ phantom: {}, dc: {}, region: {}, ts: 1 });
    expect(put).toHaveBeenCalledWith('market-cache.json', expect.any(String), expect.objectContaining({ access: 'public' }));
    expect(url).toBe('https://blob/market-cache.json');
  });

  it('writeMarketCache honours an explicit blob name', async () => {
    put.mockResolvedValue({ url: 'https://blob/market-cache-hot.json' });
    await writeMarketCache({ phantom: {}, dc: {}, region: {}, ts: 1 }, 'market-cache-hot.json');
    expect(put).toHaveBeenCalledWith('market-cache-hot.json', expect.any(String), expect.anything());
  });

  it('readBlobJson resolves the url via head and parses it', async () => {
    head.mockResolvedValue({ url: 'https://blob/hot-ids.json' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [1, 2, 3] }));
    expect(await readBlobJson<number[]>('hot-ids.json')).toEqual([1, 2, 3]);
  });

  it('readBlobJson returns null when the blob is missing', async () => {
    head.mockRejectedValue(new Error('not found'));
    expect(await readBlobJson('missing.json')).toBeNull();
  });
});
