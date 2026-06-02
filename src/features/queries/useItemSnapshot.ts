import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getAllCachedItems,
  putCachedItems,
  clearItemCache,
  getItemSnapshotUpdatedAt,
} from '../../lib/recipeCache';
import { fetchItemSnapshot, type SnapshotItem } from '../../lib/itemSnapshot';
import { loadStaticItemsSnapshot, loadSnapshotManifestBakedAt } from '../../lib/staticSnapshots';

const QUERY_KEY = ['itemSnapshot'] as const;

export function useItemSnapshot() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  const query = useQuery<{ items: SnapshotItem[]; updatedAt: number | null }>({
    queryKey: QUERY_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const cached = await getAllCachedItems();
      const ts = await getItemSnapshotUpdatedAt();
      if (cached) {
        // Re-hydrate from the static bundle when a newer bake has shipped — a
        // re-baked catalog (e.g. a game patch's new items) would otherwise stay
        // invisible behind the cache until a DB version bump. Only refresh when
        // we can confirm the bundle is strictly newer; null manifest/ts means
        // "can't tell" → keep the cache (offline-safe).
        const bundleBakedAt = await loadSnapshotManifestBakedAt();
        if (bundleBakedAt == null || ts == null || bundleBakedAt <= ts) {
          return { items: cached, updatedAt: ts ?? null };
        }
      }

      const bundled = await loadStaticItemsSnapshot();
      if (bundled) {
        await putCachedItems(bundled.data, bundled.bakedAt);
        return { items: bundled.data, updatedAt: bundled.bakedAt };
      }

      const fresh = await fetchItemSnapshot({ onProgress: (n) => progressRef.current(n) });
      await putCachedItems(fresh);
      return { items: fresh, updatedAt: Date.now() };
    },
  });

  return { ...query, progress };
}

export function useRefreshItemSnapshot() {
  const qc = useQueryClient();
  return async () => {
    await clearItemCache();
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
}
