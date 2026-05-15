import { useMutation } from '@tanstack/react-query';
import { useLeveSnapshot } from '../queries/useLeveSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useSettingsStore } from '../settings/store';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { useLevePlanStore } from './levePlanStore';
import { computeLevePlan, type LeveRow } from './computeLevePlan';

export interface UseLevePlanQueryResult {
  run: () => void;
  rows: LeveRow[];
  skipped: number;
  ready: boolean;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

interface RunResult {
  rows: LeveRow[];
  skipped: number;
}

export function useLevePlanQuery(): UseLevePlanQueryResult {
  const snapshot = useLeveSnapshot();
  const recipes = useRecipeSnapshot();
  const { world } = useSettingsStore();
  const { mode, jobFilter, maxLevel } = useLevePlanStore();

  const mutation = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Leve snapshot not ready');
      if (!recipes.data) throw new Error('Recipe snapshot not ready');

      const ingredientIds = new Set<number>();
      for (const leve of snapshot.data.leves) {
        if (leve.type !== 'doh' || leve.targetItemId == null) continue;
        const recipe = recipes.data.get(leve.targetItemId);
        if (!recipe) continue;
        for (const ing of recipe.ingredients) ingredientIds.add(ing.itemId);
      }

      const ids = [...ingredientIds];
      const result = await fetchInBatches<MarketData[string]>(
        ids,
        async (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 25, concurrency: 4 },
      );

      const plan = computeLevePlan(snapshot.data.leves, recipes.data, result.data,
        { mode, jobFilter, maxLevel });

      return { rows: plan.rows, skipped: result.errors.length };
    },
  });

  return {
    run: () => mutation.mutate(),
    rows: mutation.data?.rows ?? [],
    skipped: mutation.data?.skipped ?? 0,
    ready: snapshot.data != null && recipes.data != null,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error as Error | null,
  };
}
