import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import Trading from './Trading';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { useWatchlistStore, defaultWatchlist } from '../features/items/watchlistStore';
import { clearItemCache, clearRecipeCache, putCachedItems } from '../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useWatchlistStore.setState(defaultWatchlist());
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

describe('Trading route', () => {
  it('renders three tabs with Arbitrage active by default', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));
    render(withProviders(<Trading />));
    expect(screen.getByRole('button', { name: /arbitrage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /best deals/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /queries/i })).toBeInTheDocument();
  });

  it('switches to Best deals when its tab is clicked', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));
    render(withProviders(<Trading />));
    fireEvent.click(screen.getByRole('button', { name: /best deals/i }));
    expect(screen.getByText(/Min discount/i)).toBeInTheDocument();
  });

  it('Queries tab renders only trading preset chips', async () => {
    await putCachedItems([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));
    render(withProviders(<Trading />));
    fireEvent.click(screen.getByRole('button', { name: /^queries$/i }));
    expect(await screen.findByRole('button', { name: /mega value hq/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fast sellers hq/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /food & potions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /furnishings discount/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reposts \(camp\)/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undersupply/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /craft-flip phantom/i })).toBeNull();
  });

  it('Reposts preset: surfaces wall-gap opportunities, drops tied-sellers', async () => {
    await putCachedItems([
      { id: 300, name: 'Pixie Cotton',  sc: 50, ui: 30, ilvl: 90, canHq: true },
      { id: 301, name: 'Tied Sellers',  sc: 50, ui: 30, ilvl: 90, canHq: true },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: {
          '300': {
            listings: [
              { hq: false, pricePerUnit: 80_000,  worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
            ],
            recentHistory: [],
            regularSaleVelocity: 1.5,
            lastUploadTime: Date.now(),
            averagePriceNQ: 130_000,
            averagePriceHQ: null,
          },
          '301': {
            listings: [
              { hq: false, pricePerUnit: 100_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 100_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 100_000, worldName: 'Phantom' },
            ],
            recentHistory: [],
            regularSaleVelocity: 5,
            lastUploadTime: Date.now(),
            averagePriceNQ: 100_000,
            averagePriceHQ: null,
          },
        },
      }),
    }));

    render(withProviders(<Trading />));
    fireEvent.click(screen.getByRole('button', { name: /^queries$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /reposts \(camp\)/i }));
    fireEvent.click(await screen.findByRole('button', { name: /run query/i }));

    await waitFor(
      () => expect(screen.getByText(/Pixie Cotton/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByText(/Tied Sellers/)).toBeNull();
  });
});
