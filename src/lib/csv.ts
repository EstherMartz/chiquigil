export interface CsvColumn<T> {
  key: keyof T;
  label: string;
  // Optional custom serializer. Default: String(row[key]).
  value?: (row: T) => string | number | boolean | null | undefined;
}

function escapeCell(raw: string | number | boolean | null | undefined): string {
  if (raw == null) return '';
  const s = String(raw);
  // RFC 4180: quote when the value contains comma, double-quote, CR or LF.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((r) =>
    columns.map((c) => escapeCell(c.value ? c.value(r) : (r[c.key] as never))).join(',')
  );
  return [header, ...body].join('\r\n');
}

/**
 * Trigger a CSV download in the browser. Adds a UTF-8 BOM so Excel
 * opens it correctly.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
