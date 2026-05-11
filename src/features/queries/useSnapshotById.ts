import { useMemo } from 'react';
import { useItemSnapshot } from './useItemSnapshot';
import type { SnapshotItem } from '../../lib/itemSnapshot';

/**
 * Returns a Map<id, SnapshotItem> built once from the cached item snapshot.
 * O(1) lookup for fields like ilvl that aren't carried on result row types.
 * Returns an empty Map until the snapshot resolves.
 */
export function useSnapshotById(): Map<number, SnapshotItem> {
  const snapshot = useItemSnapshot();
  return useMemo(() => {
    const m = new Map<number, SnapshotItem>();
    if (snapshot.data) {
      for (const item of snapshot.data.items) m.set(item.id, item);
    }
    return m;
  }, [snapshot.data]);
}
