import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getCachedLeves,
  putCachedLeves,
  clearLeveCache,
  getLeveSnapshotUpdatedAt,
} from '../../lib/recipeCache';
import { fetchLeveSnapshot, type SnapshotLeve } from '../../lib/leveSnapshot';
import { loadStaticLevesSnapshot, loadSnapshotManifestBakedAt } from '../../lib/staticSnapshots';

const QUERY_KEY = ['leveSnapshot'] as const;

export function useLeveSnapshot() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  const query = useQuery<{ leves: SnapshotLeve[]; updatedAt: number | null }>({
    queryKey: QUERY_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const cached = await getCachedLeves();
      const ts = await getLeveSnapshotUpdatedAt();
      if (cached) {
        // Re-hydrate from the bundle when a newer bake has shipped; null
        // manifest/ts means "can't tell" → keep the cache (offline-safe).
        const bundleBakedAt = await loadSnapshotManifestBakedAt();
        if (bundleBakedAt == null || ts == null || bundleBakedAt <= ts) {
          return { leves: cached, updatedAt: ts ?? null };
        }
      }

      const bundled = await loadStaticLevesSnapshot();
      if (bundled) {
        await putCachedLeves(bundled.data, bundled.bakedAt);
        return { leves: bundled.data, updatedAt: bundled.bakedAt };
      }

      const fresh = await fetchLeveSnapshot({ onProgress: (n) => progressRef.current(n) });
      await putCachedLeves(fresh);
      return { leves: fresh, updatedAt: Date.now() };
    },
  });

  return { ...query, progress };
}

export function useRefreshLeveSnapshot() {
  const qc = useQueryClient();
  return async () => {
    await clearLeveCache();
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
}
