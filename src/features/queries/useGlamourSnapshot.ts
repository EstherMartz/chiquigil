import { useQuery } from '@tanstack/react-query';
import { loadStaticGlamourRanking, type GlamourRankingData, type GlamourPeriod } from '../../lib/staticSnapshots';

const EMPTY: GlamourRankingData = { generatedAt: null, ranking: [] };

export function useGlamourSnapshot(period: GlamourPeriod = 'all') {
  return useQuery<GlamourRankingData>({
    queryKey: ['glamourSnapshot', period],
    staleTime: Infinity,
    queryFn: async () => (await loadStaticGlamourRanking(period)) ?? EMPTY,
  });
}
