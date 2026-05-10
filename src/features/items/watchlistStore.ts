import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrackedItem } from './types';
import { defaultStarterToggles, type StarterPackId, type StarterPackToggles } from './starterPacks';

export interface WatchlistState {
  _v: 1;
  starterPacks: StarterPackToggles;
  customItems: TrackedItem[];
  togglePack: (id: StarterPackId) => void;
  addCustomItem: (item: TrackedItem) => void;
  removeCustomItem: (id: number) => void;
}

export function defaultWatchlist(): Pick<WatchlistState, '_v' | 'starterPacks' | 'customItems'> {
  return { _v: 1, starterPacks: defaultStarterToggles(), customItems: [] };
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
    }),
    { name: 'ffxiv-helper:watchlist' },
  ),
);
