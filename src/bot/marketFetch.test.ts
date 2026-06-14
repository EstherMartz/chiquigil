import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchMarketForOutputs } from './marketFetch';

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchMarketForOutputs / fetchBatch resilience', () => {
  it('returns empty data (no throw) when Universalis responds 200 with a non-JSON body', async () => {
    // The rate-limit / Cloudflare page: ok:true but body is HTML, so res.json() throws.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
    }));
    const bundle = await fetchMarketForOutputs([1, 2, 3], 'Phantom', 'Chaos', 'Europe');
    expect(bundle).toEqual({ phantom: {}, dc: {}, region: {} });
  });

  it('returns empty data when Universalis responds non-OK (after retry)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    const bundle = await fetchMarketForOutputs([1], 'Phantom', 'Chaos', 'Europe');
    expect(bundle).toEqual({ phantom: {}, dc: {}, region: {} });
  });
});
