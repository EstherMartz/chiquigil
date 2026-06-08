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
   * Cache-first, then live-fill the gaps. Reads the shared bulk-cache blob (instant), then
   * fetches ONLY the requested ids it's missing straight from Universalis, in small batches.
   * Use for small, user-specific id sets (watchlist, dashboard, a single item): the cron's
   * blob only carries the "traded" set, so a slowly-traded tracked item has no cached price —
   * this tops up just those without re-fetching the whole set (a large DC-scope live request
   * 504s on Universalis, which surfaces in the browser as a CORS error).
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
        // Cache-first: read whatever the cron blob already has (instant, every id present as a
        // real or empty placeholder), then live-fill ONLY the items it's missing. Small batches
        // because a DC-scope query aggregates every world — a large live request (a whole
        // watchlist on the DC) exceeds Universalis' ~10s gateway and 504s (browser sees CORS).
        // fetchMarketLive also warms the in-memory cache for next time.
        const [phantom, dcRes, regionRes] = await Promise.all([
          fetchMarketData(world, sortedIds),
          fetchMarketData(dc, sortedIds),
          region ? fetchMarketData(region, sortedIds) : Promise.resolve({} as MarketData),
        ]);
        const isMiss = (m: MarketData[string] | undefined) =>
          !m || (m.lastUploadTime === 0 && m.worldListings.length === 0 && m.minNQ == null);
        const missing = sortedIds.filter((id) => {
          const k = String(id);
          return isMiss(dcRes[k]) || isMiss(phantom[k]) || (region ? isMiss(regionRes[k]) : false);
        });
        if (missing.length) {
          const fill = async (scope: string, into: MarketData) => {
            const res = await fetchInBatches<MarketData[string]>(
              missing, (chunk) => fetchMarketLive(scope, chunk), { chunkSize: 8, concurrency: 3 },
            );
            Object.assign(into, res.data);
          };
          await Promise.all([
            fill(world, phantom),
            fill(dc, dcRes),
            region ? fill(region, regionRes) : Promise.resolve(),
          ]);
        }
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
