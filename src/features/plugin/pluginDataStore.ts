import { create } from 'zustand';
import type {
  Capability, WelcomeMessage, InventorySnapshotMessage, GilSnapshotMessage, ListingsSnapshotMessage,
} from './protocol';

/**
 * Live, *non-persisted* runtime data pushed by the plugin over the v2 link:
 * negotiated capabilities, the active character, and the latest inventory /
 * gil / listings snapshots. Cleared on disconnect.
 */
export interface PluginDataState {
  capabilities: Capability[];
  pluginVersion: string | null;
  character: WelcomeMessage['character'] | null;
  inventory: InventorySnapshotMessage | null;
  gil: GilSnapshotMessage | null;
  listings: ListingsSnapshotMessage | null;
  setHandshake: (m: WelcomeMessage) => void;
  setInventory: (m: InventorySnapshotMessage) => void;
  setGil: (m: GilSnapshotMessage) => void;
  setListings: (m: ListingsSnapshotMessage) => void;
  reset: () => void;
}

const EMPTY = {
  capabilities: [] as Capability[],
  pluginVersion: null,
  character: null,
  inventory: null,
  gil: null,
  listings: null,
};

export const usePluginDataStore = create<PluginDataState>((set) => ({
  ...EMPTY,
  setHandshake: (m) => set({ capabilities: m.capabilities, pluginVersion: m.pluginVersion, character: m.character }),
  setInventory: (m) => set({ inventory: m }),
  setGil: (m) => set({ gil: m }),
  setListings: (m) => set({ listings: m }),
  reset: () => set({ ...EMPTY }),
}));
