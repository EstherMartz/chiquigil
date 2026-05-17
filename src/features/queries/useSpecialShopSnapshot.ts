import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getCachedSpecialShop,
  putCachedSpecialShop,
  clearSpecialShopCache,
  getSpecialShopUpdatedAt,
} from '../../lib/recipeCache';
import { fetchSpecialShopSnapshot, type SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
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
      if (cached) return { snapshot: cached, updatedAt: ts ?? null };
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
