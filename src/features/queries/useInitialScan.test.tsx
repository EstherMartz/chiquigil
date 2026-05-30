import { describe, it, expect, vi } from 'vitest';
import { renderHook, render } from '@testing-library/react';
import { useInitialScan } from './useInitialScan';

describe('useInitialScan', () => {
  it('does not fire while ready is false', () => {
    const run = vi.fn();
    renderHook(() => useInitialScan(false, run));
    expect(run).not.toHaveBeenCalled();
  });

  it('fires once when ready flips false → true', () => {
    const run = vi.fn();
    const { rerender } = renderHook(({ r }) => useInitialScan(r, run), {
      initialProps: { r: false },
    });
    expect(run).not.toHaveBeenCalled();
    rerender({ r: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('fires only once even if ready stays true across rerenders', () => {
    const run = vi.fn();
    const { rerender } = renderHook(({ r }) => useInitialScan(r, run), {
      initialProps: { r: true },
    });
    rerender({ r: true });
    rerender({ r: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not re-fire if ready toggles true → false → true again', () => {
    const run = vi.fn();
    const { rerender } = renderHook(({ r }) => useInitialScan(r, run), {
      initialProps: { r: true },
    });
    rerender({ r: false });
    rerender({ r: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('fires once per fresh mount', () => {
    const run = vi.fn();
    function Harness() { useInitialScan(true, run); return null; }
    const a = render(<Harness />);
    a.unmount();
    render(<Harness />);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
