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

export interface MergedStackRow {
  stack: number;
  sales: number;
  units: number;
  medianUnitPrice: number;
  lastSoldMs: number;
  listedCount: number;
  isGap: boolean;
}

/**
 * Fold the demand (sold) and supply (listed) facets into one per-stack-size view,
 * sorted ascending over the union of sizes. Drives the diverging demand↔supply chart.
 * `isGap` reuses the analyzer's rule: meaningful demand (`sales >= max(2, 0.15 * total)`)
 * meeting thin current supply (`listedCount <= 1`).
 */
export function mergeStacks(sold: SoldStackRow[], listed: ListedStackRow[]): MergedStackRow[] {
  const soldByStackSize = new Map(sold.map((r) => [r.stack, r]));
  const listedCountByStack = new Map(listed.map((r) => [r.stack, r.count]));
  const totalSales = sold.reduce((s, r) => s + r.sales, 0);
  const gapThreshold = Math.max(2, totalSales * 0.15);

  const sizes = [...new Set([...soldByStackSize.keys(), ...listedCountByStack.keys()])].sort(
    (a, b) => a - b,
  );

  return sizes.map((stack) => {
    const d = soldByStackSize.get(stack);
    const listedCount = listedCountByStack.get(stack) ?? 0;
    const sales = d?.sales ?? 0;
    return {
      stack,
      sales,
      units: d?.units ?? 0,
      medianUnitPrice: d?.medianUnitPrice ?? 0,
      lastSoldMs: d?.lastSoldMs ?? 0,
      listedCount,
      isGap: sales >= gapThreshold && listedCount <= 1,
    };
  });
}

export interface StackSuggestion {
  stack: number;
  unitPrice: number;
  kind: 'gap' | 'liquid';
}

/**
 * Recommend a stack size to list at: a supply gap (real demand, thin supply)
 * if one exists, else the most-liquid size. Tie-break: most recent, then larger.
 * Returns null for non-stackable items or when there are no sales.
 */
export function suggestStack(sold: SoldStackRow[], listed: ListedStackRow[]): StackSuggestion | null {
  if (!isStackable(sold, listed) || sold.length === 0) return null;

  const totalSales = sold.reduce((s, r) => s + r.sales, 0);
  const listedCountByStack = new Map(listed.map((r) => [r.stack, r.count]));
  const gapThreshold = Math.max(2, totalSales * 0.15);

  const better = (a: SoldStackRow, b: SoldStackRow): SoldStackRow => {
    if (a.sales !== b.sales) return a.sales > b.sales ? a : b;
    if (a.lastSoldMs !== b.lastSoldMs) return a.lastSoldMs > b.lastSoldMs ? a : b;
    return a.stack >= b.stack ? a : b;
  };

  const gapRows = sold.filter(
    (r) => r.sales >= gapThreshold && (listedCountByStack.get(r.stack) ?? 0) <= 1,
  );
  const pool = gapRows.length > 0 ? gapRows : sold;
  const kind: 'gap' | 'liquid' = gapRows.length > 0 ? 'gap' : 'liquid';
  const pick = pool.reduce(better);

  return { stack: pick.stack, unitPrice: pick.medianUnitPrice, kind };
}

export interface RareSummary {
  count: number;
  sizes: number[];
  totalSales: number;
  totalListed: number;
  rows: MergedStackRow[];
}

/** Share of total activity below which a stack size is folded into the "rare" tail. */
const RARE_SHARE = 0.05;

/**
 * Split merged rows into the chart's individually-shown stacks and a collapsed "rare"
 * tail. A stack stays shown when it carries a meaningful share of demand or supply, is a
 * supply gap, or is the recommended pick. The tail only collapses when ≥2 sizes qualify
 * (a one-size chip isn't worth it), so evenly-distributed items keep every column.
 */
export function partitionStacks(
  rows: MergedStackRow[],
  suggestion: StackSuggestion | null,
): { shown: MergedStackRow[]; rare: RareSummary | null } {
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalListed = rows.reduce((s, r) => s + r.listedCount, 0);

  const isShown = (r: MergedStackRow): boolean =>
    (totalSales > 0 && r.sales >= RARE_SHARE * totalSales) ||
    (totalListed > 0 && r.listedCount >= RARE_SHARE * totalListed) ||
    r.isGap ||
    r.stack === suggestion?.stack;

  const rareRows = rows.filter((r) => !isShown(r));
  if (rareRows.length < 2) return { shown: rows, rare: null };

  const shown = rows.filter(isShown);
  const rare: RareSummary = {
    count: rareRows.length,
    sizes: rareRows.map((r) => r.stack),
    totalSales: rareRows.reduce((s, r) => s + r.sales, 0),
    totalListed: rareRows.reduce((s, r) => s + r.listedCount, 0),
    rows: rareRows,
  };
  return { shown, rare };
}
