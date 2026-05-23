import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CrafterLevels } from '../items/craftStatus';

export type { CrafterLevels };

export interface SettingsState {
  _v: 1;
  world: string;
  dc: string;
  retainerLevels: CrafterLevels;
  overheadMinutes: number;
  batchCapDays: number;
  defaultCraftTimeSeconds: number;
  hideCrystals: boolean;
  showSparklines: boolean;
  setWorld: (w: string) => void;
  setDc: (d: string) => void;
  setRetainerLevel: (c: keyof CrafterLevels, lvl: number) => void;
  setOverheadMinutes: (n: number) => void;
  setBatchCapDays: (n: number) => void;
  setDefaultCraftTimeSeconds: (n: number) => void;
  setHideCrystals: (v: boolean) => void;
  setShowSparklines: (v: boolean) => void;
}

export function defaultSettings(): Pick<SettingsState, '_v' | 'world' | 'dc' | 'retainerLevels' | 'overheadMinutes' | 'batchCapDays' | 'defaultCraftTimeSeconds' | 'hideCrystals' | 'showSparklines'> {
  return {
    _v: 1,
    world: 'Phantom',
    dc: 'Chaos',
    retainerLevels: {
      CRP: 93, BSM: 33, ARM: 42, GSM: 83, LTW: 100, WVR: 100, ALC: 90, CUL: 100,
    },
    overheadMinutes: 5,
    batchCapDays: 3,
    defaultCraftTimeSeconds: 60,
    hideCrystals: true,
    showSparklines: true,
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings(),
      setWorld: (world) => set({ world }),
      setDc: (dc) => set({ dc }),
      setRetainerLevel: (c, lvl) => set((s) => ({ retainerLevels: { ...s.retainerLevels, [c]: lvl } })),
      setOverheadMinutes: (overheadMinutes) => set({ overheadMinutes }),
      setBatchCapDays: (batchCapDays) => set({ batchCapDays }),
      setDefaultCraftTimeSeconds: (defaultCraftTimeSeconds) => set({ defaultCraftTimeSeconds }),
      setHideCrystals: (hideCrystals) => set({ hideCrystals }),
      setShowSparklines: (showSparklines) => set({ showSparklines }),
    }),
    { name: 'ffxiv-helper:settings' },
  ),
);
