import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRecipes } from './useRecipes';
import { clearRecipeCache } from '../../lib/recipeCache';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await clearRecipeCache();
});

describe('useRecipes', () => {
  it('returns a map keyed by item id with recipes from network on cache miss', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      calls++;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          results: [{
            fields: {
              ItemResult: { value: 49281 },
              CraftType: { fields: { Name: 'Leatherworker' } },
              RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
              Ingredient0: { value: 1 }, AmountIngredient0: 2,
            },
          }],
        }),
      });
    }));

    const { result } = renderHook(() => useRecipes([49281]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const recipe = result.current.data!.get(49281);
    expect(recipe?.itemResultId).toBe(49281);
    expect(recipe?.ingredients).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('skips network on cache hit', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { putCachedRecipe } = await import('../../lib/recipeCache');
    await putCachedRecipe(49281, {
      itemResultId: 49281, classJob: 'LTW', recipeLevel: 100, ingredients: [],
    });

    const { result } = renderHook(() => useRecipes([49281]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(49281)?.itemResultId).toBe(49281);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches null for items with no recipe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    }));

    const { result } = renderHook(() => useRecipes([99999]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(99999)).toBeNull();

    const { getCachedRecipe } = await import('../../lib/recipeCache');
    expect(await getCachedRecipe(99999)).toBeNull();
  });
});
