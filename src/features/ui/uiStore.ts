import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SortKey = 'name' | 'crafter' | 'lvl' | 'phantom' | 'dc' | 'spd' | 'score';
export type SortDir = 'asc' | 'desc';

export interface UiState {
  _v: 1;
  catFilter: string;
  craftFilter: string;
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
  setCat: (c: string) => void;
  setCraft: (c: string) => void;
  setSearch: (q: string) => void;
  setSort: (k: SortKey) => void;
}

export function defaultUi(): Pick<UiState, '_v' | 'catFilter' | 'craftFilter' | 'search' | 'sortKey' | 'sortDir'> {
  return { _v: 1, catFilter: 'All', craftFilter: 'All', search: '', sortKey: 'score', sortDir: 'desc' };
}

const ASC_DEFAULT_KEYS: SortKey[] = ['name', 'crafter'];

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...defaultUi(),
      setCat: (catFilter) => set({ catFilter }),
      setCraft: (craftFilter) => set({ craftFilter }),
      setSearch: (search) => set({ search }),
      setSort: (k) => set((s) => {
        if (s.sortKey === k) {
          return { sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' };
        }
        return { sortKey: k, sortDir: ASC_DEFAULT_KEYS.includes(k) ? 'asc' : 'desc' };
      }),
    }),
    { name: 'ffxiv-helper:ui' },
  ),
);
