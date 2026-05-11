export interface SnapshotItem {
  id: number;
  name: string;
  sc: number;
  ui: number;
  ilvl: number;
  canHq: boolean;
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
    });
  }
  return out;
}
