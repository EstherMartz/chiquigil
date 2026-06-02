import { useEffect, useRef } from 'react';

interface Props {
  hasMore: boolean;
  total: number;
  shown: number;
  onLoadMore: () => void;
  pageSize?: number;
  /** When set, override the "no more items" empty state copy. */
  emptyLabel?: string;
}

export function LoadMoreFooter({ hasMore, total, shown, onLoadMore, pageSize = 25, emptyLabel }: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const hasObserver = typeof IntersectionObserver !== 'undefined';

  // Auto-load the next page when the sentinel scrolls into view. Re-observes on
  // each `shown` change so a sentinel that stays visible (tall viewport) keeps
  // filling until the list ends or the content overflows the viewport.
  useEffect(() => {
    if (!hasMore || !hasObserver) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) onLoadMoreRef.current(); },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, hasObserver, shown]);

  if (total === 0) return null;

  return (
    <div className="border-t border-border-base bg-bg-card py-3 px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">
        Showing {shown} of {total}
      </div>
      {hasMore ? (
        hasObserver ? (
          <div
            ref={sentinelRef}
            className="font-mono text-[10px] tracking-widest uppercase text-text-low italic"
          >
            Loading more…
          </div>
        ) : (
          <button
            onClick={onLoadMore}
            className="font-mono text-[10px] tracking-[0.3em] uppercase border border-border-base px-4 py-2 hover:border-gold hover:text-gold transition-colors text-text-dim self-start sm:self-auto"
          >
            Load more · +{Math.min(pageSize, total - shown)}
          </button>
        )
      ) : (
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low italic">
          {emptyLabel ?? 'End of list — no more items'}
        </div>
      )}
    </div>
  );
}
