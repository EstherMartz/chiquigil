import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getCachedQuests,
  putCachedQuests,
  clearQuestCache,
  getQuestSnapshotUpdatedAt,
} from '../../lib/recipeCache';
import { fetchQuestSnapshot, type SnapshotQuest } from '../../lib/questSnapshot';
import { loadStaticQuestSnapshot } from '../../lib/staticSnapshots';

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
      if (cached) return { snapshot: cached, updatedAt: ts ?? null };

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
