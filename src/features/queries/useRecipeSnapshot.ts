import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRecipeSnapshot, type RecipeMap } from '../../lib/recipeSnapshot';
import { getCachedRecipeSnapshot, putCachedRecipeSnapshot } from '../../lib/recipeCache';

async function resolve(setProgress: (n: number) => void): Promise<RecipeMap> {
  const cached = await getCachedRecipeSnapshot();
  if (cached) return new Map(cached);
  const fresh = await fetchRecipeSnapshot({ onProgress: setProgress });
  await putCachedRecipeSnapshot([...fresh.entries()]);
  return fresh;
}

export function useRecipeSnapshot(enabled = true) {
  const [progress, setProgress] = useState(0);
  const query = useQuery<RecipeMap>({
    queryKey: ['recipe-snapshot'],
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: () => resolve(setProgress),
  });
  useEffect(() => { if (query.data) setProgress(0); }, [query.data]);
  return { ...query, progress };
}
