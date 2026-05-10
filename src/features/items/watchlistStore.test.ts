import { describe, it, expect, beforeEach } from 'vitest';
import { useWatchlistStore, defaultWatchlist } from './watchlistStore';

beforeEach(() => {
  localStorage.clear();
  useWatchlistStore.setState(defaultWatchlist());
});

describe('watchlist store', () => {
  it('starts with default starter pack toggles', () => {
    const s = useWatchlistStore.getState();
    expect(s.starterPacks['raid-current']).toBe(true);
    expect(s.starterPacks['housing-faves']).toBe(false);
    expect(s.customItems).toEqual([]);
  });

  it('togglePack flips a pack on/off', () => {
    useWatchlistStore.getState().togglePack('housing-faves');
    expect(useWatchlistStore.getState().starterPacks['housing-faves']).toBe(true);
    useWatchlistStore.getState().togglePack('housing-faves');
    expect(useWatchlistStore.getState().starterPacks['housing-faves']).toBe(false);
  });

  it('addCustomItem appends and dedupes by id', () => {
    const item = { id: 12345, name: 'Test Item', crafter: 'CRP' as const, lvl: 90, cat: 'Glamour' as const };
    useWatchlistStore.getState().addCustomItem(item);
    useWatchlistStore.getState().addCustomItem(item);
    expect(useWatchlistStore.getState().customItems).toHaveLength(1);
    expect(useWatchlistStore.getState().customItems[0].id).toBe(12345);
  });

  it('removeCustomItem drops by id', () => {
    const a = { id: 1, name: 'A', crafter: 'CRP' as const, lvl: 1, cat: 'Glamour' as const };
    const b = { id: 2, name: 'B', crafter: 'WVR' as const, lvl: 1, cat: 'Glamour' as const };
    useWatchlistStore.getState().addCustomItem(a);
    useWatchlistStore.getState().addCustomItem(b);
    useWatchlistStore.getState().removeCustomItem(1);
    expect(useWatchlistStore.getState().customItems.map((i) => i.id)).toEqual([2]);
  });

  it('perItemFlags starts empty', () => {
    expect(useWatchlistStore.getState().perItemFlags).toEqual({});
  });

  it('setCraftIntermediates flips a single item flag', () => {
    useWatchlistStore.getState().setCraftIntermediates(123, true);
    expect(useWatchlistStore.getState().perItemFlags[123]?.craftIntermediates).toBe(true);
    useWatchlistStore.getState().setCraftIntermediates(123, false);
    expect(useWatchlistStore.getState().perItemFlags[123]?.craftIntermediates).toBe(false);
  });

  it('setCraftTime stores per-item override', () => {
    useWatchlistStore.getState().setCraftTime(42, 90);
    expect(useWatchlistStore.getState().perItemFlags[42]?.craftTimeSeconds).toBe(90);
  });

  it('setCraftTime preserves craftIntermediates flag when updating time', () => {
    useWatchlistStore.getState().setCraftIntermediates(42, true);
    useWatchlistStore.getState().setCraftTime(42, 75);
    expect(useWatchlistStore.getState().perItemFlags[42]).toEqual({ craftIntermediates: true, craftTimeSeconds: 75 });
  });

  it('setCraftTime with 0 or undefined removes the override but keeps other flags', () => {
    useWatchlistStore.getState().setCraftIntermediates(42, true);
    useWatchlistStore.getState().setCraftTime(42, 75);
    useWatchlistStore.getState().setCraftTime(42, 0);
    expect(useWatchlistStore.getState().perItemFlags[42]).toEqual({ craftIntermediates: true });
  });

  it('excludedItems starts empty', () => {
    expect(useWatchlistStore.getState().excludedItems).toEqual([]);
  });

  it('toggleExcluded adds and removes ids idempotently', () => {
    useWatchlistStore.getState().toggleExcluded(99);
    expect(useWatchlistStore.getState().excludedItems).toEqual([99]);
    useWatchlistStore.getState().toggleExcluded(99);
    expect(useWatchlistStore.getState().excludedItems).toEqual([]);
  });

  it('toggleExcluded preserves other excluded ids', () => {
    useWatchlistStore.getState().toggleExcluded(1);
    useWatchlistStore.getState().toggleExcluded(2);
    useWatchlistStore.getState().toggleExcluded(1);
    expect(useWatchlistStore.getState().excludedItems).toEqual([2]);
  });
});
