const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';

export function buildNamesUrl(ids: number[]): string {
  return `${BASE.replace(/\/$/, '')}/api/sheet/Item?rows=${ids.join(',')}&fields=Name&limit=200`;
}

interface RawRow { row_id?: number; fields?: { Name?: string } }

export function parseNamesResponse(raw: { rows?: RawRow[] }): Map<number, string> {
  const out = new Map<number, string>();
  for (const r of raw.rows ?? []) {
    if (typeof r.row_id === 'number' && typeof r.fields?.Name === 'string') {
      out.set(r.row_id, r.fields.Name);
    }
  }
  return out;
}

export async function fetchItemNames(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const res = await fetch(buildNamesUrl(ids));
  if (!res.ok) throw new Error(`XIVAPI ${res.status}`);
  return parseNamesResponse(await res.json());
}
