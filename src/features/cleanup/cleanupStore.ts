import { create } from 'zustand';
import type { InventoryEntry } from './types';

export interface ParsedInventory {
  entries: InventoryEntry[];
  unrecognized: InventoryEntry[];
}

export interface CleanupState {
  parsed: ParsedInventory | null;
  parseError: string | null;
  setParsed: (parsed: ParsedInventory) => void;
  setParseError: (msg: string | null) => void;
  clear: () => void;
}

// In-memory only — survives route changes but not page reload. The cleanup
// spec calls for "paste fresh each session" so we deliberately skip localStorage
// persistence; a day-old CSV in the box would be misleading.
export const useCleanupStore = create<CleanupState>((set) => ({
  parsed: null,
  parseError: null,
  setParsed: (parsed) => set({ parsed, parseError: null }),
  setParseError: (parseError) => set({ parseError, parsed: null }),
  clear: () => set({ parsed: null, parseError: null }),
}));
