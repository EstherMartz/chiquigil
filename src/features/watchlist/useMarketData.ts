import { useQuery } from '@tanstack/react-query';
import { fetchMarketData, type MarketData } from '../../lib/universalis';

export interface MarketBundle {
  phantom: MarketData;
  dc: MarketData;
}

export function useMarketData(ids: number[], world: string, dc: string) {
  const sortedIds = [...ids].sort((a, b) => a - b);
  return useQuery<MarketBundle>({
    queryKey: ['market', world, dc, sortedIds],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [phantom, dcRes] = await Promise.all([
        fetchMarketData(world, sortedIds),
        fetchMarketData(dc, sortedIds),
      ]);
      return { phantom, dc: dcRes };
    },
  });
}
