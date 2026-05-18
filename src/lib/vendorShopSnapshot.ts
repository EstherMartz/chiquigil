import { fetchXivapiPage } from './xivapiRetry';

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const FIELDS = 'Item.PriceMid';

export interface VendorSnapshotEntry {
  itemId: number;
  price: number;
}

interface RawGilShopItemField {
  value?: number;
  fields?: { PriceMid?: number };
}
interface RawGilShopRow {
  row_id: number;
  subrow_id?: number;
  fields: { Item?: RawGilShopItemField };
}
export interface RawGilShopPage { rows?: RawGilShopRow[] }

export function parseGilShopPage(raw: RawGilShopPage): VendorSnapshotEntry[] {
  const out: VendorSnapshotEntry[] = [];
  for (const r of raw.rows ?? []) {
    const itemId = r.fields.Item?.value ?? 0;
    const price = r.fields.Item?.fields?.PriceMid ?? 0;
    if (itemId <= 0) continue;
    if (price <= 0) continue;
    out.push({ itemId, price });
  }
  return out;
}

export interface FetchVendorSnapshotOpts {
  pageSize?: number;
  onProgress?: (totalCollectedSoFar: number) => void;
}

function buildPageUrl(after: number, pageSize: number): string {
  const params = new URLSearchParams({ fields: FIELDS, limit: String(pageSize) });
  if (after > 0) params.set('after', String(after));
  return `${BASE.replace(/\/$/, '')}/api/sheet/GilShopItem?${params.toString()}`;
}

export async function fetchVendorSnapshot(opts: FetchVendorSnapshotOpts = {}): Promise<Map<number, number>> {
  const pageSize = opts.pageSize ?? 500;
  const out = new Map<number, number>();
  let cursor = 0;
  while (true) {
    const res = await fetchXivapiPage(buildPageUrl(cursor, pageSize));
    if (!res.ok) throw new Error(`XIVAPI GilShopItem ${res.status}`);
    const raw = (await res.json()) as RawGilShopPage;
    const rows = raw.rows ?? [];
    if (rows.length === 0) break;
    for (const entry of parseGilShopPage(raw)) {
      out.set(entry.itemId, entry.price); // dedupe — all writes for same id are equal
    }
    opts.onProgress?.(out.size);
    cursor = rows[rows.length - 1].row_id;
  }
  return out;
}
