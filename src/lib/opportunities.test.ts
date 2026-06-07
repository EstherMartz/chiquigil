import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadOpportunities } from './opportunities';

beforeEach(() => vi.unstubAllGlobals());

describe('loadOpportunities', () => {
  it('returns the parsed feed on success', async () => {
    const file = { ts: 42, opportunities: [{ itemId: 5, kind: 'crash', world: 'Moogle', oldValue: 1000, newValue: 800, changePct: -20, velocity: 1, gilPerDay: 800, detectedAt: 42 }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => file }));
    const out = await loadOpportunities();
    expect(out.ts).toBe(42);
    expect(out.opportunities).toHaveLength(1);
  });

  it('returns an empty feed on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await loadOpportunities()).toEqual({ ts: 0, opportunities: [] });
  });

  it('returns an empty feed on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await loadOpportunities()).toEqual({ ts: 0, opportunities: [] });
  });
});
