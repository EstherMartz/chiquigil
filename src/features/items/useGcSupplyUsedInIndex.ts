import { useMemo } from 'react';
import { useQuestSnapshot } from '../queries/useQuestSnapshot';
import { buildGcSupplyUsedInIndex, type GcSupplyUsedInIndex } from '../../lib/gcSupplyUsedInIndex';
import type { SnapshotQuest } from '../../lib/questSnapshot';

// Module-level cache so the reverse index isn't rebuilt for every consumer.
// Keyed by the snapshot array reference (stable across React Query reads).
// NOTE: useQuestSnapshot wraps the array as `data.snapshot`.
let cached: { source: SnapshotQuest[]; index: GcSupplyUsedInIndex } | null = null;

export function useGcSupplyUsedInIndex(): { data: GcSupplyUsedInIndex; isLoading: boolean; isError: boolean } {
  const quests = useQuestSnapshot();
  const source = quests.data?.snapshot;
  const index = useMemo<GcSupplyUsedInIndex>(() => {
    if (!source) return new Map();
    if (cached && cached.source === source) return cached.index;
    const built = buildGcSupplyUsedInIndex(source);
    cached = { source, index: built };
    return built;
  }, [source]);
  return { data: index, isLoading: quests.isLoading, isError: quests.isError };
}
