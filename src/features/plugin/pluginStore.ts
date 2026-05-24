import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PluginConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'closed'
  | 'error';

export interface PluginState {
  _v: 1;
  enabled: boolean;
  url: string;
  token: string;
  autoApplySnapshots: boolean;
  status: PluginConnectionStatus;
  lastSnapshotAt: number | null;
  lastError: string | null;
  setEnabled: (v: boolean) => void;
  setUrl: (v: string) => void;
  setToken: (v: string) => void;
  setAutoApplySnapshots: (v: boolean) => void;
  setRuntime: (r: Partial<Pick<PluginState, 'status' | 'lastSnapshotAt' | 'lastError'>>) => void;
}

export const DEFAULT_PLUGIN_URL = 'ws://127.0.0.1:7331/sync';

export const usePluginStore = create<PluginState>()(
  persist(
    (set) => ({
      _v: 1,
      enabled: false,
      url: DEFAULT_PLUGIN_URL,
      token: '',
      autoApplySnapshots: true,
      status: 'idle',
      lastSnapshotAt: null,
      lastError: null,
      setEnabled: (enabled) => set({ enabled }),
      setUrl: (url) => set({ url }),
      setToken: (token) => set({ token }),
      setAutoApplySnapshots: (autoApplySnapshots) => set({ autoApplySnapshots }),
      setRuntime: (r) => set(r),
    }),
    {
      name: 'ffxiv-helper:plugin',
      partialize: (s) => ({
        _v: s._v,
        enabled: s.enabled,
        url: s.url,
        token: s.token,
        autoApplySnapshots: s.autoApplySnapshots,
      }),
    },
  ),
);
