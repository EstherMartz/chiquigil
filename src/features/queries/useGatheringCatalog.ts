import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buildGatheringCatalog, type GatheringCatalog } from '../../lib/gatheringCatalog';
import { getCachedGatheringCatalog, putCachedGatheringCatalog } from '../../lib/recipeCache';
import { loadStaticGatheringCatalog } from '../../lib/staticSnapshots';

async function resolve(setProgress: (msg: string) => void): Promise<GatheringCatalog> {
  const cached = await getCachedGatheringCatalog();
  if (cached) return new Map(cached);

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
