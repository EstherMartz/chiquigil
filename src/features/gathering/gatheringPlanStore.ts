import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BudgetMode = 'time' | 'gil';

export interface GatheringPlanState {
  _v: 1;
  budgetMode: BudgetMode;
  budgetTimeMin: number;
  budgetGil: number;
  itemCount: number;
  maxLevel: number;
  includeTimed: boolean;
  listName: string;
  itemsPerMin: number;
  setBudgetMode: (m: BudgetMode) => void;
  setBudgetTimeMin: (n: number) => void;
  setBudgetGil: (n: number) => void;
  setItemCount: (n: number) => void;
  setMaxLevel: (n: number) => void;
  setIncludeTimed: (b: boolean) => void;
  setListName: (s: string) => void;
  setItemsPerMin: (n: number) => void;
}

type PlanData = Omit<
  GatheringPlanState,
  | 'setBudgetMode'
  | 'setBudgetTimeMin'
  | 'setBudgetGil'
  | 'setItemCount'
  | 'setMaxLevel'
  | 'setIncludeTimed'
  | 'setListName'
  | 'setItemsPerMin'
>;

export function defaultGatheringPlan(): PlanData {
  return {
    _v: 1,
    budgetMode: 'time',
    budgetTimeMin: 45,
    budgetGil: 500_000,
    itemCount: 3,
    maxLevel: 90,
    includeTimed: false,
    listName: 'AFK gather',
    itemsPerMin: 100,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const useGatheringPlanStore = create<GatheringPlanState>()(
  persist(
    (set) => ({
      ...defaultGatheringPlan(),
      setBudgetMode: (budgetMode) => set({ budgetMode }),
      setBudgetTimeMin: (budgetTimeMin) => set({ budgetTimeMin: Math.max(1, Math.floor(budgetTimeMin)) }),
      setBudgetGil: (budgetGil) => set({ budgetGil: Math.max(0, Math.floor(budgetGil)) }),
      setItemCount: (itemCount) => set({ itemCount: clamp(Math.floor(itemCount), 1, 10) }),
      setMaxLevel: (maxLevel) => set({ maxLevel: clamp(Math.floor(maxLevel), 1, 999) }),
      setIncludeTimed: (includeTimed) => set({ includeTimed }),
      setListName: (listName) => set({ listName }),
      setItemsPerMin: (itemsPerMin) => set({ itemsPerMin: Math.max(1, Math.floor(itemsPerMin)) }),
    }),
    {
      name: 'ffxiv-helper:gathering-plan',
      version: 1,
      migrate: (state, version) => {
        if (version < 1) return defaultGatheringPlan() as unknown as GatheringPlanState;
        return state as GatheringPlanState;
      },
    },
  ),
);
