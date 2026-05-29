import { useMemo } from 'react';
import { useLeveSnapshot } from '../queries/useLeveSnapshot';
import { buildLeveUsedInIndex, type LeveUsedInIndex } from '../../lib/leveUsedInIndex';
import type { SnapshotLeve } from '../../lib/leveSnapshot';

// Module-level cache so the reverse index isn't rebuilt for every consumer.
// Keyed by the snapshot array reference (stable across React Query reads).
// NOTE: useLeveSnapshot wraps the array as `data.leves`.
let cached: { source: SnapshotLeve[]; index: LeveUsedInIndex } | null = null;

export function useLeveUsedInIndex(): { data: LeveUsedInIndex; isLoading: boolean; isError: boolean } {
  const leves = useLeveSnapshot();
  const source = leves.data?.leves;
  const index = useMemo<LeveUsedInIndex>(() => {
    if (!source) return new Map();
    if (cached && cached.source === source) return cached.index;
    const built = buildLeveUsedInIndex(source);
    cached = { source, index: built };
    return built;
  }, [source]);
  return { data: index, isLoading: leves.isLoading, isError: leves.isError };
}
