import { describe, it, expect, vi, beforeEach } from 'vitest';

const awsFetch = vi.fn();
vi.mock('aws4fetch', () => {
  const mockClass = class {
    fetch = awsFetch;
  };
  return { AwsClient: mockClass };
});

import { writeBlobJson, writeMarketCache, readBlobJson } from './marketCache';

beforeEach(() => {
  awsFetch.mockReset();
  vi.unstubAllGlobals();
  process.env.R2_ACCOUNT_ID = 'acct';
  process.env.R2_BUCKET = 'bucket';
  process.env.R2_ACCESS_KEY_ID = 'ak';
  process.env.R2_SECRET_ACCESS_KEY = 'sk';
  process.env.R2_PUBLIC_URL = 'https://cache.example.com';
});

describe('writeBlobJson', () => {
  it('PUTs to the R2 object url with content-type + cache-control, returns the public url', async () => {
    awsFetch.mockResolvedValue({ ok: true });
    const url = await writeBlobJson('hot-ids.json', [1, 2, 3], 300);
    expect(awsFetch).toHaveBeenCalledWith(
      'https://acct.r2.cloudflarestorage.com/bucket/hot-ids.json',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify([1, 2, 3]),
        headers: expect.objectContaining({ 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }),
      }),
    );
    expect(url).toBe('https://cache.example.com/hot-ids.json');
  });

  it('throws when R2 credentials are missing', async () => {
    delete process.env.R2_ACCESS_KEY_ID;
    await expect(writeBlobJson('x.json', {})).rejects.toThrow(/R2 credentials missing/);
  });

  it('throws on a non-OK R2 response', async () => {
    awsFetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'denied' });
    await expect(writeBlobJson('x.json', {})).rejects.toThrow(/R2 put x\.json failed: 403/);
  });
});

describe('writeMarketCache', () => {
  it('writes to the given blob name via R2 and returns its public url', async () => {
    awsFetch.mockResolvedValue({ ok: true });
    const url = await writeMarketCache({ phantom: {}, dc: {}, region: {}, ts: 1 }, 'market-cache-hot.json', 300);
    expect(awsFetch).toHaveBeenCalledWith(
      'https://acct.r2.cloudflarestorage.com/bucket/market-cache-hot.json',
      expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ 'Cache-Control': 'public, max-age=300' }) }),
    );
    expect(url).toBe('https://cache.example.com/market-cache-hot.json');
  });
});

describe('readBlobJson', () => {
  it('fetches the public url (no-store) and parses JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [1, 2, 3] }));
    expect(await readBlobJson<number[]>('hot-ids.json')).toEqual([1, 2, 3]);
    expect(fetch).toHaveBeenCalledWith('https://cache.example.com/hot-ids.json', { cache: 'no-store' });
  });

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await readBlobJson('missing.json')).toBeNull();
  });
});
