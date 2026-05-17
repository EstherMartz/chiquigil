import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SortKey = 'name' | 'crafter' | 'lvl' | 'phantom' | 'dc' | 'spd' | 'profit' | 'gilDay' | 'score' | 'trend';
export type SortDir = 'asc' | 'desc';
export type Density = 'compact' | 'comfortable';

export interface UiState {
  _v: 1;
  catFilter: string;
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
  density: Density;
  setCat: (c: string) => void;
  setSearch: (q: string) => void;
  setSort: (k: SortKey) => void;
  setDensity: (d: Density) => void;
}

export function defaultUi(): Pick<UiState, '_v' | 'catFilter' | 'search' | 'sortKey' | 'sortDir' | 'density'> {
  return { _v: 1, catFilter: 'All', search: '', sortKey: 'gilDay', sortDir: 'desc', density: 'comfortable' };
}

/** Vertical-padding class to apply to table cells based on the user's density preference. */
export function rowPadClass(density: Density): string {
  return density === 'compact' ? 'py-1.5' : 'py-2.5';
}

const ASC_DEFAULT_KEYS: SortKey[] = ['name', 'crafter'];

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...defaultUi(),
      setCat: (catFilter) => set({ catFilter }),
      setSearch: (search) => set({ search }),
      setDensity: (density) => set({ density }),
      setSort: (k) => set((s) => {
        if (s.sortKey === k) {
          return { sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' };
        }
        return { sortKey: k, sortDir: ASC_DEFAULT_KEYS.includes(k) ? 'asc' : 'desc' };
      }),
    }),
    {
      name: 'ffxiv-helper:ui',
      version: 3,
      migrate: (state, version) => {
        if (version < 2) return defaultUi();
        if (version < 3) return { ...(state as object), density: 'comfortable' as const } as UiState;
        return state as UiState;
      },
    },
  ),
);
