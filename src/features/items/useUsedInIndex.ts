import { useMemo } from 'react';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { buildUsedInIndex, type UsedInIndex } from './usedInIndex';
import type { Recipe } from '../../lib/recipes';

// Module-level cache so the reverse index isn't rebuilt for every consumer.
// Keyed by the snapshot Map reference (stable across React Query reads).
let cached: { source: Map<number, Recipe>; index: UsedInIndex } | null = null;

export function useUsedInIndex(): { data: UsedInIndex; isLoading: boolean; isError: boolean } {
  const recipes = useRecipeSnapshot();
  const index = useMemo<UsedInIndex>(() => {
    if (!recipes.data) return new Map();
    if (cached && cached.source === recipes.data) return cached.index;
    const built = buildUsedInIndex(recipes.data);
    cached = { source: recipes.data, index: built };
    return built;
  }, [recipes.data]);
  return { data: index, isLoading: recipes.isLoading, isError: recipes.isError };
}
