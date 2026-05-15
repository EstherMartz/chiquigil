/**
 * XIVAPI v2 Leve sheet schema (probed 2026-05-15):
 *
 * The Leve sheet is large (~3000+ rows including all expansions). Pagination uses:
 *   GET /api/sheet/Leve?fields=...&limit=500&after=<lastRowId>
 *
 * Actual field shapes observed:
 *
 *   Name                      string (empty on placeholder rows — drop those)
 *   ClassJobCategory.fields.Name   'Carpenter' | 'Miner' | 'Culinarian' | 'Disciple of War' | etc.
 *   LeveAssignmentType.fields.Name 'Tradecraft' | 'Fieldcraft' | 'Armorer' | 'Maelstrom' | etc.
 *   ClassJobLevel             1–100 (integer)
 *   AllowanceCost             1 (normal) or 10 (Ishgardian Restoration)
 *   GilReward                 base gil for NQ submission (integer)
 *   ExpReward                 base exp at leve's level (integer)
 *   LevelLevemete             object with nested Map → PlaceName → Name (city string)
 *   DataId                    {value: number} object linking to CraftLeve (DoH) or BattleLeve (DoW) etc.
 *
 * Note: LeveAssignmentType.Name in the probe returns codes like "Armorer" rather than
 * a short code like "CRP". The classification (DoH vs DoL vs DoW) is derived from
 * ClassJobCategory.Name, not LeveAssignmentType.
 *
 * If a field is missing or named differently in a future game patch, update this
 * comment + the matching access in parseLeveSheetPage.
 */

export interface SnapshotLeve {
  id: number;
  name: string;
  level: number;
  type: 'doh' | 'dol' | 'dow' | 'dom';
  classJob: number;
  city: string;
  baseGil: number;
  baseExp: number;
  hqGilMultiplier: number;
  targetItemId: number | null;
  targetItemQty: number | null;
  _craftLeveId?: number; // temporary: resolved during enrichDohTargets, then deleted
}

interface RawFieldLink<T> { value?: T; fields?: T }
interface RawLeveFields {
  Name?: string;
  ClassJobCategory?: { fields?: { Name?: string } };
  LeveAssignmentType?: { fields?: { Name?: string } };
  ClassJobLevel?: number;
  AllowanceCost?: number;
  GilReward?: number;
  ExpReward?: number;
  LevelLevemete?: { fields?: { Map?: { fields?: { PlaceName?: { fields?: { Name?: string } } } } } };
  DataId?: RawFieldLink<number>;
}
interface RawLeveRow { row_id: number; fields: RawLeveFields }
interface RawLeveSheetPage { rows?: RawLeveRow[] }

// ClassJob id mapping (subset — only the codes leves use).
const CLASS_JOB_BY_NAME: Record<string, number> = {
  Carpenter: 8, Blacksmith: 9, Armorer: 10, Goldsmith: 11,
  Leatherworker: 12, Weaver: 13, Alchemist: 14, Culinarian: 15,
  Miner: 16, Botanist: 17, Fisher: 18,
  'Disciple of War': 99,
  'Disciple of Magic': 99,
};

const DOH_NAMES = new Set(['Carpenter', 'Blacksmith', 'Armorer', 'Goldsmith', 'Leatherworker', 'Weaver', 'Alchemist', 'Culinarian']);
const DOL_NAMES = new Set(['Miner', 'Botanist', 'Fisher']);

function classifyType(category: string): SnapshotLeve['type'] {
  if (DOH_NAMES.has(category)) return 'doh';
  if (DOL_NAMES.has(category)) return 'dol';
  if (category === 'Disciple of Magic') return 'dom';
  return 'dow';
}

export function parseLeveSheetPage(raw: RawLeveSheetPage): SnapshotLeve[] {
  const out: SnapshotLeve[] = [];
  for (const r of raw.rows ?? []) {
    const f = r.fields ?? {};
    const name = (f.Name ?? '').trim();
    if (!name) continue; // placeholder/deprecated row
    const category = f.ClassJobCategory?.fields?.Name ?? '';
    if (!category) continue;
    const type = classifyType(category);
    const craftLeveId = f.DataId?.value ?? 0;
    out.push({
      id: r.row_id,
      name,
      level: f.ClassJobLevel ?? 0,
      type,
      classJob: CLASS_JOB_BY_NAME[category] ?? 0,
      city: f.LevelLevemete?.fields?.Map?.fields?.PlaceName?.fields?.Name ?? 'Unknown',
      baseGil: f.GilReward ?? 0,
      baseExp: f.ExpReward ?? 0,
      hqGilMultiplier: type === 'doh' ? 2.0 : 1.0,
      // targetItemId/qty come from the CraftLeve linked sheet — populated in fetchLeveSnapshot,
      // not in parse, because the link resolution needs a second fetch.
      targetItemId: null,
      targetItemQty: null,
      _craftLeveId: craftLeveId,
    });
  }
  return out;
}

export interface FetchLeveSnapshotOpts {
  pageSize?: number;
  onProgress?: (total: number) => void;
}

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const LEVE_FIELDS = 'Name,ClassJobCategory.Name,LeveAssignmentType.Name,ClassJobLevel,AllowanceCost,GilReward,ExpReward,LevelLevemete.Map.PlaceName.Name,DataId';

function buildLevePageUrl(after: number, pageSize: number): string {
  const params = new URLSearchParams({ fields: LEVE_FIELDS, limit: String(pageSize) });
  if (after > 0) params.set('after', String(after));
  return `${BASE.replace(/\/$/, '')}/api/sheet/Leve?${params.toString()}`;
}

export async function fetchLeveSnapshot(opts: FetchLeveSnapshotOpts = {}): Promise<SnapshotLeve[]> {
  const pageSize = opts.pageSize ?? 500;
  const out: SnapshotLeve[] = [];
  let cursor = 0;
  while (true) {
    const res = await fetch(buildLevePageUrl(cursor, pageSize));
    if (!res.ok) throw new Error(`XIVAPI Leve ${res.status}`);
    const raw = (await res.json()) as RawLeveSheetPage;
    const rows = raw.rows ?? [];
    if (rows.length === 0) break;
    out.push(...parseLeveSheetPage(raw));
    opts.onProgress?.(out.length);
    cursor = rows[rows.length - 1].row_id;
  }
  // Path 1: Inline enrichment approach. Store craftLeveId temporarily on each leve,
  // then fetch CraftLeve sheet and attach targetItemId/qty. Delete the temporary field.
  await enrichDohTargets(out, pageSize);
  return out;
}

async function enrichDohTargets(leves: SnapshotLeve[], pageSize: number): Promise<void> {
  // Fetch the entire CraftLeve sheet and index by row_id (= the DataId of the parent Leve).
  const craftLeves = new Map<number, { itemId: number; qty: number }>();
  let cursor = 0;
  while (true) {
    const url = `${BASE.replace(/\/$/, '')}/api/sheet/CraftLeve?fields=Item0,ItemCount0&limit=${pageSize}${cursor > 0 ? `&after=${cursor}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`XIVAPI CraftLeve ${res.status}`);
    const page = (await res.json()) as { rows?: Array<{ row_id: number; fields: { Item0?: { value?: number }; ItemCount0?: number } }> };
    const rows = page.rows ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const itemId = row.fields.Item0?.value ?? 0;
      const qty = row.fields.ItemCount0 ?? 0;
      if (itemId > 0 && qty > 0) craftLeves.set(row.row_id, { itemId, qty });
    }
    cursor = rows[rows.length - 1].row_id;
  }
  // Walk the parsed leves and attach target via _craftLeveId.
  for (const leve of leves) {
    if (leve.type === 'doh' && leve._craftLeveId != null && leve._craftLeveId > 0) {
      const craft = craftLeves.get(leve._craftLeveId);
      if (craft) {
        leve.targetItemId = craft.itemId;
        leve.targetItemQty = craft.qty;
      }
    }
    // Delete the temporary field before returning.
    delete leve._craftLeveId;
  }
}
