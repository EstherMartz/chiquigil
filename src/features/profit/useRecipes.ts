import { useQuery } from '@tanstack/react-query';
import { fetchRecipeForItem, type Recipe } from '../../lib/recipes';
import { getCachedRecipe, putCachedRecipe } from '../../lib/recipeCache';

async function resolveRecipe(itemId: number): Promise<Recipe | null> {
  const cached = await getCachedRecipe(itemId);
  if (cached !== undefined) return cached;
  const fresh = await fetchRecipeForItem(itemId);
  await putCachedRecipe(itemId, fresh);
  return fresh;
}

export function useRecipes(itemIds: number[]) {
  const sorted = [...new Set(itemIds)].sort((a, b) => a - b);
  return useQuery<Map<number, Recipe | null>>({
    queryKey: ['recipes', sorted],
    enabled: sorted.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const entries = await Promise.all(
        sorted.map(async (id) => [id, await resolveRecipe(id)] as const),
      );
      return new Map(entries);
    },
  });
}
