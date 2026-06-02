import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LoadMoreFooter } from './LoadMoreFooter';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Install a controllable IntersectionObserver stub; returns a trigger fn. */
function stubIO() {
  let cb: IntersectionObserverCallback | null = null;
  const observe = vi.fn();
  const disconnect = vi.fn();
  class IO {
    constructor(c: IntersectionObserverCallback) { cb = c; }
    observe = observe;
    disconnect = disconnect;
    unobserve = vi.fn();
    takeRecords = () => [];
    root = null;
    rootMargin = '';
    thresholds = [];
  }
  vi.stubGlobal('IntersectionObserver', IO as unknown as typeof IntersectionObserver);
  return {
    observe,
    disconnect,
    fire: (isIntersecting: boolean) =>
      act(() => { cb?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver); }),
  };
}

describe('LoadMoreFooter', () => {
  it('auto-loads when the sentinel intersects and more remain', () => {
    const io = stubIO();
    const onLoadMore = vi.fn();
    render(<LoadMoreFooter hasMore total={100} shown={25} onLoadMore={onLoadMore} />);
    expect(io.observe).toHaveBeenCalled();
    io.fire(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not auto-load when the sentinel is not intersecting', () => {
    const io = stubIO();
    const onLoadMore = vi.fn();
    render(<LoadMoreFooter hasMore total={100} shown={25} onLoadMore={onLoadMore} />);
    io.fire(false);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('shows the end-of-list message and does not observe when nothing remains', () => {
    const io = stubIO();
    render(<LoadMoreFooter hasMore={false} total={100} shown={100} onLoadMore={vi.fn()} />);
    expect(io.observe).not.toHaveBeenCalled();
    expect(screen.getByText(/end of list/i)).toBeInTheDocument();
  });

  it('falls back to a manual button when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined as unknown as typeof IntersectionObserver);
    const onLoadMore = vi.fn();
    render(<LoadMoreFooter hasMore total={100} shown={25} onLoadMore={onLoadMore} />);
    const btn = screen.getByRole('button', { name: /load more/i });
    fireEvent.click(btn);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
