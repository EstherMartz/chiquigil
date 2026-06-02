import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getCachedSpecialShop,
  putCachedSpecialShop,
  clearSpecialShopCache,
  getSpecialShopUpdatedAt,
} from '../../lib/recipeCache';
import { fetchSpecialShopSnapshot, type SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import { loadStaticSpecialShopSnapshot, loadSnapshotManifestBakedAt } from '../../lib/staticSnapshots';
import { currencyByItemId } from '../../lib/currencies';

const QUERY_KEY = ['specialShopSnapshot'] as const;

export function useSpecialShopSnapshot() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  const query = useQuery<{ snapshot: SpecialShopSnapshot; updatedAt: number | null }>({
    queryKey: QUERY_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const cached = await getCachedSpecialShop();
      const ts = await getSpecialShopUpdatedAt();
      if (cached) {
        // Re-hydrate from the bundle when a newer bake has shipped; null
        // manifest/ts means "can't tell" → keep the cache (offline-safe).
        const bundleBakedAt = await loadSnapshotManifestBakedAt();
        if (bundleBakedAt == null || ts == null || bundleBakedAt <= ts) {
          return { snapshot: cached, updatedAt: ts ?? null };
        }
      }

      const bundled = await loadStaticSpecialShopSnapshot();
      if (bundled) {
        await putCachedSpecialShop(bundled.data, bundled.bakedAt);
        return { snapshot: bundled.data, updatedAt: bundled.bakedAt };
      }

      const fresh = await fetchSpecialShopSnapshot(currencyByItemId, { onProgress: (n) => progressRef.current(n) });
      await putCachedSpecialShop(fresh);
      return { snapshot: fresh, updatedAt: Date.now() };
    },
  });

  return { ...query, progress };
}

export function useRefreshSpecialShopSnapshot() {
  const qc = useQueryClient();
  return async () => {
    await clearSpecialShopCache();
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
}
