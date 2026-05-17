import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin, computeWeekDelta } from '../../lib/universalisHistory';

const FOURTEEN_DAYS_SEC = 14 * 24 * 60 * 60;

/**
 * Fetches recent sale history for all watchlist items in one bulk call and
 * computes the 7-day delta (% change in quantity-weighted average price) for
 * each. Returns a Map keyed by itemId. Delta is null when there isn't enough
 * data to compute (either week has no sales).
 */
export function useWatchlistHistory(ids: number[], scope: string) {
  const sortedIds = [...ids].sort((a, b) => a - b);
  return useQuery<Map<number, number | null>>({
    queryKey: ['watchlist-history', scope, sortedIds],
    enabled: ids.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const map = await fetchHistoryWithin(scope, sortedIds, FOURTEEN_DAYS_SEC);
      const out = new Map<number, number | null>();
      for (const id of sortedIds) {
        out.set(id, computeWeekDelta(map.get(id) ?? []));
      }
      return out;
    },
  });
}
