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
  if (total === 0) return null;
  return (
    <div className="border-t border-border-base bg-bg-card py-3 px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">
        Showing {shown} of {total}
      </div>
      {hasMore ? (
        <button
          onClick={onLoadMore}
          className="font-mono text-[10px] tracking-[0.3em] uppercase border border-border-base px-4 py-2 hover:border-gold hover:text-gold transition-colors text-text-dim self-start sm:self-auto"
        >
          Load more · +{Math.min(pageSize, total - shown)}
        </button>
      ) : (
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low italic">
          {emptyLabel ?? 'End of list — no more items'}
        </div>
      )}
    </div>
  );
}
