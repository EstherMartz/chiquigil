import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayStr, type LogEntry } from './plannerStats';
import { seedPlanner, newItemId, type LaneKey, type PlanItem } from './seedPlanner';

export interface PlannerState {
  _v: 1;
  goal: { current: number; target: number; startTs: number };
  log: LogEntry[];
  lanes: Record<LaneKey, PlanItem[]>;
  daily: { date: string; done: Record<string, boolean> };

  logGil: (amount: number, opts?: { itemId?: string; note?: string }) => void;
  recordSale: (lane: LaneKey, itemId: string) => void;
  reverseSale: (lane: LaneKey, itemId: string) => void;
  addItem: (lane: LaneKey, partial: Omit<PlanItem, 'id' | 'earned' | 'units' | 'active'>) => void;
  removeItem: (lane: LaneKey, itemId: string) => void;
  toggleActive: (lane: LaneKey, itemId: string) => void;
  setGoal: (patch: Partial<{ current: number; target: number }>) => void;
  toggleDaily: (taskId: string) => void;
  dailyResetIfStale: () => void;
  deleteLogEntry: (ts: number) => void;
  resetAll: () => void;
}

function defaultState(): Pick<PlannerState, '_v' | 'goal' | 'log' | 'lanes' | 'daily'> {
  const s = seedPlanner();
  return { _v: 1, ...s };
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      ...defaultState(),

      logGil: (amount, opts) => set((s) => {
        if (!amount) return s;
        const lanes = opts?.itemId ? structuredCloneLanes(s.lanes) : s.lanes;
        let note = opts?.note ?? 'Manual entry';
        if (opts?.itemId) {
          for (const lane of Object.keys(lanes) as LaneKey[]) {
            const it = lanes[lane].find((x) => x.id === opts.itemId);
            if (it) {
              it.earned += amount;
              it.units += 1;
              note = it.name;
              break;
            }
          }
        }
        return {
          lanes,
          goal: { ...s.goal, current: Math.max(0, s.goal.current + amount) },
          log: [...s.log, { ts: Date.now(), amount, note, itemId: opts?.itemId }],
        };
      }),

      recordSale: (lane, itemId) => set((s) => {
        const lanes = structuredCloneLanes(s.lanes);
        const it = lanes[lane].find((x) => x.id === itemId);
        if (!it) return s;
        it.units += 1;
        it.earned += it.price;
        return {
          lanes,
          goal: { ...s.goal, current: s.goal.current + it.price },
          log: [...s.log, { ts: Date.now(), amount: it.price, note: `${it.name} (sale)`, itemId }],
        };
      }),

      reverseSale: (lane, itemId) => set((s) => {
        const lanes = structuredCloneLanes(s.lanes);
        const it = lanes[lane].find((x) => x.id === itemId);
        if (!it || it.units <= 0) return s;
        // Find the most recent matching log entry
        let entryIdx = -1;
        for (let i = s.log.length - 1; i >= 0; i--) {
          if (s.log[i].itemId === itemId && s.log[i].amount > 0) {
            entryIdx = i;
            break;
          }
        }
        const amount = entryIdx >= 0 ? s.log[entryIdx].amount : it.price;
        it.units -= 1;
        it.earned = Math.max(0, it.earned - amount);
        const log = entryIdx >= 0
          ? [...s.log.slice(0, entryIdx), ...s.log.slice(entryIdx + 1)]
          : s.log;
        return {
          lanes,
          goal: { ...s.goal, current: Math.max(0, s.goal.current - amount) },
          log,
        };
      }),

      addItem: (lane, partial) => set((s) => ({
        lanes: {
          ...s.lanes,
          [lane]: [...s.lanes[lane], { ...partial, id: newItemId(), active: true, earned: 0, units: 0 }],
        },
      })),

      removeItem: (lane, itemId) => set((s) => ({
        lanes: { ...s.lanes, [lane]: s.lanes[lane].filter((x) => x.id !== itemId) },
      })),

      toggleActive: (lane, itemId) => set((s) => {
        const lanes = structuredCloneLanes(s.lanes);
        const it = lanes[lane].find((x) => x.id === itemId);
        if (it) it.active = !it.active;
        return { lanes };
      }),

      setGoal: (patch) => set((s) => ({
        goal: {
          ...s.goal,
          ...(patch.current != null ? { current: Math.max(0, patch.current) } : {}),
          ...(patch.target != null ? { target: Math.max(1, patch.target) } : {}),
        },
      })),

      toggleDaily: (taskId) => set((s) => {
        const done = { ...s.daily.done };
        if (done[taskId]) delete done[taskId];
        else done[taskId] = true;
        return { daily: { ...s.daily, done } };
      }),

      dailyResetIfStale: () => set((s) => {
        const today = todayStr();
        if (s.daily.date === today) return s;
        return { daily: { date: today, done: {} } };
      }),

      deleteLogEntry: (ts) => set((s) => {
        const entry = s.log.find((l) => l.ts === ts);
        if (!entry) return s;
        return {
          log: s.log.filter((l) => l.ts !== ts),
          goal: { ...s.goal, current: Math.max(0, s.goal.current - entry.amount) },
        };
      }),

      resetAll: () => set(() => defaultState()),
    }),
    {
      name: 'gilipichi-planner-v1',
      version: 1,
    },
  ),
);

function structuredCloneLanes(lanes: Record<LaneKey, PlanItem[]>): Record<LaneKey, PlanItem[]> {
  return {
    craft: lanes.craft.map((i) => ({ ...i })),
    gather: lanes.gather.map((i) => ({ ...i })),
    content: lanes.content.map((i) => ({ ...i })),
    passive: lanes.passive.map((i) => ({ ...i })),
  };
}
