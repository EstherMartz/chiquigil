import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayStr, type LogEntry } from './plannerStats';
import { seedPlanner, newItemId, LANE_ORDER, type LaneKey, type PlanItem } from './seedPlanner';
import { dedupKey, matchSalesToPlan, type ParsedSale } from './parseSalesCsv';

export interface PlannerState {
  _v: 1;
  goal: { current: number; target: number; startTs: number };
  log: LogEntry[];
  lanes: Record<LaneKey, PlanItem[]>;
  daily: { date: string; done: Record<string, boolean> };
  importedSaleKeys: string[];
  lastImportBatchId: string | null;

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
  importCsv: (sales: ParsedSale[]) => { imported: number; matched: number; skipped: number };
  rollbackLastImport: () => number;
  resetAll: () => void;
}

function defaultState(): Pick<PlannerState, '_v' | 'goal' | 'log' | 'lanes' | 'daily' | 'importedSaleKeys' | 'lastImportBatchId'> {
  const s = seedPlanner();
  return { _v: 1, ...s, importedSaleKeys: [], lastImportBatchId: null };
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set, get) => ({
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

      importCsv: (sales) => {
        const state = get();
        const batchId = 'b' + Date.now().toString(36);
        const existingKeys = new Set(state.importedSaleKeys);
        const batchKeys = new Set<string>();
        const allPlanItems = LANE_ORDER.flatMap((lane) => state.lanes[lane]);
        const matched = matchSalesToPlan(sales, allPlanItems);

        let importedCount = 0;
        let matchedCount = 0;
        let skippedCount = 0;
        const newLogEntries: LogEntry[] = [];
        const newKeys: string[] = [];
        const itemIncrements = new Map<string, { units: number; earned: number }>();
        let treasuryDelta = 0;

        for (const sale of matched) {
          const key = dedupKey(sale);
          if (existingKeys.has(key) || batchKeys.has(key)) {
            skippedCount++;
            continue;
          }
          batchKeys.add(key);
          const total = sale.quantity * sale.unitPrice;
          treasuryDelta += total;
          importedCount++;

          if (sale.matchedItemId) {
            matchedCount++;
            const prev = itemIncrements.get(sale.matchedItemId) ?? { units: 0, earned: 0 };
            prev.units += sale.quantity;
            prev.earned += total;
            itemIncrements.set(sale.matchedItemId, prev);
          }

          newLogEntries.push({
            ts: sale.soldAt,
            amount: total,
            note: sale.matchedItemId ? `${sale.name} (csv)` : sale.name,
            itemId: sale.matchedItemId,
            retainer: sale.retainer,
            source: 'csv-import',
            csvName: sale.matchedItemId ? undefined : sale.name,
            batchId,
            qty: sale.quantity,
          });
          newKeys.push(key);
        }

        if (importedCount === 0) return { imported: 0, matched: 0, skipped: skippedCount };

        set((s) => {
          const lanes = structuredCloneLanes(s.lanes);
          for (const [itemId, inc] of itemIncrements) {
            for (const lane of LANE_ORDER) {
              const it = lanes[lane].find((x) => x.id === itemId);
              if (it) {
                it.units += inc.units;
                it.earned += inc.earned;
                break;
              }
            }
          }
          return {
            lanes,
            goal: { ...s.goal, current: s.goal.current + treasuryDelta },
            log: [...s.log, ...newLogEntries],
            importedSaleKeys: [...s.importedSaleKeys, ...newKeys],
            lastImportBatchId: batchId,
          };
        });

        return { imported: importedCount, matched: matchedCount, skipped: skippedCount };
      },

      rollbackLastImport: () => {
        const state = get();
        if (!state.lastImportBatchId) return 0;
        const bid = state.lastImportBatchId;
        const batchEntries = state.log.filter((l) => l.batchId === bid);
        if (batchEntries.length === 0) return 0;

        const itemDecrements = new Map<string, { units: number; earned: number }>();
        let treasuryDelta = 0;

        for (const entry of batchEntries) {
          treasuryDelta += entry.amount;
          if (entry.itemId) {
            const prev = itemDecrements.get(entry.itemId) ?? { units: 0, earned: 0 };
            prev.earned += entry.amount;
            prev.units += entry.qty ?? 1;
            itemDecrements.set(entry.itemId, prev);
          }
        }

        // Remove dedup keys added by this batch (they're the last N keys appended)
        const remainingKeys = state.importedSaleKeys.slice(0, state.importedSaleKeys.length - batchEntries.length);

        set((s) => {
          const lanes = structuredCloneLanes(s.lanes);
          for (const [itemId, dec] of itemDecrements) {
            for (const lane of LANE_ORDER) {
              const it = lanes[lane].find((x) => x.id === itemId);
              if (it) {
                it.units = Math.max(0, it.units - dec.units);
                it.earned = Math.max(0, it.earned - dec.earned);
                break;
              }
            }
          }
          return {
            lanes,
            goal: { ...s.goal, current: Math.max(0, s.goal.current - treasuryDelta) },
            log: s.log.filter((l) => l.batchId !== bid),
            importedSaleKeys: remainingKeys,
            lastImportBatchId: null,
          };
        });

        return batchEntries.length;
      },

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
