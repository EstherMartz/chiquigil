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
  it('auto-runs the default scan and reports rows without a manual click', async () => {
    // Seed snapshot + gathering catalog so the view becomes ready.
    await putCachedItems([]);
    await putCachedGatheringCatalog([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));

    const onRowsChange = vi.fn();
    render(withProviders(<QueriesView category="gathering" onRowsChange={onRowsChange} />));

    // Auto-run fires on ready; with an empty snapshot the derived query rows are [].
    await waitFor(() => {
      expect(onRowsChange).toHaveBeenCalledWith([]);
    });
  });
});
