import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMarketData } from './useMarketData';
import type { MarketData, MarketItem } from '../../lib/universalis';

function empty(): MarketItem {
  return { minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null };
}
function present(minNQ: number): MarketItem {
  return { ...empty(), minNQ, lastUploadTime: 1, listingCount: 1, worldListings: [{ world: 'Phantom', price: minNQ, hq: false }] };
}

vi.mock('../../lib/universalis', async () => {
  const actual = await vi.importActual<typeof import('../../lib/universalis')>('../../lib/universalis');
  return {
    ...actual,
    // Cache: item 1 is in the blob (Phantom 100 / Chaos 90); everything else is a cache miss.
    fetchMarketData: vi.fn(async (scope: string, ids: number[]) => {
      const out: MarketData = {};
      for (const id of ids) out[String(id)] = id === 1 ? present(scope === 'Chaos' ? 90 : 100) : empty();
      return out;
    }),
    // Live: returns a distinct value (77) so tests can tell cache from live.
    fetchMarketLive: vi.fn(async (_scope: string, ids: number[]) => {
      const out: MarketData = {};
      for (const id of ids) out[String(id)] = present(77);
      return out;
    }),
  };
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => { vi.clearAllMocks(); });

describe('useMarketData', () => {
  it('fetches Phantom + Chaos from cache in parallel and returns both', async () => {
    const { result } = renderHook(() => useMarketData([1], 'Phantom', 'Chaos'), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.phantom['1'].minNQ).toBe(100);
    expect(result.current.data!.dc['1'].minNQ).toBe(90);
  });

  it('live mode serves cached items without re-fetching them live', async () => {
    // item 1 is in cache → result is the cache value (90), NOT the live value (77)
    const { result } = renderHook(() => useMarketData([1], 'Phantom', 'Chaos', undefined, { live: true }), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.dc['1'].minNQ).toBe(90);
  });

  it('live mode fills cache misses straight from Universalis', async () => {
    // item 7 is NOT in cache → live-filled with the live value (77)
    const { result } = renderHook(() => useMarketData([7], 'Phantom', 'Chaos', undefined, { live: true }), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.dc['7'].minNQ).toBe(77);
    expect(result.current.data!.phantom['7'].minNQ).toBe(77);
  });

  it('does nothing when ids array is empty', () => {
    const { result } = renderHook(() => useMarketData([], 'Phantom', 'Chaos'), { wrapper: wrap() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
