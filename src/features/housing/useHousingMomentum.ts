import { useEffect, useState } from 'react';
import { chunkIds } from '../../lib/universalisBulk';
import { fetchHistoryWithin } from '../../lib/universalisHistory';
import { idsToFetch, mergeDeltas } from './spikeSignal';

const FOURTEEN_DAYS_SECONDS = 14 * 86400;

/**
 * On-demand 7-day price momentum for housing rows. Given the ids currently
 * visible in the table, live-fetches their sale history (batched, home world)
 * and accumulates a `Map<id, number | null>` of 7-day deltas — `number` = delta%,
 * `null` = fetched but insufficient history, absent = still pending. The map
 * resets whenever `scanKey` (e.g. `world:tab`) changes.
 *
 * History is live-only (not in the bot cache); fetching just the visible window
 * keeps the per-page cost to ~one request.
 */
export function useHousingMomentum(
  world: string,
  scanKey: string,
  visibleIds: number[],
): Map<number, number | null> {
  const [cache, setCache] = useState<Map<number, number | null>>(() => new Map());

  // Reset the accumulated deltas when the scope/tab changes.
  useEffect(() => {
    setCache(new Map());
  }, [scanKey]);

  const signature = visibleIds.join(',');
  useEffect(() => {
    const missing = idsToFetch(visibleIds, cache);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const chunk of chunkIds(missing, 100)) {
        const history = await fetchHistoryWithin(world, chunk, FOURTEEN_DAYS_SECONDS);
        if (cancelled) return;
        setCache((prev) => mergeDeltas(prev, chunk, history, Date.now()));
      }
    })();
    return () => { cancelled = true; };
    // `cache` is intentionally excluded: re-running on every setCache would loop.
    // A changed `signature` (load-more / new rows) or `scanKey` re-triggers with
    // the latest cache from the render closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, world, scanKey]);

  return cache;
}
