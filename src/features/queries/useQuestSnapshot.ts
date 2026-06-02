import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getCachedQuests,
  putCachedQuests,
  clearQuestCache,
  getQuestSnapshotUpdatedAt,
} from '../../lib/recipeCache';
import { fetchQuestSnapshot, type SnapshotQuest } from '../../lib/questSnapshot';
import { loadStaticQuestSnapshot, loadSnapshotManifestBakedAt } from '../../lib/staticSnapshots';

const QUERY_KEY = ['questSnapshot'] as const;

export function useQuestSnapshot() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  const query = useQuery<{ snapshot: SnapshotQuest[]; updatedAt: number | null }>({
    queryKey: QUERY_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const cached = await getCachedQuests();
      const ts = await getQuestSnapshotUpdatedAt();
      if (cached) {
        // Re-hydrate from the bundle when a newer bake has shipped; null
        // manifest/ts means "can't tell" → keep the cache (offline-safe).
        const bundleBakedAt = await loadSnapshotManifestBakedAt();
        if (bundleBakedAt == null || ts == null || bundleBakedAt <= ts) {
          return { snapshot: cached, updatedAt: ts ?? null };
        }
      }

      const bundled = await loadStaticQuestSnapshot();
      if (bundled) {
        await putCachedQuests(bundled.data, bundled.bakedAt);
        return { snapshot: bundled.data, updatedAt: bundled.bakedAt };
      }

      const fresh = await fetchQuestSnapshot({ onProgress: (n) => progressRef.current(n) });
      await putCachedQuests(fresh);
      return { snapshot: fresh, updatedAt: Date.now() };
    },
  });

  return { ...query, progress };
}

export function useRefreshQuestSnapshot() {
  const qc = useQueryClient();
  return async () => {
    await clearQuestCache();
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
}
