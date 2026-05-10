import { useQuery } from '@tanstack/react-query';
import { fetchHistoryFor, dailyBuckets, type DailyBucket } from '../../lib/universalisHistory';

export function useItemHistory(itemId: number | null, scope: string, lookbackDays = 30) {
  return useQuery<DailyBucket[]>({
    queryKey: ['history', scope, itemId, lookbackDays],
    enabled: itemId != null,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const map = await fetchHistoryFor(scope, [itemId!]);
      const entries = map.get(itemId!) ?? [];
      return dailyBuckets(entries, lookbackDays);
    },
  });
}
