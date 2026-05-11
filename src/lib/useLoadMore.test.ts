import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoadMore } from './useLoadMore';

const seq = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('useLoadMore', () => {
  it('shows the first pageSize items on mount', () => {
    const { result } = renderHook(() => useLoadMore(seq(80), 25));
    expect(result.current.visible).toHaveLength(25);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.total).toBe(80);
    expect(result.current.shown).toBe(25);
  });

  it('loadMore reveals the next pageSize items', () => {
    const rows = seq(80);
    const { result } = renderHook(() => useLoadMore(rows, 25));
    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(50);
    expect(result.current.shown).toBe(50);
    expect(result.current.hasMore).toBe(true);
  });

  it('caps at the source length and hasMore goes false', () => {
    const rows = seq(40);
    const { result } = renderHook(() => useLoadMore(rows, 25));
    act(() => result.current.loadMore());
    expect(result.current.visible).toHaveLength(40);
    expect(result.current.shown).toBe(40);
    expect(result.current.hasMore).toBe(false);
  });

  it('handles fewer items than pageSize', () => {
    const { result } = renderHook(() => useLoadMore(seq(10), 25));
    expect(result.current.visible).toHaveLength(10);
    expect(result.current.shown).toBe(10);
    expect(result.current.hasMore).toBe(false);
  });

  it('resets to first page when the rows reference changes', () => {
    const { result, rerender } = renderHook(({ rows }) => useLoadMore(rows, 25), {
      initialProps: { rows: seq(80) },
    });
    act(() => result.current.loadMore());
    expect(result.current.shown).toBe(50);

    rerender({ rows: seq(40) });
    expect(result.current.shown).toBe(25);
    expect(result.current.hasMore).toBe(true);
  });

  it('renders empty list cleanly', () => {
    const { result } = renderHook(() => useLoadMore<number>([], 25));
    expect(result.current.visible).toEqual([]);
    expect(result.current.shown).toBe(0);
    expect(result.current.total).toBe(0);
    expect(result.current.hasMore).toBe(false);
  });
});
