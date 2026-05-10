import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useItemNames } from './useItemNames';
import { clearNameCache } from '../../lib/recipeCache';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await clearNameCache();
});

describe('useItemNames', () => {
  it('returns names from a single batched fetch on cache miss', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      calls++;
      return Promise.resolve({
        ok: true,
        json: async () => ({ rows: [
          { row_id: 1, fields: { Name: 'Item 1' } },
          { row_id: 2, fields: { Name: 'Item 2' } },
        ] }),
      });
    }));

    const { result } = renderHook(() => useItemNames([1, 2]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(1)).toBe('Item 1');
    expect(result.current.data!.get(2)).toBe('Item 2');
    expect(calls).toBe(1);
  });

  it('skips network when all ids are cached', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { putCachedName } = await import('../../lib/recipeCache');
    await putCachedName(1, 'Cached');

    const { result } = renderHook(() => useItemNames([1]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(1)).toBe('Cached');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only fetches missing ids when partially cached', async () => {
    const { putCachedName } = await import('../../lib/recipeCache');
    await putCachedName(1, 'Cached One');

    let calledWith = '';
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      calledWith = url;
      return Promise.resolve({
        ok: true,
        json: async () => ({ rows: [{ row_id: 2, fields: { Name: 'Fetched Two' } }] }),
      });
    }));

    const { result } = renderHook(() => useItemNames([1, 2]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(1)).toBe('Cached One');
    expect(result.current.data!.get(2)).toBe('Fetched Two');
    expect(calledWith).toContain('rows=2');
    expect(calledWith).not.toContain('rows=1,2');
  });
});
