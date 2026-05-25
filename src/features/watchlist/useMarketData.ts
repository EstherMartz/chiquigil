import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMarketData, type MarketData } from '../../lib/universalis';

export interface MarketBundle {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;  // empty object when region arg is not supplied
}

export interface UseMarketDataOpts {
  enabled?: boolean;
  /** Fires as cache lookups complete. Kept for API compatibility. */
  onProgress?: (completed: number, total: number) => void;
}

export function useMarketData(
  ids: number[],
  world: string,
  dc: string,
  region?: string,
  opts: UseMarketDataOpts = {},
) {
  const sortedIds = [...ids].sort((a, b) => a - b);
  // Keep the callback in a ref so its identity doesn't churn the query key.
  const onProgressRef = useRef(opts.onProgress);
  onProgressRef.current = opts.onProgress;

  return useQuery<MarketBundle>({
    queryKey: ['market', world, dc, region ?? null, sortedIds],
    enabled: (opts.enabled ?? true) && ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Aggregate progress across the 3 scope fetches.
      const counts = [
        { done: 0, total: 0 },
        { done: 0, total: 0 },
        { done: 0, total: 0 },
      ];
      const onProgress = (idx: number) => (done: number, total: number) => {
        counts[idx] = { done, total };
        const cb = onProgressRef.current;
        if (!cb) return;
        let dSum = 0;
        let tSum = 0;
        for (const c of counts) { dSum += c.done; tSum += c.total; }
        cb(dSum, tSum);
      };
      const [phantom, dcRes, regionRes] = await Promise.all([
        fetchMarketData(world, sortedIds, { onProgress: onProgress(0) }),
        fetchMarketData(dc, sortedIds, { onProgress: onProgress(1) }),
        region
          ? fetchMarketData(region, sortedIds, { onProgress: onProgress(2) })
          : Promise.resolve({}),
      ]);
      return { phantom, dc: dcRes, region: regionRes };
    },
  });
}
