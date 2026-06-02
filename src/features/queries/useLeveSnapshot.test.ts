import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useLeveSnapshot } from './useLeveSnapshot';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/leveSnapshot';
import type { SnapshotLeve } from '../../lib/leveSnapshot';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const sample: SnapshotLeve[] = [
  { id: 1, name: 'X', level: 50, type: 'doh', classJob: 8, city: 'Y', baseGil: 1, baseExp: 1, hqGilMultiplier: 2, targetItemId: null, targetItemQty: null },
];

afterEach(() => { vi.restoreAllMocks(); });

describe('useLeveSnapshot', () => {
  it('falls back to static bundle', async () => {
    vi.spyOn(cache, 'getCachedLeves').mockResolvedValue(undefined);
    vi.spyOn(cache, 'getLeveSnapshotUpdatedAt').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedLeves').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticLevesSnapshot').mockResolvedValue({ bakedAt: 777, data: sample });
    const live$ = vi.spyOn(live, 'fetchLeveSnapshot').mockResolvedValue([]);

    const { result } = renderHook(() => useLeveSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.leves).toEqual(sample);
    expect(result.current.data!.updatedAt).toBe(777);
    expect(put).toHaveBeenCalledWith(sample, 777);
    expect(live$).not.toHaveBeenCalled();
  });

  it('keeps the IDB cache when it is up to date with the bundle', async () => {
    vi.spyOn(cache, 'getCachedLeves').mockResolvedValue(sample);
    vi.spyOn(cache, 'getLeveSnapshotUpdatedAt').mockResolvedValue(123);
    vi.spyOn(staticLoader, 'loadSnapshotManifestBakedAt').mockResolvedValue(123);
    const static$ = vi.spyOn(staticLoader, 'loadStaticLevesSnapshot').mockResolvedValue(null);
    const live$ = vi.spyOn(live, 'fetchLeveSnapshot').mockResolvedValue([]);

    const { result } = renderHook(() => useLeveSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.leves).toEqual(sample);
    expect(result.current.data!.updatedAt).toBe(123);
    expect(static$).not.toHaveBeenCalled();
    expect(live$).not.toHaveBeenCalled();
  });

  it('re-hydrates from the static bundle when a newer bake has shipped', async () => {
    const fresh: SnapshotLeve[] = [
      ...sample,
      { id: 2, name: 'NEW', level: 90, type: 'doh', classJob: 8, city: 'Z', baseGil: 5, baseExp: 5, hqGilMultiplier: 2, targetItemId: null, targetItemQty: null },
    ];
    vi.spyOn(cache, 'getCachedLeves').mockResolvedValue(sample);
    vi.spyOn(cache, 'getLeveSnapshotUpdatedAt').mockResolvedValue(100);
    vi.spyOn(staticLoader, 'loadSnapshotManifestBakedAt').mockResolvedValue(999);
    const put = vi.spyOn(cache, 'putCachedLeves').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticLevesSnapshot').mockResolvedValue({ bakedAt: 999, data: fresh });
    const live$ = vi.spyOn(live, 'fetchLeveSnapshot').mockResolvedValue([]);

    const { result } = renderHook(() => useLeveSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.leves).toEqual(fresh);
    expect(result.current.data!.updatedAt).toBe(999);
    expect(put).toHaveBeenCalledWith(fresh, 999);
    expect(live$).not.toHaveBeenCalled();
  });

  it('keeps the cache when the manifest cannot be read (offline-safe)', async () => {
    vi.spyOn(cache, 'getCachedLeves').mockResolvedValue(sample);
    vi.spyOn(cache, 'getLeveSnapshotUpdatedAt').mockResolvedValue(123);
    vi.spyOn(staticLoader, 'loadSnapshotManifestBakedAt').mockResolvedValue(null);
    const static$ = vi.spyOn(staticLoader, 'loadStaticLevesSnapshot').mockResolvedValue(null);

    const { result } = renderHook(() => useLeveSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.leves).toEqual(sample);
    expect(static$).not.toHaveBeenCalled();
  });
});
