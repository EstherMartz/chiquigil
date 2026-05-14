import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { useGatheringQuery } from './useGatheringQuery';
import { useSettingsStore, defaultSettings } from '../settings/store';
import { clearItemCache, putCachedItems, putCachedGatheringCatalog } from '../../lib/recipeCache';
import { _resetMarketCacheForTests } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';

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

  it('exposes skipped when a chunk fetch fails', async () => {
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

    await waitFor(() => expect(result.current.skipped).toBeGreaterThan(0));
    expect(result.current.rows).toEqual([]);
  });
});
