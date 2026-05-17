import { downloadCsv, toCsv, type CsvColumn } from '../lib/csv';

interface Props<T> {
  rows: T[];
  columns: CsvColumn<T>[];
  filename: string; // e.g. 'watchlist-2026-05-17.csv'
}

export function ExportCsvButton<T>({ rows, columns, filename }: Props<T>) {
  const disabled = rows.length === 0;
  return (
    <button
      onClick={() => downloadCsv(filename, toCsv(rows, columns))}
      disabled={disabled}
      title={disabled ? 'No rows to export' : `Export ${rows.length} rows as CSV`}
      className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-aether hover:text-aether transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      ⬇ CSV
    </button>
  );
}
