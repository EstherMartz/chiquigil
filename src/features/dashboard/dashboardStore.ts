import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Dashboard-local preferences. `dismissedPickIds` are items the user has waved
 * off the Top Pick banner ("got it / already in rotation") — they stay on the
 * watchlist and everywhere else, just stop being offered as the headline pick.
 */
export interface DashboardState {
  _v: 1;
  dismissedPickIds: number[];
  dismissPick: (id: number) => void;
  resetDismissedPicks: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      _v: 1,
      dismissedPickIds: [],
      dismissPick: (id) => set((s) => (
        s.dismissedPickIds.includes(id) ? s : { dismissedPickIds: [...s.dismissedPickIds, id] }
      )),
      resetDismissedPicks: () => set({ dismissedPickIds: [] }),
    }),
    { name: 'ffxiv-helper:dashboard' },
  ),
);
