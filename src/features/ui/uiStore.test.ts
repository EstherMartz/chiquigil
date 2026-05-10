import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore, defaultUi } from './uiStore';

beforeEach(() => {
  localStorage.clear();
  useUiStore.setState(defaultUi());
});

describe('ui store', () => {
  it('defaults', () => {
    const s = useUiStore.getState();
    expect(s.catFilter).toBe('All');
    expect(s.craftFilter).toBe('All');
    expect(s.sortKey).toBe('score');
    expect(s.sortDir).toBe('desc');
    expect(s.search).toBe('');
  });

  it('setSort toggles direction when clicking the same key', () => {
    useUiStore.getState().setSort('score');
    expect(useUiStore.getState().sortDir).toBe('asc');
    useUiStore.getState().setSort('score');
    expect(useUiStore.getState().sortDir).toBe('desc');
  });

  it('setSort on a new key uses asc for name/crafter, desc for everything else', () => {
    useUiStore.getState().setSort('name');
    expect(useUiStore.getState().sortKey).toBe('name');
    expect(useUiStore.getState().sortDir).toBe('asc');

    useUiStore.getState().setSort('phantom');
    expect(useUiStore.getState().sortDir).toBe('desc');
  });
});
