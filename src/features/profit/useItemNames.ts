import { useQuery } from '@tanstack/react-query';
import { fetchItemNames } from '../../lib/itemNames';
import { getCachedName, putCachedName } from '../../lib/recipeCache';

async function resolveNames(ids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const missing: number[] = [];
  for (const id of ids) {
    const cached = await getCachedName(id);
    if (cached !== undefined) {
      result.set(id, cached);
    } else {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    const fresh = await fetchItemNames(missing);
    for (const [id, name] of fresh) {
      result.set(id, name);
      await putCachedName(id, name);
    }
  }
  return result;
}

export function useItemNames(itemIds: number[]) {
  const sorted = [...new Set(itemIds)].sort((a, b) => a - b);
  return useQuery<Map<number, string>>({
    queryKey: ['item-names', sorted],
    enabled: sorted.length > 0,
    staleTime: Infinity,
    queryFn: () => resolveNames(sorted),
  });
}
