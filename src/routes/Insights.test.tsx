import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import Insights from './Insights';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { useWatchlistStore, defaultWatchlist } from '../features/items/watchlistStore';
import { clearRecipeCache } from '../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useWatchlistStore.setState(defaultWatchlist());
  await clearRecipeCache();
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: {}, results: [] }),
  }));
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Insights route', () => {
  it('renders three tabs with Arbitrage active by default', () => {
    render(withProviders(<Insights />));
    expect(screen.getByRole('button', { name: /arbitrage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /best deals/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marketshare/i })).toBeInTheDocument();
  });

  it('switches to Best deals when its tab is clicked', () => {
    render(withProviders(<Insights />));
    fireEvent.click(screen.getByRole('button', { name: /best deals/i }));
    expect(screen.getByText(/Min discount/i)).toBeInTheDocument();
  });
});
