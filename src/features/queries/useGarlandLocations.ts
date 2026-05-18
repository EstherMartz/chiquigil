import { useQuery } from '@tanstack/react-query';
import { fetchGarlandLocations } from '../../lib/garlandLocations';

export function useGarlandLocations() {
  return useQuery<Map<number, string>>({
    queryKey: ['garland-locations'],
    staleTime: Infinity,
    retry: false,
    queryFn: fetchGarlandLocations,
  });
}
