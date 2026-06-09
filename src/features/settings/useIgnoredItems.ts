import { useMemo } from 'react';
import { useSettingsStore } from './store';

/** Memoized Set of ignored item IDs for O(1) membership tests in filters. */
export function useIgnoredItemSet(): ReadonlySet<number> {
  const ids = useSettingsStore((s) => s.ignoredItemIds);
  return useMemo(() => new Set(ids), [ids]);
}
