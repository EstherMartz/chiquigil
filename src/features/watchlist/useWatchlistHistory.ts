import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin, computeWeekDelta } from '../../lib/universalisHistory';
import { summarizeHistory, type HistorySummary } from '../fairvalue/fairValue';

const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

export interface ItemHistory {
  /** 7-day delta (% change in quantity-weighted average price), null if thin. */
  delta: number | null;
  /** Distribution stats over the 30-day window — the fair-value basis. */
  summary: HistorySummary;
}

/**
 * Fetches recent sale history for all watchlist items in one bulk call and
 * derives, per item, the 7-day delta AND a distribution summary (mean/stdev/
 * vwap/count) — both from the same fetch. The delta still compares the last two
 * 7-day windows; the summary spans 30 days for a more stable fair-value basis.
 * Returns a Map keyed by itemId.
 */
export function useWatchlistHistory(ids: number[], scope: string) {
  const sortedIds = [...ids].sort((a, b) => a - b);
  return useQuery<Map<number, ItemHistory>>({
    queryKey: ['watchlist-history', scope, sortedIds],
    enabled: ids.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const map = await fetchHistoryWithin(scope, sortedIds, THIRTY_DAYS_SEC);
      const out = new Map<number, ItemHistory>();
      for (const id of sortedIds) {
        const entries = map.get(id) ?? [];
        out.set(id, { delta: computeWeekDelta(entries), summary: summarizeHistory(entries) });
      }
      return out;
    },
  });
}
