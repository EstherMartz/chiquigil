import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InventoryEntry } from './types';

export interface ParsedInventory {
  entries: InventoryEntry[];
  unrecognized: InventoryEntry[];
}

export interface CleanupState {
  _v: 1;
  parsed: ParsedInventory | null;
  parseError: string | null;
  setParsed: (parsed: ParsedInventory) => void;
  setParseError: (msg: string | null) => void;
  clear: () => void;
}

// Persists the parsed inventory to localStorage so it survives reloads. The
// market data behind it is independently cached in IDB (30-min TTL), so on
// reload the cleanup view rehydrates the inventory and re-fetches prices
// (usually instant from cache). User clicks Clear to forget.
//
// `parseError` is transient — never persisted — to avoid showing yesterday's
// failure on a fresh page load.
export const useCleanupStore = create<CleanupState>()(
  persist(
    (set) => ({
      _v: 1,
      parsed: null,
      parseError: null,
      setParsed: (parsed) => set({ parsed, parseError: null }),
      setParseError: (parseError) => set({ parseError, parsed: null }),
      clear: () => set({ parsed: null, parseError: null }),
    }),
    {
      name: 'ffxiv-helper:cleanup',
      partialize: (s) => ({ _v: s._v, parsed: s.parsed }),
    },
  ),
);
