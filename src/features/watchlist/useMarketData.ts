import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMarketData, fetchMarketLive, type MarketData } from '../../lib/universalis';
import { fetchInBatches } from '../../lib/universalisBulk';

export interface MarketBundle {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;  // empty object when region arg is not supplied
}

export interface UseMarketDataOpts {
  enabled?: boolean;
  /** Fires as cache lookups complete. Kept for API compatibility. */
  onProgress?: (completed: number, total: number) => void;
  /**
   * Fetch live from Universalis (batched 100/req) instead of reading the shared bulk-cache
   * blob. Use for small, user-specific id sets (watchlist, dashboard, a single item): the
   * cron's blob only carries the "traded" set (items that actually sell), so a slowly-traded
   * tracked item has no cached price — live keeps those views complete and fresh.
   */
  live?: boolean;
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
  const live = opts.live ?? false;

  return useQuery<MarketBundle>({
    queryKey: ['market', world, dc, region ?? null, live, sortedIds],
    enabled: (opts.enabled ?? true) && ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (live) {
        // Live, batched (100/req, concurrency 4). fetchMarketLive also merges each row
        // back into the in-memory cache, so later cache-only reads benefit too.
        const liveScope = async (scope: string): Promise<MarketData> =>
          (await fetchInBatches<MarketData[string]>(
            sortedIds,
            (chunk) => fetchMarketLive(scope, chunk),
            { chunkSize: 100, concurrency: 4 },
          )).data;
        const [phantom, dcRes, regionRes] = await Promise.all([
          liveScope(world),
          liveScope(dc),
          region ? liveScope(region) : Promise.resolve({} as MarketData),
        ]);
        return { phantom, dc: dcRes, region: regionRes };
      }

      // Cache-only (default). Aggregate progress across the 3 scope fetches.
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
