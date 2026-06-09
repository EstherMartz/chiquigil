import { useMutation } from '@tanstack/react-query';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { useSettingsStore } from '../settings/store';
import { runQuery } from '../queries/runQuery';
import { isItemHidden } from '../queries/commonFilters';
import { useIgnoredItemSet } from '../settings/useIgnoredItems';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import type { QueryFilter, QueryResultRow } from '../queries/types';

// Baked-in filter for the standalone planner: gatherable items only, NQ
// preference, home server, sort by gil/day. The planner UI does not expose
// these knobs — see docs/superpowers/specs/2026-05-14-gathering-planner-standalone-design.md.
const DEFAULT_GATHERING_FILTER: QueryFilter = {
  searchCategories: [],
  hq: 'either',
  minDealPct: 0,
  minVelocity: 0,
  minPrice: null,
  maxPrice: null,
  sort: 'gilFlow',
  limit: 100,
  scope: 'home',
  maxListings: null,
  mode: 'standard',
  minGap: null,
  trainedEye: false,
};

interface RunResult {
  rows: QueryResultRow[];
  skipped: number;
}

export interface UseGatheringQueryResult {
  run: () => void;
  rows: QueryResultRow[];
  skipped: number;
  ready: boolean;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

export function useGatheringQuery(): UseGatheringQueryResult {
  const snapshot = useItemSnapshot();
  const catalog = useGatheringCatalog();
  const { world, hideCrystals } = useSettingsStore();
  const hideIgnored = useSettingsStore((s) => s.hideIgnored);
  const ignored = useIgnoredItemSet();

  const mutation = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      if (!catalog.data) throw new Error('Gathering catalog not ready');
      const ids: number[] = [];
      for (const item of snapshot.data.items) {
        if (isItemHidden(item, { hideCrystals, hideIgnored, ignored })) continue;
        if (catalog.data.has(item.id)) ids.push(item.id);
      }
      const result = await fetchInBatches<MarketData[string]>(
        ids,
        async (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 25, concurrency: 4 },
      );
      const rows = runQuery(snapshot.data.items, result.data, DEFAULT_GATHERING_FILTER);
      return { rows, skipped: result.errors.length };
    },
  });

  return {
    run: () => mutation.mutate(),
    rows: mutation.data?.rows ?? [],
    skipped: mutation.data?.skipped ?? 0,
    ready: snapshot.data != null && catalog.data != null,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error as Error | null,
  };
}
