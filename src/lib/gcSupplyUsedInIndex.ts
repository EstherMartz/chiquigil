import type { SnapshotQuest } from './questSnapshot';

export interface GcSupplyUsedInEntry {
  level: number;
  categoryName: string;
  qty: number;
}

/** Reverse index: itemId → Grand Company Supply turn-ins requiring it. */
export type GcSupplyUsedInIndex = Map<number, GcSupplyUsedInEntry[]>;

export function buildGcSupplyUsedInIndex(quests: SnapshotQuest[]): GcSupplyUsedInIndex {
  const out: GcSupplyUsedInIndex = new Map();
  for (const quest of quests) {
    for (const req of quest.requiredItems) {
      const entry: GcSupplyUsedInEntry = {
        level: quest.level,
        categoryName: quest.categoryName,
        qty: req.qty,
      };
      const list = out.get(req.itemId);
      if (list) list.push(entry);
      else out.set(req.itemId, [entry]);
    }
  }
  return out;
}
