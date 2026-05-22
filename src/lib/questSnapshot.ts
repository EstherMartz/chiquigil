/**
 * GC Supply turn-in data sourced from Teamcraft's gc-supply.json.
 *
 * Structure: Record<level, Record<categoryId, Array<{ itemId, count, reward }>>>
 * Categories are ClassJob IDs: 8=CRP, 9=BSM, 10=ARM, 11=GSM, 12=LTW,
 * 13=WVR, 14=ALC, 15=CUL, 16=MIN, 17=BTN, 18=FSH.
 */

const GC_SUPPLY_URL =
  'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/master/libs/data/src/lib/json/gc-supply.json';

export interface QuestRequiredItem {
  itemId: number;
  itemName: string;
  qty: number;
}

export interface SnapshotQuest {
  questId: number;
  questName: string;
  categoryName: string;
  level: number;
  requiredItems: QuestRequiredItem[];
}

const CATEGORY_NAMES: Record<number, string> = {
  8: 'CRP', 9: 'BSM', 10: 'ARM', 11: 'GSM',
  12: 'LTW', 13: 'WVR', 14: 'ALC', 15: 'CUL',
  16: 'MIN', 17: 'BTN', 18: 'FSH',
};

interface RawGcSupplyItem {
  itemId: number;
  count: number;
  reward: { xp: number; seals: number };
}

type RawGcSupply = Record<string, Record<string, RawGcSupplyItem[]>>;

export function parseGcSupply(raw: RawGcSupply): SnapshotQuest[] {
  const out: SnapshotQuest[] = [];
  for (const [levelStr, categories] of Object.entries(raw)) {
    const level = Number(levelStr);
    if (!Number.isFinite(level) || level <= 0) continue;
    for (const [catStr, items] of Object.entries(categories)) {
      const cat = Number(catStr);
      const categoryName = CATEGORY_NAMES[cat];
      if (!categoryName) continue;
      const requiredItems: QuestRequiredItem[] = [];
      for (const item of items) {
        if (item.itemId <= 0 || item.count <= 0) continue;
        requiredItems.push({ itemId: item.itemId, itemName: '', qty: item.count });
      }
      if (requiredItems.length === 0) continue;
      out.push({
        questId: level * 100 + cat,
        questName: `GC Supply Lv.${level}`,
        categoryName,
        level,
        requiredItems,
      });
    }
  }
  return out;
}

export interface FetchQuestSnapshotOpts {
  onProgress?: (n: number) => void;
}

export async function fetchQuestSnapshot(opts: FetchQuestSnapshotOpts = {}): Promise<SnapshotQuest[]> {
  const res = await fetch(GC_SUPPLY_URL);
  if (!res.ok) throw new Error(`Teamcraft gc-supply fetch failed: ${res.status}`);
  const raw = (await res.json()) as RawGcSupply;
  const out = parseGcSupply(raw);
  opts.onProgress?.(out.length);
  return out;
}
