import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useVendorShopSnapshot } from './useVendorShopSnapshot';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/vendorShopSnapshot';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('useVendorShopSnapshot', () => {
  it('falls back to static bundle', async () => {
    const map = new Map([[10, 99]]);
    vi.spyOn(cache, 'getCachedVendorSnapshot').mockResolvedValue(undefined);
    vi.spyOn(cache, 'getVendorSnapshotUpdatedAt').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedVendorSnapshot').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticVendorSnapshot').mockResolvedValue({ bakedAt: 888, data: map });
    const live$ = vi.spyOn(live, 'fetchVendorSnapshot').mockResolvedValue(new Map());

    const { result } = renderHook(() => useVendorShopSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.snapshot.get(10)).toBe(99);
    expect(result.current.data!.updatedAt).toBe(888);
    expect(put).toHaveBeenCalledWith(map, 888);
    expect(live$).not.toHaveBeenCalled();
  });

  it('keeps the IDB cache when it is up to date with the bundle', async () => {
    const map = new Map([[10, 99]]);
    vi.spyOn(cache, 'getCachedVendorSnapshot').mockResolvedValue(map);
    vi.spyOn(cache, 'getVendorSnapshotUpdatedAt').mockResolvedValue(123);
    vi.spyOn(staticLoader, 'loadSnapshotManifestBakedAt').mockResolvedValue(123);
    const static$ = vi.spyOn(staticLoader, 'loadStaticVendorSnapshot').mockResolvedValue(null);
    const live$ = vi.spyOn(live, 'fetchVendorSnapshot').mockResolvedValue(new Map());

    const { result } = renderHook(() => useVendorShopSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.snapshot.get(10)).toBe(99);
    expect(result.current.data!.updatedAt).toBe(123);
    expect(static$).not.toHaveBeenCalled();
    expect(live$).not.toHaveBeenCalled();
  });

  it('re-hydrates from the static bundle when a newer bake has shipped', async () => {
    const stale = new Map([[10, 99]]);
    const fresh = new Map([[10, 99], [20, 42]]);
    vi.spyOn(cache, 'getCachedVendorSnapshot').mockResolvedValue(stale);
    vi.spyOn(cache, 'getVendorSnapshotUpdatedAt').mockResolvedValue(100);
    vi.spyOn(staticLoader, 'loadSnapshotManifestBakedAt').mockResolvedValue(999);
    const put = vi.spyOn(cache, 'putCachedVendorSnapshot').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticVendorSnapshot').mockResolvedValue({ bakedAt: 999, data: fresh });
    const live$ = vi.spyOn(live, 'fetchVendorSnapshot').mockResolvedValue(new Map());

    const { result } = renderHook(() => useVendorShopSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.snapshot.get(20)).toBe(42);
    expect(result.current.data!.updatedAt).toBe(999);
    expect(put).toHaveBeenCalledWith(fresh, 999);
    expect(live$).not.toHaveBeenCalled();
  });

  it('keeps the cache when the manifest cannot be read (offline-safe)', async () => {
    const map = new Map([[10, 99]]);
    vi.spyOn(cache, 'getCachedVendorSnapshot').mockResolvedValue(map);
    vi.spyOn(cache, 'getVendorSnapshotUpdatedAt').mockResolvedValue(123);
    vi.spyOn(staticLoader, 'loadSnapshotManifestBakedAt').mockResolvedValue(null);
    const static$ = vi.spyOn(staticLoader, 'loadStaticVendorSnapshot').mockResolvedValue(null);

    const { result } = renderHook(() => useVendorShopSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.snapshot.get(10)).toBe(99);
    expect(static$).not.toHaveBeenCalled();
  });
});
