import type { SnapshotLeve } from './leveSnapshot';

const CLASS_JOB_TO_CODE: Record<number, string> = {
  8: 'CRP', 9: 'BSM', 10: 'ARM', 11: 'GSM',
  12: 'LTW', 13: 'WVR', 14: 'ALC', 15: 'CUL',
  16: 'MIN', 17: 'BTN', 18: 'FSH',
  99: 'GC',
};

export interface LeveUsedInEntry {
  leveId: number;
  name: string;
  level: number;
  type: SnapshotLeve['type'];
  jobCode: string;
  qty: number;
}

/** Reverse index: itemId → craft-leves that deliver it. */
export type LeveUsedInIndex = Map<number, LeveUsedInEntry[]>;

export function buildLeveUsedInIndex(leves: SnapshotLeve[]): LeveUsedInIndex {
  const out: LeveUsedInIndex = new Map();
  for (const leve of leves) {
    if (leve.targetItemId == null) continue;
    const entry: LeveUsedInEntry = {
      leveId: leve.id,
      name: leve.name,
      level: leve.level,
      type: leve.type,
      jobCode: CLASS_JOB_TO_CODE[leve.classJob] ?? '',
      qty: leve.targetItemQty ?? 1,
    };
    const list = out.get(leve.targetItemId);
    if (list) list.push(entry);
    else out.set(leve.targetItemId, [entry]);
  }
  return out;
}
