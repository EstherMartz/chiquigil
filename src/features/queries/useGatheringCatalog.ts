import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildGatheringCatalog, type GatheringCatalog } from '../../lib/gatheringCatalog';
import { getCachedGatheringCatalog, putCachedGatheringCatalog, getGatheringCatalogUpdatedAt } from '../../lib/recipeCache';
import { loadStaticGatheringCatalog, loadSnapshotManifestBakedAt } from '../../lib/staticSnapshots';

async function resolve(setProgress: (msg: string) => void): Promise<GatheringCatalog> {
  const cached = await getCachedGatheringCatalog();
  if (cached) {
    // Re-hydrate from the bundle when a newer bake has shipped; null
    // manifest/ts means "can't tell" → keep the cache (offline-safe).
    const ts = await getGatheringCatalogUpdatedAt();
    const bundleBakedAt = await loadSnapshotManifestBakedAt();
    if (bundleBakedAt == null || ts == null || bundleBakedAt <= ts) return new Map(cached);
  }

  const bundled = await loadStaticGatheringCatalog();
  if (bundled) {
    await putCachedGatheringCatalog([...bundled.data.entries()], bundled.bakedAt);
    return bundled.data;
  }

  const fresh = await buildGatheringCatalog({ onProgress: setProgress });
  await putCachedGatheringCatalog([...fresh.entries()]);
  return fresh;
}

export function useGatheringCatalog() {
  const [progress, setProgress] = useState<string>('');
  const query = useQuery<GatheringCatalog>({
    queryKey: ['gathering-catalog'],
    staleTime: Infinity,
    retry: false,
    queryFn: () => resolve(setProgress),
  });
  // Clear progress once the catalog resolves.
  useEffect(() => {
    if (query.data) setProgress('');
  }, [query.data]);
  return { ...query, progress };
}
