import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHousingMomentum } from './useHousingMomentum';
import { fetchHistoryWithinCached } from '../../lib/universalisHistory';

// Mock the cache-aware fetcher the hook calls; keep computeWeekDelta real
// (mergeDeltas uses it). Mocking here keeps the test off IndexedDB entirely.
vi.mock('../../lib/universalisHistory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/universalisHistory')>();
  return { ...actual, fetchHistoryWithinCached: vi.fn() };
});

describe('useHousingMomentum', () => {
  beforeEach(() => { (fetchHistoryWithinCached as Mock).mockReset(); });

  it('fetches history for visible ids and resolves them in the map', async () => {
    (fetchHistoryWithinCached as Mock).mockResolvedValue(new Map()); // no entries -> deltas resolve to null
    const { result } = renderHook(() =>
      useHousingMomentum('Phantom', 'Phantom:furnishings', [1, 2]),
    );
    await waitFor(() => {
      expect(result.current.get(1)).toBeNull();
      expect(result.current.get(2)).toBeNull();
    });
    expect(fetchHistoryWithinCached).toHaveBeenCalledWith('Phantom', [1, 2], 14 * 86400);
  });

  it('does not refetch ids already in the map', async () => {
    (fetchHistoryWithinCached as Mock).mockResolvedValue(new Map());
    const { result, rerender } = renderHook(
      ({ ids }) => useHousingMomentum('Phantom', 'Phantom:furnishings', ids),
      { initialProps: { ids: [1] } },
    );
    await waitFor(() => expect(result.current.get(1)).toBeNull());
    rerender({ ids: [1] });
    await waitFor(() => expect((fetchHistoryWithinCached as Mock).mock.calls.length).toBe(1));
  });
});
