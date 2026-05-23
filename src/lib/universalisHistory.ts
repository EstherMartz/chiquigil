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

export function buildHistoryUrl(scope: string, ids: number[]): string {
  return `https://universalis.app/api/v2/history/${scope}/${ids.join(',')}?entriesToReturn=50`;
}

interface RawHistoryItem { entries?: HistoryEntry[] }

export function parseHistoryResponse(raw: { items?: Record<string, RawHistoryItem> }): Map<number, HistoryEntry[]> {
  const out = new Map<number, HistoryEntry[]>();
  for (const [id, item] of Object.entries(raw.items ?? {})) {
    out.set(Number(id), item.entries ?? []);
  }
  return out;
}

export async function fetchHistoryFor(scope: string, ids: number[]): Promise<Map<number, HistoryEntry[]>> {
  if (ids.length === 0) return new Map();
  const res = await fetch(buildHistoryUrl(scope, ids));
  if (!res.ok) throw new Error(`Universalis history ${res.status}`);
  return parseHistoryResponse(await res.json());
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

export function buildHistoryUrlWithin(scope: string, ids: number[], withinSeconds: number): string {
  return `https://universalis.app/api/v2/history/${scope}/${ids.join(',')}?entriesWithin=${withinSeconds}`;
}

export async function fetchHistoryWithin(
  scope: string,
  ids: number[],
  withinSeconds: number,
): Promise<Map<number, HistoryEntry[]>> {
  if (ids.length === 0) return new Map();
  const res = await fetch(buildHistoryUrlWithin(scope, ids, withinSeconds));
  if (!res.ok) throw new Error(`Universalis history ${res.status}`);
  return parseHistoryResponse(await res.json());
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
