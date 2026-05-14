import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { QueriesView } from './QueriesView';
import { useSettingsStore, defaultSettings } from '../settings/store';
import { clearItemCache, clearRecipeCache, putCachedItems, putCachedGatheringCatalog } from '../../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  await clearItemCache();
  await clearRecipeCache();
  vi.restoreAllMocks();
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('QueriesView', () => {
  it('fires onRowsChange with an empty array before a query runs', async () => {
    // Seed snapshot + gathering catalog so the view renders the QueryBuilder.
    await putCachedItems([]);
    await putCachedGatheringCatalog([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));

    const onRowsChange = vi.fn();
    render(withProviders(<QueriesView category="gathering" onRowsChange={onRowsChange} />));

    // When derived is null (before a query runs), the effect fires onRowsChange([]).
    await waitFor(() => {
      expect(onRowsChange).toHaveBeenCalledWith([]);
    });
  });
});
