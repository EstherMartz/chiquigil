const BASE = (import.meta.env.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';

export interface XivapiItemRow {
  id: number;
  name: string;
  level: number;
  classJobCategory: string;
}

interface RawResult {
  row_id?: number;
  fields?: { Name?: string; Icon?: string; LevelItem?: number; ClassJobCategory?: { Name?: string } };
}

export function buildItemSearchUrl(query: string): string {
  const q = encodeURIComponent(`Name~"${query}"`);
  return `${BASE.replace(/\/$/, '')}/api/search?sheets=Item&query=${q}&fields=Name,Icon,LevelItem,ClassJobCategory&limit=20`;
}

export function parseItemSearchResponse(raw: { results?: RawResult[] }): XivapiItemRow[] {
  return (raw.results ?? [])
    .filter((r): r is Required<Pick<RawResult, 'row_id' | 'fields'>> & RawResult =>
      typeof r.row_id === 'number' && !!r.fields?.Name && typeof r.fields.LevelItem === 'number',
    )
    .map((r) => ({
      id: r.row_id!,
      name: r.fields!.Name!,
      level: r.fields!.LevelItem!,
      classJobCategory: r.fields!.ClassJobCategory?.Name ?? '',
    }));
}

export async function searchItems(query: string): Promise<XivapiItemRow[]> {
  if (!query.trim()) return [];
  const res = await fetch(buildItemSearchUrl(query.trim()));
  if (!res.ok) throw new Error(`XIVAPI ${res.status}`);
  return parseItemSearchResponse(await res.json());
}
