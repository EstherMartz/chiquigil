import type { CurrencyId } from './currencies';
import { TOMESTONE_TYPE_TO_ITEM_ID, SCRIP_TYPE_TO_ITEM_ID } from './currencies';
import { fetchXivapiPage, nextCursor } from './xivapiRetry';

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const FIELDS = 'UseCurrencyType,Item[].Item@as(raw),Item[].ItemCost@as(raw),Item[].ReceiveCount,Item[].CurrencyCost,Item[].ReceiveHq';

/** UseCurrencyType value that signals tomestone-index cost encoding. */
const UCT_TOMESTONE = 4;
/** UseCurrencyType value that signals scrip-index cost encoding. */
const UCT_SCRIP = 16;
/** ItemCost values above this in UCT_SCRIP shops are direct item refs (raid tokens etc.), not scrip type indices. */
const SCRIP_INDEX_MAX = 10;

export interface ShopEntry {
  itemId: number;
  receiveQty: number;
  costPerUnit: number;
  isHq: boolean;
}

export interface SpecialShopSnapshot {
  byCurrency: Map<CurrencyId, ShopEntry[]>;
}

interface RawDealSlot {
  'Item@as(raw)'?: number[];
  ReceiveCount?: number[];
  ReceiveHq?: boolean[];
  'ItemCost@as(raw)'?: number[];
  CurrencyCost?: number[];
}
interface RawSpecialShopRow {
  row_id: number;
  fields: { Item?: RawDealSlot[]; UseCurrencyType?: number };
}
export interface RawSpecialShopPage { rows?: RawSpecialShopRow[] }

export interface ParsedShopEntry extends ShopEntry { currency: CurrencyId }

export function parseSpecialShopPage(
  raw: RawSpecialShopPage,
  currencyByItemId: Map<number, CurrencyId>,
): ParsedShopEntry[] {
  const out: ParsedShopEntry[] = [];
  for (const row of raw.rows ?? []) {
    const uct = row.fields.UseCurrencyType ?? 0;
    for (const slot of row.fields.Item ?? []) {
      const recvIds = slot['Item@as(raw)'] ?? [];
      const costIds = slot['ItemCost@as(raw)'] ?? [];
      const recvCounts = slot.ReceiveCount ?? [];
      const recvHq = slot.ReceiveHq ?? [];
      const currencyCost = slot.CurrencyCost ?? [];

      const recvId = recvIds[0] ?? 0;
      if (recvId <= 0) continue;
      if ((recvIds[1] ?? 0) > 0) continue;

      let costId = costIds[0] ?? 0;
      if (costId <= 0) continue;
      if ((costIds[1] ?? 0) > 0) continue;
      if ((costIds[2] ?? 0) > 0) continue;

      // UseCurrencyType 4 = tomestones: costId is a type index, not an Item ID.
      if (uct === UCT_TOMESTONE) {
        costId = TOMESTONE_TYPE_TO_ITEM_ID.get(costId) ?? 0;
        if (costId === 0) continue;
      }
      // UseCurrencyType 16 = scrips: small costId values are type indices.
      // Larger values are direct item refs (raid tokens) — fall through to normal lookup.
      if (uct === UCT_SCRIP && costId <= SCRIP_INDEX_MAX) {
        costId = SCRIP_TYPE_TO_ITEM_ID.get(costId) ?? 0;
        if (costId === 0) continue;
      }

      const currency = currencyByItemId.get(costId);
      if (!currency) continue;

      const receiveQty = recvCounts[0] ?? 0;
      const cost = currencyCost[0] ?? 0;
      if (receiveQty <= 0 || cost <= 0) continue;

      out.push({
        currency,
        itemId: recvId,
        receiveQty,
        costPerUnit: cost / receiveQty,
        isHq: recvHq[0] === true,
      });
    }
  }
  return out;
}

export interface FetchSpecialShopOpts {
  pageSize?: number;
  onProgress?: (totalEntriesSoFar: number) => void;
}

function buildPageUrl(after: number, pageSize: number): string {
  const params = new URLSearchParams({ fields: FIELDS, limit: String(pageSize) });
  if (after > 0) params.set('after', String(after));
  return `${BASE.replace(/\/$/, '')}/api/sheet/SpecialShop?${params.toString()}`;
}

export async function fetchSpecialShopSnapshot(
  currencyByItemId: Map<number, CurrencyId>,
  opts: FetchSpecialShopOpts = {},
): Promise<SpecialShopSnapshot> {
  // pageSize=50 hard-cap: XIVAPI v2 enforces a 20k-row-fanout budget; larger pages 400.
  const pageSize = opts.pageSize ?? 50;
  const byCurrency = new Map<CurrencyId, ShopEntry[]>();
  let cursor = 0;
  let totalEntries = 0;
  while (true) {
    const res = await fetchXivapiPage(buildPageUrl(cursor, pageSize));
    if (!res.ok) throw new Error(`XIVAPI SpecialShop ${res.status}`);
    const raw = (await res.json()) as RawSpecialShopPage;
    const rows = raw.rows ?? [];
    if (rows.length === 0) break;
    for (const entry of parseSpecialShopPage(raw, currencyByItemId)) {
      let bucket = byCurrency.get(entry.currency);
      if (!bucket) { bucket = []; byCurrency.set(entry.currency, bucket); }
      bucket.push({ itemId: entry.itemId, receiveQty: entry.receiveQty, costPerUnit: entry.costPerUnit, isHq: entry.isHq });
      totalEntries++;
    }
    opts.onProgress?.(totalEntries);
    cursor = nextCursor(cursor, rows[rows.length - 1].row_id);
  }
  return { byCurrency };
}
