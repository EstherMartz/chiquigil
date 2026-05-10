import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Watchlist from './Watchlist';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { useWatchlistStore, defaultWatchlist } from '../features/items/watchlistStore';
import { useUiStore, defaultUi } from '../features/ui/uiStore';
import { clearRecipeCache } from '../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useWatchlistStore.setState(defaultWatchlist());
  useUiStore.setState(defaultUi());
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

describe('Watchlist route', () => {
  it('renders rows from a mocked Universalis response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('universalis.app')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: {
              '49281': { listings: [{ hq: false, pricePerUnit: 250000 }], recentHistory: [], regularSaleVelocity: 2.5, lastUploadTime: Date.now() },
            },
          }),
        });
      }
      // XIVAPI recipe lookup — return empty results for all items (sale-only)
      return Promise.resolve({
        ok: true,
        json: async () => ({ results: [] }),
      });
    }));

    render(withProviders(<Watchlist />));

    await waitFor(() => {
      expect(screen.getByText(/Courtly Lover's Temple Chain of Striking/)).toBeInTheDocument();
    });
  });
});
