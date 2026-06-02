import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRecipeSnapshot, type RecipeMap } from '../../lib/recipeSnapshot';
import { getCachedRecipeSnapshot, putCachedRecipeSnapshot, getRecipeSnapshotUpdatedAt } from '../../lib/recipeCache';
import { loadStaticRecipesSnapshot, loadSnapshotManifestBakedAt } from '../../lib/staticSnapshots';

async function resolve(setProgress: (n: number) => void): Promise<RecipeMap> {
  const cached = await getCachedRecipeSnapshot();
  const ts = await getRecipeSnapshotUpdatedAt();
  if (cached) {
    // Re-hydrate from the static bundle when a newer bake has shipped — a
    // re-baked recipe set (e.g. a patch's new craftables) would otherwise stay
    // invisible behind the cache until a DB version bump, throwing off the
    // What's New "craftable" badge and New Recipes tab. Only refresh when we
    // can confirm the bundle is strictly newer; null manifest/ts means "can't
    // tell" → keep the cache (offline-safe).
    const bundleBakedAt = await loadSnapshotManifestBakedAt();
    if (bundleBakedAt == null || ts == null || bundleBakedAt <= ts) {
      return new Map(cached);
    }
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
