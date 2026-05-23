/**
 * Returns the merged "watchlist active items" set: items from enabled
 * starter packs UNION user-added custom items, minus any excluded ids.
 *
 * Replaces an identical useMemo block previously duplicated in
 * DcFlipView, BestDealsView, and Watchlist route.
 */
import { useMemo } from 'react';
import type { TrackedItem } from './types';
import { useWatchlistStore } from './watchlistStore';
import { allItemsFromEnabledPacks, type StarterPackToggles } from './starterPacks';

export function mergeWatchlistItems(
  toggles: StarterPackToggles,
  customItems: TrackedItem[],
  excludedItems: number[],
): TrackedItem[] {
  const fromPacks = allItemsFromEnabledPacks(toggles, new Set(excludedItems));
  const seen = new Set(fromPacks.map((i) => i.id));
  const excludedSet = new Set(excludedItems);
  return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id) && !excludedSet.has(i.id))];
}

export function useSelectedItems(): TrackedItem[] {
  const { starterPacks, customItems, excludedItems } = useWatchlistStore();
  return useMemo(
    () => mergeWatchlistItems(starterPacks, customItems, excludedItems),
    [starterPacks, customItems, excludedItems],
  );
}
