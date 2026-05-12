import { useMemo } from 'react';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import type { Recipe } from '../../lib/recipes';

/**
 * Returns Map<itemId, Recipe | null> for the given ids by consulting the
 * bulk recipe snapshot. After the snapshot loads once (~5-15s), every
 * subsequent call is a local Map.get with no network traffic.
 *
 * The return shape mimics a TanStack Query result so existing consumers
 * (which check .data / .isLoading / .isError) don't need rewiring.
 */
export function useRecipes(itemIds: number[]) {
  const snapshot = useRecipeSnapshot(itemIds.length > 0);
  const data = useMemo<Map<number, Recipe | null> | undefined>(() => {
    if (!snapshot.data) return undefined;
    const m = new Map<number, Recipe | null>();
    for (const id of itemIds) m.set(id, snapshot.data.get(id) ?? null);
    return m;
  }, [snapshot.data, itemIds]);
  return {
    data,
    isLoading: snapshot.isLoading,
    isFetching: snapshot.isFetching,
    isError: snapshot.isError,
    isSuccess: snapshot.isSuccess && data != null,
    error: snapshot.error,
    refetch: snapshot.refetch,
  };
}
