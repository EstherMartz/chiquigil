import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLevePlanQuery } from './useLevePlanQuery';
import { useLevePlanStore, defaultLevePlan } from './levePlanStore';

vi.mock('../queries/useLeveSnapshot', () => ({
  useLeveSnapshot: () => ({
    data: {
      leves: [
        { id: 100, name: 'A', level: 30, type: 'doh', classJob: 15, city: 'X',
          baseGil: 1000, baseExp: 5000, hqGilMultiplier: 2.0,
          targetItemId: 5001, targetItemQty: 1 },
      ],
      updatedAt: 1,
    },
  }),
}));

vi.mock('../queries/useRecipeSnapshot', () => ({
  useRecipeSnapshot: () => ({
    data: new Map([[5001, { itemResultId: 5001, classJob: 'CUL', recipeLevel: 30,
      ingredients: [{ itemId: 6001, amount: 2 }] }]]),
  }),
}));

vi.mock('../settings/store', () => ({
  useSettingsStore: () => ({ world: 'Phantom' }),
}));

vi.mock('../../lib/universalisBulk', () => ({
  fetchInBatches: async () => ({
    data: { '6001': { minNQ: 50, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null,
      medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0,
      listingCount: 0, worldListings: [], averagePriceNQ: null, averagePriceHQ: null } },
    errors: [],
  }),
}));

vi.mock('../../lib/universalis', () => ({
  fetchMarketData: vi.fn(),
}));

function withProviders(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  localStorage.clear();
  useLevePlanStore.setState(defaultLevePlan());
});

describe('useLevePlanQuery', () => {
  it('returns ready=true once snapshots resolve', () => {
    const { result } = renderHook(() => useLevePlanQuery(), { wrapper: ({ children }) => withProviders(children) });
    expect(result.current.ready).toBe(true);
  });

  it('produces a ranked row after run()', async () => {
    const { result } = renderHook(() => useLevePlanQuery(), { wrapper: ({ children }) => withProviders(children) });
    act(() => { result.current.run(); });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    // grossGil=1000*2*1=2000, matCost=50*2*1=100, netGil=1900
    expect(result.current.rows[0].netGil).toBe(1900);
  });
});
