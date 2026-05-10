import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMarketData } from './useMarketData';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('useMarketData', () => {
  it('fetches Phantom + Chaos in parallel and returns both', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const isPhantom = url.includes('/Phantom/');
      const items = isPhantom
        ? { '1': { listings: [{ hq: false, pricePerUnit: 100 }], recentHistory: [], regularSaleVelocity: 1, lastUploadTime: 1 } }
        : { '1': { listings: [{ hq: false, pricePerUnit: 90  }], recentHistory: [], regularSaleVelocity: 5, lastUploadTime: 1 } };
      return Promise.resolve({ ok: true, json: async () => ({ items }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useMarketData([1], 'Phantom', 'Chaos'),
      { wrapper: wrap() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.phantom['1'].minNQ).toBe(100);
    expect(result.current.data!.dc['1'].minNQ).toBe(90);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does nothing when ids array is empty', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(
      () => useMarketData([], 'Phantom', 'Chaos'),
      { wrapper: wrap() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
