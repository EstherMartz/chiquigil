import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SavedBatch, SavedBatchItem } from './types';

export interface BatchTrackerState {
  _v: 1;
  batches: SavedBatch[];
  saveBatch: (budget: number, items: SavedBatchItem[]) => void;
  setActualPrice: (batchId: string, itemId: number, price: number) => void;
  clearActualPrice: (batchId: string, itemId: number) => void;
  closeBatch: (batchId: string) => void;
  deleteBatch: (batchId: string) => void;
}

export function defaultBatchTracker(): Pick<BatchTrackerState, '_v' | 'batches'> {
  return { _v: 1, batches: [] };
}

function updateBatchItem(
  batches: SavedBatch[],
  batchId: string,
  itemId: number,
  updater: (item: SavedBatchItem) => SavedBatchItem,
): SavedBatch[] {
  return batches.map((b) =>
    b.batchId === batchId
      ? { ...b, items: b.items.map((i) => (i.id === itemId ? updater(i) : i)) }
      : b,
  );
}

export const useBatchTrackerStore = create<BatchTrackerState>()(
  persist(
    (set) => ({
      ...defaultBatchTracker(),
      saveBatch: (budget, items) => set((s) => ({
        batches: [
          {
            batchId: Date.now().toString(),
            createdAt: new Date().toISOString(),
            budget,
            items,
            status: 'active' as const,
          },
          ...s.batches,
        ],
      })),
      setActualPrice: (batchId, itemId, price) => set((s) => ({
        batches: updateBatchItem(s.batches, batchId, itemId, (i) => ({
          ...i,
          actualPrice: price,
          soldAt: new Date().toISOString(),
        })),
      })),
      clearActualPrice: (batchId, itemId) => set((s) => ({
        batches: updateBatchItem(s.batches, batchId, itemId, (i) => ({
          ...i,
          actualPrice: null,
          soldAt: null,
        })),
      })),
      closeBatch: (batchId) => set((s) => ({
        batches: s.batches.map((b) =>
          b.batchId === batchId ? { ...b, status: 'closed' as const } : b,
        ),
      })),
      deleteBatch: (batchId) => set((s) => ({
        batches: s.batches.filter((b) => b.batchId !== batchId),
      })),
    }),
    { name: 'ffxiv-helper:batchTracker' },
  ),
);
