import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { useGatheringQuery } from './useGatheringQuery';
import { useSettingsStore, defaultSettings } from '../settings/store';
import { clearItemCache, putCachedItems, putCachedGatheringCatalog } from '../../lib/recipeCache';
import { _resetMarketCacheForTests } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';

vi.mock('../../lib/universalis', async () => {
  const actual = await vi.importActual<typeof import('../../lib/universalis')>('../../lib/universalis');
  return {
    ...actual,
    fetchMarketData: vi.fn(async (scope: string, ids: number[]) => {
      const url = actual.buildMarketUrl(scope, ids);
      try {
        const res = await fetch(url);
        if (!res.ok) return Object.fromEntries(ids.map(id => [String(id), { minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0, worldListings: [], averagePriceNQ: null, averagePriceHQ: null }]));
        return actual.parseMarketResponse(await res.json());
      } catch { return {}; }
    }),
  };
});

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  await clearItemCache();
  _resetMarketCacheForTests();
  vi.restoreAllMocks();
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const snapshotItems: SnapshotItem[] = [
  { id: 5544, name: 'Cobalt Ore',     sc: 1, ui: 1, ilvl: 1, canHq: false },
  { id: 5543, name: 'Rosewood Log',   sc: 1, ui: 1, ilvl: 1, canHq: false },
  { id: 9999, name: 'Not Gatherable', sc: 1, ui: 1, ilvl: 1, canHq: false },
];

describe('useGatheringQuery', () => {
  it('starts with rows empty and ready=false until snapshot + catalog resolve', async () => {
    // No seeded data → both queries will try to fetch and fail (no mock).
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const { result } = renderHook(() => useGatheringQuery(), { wrapper });
    expect(result.current.rows).toEqual([]);
    expect(result.current.ready).toBe(false);
    expect(result.current.isPending).toBe(false);
  });

  it('after run(), fetches market data and returns rows for catalog-known items only', async () => {
    // Seed both caches so snapshot + catalog resolve from IDB.
    await putCachedItems(snapshotItems);
    await putCachedGatheringCatalog([
      [5544, { level: 50, timed: false, hidden: false }],
      [5543, { level: 60, timed: false, hidden: false }],
      // 9999 not in catalog → filtered out of the candidate id list.
    ]);

    // Mock the Universalis bulk endpoint.
    const marketResponse = {
      items: {
        '5544': {
          listings: [{ hq: false, pricePerUnit: 100 }],
          recentHistory: Array.from({ length: 10 }, () => ({ hq: false, pricePerUnit: 100 })),
          regularSaleVelocity: 5,
          averagePriceNQ: 110,
        },
        '5543': {
          listings: [{ hq: false, pricePerUnit: 50 }],
          recentHistory: Array.from({ length: 10 }, () => ({ hq: false, pricePerUnit: 50 })),
          regularSaleVelocity: 4,
          averagePriceNQ: 55,
        },
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => marketResponse,
    }));

    const { result } = renderHook(() => useGatheringQuery(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      result.current.run();
    });

    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));

    const ids = result.current.rows.map((r) => r.id).sort();
    expect(ids).toEqual([5543, 5544]);
    expect(result.current.skipped).toBe(0);
  });

  it('completes with empty rows when all fetches fail (errors caught per-batch)', { timeout: 15000 }, async () => {
    await putCachedItems(snapshotItems);
    await putCachedGatheringCatalog([
      [5544, { level: 50, timed: false, hidden: false }],
    ]);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Universalis 504')));

    const { result } = renderHook(() => useGatheringQuery(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      result.current.run();
    });

    // fetchMarketData catches per-batch errors and returns empty placeholders,
    // so the mutation completes without skipped count (errors are handled internally).
    await waitFor(() => expect(result.current.isPending).toBe(false), { timeout: 10000 });
    expect(result.current.rows).toEqual([]);
  });
});
