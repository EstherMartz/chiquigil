export interface HistoryEntry {
  pricePerUnit: number;
  quantity: number;
  timestamp: number; // SECONDS, per Universalis convention
  hq: boolean;
}

export interface DailyBucket {
  dayStartMs: number;
  meanPrice: number;
  quantity: number;
}

interface RawHistoryEntry {
  pricePerUnit?: number;
  quantity?: number;
  timestamp?: number;
  hq?: boolean;
}
interface RawHistoryItem { entries?: RawHistoryEntry[] }
interface RawHistoryResponse {
  itemID?: number;
  entries?: RawHistoryEntry[];
  items?: Record<string, RawHistoryItem>;
}

const HISTORY_BASE = 'https://universalis.app/api/v2/history';

function normalizeEntries(entries: RawHistoryEntry[] | undefined): HistoryEntry[] {
  if (!entries) return [];
  return entries
    .filter((e) => e.pricePerUnit != null && e.timestamp != null)
    .map((e) => ({
      pricePerUnit: e.pricePerUnit as number,
      quantity: e.quantity ?? 1,
      timestamp: e.timestamp as number,
      hq: !!e.hq,
    }));
}

export function parseHistoryResponse(raw: RawHistoryResponse): Map<number, HistoryEntry[]> {
  const out = new Map<number, HistoryEntry[]>();
  if (raw.items && typeof raw.items === 'object') {
    // Multi-item shape: { items: { "5": { entries: [...] } } }
    for (const [id, item] of Object.entries(raw.items)) {
      out.set(Number(id), normalizeEntries(item?.entries));
    }
  } else if (raw.itemID != null) {
    // Single-item shape: { itemID, entries: [...] }
    out.set(Number(raw.itemID), normalizeEntries(raw.entries));
  }
  return out;
}

/** History is not cached locally — always returns empty. */
export async function fetchHistoryFor(_scope: string, ids: number[]): Promise<Map<number, HistoryEntry[]>> {
  if (ids.length === 0) return new Map();
  return new Map();
}

const DAY_MS = 86_400_000;

export function dailyBuckets(entries: HistoryEntry[], lookbackDays: number): DailyBucket[] {
  const cutoffMs = Date.now() - lookbackDays * DAY_MS;
  const grouped = new Map<number, { qty: number; weightedSum: number }>();
  for (const e of entries) {
    const tsMs = e.timestamp * 1000;
    if (tsMs < cutoffMs) continue;
    const dayStart = Math.floor(tsMs / DAY_MS) * DAY_MS;
    const cur = grouped.get(dayStart) ?? { qty: 0, weightedSum: 0 };
    cur.qty += e.quantity;
    cur.weightedSum += e.pricePerUnit * e.quantity;
    grouped.set(dayStart, cur);
  }
  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayStartMs, { qty, weightedSum }]) => ({
      dayStartMs,
      meanPrice: Math.round(weightedSum / qty),
      quantity: qty,
    }));
}

/**
 * Fetch recent sale history from Universalis for a small set of items.
 *
 * Unlike bulk market data (served from the bot's hourly cache to dodge
 * rate-limiting), history is fetched LIVE here: callers query a single item at
 * a time (the item detail page), which is low-volume and CORS-allowed. Callers
 * should cache results (e.g. React Query staleTime) to avoid refetching.
 * Universalis caps each response at ~1800 entries regardless of the window.
 */
export async function fetchHistoryWithin(
  scope: string,
  ids: number[],
  withinSeconds: number,
): Promise<Map<number, HistoryEntry[]>> {
  if (ids.length === 0) return new Map();
  const url = `${HISTORY_BASE}/${encodeURIComponent(scope)}/${ids.join(',')}?entriesWithin=${withinSeconds}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return new Map();
    const json = (await res.json()) as RawHistoryResponse;
    return parseHistoryResponse(json);
  } catch {
    return new Map();
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function dailyMedianBuckets(
  entries: HistoryEntry[],
  lookbackDays: number,
  nowMs: number = Date.now(),
): (number | null)[] {
  const todayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const oldestStart = todayStart - (lookbackDays - 1) * DAY_MS;

  const byDay = new Map<number, number[]>();
  for (const e of entries) {
    const tsMs = e.timestamp * 1000;
    const dayStart = Math.floor(tsMs / DAY_MS) * DAY_MS;
    if (dayStart < oldestStart || dayStart > todayStart) continue;
    const dayIndex = Math.round((dayStart - oldestStart) / DAY_MS);
    const arr = byDay.get(dayIndex) ?? [];
    arr.push(e.pricePerUnit);
    byDay.set(dayIndex, arr);
  }

  const result: (number | null)[] = [];
  for (let i = 0; i < lookbackDays; i++) {
    const prices = byDay.get(i);
    result.push(prices && prices.length > 0 ? median(prices) : null);
  }
  return result;
}

/**
 * Compute the 7-day delta percentage of price between the recent week
 * (sales in days 0-6) and the prior week (sales in days 7-13). Both
 * windows are quantity-weighted averages. Returns null when either week
 * has zero sales (no meaningful comparison possible).
 */
export function computeWeekDelta(entries: HistoryEntry[], nowMs: number = Date.now()): number | null {
  const DAY = 86_400_000;
  const recentCut = nowMs - 7 * DAY;
  const priorCut = nowMs - 14 * DAY;
  let recentQty = 0, recentSum = 0;
  let priorQty = 0, priorSum = 0;
  for (const e of entries) {
    const tsMs = e.timestamp * 1000;
    if (tsMs >= recentCut) { recentQty += e.quantity; recentSum += e.pricePerUnit * e.quantity; }
    else if (tsMs >= priorCut) { priorQty += e.quantity; priorSum += e.pricePerUnit * e.quantity; }
  }
  if (priorQty === 0 || recentQty === 0) return null;
  const recentAvg = recentSum / recentQty;
  const priorAvg = priorSum / priorQty;
  return ((recentAvg - priorAvg) / priorAvg) * 100;
}
