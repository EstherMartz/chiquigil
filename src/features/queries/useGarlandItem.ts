import { useQuery } from '@tanstack/react-query';
import { fetchGarlandItem, type GarlandItem } from '../../lib/garlandData';

export function useGarlandItem(itemId: number | null) {
  return useQuery<GarlandItem | null>({
    queryKey: ['garland', itemId],
    enabled: itemId != null,
    staleTime: Infinity,
    retry: false,
    queryFn: () => fetchGarlandItem(itemId as number),
  });
}
