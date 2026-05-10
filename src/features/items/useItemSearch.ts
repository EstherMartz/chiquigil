import { useQuery } from '@tanstack/react-query';
import { searchItems } from '../../lib/xivapi';

export function useItemSearch(query: string) {
  return useQuery({
    queryKey: ['xivapi-search', query],
    enabled: query.trim().length >= 2,
    staleTime: 60 * 1000,
    queryFn: () => searchItems(query),
  });
}
