import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useWhatsNewSnapshot } from '../queries/useWhatsNewSnapshot';
import { usePatchStatus } from './usePatchStatus';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { selectPatchMovers, type PatchMover } from './patchMovers';
import type { SnapshotItem } from '../../lib/itemSnapshot';

export interface UsePatchMoversResult {
  movers: PatchMover[];
  isLoading: boolean;
  isError: boolean;
  /** Whether a fetch is warranted (inside the patch window with items to check). */
  active: boolean;
}

export function usePatchMovers(): UsePatchMoversResult {
  const status = usePatchStatus();
  const { world, retainerLevels } = useSettingsStore();
  const itemSnap = useItemSnapshot();
  const recipeSnap = useRecipeSnapshot();
  const whatsNew = useWhatsNewSnapshot();

  const newItems = whatsNew.data?.newItems ?? [];
  const active = status.withinWindow(14) && newItems.length > 0;

  const marketQuery = useQuery<MarketData>({
    queryKey: ['patchMoversMarket', world, status.bakedAt],
    enabled: active,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const res = await fetchInBatches<MarketData[string]>(
        newItems,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return res.data;
    },
  });

  const itemsById = useMemo(() => {
    const m = new Map<number, SnapshotItem>();
    if (itemSnap.data) {
      for (const it of itemSnap.data.items) {
        m.set(it.id, it);
      }
    }
    return m;
  }, [itemSnap.data]);

  const movers = useMemo(() => {
    if (!marketQuery.data || !recipeSnap.data || !itemSnap.data) {
      return [];
    }
    return selectPatchMovers(newItems, itemsById, recipeSnap.data, retainerLevels, marketQuery.data);
  }, [marketQuery.data, recipeSnap.data, itemSnap.data, newItems, itemsById, retainerLevels]);

  return {
    movers,
    isLoading: active && marketQuery.isLoading,
    isError: marketQuery.isError,
    active,
  };
}
