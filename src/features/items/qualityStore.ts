import { create } from 'zustand';

interface QualityState {
  /** NQ (false) / HQ (true) preference, shared across the item-page market sections. */
  hq: boolean;
  setHq: (hq: boolean) => void;
}

/**
 * Shared NQ/HQ toggle state for the item page's market blocks (Supply Depth, Seller
 * Concentration, Stack Analyzer) so switching tier in one switches all. In-memory only —
 * resets to NQ on load.
 */
export const useQualityStore = create<QualityState>((set) => ({
  hq: false,
  setHq: (hq) => set({ hq }),
}));
