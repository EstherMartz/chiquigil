import { useEffect, useState } from 'react';

export interface LoadMoreState<T> {
  visible: T[];
  hasMore: boolean;
  loadMore: () => void;
  total: number;
  shown: number;
}

/**
 * Paginates a list with a "load more" button. Resets to the first page whenever
 * the source `rows` reference changes (e.g., after a fresh query).
 */
export function useLoadMore<T>(rows: T[], pageSize = 25): LoadMoreState<T> {
  const [count, setCount] = useState(pageSize);

  useEffect(() => {
    setCount(pageSize);
  }, [rows, pageSize]);

  const shown = Math.min(count, rows.length);
  return {
    visible: rows.slice(0, count),
    hasMore: count < rows.length,
    loadMore: () => setCount((c) => Math.min(c + pageSize, rows.length)),
    total: rows.length,
    shown,
  };
}
