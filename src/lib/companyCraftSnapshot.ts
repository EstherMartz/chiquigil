/**
 * One-shot paginated fetch of XIVAPI v2's CompanyCraftSequence sheet.
 * Each row produces one synthetic recipe whose ingredients are grouped by
 * CompanyCraftPart (e.g. Hull/Stern/Bow/Bridge for submarines) so the bot
 * can split a workshop project into per-part task buckets. Single-part
 * items (wheel stands, FC walls) collapse to one bucket.
 */
import { fetchXivapiPage, nextCursor } from './xivapiRetry';

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
// XIVAPI v2 caps responses at ~20k expanded rows. Each sequence expands to up
// to 8 parts × 3 processes × 12 supply items × 2 (SupplyItem + nested Item)
// ≈ 576 rows, so 25 sequences per page sits safely under the budget.
// limit ≥ 50 fails with HTTP 400 ("would require processing over 20,000 rows").
const PAGE_SIZE = 25;

// Deep field selector. Each level uses `[].sub` for array nesting.
const FIELDS = [
  'ResultItem.row_id',
  'CompanyCraftPart[].CompanyCraftType.Name',
  'CompanyCraftPart[].CompanyCraftProcess[].SupplyItem[].Item.row_id',
  'CompanyCraftPart[].CompanyCraftProcess[].SetQuantity',
  'CompanyCraftPart[].CompanyCraftProcess[].SetsRequired',
].join(',');

export interface CompanyCraftRecipePart {
  /** Display name (e.g. "Hull", "Stern"). Empty when XIVAPI has no Type. */
  name: string;
  ingredients: Array<{ itemId: number; qty: number }>;
}

export interface CompanyCraftRecipe {
  resultItemId: number;
  resultName: string;
  parts: CompanyCraftRecipePart[];
}

export type CompanyCraftMap = Map<number, CompanyCraftRecipe>;

interface RawRow {
  row_id: number;
  fields: Record<string, unknown>;
}

interface RawPage {
  rows?: RawRow[];
}

export interface BuildOpts {
  onProgress?: (count: number) => void;
}

function buildPageUrl(after: number): string {
  const params = new URLSearchParams({ fields: FIELDS, limit: String(PAGE_SIZE) });
  if (after > 0) params.set('after', String(after));
  return `${BASE.replace(/\/$/, '')}/api/sheet/CompanyCraftSequence?${params.toString()}`;
}

function readArrayField(row: any, key: string): any[] {
  const v = row?.[key];
  return Array.isArray(v) ? v : [];
}

export function parseCompanyCraftRow(
  row: RawRow,
  namesById: Map<number, string>,
): CompanyCraftRecipe | null {
  const f = row.fields as any;
  const resultItemId = (f.ResultItem as { value?: number } | undefined)?.value ?? 0;
  if (resultItemId <= 0) return null;

  const parts: CompanyCraftRecipePart[] = [];
  for (const part of readArrayField(f, 'CompanyCraftPart')) {
    const partFields = (part as any).fields ?? part;
    const typeField = (partFields as any).CompanyCraftType;
    const typeName = String(typeField?.fields?.Name ?? typeField?.Name ?? '');

    const partTotals = new Map<number, number>();
    for (const process of readArrayField(partFields, 'CompanyCraftProcess')) {
      const procFields = (process as any).fields ?? process;
      const supplies = readArrayField(procFields, 'SupplyItem');
      const setQty = readArrayField(procFields, 'SetQuantity');
      const setsReq = readArrayField(procFields, 'SetsRequired');
      for (let i = 0; i < supplies.length; i++) {
        const sup = supplies[i];
        const supFields = (sup as any).fields ?? sup;
        const itemId = (supFields.Item as { value?: number } | undefined)?.value ?? 0;
        if (itemId <= 0) continue;
        const qty = Number(setQty[i] ?? 0) * Number(setsReq[i] ?? 0);
        if (qty <= 0) continue;
        partTotals.set(itemId, (partTotals.get(itemId) ?? 0) + qty);
      }
    }
    if (partTotals.size === 0) continue;

    parts.push({
      name: typeName,
      ingredients: [...partTotals.entries()].map(([itemId, qty]) => ({ itemId, qty })),
    });
  }
  if (parts.length === 0) return null;

  return {
    resultItemId,
    resultName: namesById.get(resultItemId) ?? `Item #${resultItemId}`,
    parts,
  };
}

export async function fetchCompanyCraftSnapshot(
  namesById: Map<number, string>,
  opts: BuildOpts = {},
): Promise<CompanyCraftMap> {
  const out: CompanyCraftMap = new Map();
  let after = 0;
  while (true) {
    const res = await fetchXivapiPage(buildPageUrl(after));
    if (!res.ok) throw new Error(`XIVAPI CompanyCraftSequence ${res.status}`);
    const page = (await res.json()) as RawPage;
    const rows = page.rows ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const parsed = parseCompanyCraftRow(row, namesById);
      if (parsed) out.set(parsed.resultItemId, parsed);
    }
    opts.onProgress?.(out.size);
    after = nextCursor(after, rows[rows.length - 1].row_id);
  }
  return out;
}
