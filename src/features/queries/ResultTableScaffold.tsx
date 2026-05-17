import type { ReactNode } from 'react';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';
import { ExportCsvButton } from '../../components/ExportCsvButton';
import type { CsvColumn } from '../../lib/csv';

interface Props<T extends { id: number }> {
  rows: T[];
  totalCandidates: number;
  skippedChunks: number;
  /** What to render when rows is empty (on-brand copy). */
  emptyState: ReactNode;
  /** Render the table body given the current page-visible slice. */
  renderTable: (visible: T[]) => ReactNode;
  csvColumns?: CsvColumn<T>[];
  csvFilename?: string;
}

/**
 * Shared scaffolding for the Query / CraftFlip / Repost result tables:
 * matches-count line, bordered card wrap, load-more footer. The per-result
 * shape (column set, formatters) stays in each component because they
 * differ — but everything around the table is now one piece.
 */
export function ResultTableScaffold<T extends { id: number }>({
  rows, totalCandidates, skippedChunks, emptyState, renderTable, csvColumns, csvFilename,
}: Props<T>) {
  const lm = useLoadMore(rows, 25);
  if (rows.length === 0) return <>{emptyState}</>;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] text-text-low">
          {rows.length} matches from {totalCandidates} candidates
          {skippedChunks > 0 && (
            <span className="text-crimson"> · {skippedChunks} batch(es) skipped (Universalis error)</span>
          )}
        </div>
        {csvColumns && csvFilename && (
          <ExportCsvButton rows={rows} columns={csvColumns} filename={csvFilename} />
        )}
      </div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        {renderTable(lm.visible)}
        <LoadMoreFooter
          hasMore={lm.hasMore}
          total={lm.total}
          shown={lm.shown}
          onLoadMore={lm.loadMore}
        />
      </div>
    </div>
  );
}

/** On-brand empty-state card used by every results view. */
export function EmptyResults({ children }: { children: ReactNode }) {
  return (
    <div className="border border-border-base bg-bg-card p-8 text-center text-text-low text-sm italic">
      {children}
    </div>
  );
}
