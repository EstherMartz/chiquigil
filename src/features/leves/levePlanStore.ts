import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LeveMode = 'gil' | 'exp';

export type LeveJobFilter =
  | 'all'
  | 'doh' | 'dol' | 'dow'
  | 'CRP' | 'BSM' | 'ARM' | 'GSM' | 'LTW' | 'WVR' | 'ALC' | 'CUL'
  | 'MIN' | 'BTN' | 'FSH'
  | 'GC';

export interface LevePlanState {
  _v: 1;
  mode: LeveMode;
  jobFilter: LeveJobFilter;
  maxLevel: number;
  setMode: (m: LeveMode) => void;
  setJobFilter: (j: LeveJobFilter) => void;
  setMaxLevel: (n: number) => void;
}

type PlanData = Omit<LevePlanState, 'setMode' | 'setJobFilter' | 'setMaxLevel'>;

export function defaultLevePlan(): PlanData {
  return {
    _v: 1,
    mode: 'gil',
    jobFilter: 'all',
    maxLevel: 100,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const useLevePlanStore = create<LevePlanState>()(
  persist(
    (set) => ({
      ...defaultLevePlan(),
      setMode: (mode) => set({ mode }),
      setJobFilter: (jobFilter) => set({ jobFilter }),
      setMaxLevel: (maxLevel) => set({ maxLevel: clamp(Math.floor(maxLevel), 1, 100) }),
    }),
    {
      name: 'ffxiv-helper:leve-plan',
      version: 1,
      migrate: (state, version) => {
        if (version < 1) return defaultLevePlan() as unknown as LevePlanState;
        return state as LevePlanState;
      },
    },
  ),
);
