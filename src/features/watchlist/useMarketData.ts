import { useQuery } from '@tanstack/react-query';
import { fetchMarketData, type MarketData } from '../../lib/universalis';

export interface MarketBundle {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;  // empty object when region arg is not supplied
}

export function useMarketData(
  ids: number[],
  world: string,
  dc: string,
  region?: string,
) {
  const sortedIds = [...ids].sort((a, b) => a - b);
  return useQuery<MarketBundle>({
    queryKey: ['market', world, dc, region ?? null, sortedIds],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [phantom, dcRes, regionRes] = await Promise.all([
        fetchMarketData(world, sortedIds),
        fetchMarketData(dc, sortedIds),
        region ? fetchMarketData(region, sortedIds) : Promise.resolve({}),
      ]);
      return { phantom, dc: dcRes, region: regionRes };
    },
  });
}
