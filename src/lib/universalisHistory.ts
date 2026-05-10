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
