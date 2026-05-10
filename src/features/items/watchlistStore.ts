import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrackedItem } from './types';
import { defaultStarterToggles, type StarterPackId, type StarterPackToggles } from './starterPacks';
import type { FlagMap } from '../profit/computeProfit';

export interface WatchlistState {
  _v: 1;
  starterPacks: StarterPackToggles;
  customItems: TrackedItem[];
  perItemFlags: FlagMap;
  excludedItems: number[];
  togglePack: (id: StarterPackId) => void;
  addCustomItem: (item: TrackedItem) => void;
  removeCustomItem: (id: number) => void;
  setCraftIntermediates: (itemId: number, value: boolean) => void;
  setCraftTime: (itemId: number, seconds: number | undefined) => void;
  toggleExcluded: (itemId: number) => void;
}

export function defaultWatchlist(): Pick<WatchlistState, '_v' | 'starterPacks' | 'customItems' | 'perItemFlags' | 'excludedItems'> {
  return { _v: 1, starterPacks: defaultStarterToggles(), customItems: [], perItemFlags: {}, excludedItems: [] };
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set) => ({
      ...defaultWatchlist(),
      togglePack: (id) => set((s) => ({ starterPacks: { ...s.starterPacks, [id]: !s.starterPacks[id] } })),
      addCustomItem: (item) => set((s) => (
        s.customItems.some((i) => i.id === item.id) ? s : { customItems: [...s.customItems, item] }
      )),
      removeCustomItem: (id) => set((s) => ({ customItems: s.customItems.filter((i) => i.id !== id) })),
      setCraftIntermediates: (itemId, value) => set((s) => ({
        perItemFlags: { ...s.perItemFlags, [itemId]: { ...s.perItemFlags[itemId], craftIntermediates: value } },
      })),
      setCraftTime: (itemId, seconds) => set((s) => {
        const next = { ...s.perItemFlags };
        const existing = next[itemId];
        if (seconds == null || seconds <= 0) {
          if (existing) {
            const { craftTimeSeconds: _drop, ...rest } = existing;
            next[itemId] = Object.keys(rest).length ? rest : undefined;
          }
        } else {
          next[itemId] = { ...existing, craftTimeSeconds: seconds };
        }
        return { perItemFlags: next };
      }),
      toggleExcluded: (itemId) => set((s) => ({
        excludedItems: s.excludedItems.includes(itemId)
          ? s.excludedItems.filter((id) => id !== itemId)
          : [...s.excludedItems, itemId],
      })),
    }),
    { name: 'ffxiv-helper:watchlist' },
  ),
);
