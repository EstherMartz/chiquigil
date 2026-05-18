export interface SnapshotItem {
  id: number;
  name: string;
  sc: number;
  ui: number;
  ilvl: number;
  canHq: boolean;
  /** FFXIV rarity tier (1 white, 2 green, 3 blue, 4 purple, 7 pink). 0/undefined for legacy snapshots. */
  rarity?: number;
}

interface RawSheetField<T> { value: T }
interface RawSheetRow {
  row_id: number;
  fields: {
    Name?: string;
    ItemSearchCategory?: RawSheetField<number>;
    ItemUICategory?: RawSheetField<number>;
    LevelItem?: RawSheetField<number>;
    CanBeHq?: boolean;
    Rarity?: number;
  };
}
interface RawSheetPage { rows?: RawSheetRow[] }

export function parseItemSheetPage(raw: RawSheetPage): SnapshotItem[] {
  const rows = raw.rows ?? [];
  const out: SnapshotItem[] = [];
  for (const r of rows) {
    const sc = r.fields.ItemSearchCategory?.value ?? 0;
    const name = r.fields.Name ?? '';
    if (sc === 0 || name === '') continue;
    out.push({
      id: r.row_id,
      name,
      sc,
      ui: r.fields.ItemUICategory?.value ?? 0,
      ilvl: r.fields.LevelItem?.value ?? 0,
      canHq: r.fields.CanBeHq === true,
      rarity: typeof r.fields.Rarity === 'number' ? r.fields.Rarity : undefined,
    });
  }
  return out;
}

export interface FetchItemSnapshotOpts {
  pageSize?: number;
  onProgress?: (totalCollectedSoFar: number) => void;
}

const SHEET_FIELDS = 'Name,ItemSearchCategory.Name,ItemUICategory.Name,LevelItem,CanBeHq,Rarity';

function buildPageUrl(after: number, pageSize: number): string {
  const params = new URLSearchParams({
    fields: SHEET_FIELDS,
    limit: String(pageSize),
  });
  if (after > 0) params.set('after', String(after));
  return `https://v2.xivapi.com/api/sheet/Item?${params.toString()}`;
}

export async function fetchItemSnapshot(opts: FetchItemSnapshotOpts = {}): Promise<SnapshotItem[]> {
  const pageSize = opts.pageSize ?? 500;
  const out: SnapshotItem[] = [];
  let cursor = 0;
  while (true) {
    const res = await fetch(buildPageUrl(cursor, pageSize));
    if (!res.ok) throw new Error(`XIVAPI ${res.status}`);
    const raw = (await res.json()) as RawSheetPage;
    const rows = raw.rows ?? [];
    if (rows.length === 0) break;
    out.push(...parseItemSheetPage(raw));
    opts.onProgress?.(out.length);
    cursor = rows[rows.length - 1].row_id;
  }
  return out;
}
