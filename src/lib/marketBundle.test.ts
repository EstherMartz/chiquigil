// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveCacheUrls, loadMarketBundle } from './marketBundle';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('resolveCacheUrls', () => {
  it('prefers explicit VITE_CACHE_COLD_URL / VITE_CACHE_HOT_URL', () => {
    const { coldUrl, hotUrl } = resolveCacheUrls({
      VITE_CACHE_COLD_URL: 'https://cdn/cold.json',
      VITE_CACHE_HOT_URL: 'https://cdn/hot.json',
      R2_PUBLIC_URL: 'https://r2.example',
    });
    expect(coldUrl).toBe('https://cdn/cold.json');
    expect(hotUrl).toBe('https://cdn/hot.json');
  });

  it('derives cold/hot from R2_PUBLIC_URL and trims a trailing slash', () => {
    const { coldUrl, hotUrl } = resolveCacheUrls({ R2_PUBLIC_URL: 'https://r2.example/bucket/' });
    expect(coldUrl).toBe('https://r2.example/bucket/market-cache-cold.json');
    expect(hotUrl).toBe('https://r2.example/bucket/market-cache-hot.json');
  });

  it('lets the R2-derived cold URL outrank a stale legacy VITE_CACHE_BLOB_URL', () => {
    // This is the bug guard: a leftover legacy blob var must NOT shadow live R2.
    const { coldUrl } = resolveCacheUrls({
      R2_PUBLIC_URL: 'https://r2.example',
      VITE_CACHE_BLOB_URL: 'https://old/market-cache.json',
    });
    expect(coldUrl).toBe('https://r2.example/market-cache-cold.json');
  });

  it('falls back to legacy single-blob vars for cold when no cold/R2 url exists', () => {
    expect(resolveCacheUrls({ VITE_CACHE_BLOB_URL: 'https://old/blob.json' }).coldUrl)
      .toBe('https://old/blob.json');
    expect(resolveCacheUrls({ MARKET_CACHE_BLOB_URL: 'https://older/blob.json' }).coldUrl)
      .toBe('https://older/blob.json');
  });

  it('uses caller defaults, then relative static paths, as last resorts', () => {
    const withDefaults = resolveCacheUrls({}, {
      defaultColdUrl: 'https://app/data/market-cache-cold.json',
      defaultHotUrl: 'https://app/data/market-cache-hot.json',
    });
    expect(withDefaults.coldUrl).toBe('https://app/data/market-cache-cold.json');
    expect(withDefaults.hotUrl).toBe('https://app/data/market-cache-hot.json');

    const bare = resolveCacheUrls({});
    expect(bare.coldUrl).toBe('/data/market-cache-cold.json');
    expect(bare.hotUrl).toBe('/data/market-cache-hot.json');
  });

  it('mirrors the browser case: no R2 var → cold = COLD_URL || BLOB_URL || default', () => {
    // Browsers never see R2_PUBLIC_URL, so behavior must match the pre-refactor web.
    expect(resolveCacheUrls({ VITE_CACHE_BLOB_URL: 'https://legacy/blob.json' }).coldUrl)
      .toBe('https://legacy/blob.json');
  });
});

// Route a stubbed fetch by URL so cold and hot return distinct blobs.
function stubBlobs(opts: {
  cold?: unknown | null;
  hot?: unknown | null;
}) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    // Route by the hot blob's filename specifically (cold.json never contains it).
    const isHot = url.includes('hot.json');
    const body = isHot ? opts.hot : opts.cold;
    if (body == null) return Promise.resolve({ ok: false, json: async () => ({}) });
    return Promise.resolve({ ok: true, json: async () => body });
  }));
}

const env = { VITE_CACHE_COLD_URL: 'https://x/cold.json', VITE_CACHE_HOT_URL: 'https://x/hot.json' };

describe('loadMarketBundle', () => {
  it('overlays hot rows on cold rows (hot wins on id collision), per scope', async () => {
    stubBlobs({
      cold: { phantom: { '1': { minNQ: 100 }, '2': { minNQ: 200 } }, dc: { '9': { minNQ: 1 } }, region: {}, ts: 1000 },
      hot: { phantom: { '2': { minNQ: 222 }, '3': { minNQ: 300 } }, dc: {}, region: {}, ts: 2000 },
    });
    const b = await loadMarketBundle(env);
    expect(b).not.toBeNull();
    // id 1 only in cold, id 2 overridden by hot, id 3 only in hot
    expect(b!.phantom['1']).toEqual({ minNQ: 100 });
    expect(b!.phantom['2']).toEqual({ minNQ: 222 });
    expect(b!.phantom['3']).toEqual({ minNQ: 300 });
    // dc stays distinct from phantom; cold's dc row survives (hot has none)
    expect(b!.dc['9']).toEqual({ minNQ: 1 });
    expect(b!.region).toEqual({});
    // ts is the freshest of the two blobs
    expect(b!.ts).toBe(2000);
  });

  it('returns the available blob when only cold (or only hot) is present', async () => {
    stubBlobs({ cold: { phantom: { '1': { minNQ: 5 } }, dc: {}, region: {}, ts: 10 }, hot: null });
    const coldOnly = await loadMarketBundle(env);
    expect(coldOnly!.phantom['1']).toEqual({ minNQ: 5 });
    expect(coldOnly!.ts).toBe(10);

    stubBlobs({ cold: null, hot: { phantom: { '7': { minNQ: 9 } }, dc: {}, region: {}, ts: 99 } });
    const hotOnly = await loadMarketBundle(env);
    expect(hotOnly!.phantom['7']).toEqual({ minNQ: 9 });
    expect(hotOnly!.ts).toBe(99);
  });

  it('returns null when neither blob is available', async () => {
    stubBlobs({ cold: null, hot: null });
    expect(await loadMarketBundle(env)).toBeNull();
  });

  it('survives a fetch that throws (network error) and returns null', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    expect(await loadMarketBundle(env)).toBeNull();
  });
});
