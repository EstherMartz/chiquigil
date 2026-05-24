export interface LogEntry {
  ts: number;
  amount: number;
  note: string;
  itemId?: string;
  retainer?: string;
  source?: 'manual' | 'csv-import';
  csvName?: string;
  batchId?: string;
  qty?: number;
}

const DAY_MS = 864e5;

export function todayStr(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function todaySum(log: LogEntry[], now: number = Date.now()): number {
  const today = todayStr(now);
  return log
    .filter((l) => new Date(l.ts).toISOString().slice(0, 10) === today)
    .reduce((a, l) => a + l.amount, 0);
}

export function weekSum(log: LogEntry[], now: number = Date.now()): number {
  return log
    .filter((l) => now - l.ts < 7 * DAY_MS)
    .reduce((a, l) => a + l.amount, 0);
}

export function elapsedDays(startTs: number, now: number = Date.now()): number {
  return Math.max(1, Math.ceil((now - startTs) / DAY_MS));
}

export function rate(week: number, days: number): number {
  return week > 0 ? week / Math.min(7, days) : 0;
}

export function eta(remaining: number, dailyRate: number): number | null {
  return dailyRate > 0 ? Math.ceil(remaining / dailyRate) : null;
}

export function pct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, (current / target) * 100);
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function abbr(n: number): string {
  const abs = Math.max(0, n);
  if (abs >= 1e9) return (abs / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (abs >= 1e6) return (abs / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1e3) return (abs / 1e3).toFixed(0) + 'K';
  return '' + Math.round(abs);
}

export function abbrParts(n: number): [string, string] {
  if (n >= 1e6) return [(n / 1e6).toFixed(1).replace(/\.0$/, ''), 'M gil'];
  if (n >= 1e3) return [(n / 1e3).toFixed(0), 'K gil'];
  return ['' + Math.round(n), 'gil'];
}

export type SupplyClass = '' | 'low' | 'mid' | 'high';

export function supClass(supply: number | null): SupplyClass {
  if (supply == null) return '';
  if (supply < 2) return 'low';
  if (supply <= 7) return 'mid';
  return 'high';
}
