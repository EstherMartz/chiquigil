import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSettingsStore } from './store';
import { useIgnoredItemSet } from './useIgnoredItems';

describe('useIgnoredItemSet', () => {
  beforeEach(() => useSettingsStore.setState({ ignoredItemIds: [1, 2, 3] }));

  it('returns a Set mirroring ignoredItemIds', () => {
    const { result } = renderHook(() => useIgnoredItemSet());
    expect(result.current.has(2)).toBe(true);
    expect(result.current.has(99)).toBe(false);
  });

  it('keeps the same Set identity when the array does not change', () => {
    const { result, rerender } = renderHook(() => useIgnoredItemSet());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
