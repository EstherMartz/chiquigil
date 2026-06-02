import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getCachedVendorSnapshot,
  putCachedVendorSnapshot,
  clearVendorSnapshotCache,
  getVendorSnapshotUpdatedAt,
} from '../../lib/recipeCache';
import { fetchVendorSnapshot } from '../../lib/vendorShopSnapshot';
import { loadStaticVendorSnapshot, loadSnapshotManifestBakedAt } from '../../lib/staticSnapshots';

const QUERY_KEY = ['vendorSnapshot'] as const;

export function useVendorShopSnapshot() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  const query = useQuery<{ snapshot: Map<number, number>; updatedAt: number | null }>({
    queryKey: QUERY_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const cached = await getCachedVendorSnapshot();
      const ts = await getVendorSnapshotUpdatedAt();
      if (cached) {
        // Re-hydrate from the bundle when a newer bake has shipped; null
        // manifest/ts means "can't tell" → keep the cache (offline-safe).
        const bundleBakedAt = await loadSnapshotManifestBakedAt();
        if (bundleBakedAt == null || ts == null || bundleBakedAt <= ts) {
          return { snapshot: cached, updatedAt: ts ?? null };
        }
      }

      const bundled = await loadStaticVendorSnapshot();
      if (bundled) {
        await putCachedVendorSnapshot(bundled.data, bundled.bakedAt);
        return { snapshot: bundled.data, updatedAt: bundled.bakedAt };
      }

      const fresh = await fetchVendorSnapshot({ onProgress: (n) => progressRef.current(n) });
      await putCachedVendorSnapshot(fresh);
      return { snapshot: fresh, updatedAt: Date.now() };
    },
  });

  return { ...query, progress };
}

export function useRefreshVendorShopSnapshot() {
  const qc = useQueryClient();
  return async () => {
    await clearVendorSnapshotCache();
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
}
