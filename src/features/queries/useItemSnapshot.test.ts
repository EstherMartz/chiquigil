import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useItemSnapshot } from './useItemSnapshot';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/itemSnapshot';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const sampleItems = [{ id: 1, name: 'A', sc: 1, ui: 1, ilvl: 1, canHq: false }];

afterEach(() => { vi.restoreAllMocks(); });

describe('useItemSnapshot', () => {
  it('prefers IDB cache when populated', async () => {
    vi.spyOn(cache, 'getAllCachedItems').mockResolvedValue(sampleItems);
    vi.spyOn(cache, 'getItemSnapshotUpdatedAt').mockResolvedValue(123);
    const live$ = vi.spyOn(live, 'fetchItemSnapshot').mockResolvedValue([]);
    const static$ = vi.spyOn(staticLoader, 'loadStaticItemsSnapshot').mockResolvedValue(null);

    const { result } = renderHook(() => useItemSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.items).toEqual(sampleItems);
    expect(live$).not.toHaveBeenCalled();
    expect(static$).not.toHaveBeenCalled();
  });

  it('falls back to static bundle when cache empty', async () => {
    vi.spyOn(cache, 'getAllCachedItems').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedItems').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticItemsSnapshot').mockResolvedValue({ bakedAt: 999, data: sampleItems });
    const live$ = vi.spyOn(live, 'fetchItemSnapshot').mockResolvedValue([]);

    const { result } = renderHook(() => useItemSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.items).toEqual(sampleItems);
    expect(result.current.data!.updatedAt).toBe(999);
    expect(put).toHaveBeenCalledWith(sampleItems, 999);
    expect(live$).not.toHaveBeenCalled();
  });

  it('falls back to live fetch when no cache or static bundle', async () => {
    vi.spyOn(cache, 'getAllCachedItems').mockResolvedValue(undefined);
    vi.spyOn(cache, 'putCachedItems').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticItemsSnapshot').mockResolvedValue(null);
    const live$ = vi.spyOn(live, 'fetchItemSnapshot').mockResolvedValue(sampleItems);

    const { result } = renderHook(() => useItemSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.items).toEqual(sampleItems);
    expect(live$).toHaveBeenCalled();
  });
});
