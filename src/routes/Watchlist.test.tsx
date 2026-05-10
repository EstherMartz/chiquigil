import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Watchlist from './Watchlist';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { useWatchlistStore, defaultWatchlist } from '../features/items/watchlistStore';
import { useUiStore, defaultUi } from '../features/ui/uiStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useWatchlistStore.setState(defaultWatchlist());
  useUiStore.setState(defaultUi());
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
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve({
      ok: true,
      json: async () => ({
        items: {
          '49281': { listings: [{ hq: false, pricePerUnit: 250000 }], recentHistory: [], regularSaleVelocity: 2.5, lastUploadTime: Date.now() },
        },
      }),
    })));

    render(withProviders(<Watchlist />));

    await waitFor(() => {
      expect(screen.getByText(/Courtly Lover's Temple Chain of Striking/)).toBeInTheDocument();
    });
  });
});
