import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRecipeSnapshot, type RecipeMap } from '../../lib/recipeSnapshot';
import { getCachedRecipeSnapshot, putCachedRecipeSnapshot, getRecipeSnapshotUpdatedAt } from '../../lib/recipeCache';
import { loadStaticRecipesSnapshot, loadSnapshotManifestBakedAt } from '../../lib/staticSnapshots';

async function resolve(setProgress: (n: number) => void): Promise<RecipeMap> {
  const cached = await getCachedRecipeSnapshot();
  if (cached) {
    // Re-hydrate from the bundle when a newer bake has shipped; null
    // manifest/ts means "can't tell" → keep the cache (offline-safe).
    const ts = await getRecipeSnapshotUpdatedAt();
    const bundleBakedAt = await loadSnapshotManifestBakedAt();
    if (bundleBakedAt == null || ts == null || bundleBakedAt <= ts) return new Map(cached);
  }

  const bundled = await loadStaticRecipesSnapshot();
  if (bundled) {
    await putCachedRecipeSnapshot([...bundled.data.entries()], bundled.bakedAt);
    return bundled.data;
  }

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
