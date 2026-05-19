import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRecipes } from './useRecipes';
import {
  clearRecipeSnapshot,
  putCachedRecipeSnapshot,
} from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await clearRecipeSnapshot();
  // Mock static snapshot loader to return null so tests use mocked fetch instead.
  vi.spyOn(staticLoader, 'loadStaticRecipesSnapshot').mockResolvedValue(null);
});

describe('useRecipes (snapshot-backed)', () => {
  it('hydrates from cached snapshot without hitting network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await putCachedRecipeSnapshot([
      [49281, { itemResultId: 49281, classJob: 'LTW', recipeLevel: 100, ingredients: [] }],
    ]);

    const { result } = renderHook(() => useRecipes([49281]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(49281)?.itemResultId).toBe(49281);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null for ids not in the snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await putCachedRecipeSnapshot([
      [49281, { itemResultId: 49281, classJob: 'LTW', recipeLevel: 100, ingredients: [] }],
    ]);

    const { result } = renderHook(() => useRecipes([99999]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(99999)).toBeNull();
  });

  it('fetches the snapshot on cache miss', async () => {
    let pageCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      pageCount++;
      // First page returns one row; second page returns empty (end of sheet).
      if (pageCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            rows: [{
              row_id: 1,
              fields: {
                ItemResult: { value: 49281 },
                CraftType: { fields: { Name: 'Leatherworker' } },
                RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
                Ingredient0: { value: 1 }, AmountIngredient0: 2,
              },
            }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ rows: [] }) });
    }));

    const { result } = renderHook(() => useRecipes([49281]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(49281)?.itemResultId).toBe(49281);
    expect(pageCount).toBe(2); // one data page + one empty page (loop terminator)
  });
});
