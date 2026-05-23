import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin, dailyMedianBuckets } from '../../lib/universalisHistory';

const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;
const CHUNK_SIZE = 100;

async function fetchBatched(
  world: string,
  ids: number[],
): Promise<Map<number, (number | null)[]>> {
  const result = new Map<number, (number | null)[]>();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    try {
      const entries = await fetchHistoryWithin(world, chunk, SEVEN_DAYS_SEC);
      for (const id of chunk) {
        result.set(id, dailyMedianBuckets(entries.get(id) ?? [], 7));
      }
    } catch {
      // Sparklines are non-critical — swallow errors, fill with empty
      for (const id of chunk) {
        result.set(id, [null, null, null, null, null, null, null]);
      }
    }
    // Rate-limit: 100ms between batches (skip delay for last/only batch)
    if (i + CHUNK_SIZE < ids.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
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
