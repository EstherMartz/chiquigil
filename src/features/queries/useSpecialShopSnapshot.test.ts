import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useSpecialShopSnapshot } from './useSpecialShopSnapshot';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/specialShopSnapshot';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('useSpecialShopSnapshot', () => {
  it('falls back to static bundle', async () => {
    const snap: SpecialShopSnapshot = {
      byCurrency: new Map([['poetics' as never, [{ itemId: 5, receiveQty: 1, costPerUnit: 100, isHq: false }]]]),
    };
    vi.spyOn(cache, 'getCachedSpecialShop').mockResolvedValue(undefined);
    vi.spyOn(cache, 'getSpecialShopUpdatedAt').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedSpecialShop').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticSpecialShopSnapshot').mockResolvedValue({ bakedAt: 444, data: snap });
    const live$ = vi.spyOn(live, 'fetchSpecialShopSnapshot').mockResolvedValue({ byCurrency: new Map() });

    const { result } = renderHook(() => useSpecialShopSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.snapshot.byCurrency.size).toBe(1);
    expect(result.current.data!.updatedAt).toBe(444);
    expect(put).toHaveBeenCalledWith(snap, 444);
    expect(live$).not.toHaveBeenCalled();
  });
});
