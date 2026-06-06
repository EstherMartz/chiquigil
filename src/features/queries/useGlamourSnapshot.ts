import { useQuery } from '@tanstack/react-query';
import { loadStaticGlamourRanking, type GlamourRankingData } from '../../lib/staticSnapshots';

const EMPTY: GlamourRankingData = { generatedAt: null, ranking: [] };

export function useGlamourSnapshot() {
  return useQuery<GlamourRankingData>({
    queryKey: ['glamourSnapshot'],
    staleTime: Infinity,
    queryFn: async () => (await loadStaticGlamourRanking()) ?? EMPTY,
  });
}
