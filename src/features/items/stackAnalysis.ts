import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';

export interface SoldStackRow {
  stack: number;
  sales: number;
  units: number;
  medianUnitPrice: number;
  lastSoldMs: number;
}

export interface ListedStackRow {
  stack: number;
  count: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/** Group 90-day sales by exact stack size for the demand panel. */
export function soldByStack(entries: HistoryEntry[], hq: boolean): SoldStackRow[] {
  const rows = entries.filter((e) => e.hq === hq && e.quantity > 0 && e.pricePerUnit > 0);
  if (rows.length === 0) return [];

  interface Acc { sales: number; units: number; prices: number[]; lastSoldMs: number }
  const groups = new Map<number, Acc>();
  for (const e of rows) {
    let acc = groups.get(e.quantity);
    if (!acc) { acc = { sales: 0, units: 0, prices: [], lastSoldMs: 0 }; groups.set(e.quantity, acc); }
    acc.sales += 1;
    acc.units += e.quantity;
    acc.prices.push(e.pricePerUnit);
    const ms = e.timestamp * 1000;
    if (ms > acc.lastSoldMs) acc.lastSoldMs = ms;
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stack, acc]) => ({
      stack,
      sales: acc.sales,
      units: acc.units,
      medianUnitPrice: median(acc.prices),
      lastSoldMs: acc.lastSoldMs,
    }));
}

/** Group current listings by exact stack size for the supply panel. */
export function listedByStack(listings: WorldListing[], hq: boolean): ListedStackRow[] {
  const rows = listings.filter((l) => l.hq === hq && l.price > 0);
  if (rows.length === 0) return [];

  const counts = new Map<number, number>();
  for (const l of rows) {
    const stack = l.quantity ?? 1;
    counts.set(stack, (counts.get(stack) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stack, count]) => ({ stack, count }));
}

/** Whether any observed stack size exceeds 1 (else the item is sold singly). */
export function isStackable(sold: SoldStackRow[], listed: ListedStackRow[]): boolean {
  return sold.some((r) => r.stack > 1) || listed.some((r) => r.stack > 1);
}
