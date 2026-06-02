import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useGatheringCatalog } from './useGatheringCatalog';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/gatheringCatalog';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('useGatheringCatalog', () => {
  it('falls back to static bundle', async () => {
    const map = new Map([[1, { level: 50, timed: false, hidden: false }]]);
    vi.spyOn(cache, 'getCachedGatheringCatalog').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedGatheringCatalog').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticGatheringCatalog').mockResolvedValue({ bakedAt: 222, data: map });
    const live$ = vi.spyOn(live, 'buildGatheringCatalog').mockResolvedValue(new Map());

    const { result } = renderHook(() => useGatheringCatalog(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.get(1)?.level).toBe(50);
    expect(put).toHaveBeenCalledWith([[1, { level: 50, timed: false, hidden: false }]], 222);
    expect(live$).not.toHaveBeenCalled();
  });

  it('keeps the IDB cache when it is up to date with the bundle', async () => {
    const entries: Array<[number, { level: number; timed: boolean; hidden: boolean }]> = [[1, { level: 50, timed: false, hidden: false }]];
    vi.spyOn(cache, 'getCachedGatheringCatalog').mockResolvedValue(entries);
    vi.spyOn(cache, 'getGatheringCatalogUpdatedAt').mockResolvedValue(123);
    vi.spyOn(staticLoader, 'loadSnapshotManifestBakedAt').mockResolvedValue(123);
    const static$ = vi.spyOn(staticLoader, 'loadStaticGatheringCatalog').mockResolvedValue(null);
    const live$ = vi.spyOn(live, 'buildGatheringCatalog').mockResolvedValue(new Map());

    const { result } = renderHook(() => useGatheringCatalog(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.get(1)?.level).toBe(50);
    expect(static$).not.toHaveBeenCalled();
    expect(live$).not.toHaveBeenCalled();
  });

  it('re-hydrates from the static bundle when a newer bake has shipped', async () => {
    const stale: Array<[number, { level: number; timed: boolean; hidden: boolean }]> = [[1, { level: 50, timed: false, hidden: false }]];
    const fresh = new Map([[1, { level: 50, timed: false, hidden: false }], [2, { level: 90, timed: true, hidden: false }]]);
    vi.spyOn(cache, 'getCachedGatheringCatalog').mockResolvedValue(stale);
    vi.spyOn(cache, 'getGatheringCatalogUpdatedAt').mockResolvedValue(100);
    vi.spyOn(staticLoader, 'loadSnapshotManifestBakedAt').mockResolvedValue(999);
    const put = vi.spyOn(cache, 'putCachedGatheringCatalog').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticGatheringCatalog').mockResolvedValue({ bakedAt: 999, data: fresh });
    const live$ = vi.spyOn(live, 'buildGatheringCatalog').mockResolvedValue(new Map());

    const { result } = renderHook(() => useGatheringCatalog(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.get(2)?.level).toBe(90);
    expect(put).toHaveBeenCalledWith([...fresh.entries()], 999);
    expect(live$).not.toHaveBeenCalled();
  });

  it('keeps the cache when the manifest cannot be read (offline-safe)', async () => {
    const entries: Array<[number, { level: number; timed: boolean; hidden: boolean }]> = [[1, { level: 50, timed: false, hidden: false }]];
    vi.spyOn(cache, 'getCachedGatheringCatalog').mockResolvedValue(entries);
    vi.spyOn(cache, 'getGatheringCatalogUpdatedAt').mockResolvedValue(123);
    vi.spyOn(staticLoader, 'loadSnapshotManifestBakedAt').mockResolvedValue(null);
    const static$ = vi.spyOn(staticLoader, 'loadStaticGatheringCatalog').mockResolvedValue(null);

    const { result } = renderHook(() => useGatheringCatalog(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.get(1)?.level).toBe(50);
    expect(static$).not.toHaveBeenCalled();
  });
});
