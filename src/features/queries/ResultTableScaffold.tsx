import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';
import { ExportCsvButton } from '../../components/ExportCsvButton';
import { useUiStore } from '../ui/uiStore';
import type { CsvColumn } from '../../lib/csv';
import { useSettingsStore } from '../settings/store';
import { useIgnoredItemSet } from '../settings/useIgnoredItems';
import { IgnoreAffordanceContext } from '../items/ignoreAffordance';

interface Props<T extends { id: number }> {
  rows: T[];
  totalCandidates: number;
  skippedChunks: number;
  /** What to render when rows is empty (on-brand copy). */
  emptyState: ReactNode;
  /** Render the table body given the current page-visible slice. */
  renderTable: (visible: T[]) => ReactNode;
  /** Optional mobile card layout. When provided, renders below md; the
   *  table is hidden below md. When omitted, the table renders at all
   *  sizes (existing behavior). */
  renderMobile?: (visible: T[]) => ReactNode;
  csvColumns?: CsvColumn<T>[];
  csvFilename?: string;
  /** Fires with the currently-visible (paginated) rows whenever that slice
   *  changes — lets a parent enrich just the rows on screen. */
  onVisibleRows?: (visible: T[]) => void;
}

/**
 * Shared scaffolding for the Query / CraftFlip / Repost result tables:
 * matches-count line, bordered card wrap, load-more footer. The per-result
 * shape (column set, formatters) stays in each component because they
 * differ — but everything around the table is now one piece.
 */
export function ResultTableScaffold<T extends { id: number }>({
  rows: allRows, totalCandidates, skippedChunks, emptyState, renderTable, renderMobile, csvColumns, csvFilename, onVisibleRows,
}: Props<T>) {
  const hideIgnored = useSettingsStore((s) => s.hideIgnored);
  const ignored = useIgnoredItemSet();
  const rows = useMemo(
    () => (hideIgnored ? allRows.filter((r) => !ignored.has(r.id)) : allRows),
    [allRows, hideIgnored, ignored],
  );

  const lm = useLoadMore(rows, 25);
  const visibleSig = lm.visible.map((r) => r.id).join(',');
  useEffect(() => {
    onVisibleRows?.(lm.visible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSig]);
  if (rows.length === 0) return <IgnoreAffordanceContext.Provider value={true}>{emptyState}</IgnoreAffordanceContext.Provider>;
  const tableWrapClass = renderMobile
    ? 'hidden md:block border border-border-base bg-bg-card overflow-x-auto'
    : 'border border-border-base bg-bg-card overflow-x-auto';
  return (
    <IgnoreAffordanceContext.Provider value={true}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="font-mono text-[10px] text-text-low">
            {rows.length} matches from {totalCandidates} candidates
            {skippedChunks > 0 && (
              <span className="text-crimson"> · {skippedChunks} batch(es) skipped (Universalis error)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <InlineDensityToggle />
            {csvColumns && csvFilename && (
              <ExportCsvButton rows={rows} columns={csvColumns} filename={csvFilename} />
            )}
          </div>
        </div>
        {renderMobile && (
          <div className="md:hidden border border-border-base bg-bg-card divide-y divide-border-base">
            {renderMobile(lm.visible)}
            <LoadMoreFooter
              hasMore={lm.hasMore}
              total={lm.total}
              shown={lm.shown}
              onLoadMore={lm.loadMore}
            />
          </div>
        )}
        <div className={tableWrapClass}>
          {renderTable(lm.visible)}
          <LoadMoreFooter
            hasMore={lm.hasMore}
            total={lm.total}
            shown={lm.shown}
            onLoadMore={lm.loadMore}
          />
        </div>
      </div>
    </IgnoreAffordanceContext.Provider>
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

/** Compact density toggle for result-table toolbars. Reads/writes the shared UI store. */
function InlineDensityToggle() {
  const density = useUiStore((s) => s.density);
  const setDensity = useUiStore((s) => s.setDensity);
  const opts: { id: 'compact' | 'comfortable'; label: string; title: string }[] = [
    { id: 'compact', label: 'Compact', title: 'Denser rows' },
    { id: 'comfortable', label: 'Comfy', title: 'Roomier rows' },
  ];
  return (
    <div className="inline-flex border border-border-base" role="group" aria-label="Row density">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setDensity(o.id)}
          title={o.title}
          className={`font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 border-r border-border-base last:border-r-0 transition-colors ${
            density === o.id ? 'bg-bg-card-hi text-aether' : 'text-text-dim hover:text-aether'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
