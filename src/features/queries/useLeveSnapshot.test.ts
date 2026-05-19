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
});
