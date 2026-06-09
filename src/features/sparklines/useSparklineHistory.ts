import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithinCached, dailyMedianBuckets } from '../../lib/universalisHistory';

const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;

async function fetchBatched(
  world: string,
  ids: number[],
): Promise<Map<number, (number | null)[]>> {
  // The cached fetcher chunks misses (100 at a time), rate-limits, persists, and
  // returns empty entries for any failed/absent id — so a miss degrades to a flat
  // sparkline exactly as before, but revisits now serve straight from IndexedDB.
  const entries = await fetchHistoryWithinCached(world, ids, SEVEN_DAYS_SEC);
  const result = new Map<number, (number | null)[]>();
  for (const id of ids) {
    result.set(id, dailyMedianBuckets(entries.get(id) ?? [], 7));
  }
  return result;
}

export function useSparklineHistory(
  itemIds: number[],
  world: string,
  enabled: boolean,
) {
  const sortedIds = [...itemIds].sort((a, b) => a - b);
  return useQuery<Map<number, (number | null)[]>>({
    queryKey: ['sparkline-history', world, sortedIds],
    enabled: enabled && itemIds.length > 0,
    staleTime: 60 * 60 * 1000, // 1 hour
    queryFn: () => fetchBatched(world, sortedIds),
  });
}
