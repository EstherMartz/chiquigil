import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getCachedLeves,
  putCachedLeves,
  clearLeveCache,
  getLeveSnapshotUpdatedAt,
} from '../../lib/recipeCache';
import { fetchLeveSnapshot, type SnapshotLeve } from '../../lib/leveSnapshot';
import { loadStaticLevesSnapshot } from '../../lib/staticSnapshots';

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
      if (cached) return { leves: cached, updatedAt: ts ?? null };

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
