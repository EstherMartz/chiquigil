import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getCachedVendorSnapshot,
  putCachedVendorSnapshot,
  clearVendorSnapshotCache,
  getVendorSnapshotUpdatedAt,
} from '../../lib/recipeCache';
import { fetchVendorSnapshot } from '../../lib/vendorShopSnapshot';

const QUERY_KEY = ['vendorSnapshot'] as const;

export function useVendorShopSnapshot() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  const query = useQuery<{ vendors: Map<number, number>; updatedAt: number | null }>({
    queryKey: QUERY_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const cached = await getCachedVendorSnapshot();
      const ts = await getVendorSnapshotUpdatedAt();
      if (cached) return { vendors: cached, updatedAt: ts ?? null };
      const fresh = await fetchVendorSnapshot({ onProgress: (n) => progressRef.current(n) });
      await putCachedVendorSnapshot(fresh);
      return { vendors: fresh, updatedAt: Date.now() };
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
