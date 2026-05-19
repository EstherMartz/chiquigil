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
});
