import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMarketData } from './useMarketData';
import type { MarketData } from '../../lib/universalis';

vi.mock('../../lib/universalis', async () => {
  const actual = await vi.importActual<typeof import('../../lib/universalis')>('../../lib/universalis');
  const fixture: Record<string, Record<string, unknown>> = {
    Phantom: {
      '1': { minNQ: 100, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: 100, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 1, listingCount: 1, worldListings: [{ world: 'Phantom', price: 100, hq: false }], averagePriceNQ: null, averagePriceHQ: null },
    },
    Chaos: {
      '1': { minNQ: 90, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: 90, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 5, lastUploadTime: 1, listingCount: 1, worldListings: [{ world: 'Phantom', price: 90, hq: false }], averagePriceNQ: null, averagePriceHQ: null },
    },
  };
  const resolve = (scope: string, ids: number[]): MarketData => {
    const scopeData = fixture[scope] ?? {};
    const result: MarketData = {};
    for (const id of ids) result[String(id)] = (scopeData[String(id)] ?? { minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0, worldListings: [], averagePriceNQ: null, averagePriceHQ: null }) as MarketData[string];
    return result;
  };
  return {
    ...actual,
    fetchMarketData: vi.fn(async (scope: string, ids: number[]) => resolve(scope, ids)),
    fetchMarketLive: vi.fn(async (scope: string, ids: number[]) => resolve(scope, ids)),
  };
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('useMarketData', () => {
  it('fetches Phantom + Chaos in parallel and returns both', async () => {
    const { result } = renderHook(
      () => useMarketData([1], 'Phantom', 'Chaos'),
      { wrapper: wrap() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.phantom['1'].minNQ).toBe(100);
    expect(result.current.data!.dc['1'].minNQ).toBe(90);
  });

  it('live mode fetches straight from Universalis (fetchMarketLive)', async () => {
    const { result } = renderHook(
      () => useMarketData([1], 'Phantom', 'Chaos', undefined, { live: true }),
      { wrapper: wrap() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.phantom['1'].minNQ).toBe(100);
    expect(result.current.data!.dc['1'].minNQ).toBe(90);
  });

  it('does nothing when ids array is empty', () => {
    const { result } = renderHook(
      () => useMarketData([], 'Phantom', 'Chaos'),
      { wrapper: wrap() },
    );
    expect(result.current.fetchStatus).toBe('idle');
  });
});
