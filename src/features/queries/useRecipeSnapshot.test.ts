import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useRecipeSnapshot } from './useRecipeSnapshot';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/recipeSnapshot';
import type { Recipe } from '../../lib/recipes';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const sample: Array<[number, Recipe]> = [[1, { itemResultId: 1 } as Recipe]];

afterEach(() => { vi.restoreAllMocks(); });

describe('useRecipeSnapshot', () => {
  it('falls back to static bundle when IDB cache empty', async () => {
    vi.spyOn(cache, 'getCachedRecipeSnapshot').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedRecipeSnapshot').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticRecipesSnapshot').mockResolvedValue({ bakedAt: 555, data: new Map(sample) });
    const live$ = vi.spyOn(live, 'fetchRecipeSnapshot').mockResolvedValue(new Map());

    const { result } = renderHook(() => useRecipeSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect([...result.current.data!.entries()]).toEqual(sample);
    expect(put).toHaveBeenCalledWith(sample, 555);
    expect(live$).not.toHaveBeenCalled();
  });
});
