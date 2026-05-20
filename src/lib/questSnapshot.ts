/**
 * XIVAPI v2 Quest sheet parser (probed 2026-05-20):
 *
 * Sample row (Quest #65674 "Way of the Carpenter"):
 *   {
 *     row_id: 65674,
 *     fields: {
 *       Name: "Way of the Carpenter",
 *       ClassJobLevel: [1, 0],                      // [primaryLevel, secondaryLevel]
 *       ItemCatalyst: [                              // 3 fixed slots
 *         { value: 4, fields: { Name: "Wind Shard" } },
 *         { value: 3, fields: { Name: "Ice Shard" } },
 *         { value: 0, fields: { Name: "" } },        // unused slot
 *       ],
 *       ItemCountCatalyst: [100, 50, 0],             // parallel counts; 0 = unused slot
 *       ClassJobCategory0: { fields: { Name: "All Classes" } },
 *     }
 *   }
 *
 * Notes:
 * - XIVAPI v2 exposes NO ItemRequiredHQ field. HQ-turn-in requirement is not
 *   queryable via the API; downstream UI must show both NQ + HQ market data
 *   and let the user decide.
 * - ClassJobCategory0 doesn't cleanly identify "crafter-only" quests — intro
 *   crafter quests are tagged "All Classes". For filtering, surface
 *   categoryName as a string and let the UI filter by free-text match.
 * - Pagination: GET /api/sheet/Quest?fields=...&limit=500&after=<lastRowId>
 */

import { fetchXivapiPage, nextCursor } from './xivapiRetry';

export interface QuestRequiredItem {
  itemId: number;
  itemName: string;
  qty: number;
}

export interface SnapshotQuest {
  questId: number;
  questName: string;
  categoryName: string;     // ClassJobCategory0.fields.Name; '' if missing
  level: number;            // ClassJobLevel[0]; 0 if missing
  requiredItems: QuestRequiredItem[];   // 1-3 entries, non-empty
}

interface RawItemSlot {
  value?: number;
  fields?: { Name?: string };
}

interface RawQuestFields {
  Name?: string;
  ClassJobLevel?: number[];
  ItemCatalyst?: RawItemSlot[];
  ItemCountCatalyst?: number[];
  ClassJobCategory0?: { fields?: { Name?: string } };
}

interface RawQuestRow { row_id: number; fields: RawQuestFields }
export interface RawQuestSheetPage { rows?: RawQuestRow[] }

export function parseQuestSheetPage(raw: RawQuestSheetPage): SnapshotQuest[] {
  const rows = raw.rows ?? [];
  const out: SnapshotQuest[] = [];
  for (const row of rows) {
    const items = row.fields.ItemCatalyst ?? [];
    const qtys = row.fields.ItemCountCatalyst ?? [];

    const requiredItems: QuestRequiredItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const itemId = items[i]?.value ?? 0;
      const qty = qtys[i] ?? 0;
      if (itemId <= 0 || qty <= 0) continue;
      requiredItems.push({
        itemId,
        itemName: items[i]?.fields?.Name ?? '',
        qty,
      });
    }

    if (requiredItems.length === 0) continue;

    out.push({
      questId: row.row_id,
      questName: row.fields.Name ?? '',
      categoryName: row.fields.ClassJobCategory0?.fields?.Name ?? '',
      level: row.fields.ClassJobLevel?.[0] ?? 0,
      requiredItems,
    });
  }
  return out;
}

export interface FetchQuestSnapshotOpts {
  pageSize?: number;
  onProgress?: (n: number) => void;
}

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const QUEST_FIELDS = 'Name,ClassJobLevel,ItemCatalyst.value,ItemCatalyst.fields.Name,ItemCountCatalyst,ClassJobCategory0.fields.Name';

function buildQuestPageUrl(after: number, pageSize: number): string {
  const params = new URLSearchParams({ fields: QUEST_FIELDS, limit: String(pageSize) });
  if (after > 0) params.set('after', String(after));
  return `${BASE.replace(/\/$/, '')}/api/sheet/Quest?${params.toString()}`;
}

export async function fetchQuestSnapshot(opts: FetchQuestSnapshotOpts = {}): Promise<SnapshotQuest[]> {
  const pageSize = opts.pageSize ?? 500;
  const out: SnapshotQuest[] = [];
  let cursor = 0;
  while (true) {
    const res = await fetchXivapiPage(buildQuestPageUrl(cursor, pageSize));
    if (!res.ok) throw new Error(`XIVAPI Quest ${res.status}`);
    const raw = (await res.json()) as RawQuestSheetPage;
    const rows = raw.rows ?? [];
    if (rows.length === 0) break;
    out.push(...parseQuestSheetPage(raw));
    opts.onProgress?.(out.length);
    cursor = nextCursor(cursor, rows[rows.length - 1].row_id);
  }
  return out;
}
