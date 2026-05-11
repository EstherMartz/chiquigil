import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import Queries from './Queries';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { clearItemCache, putCachedItems } from '../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  await clearItemCache();
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

describe('Queries route', () => {
  it('renders all four preset chips', async () => {
    await putCachedItems([]);
    render(withProviders(<Queries />));
    expect(await screen.findByRole('button', { name: /mega value hq/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fast sellers hq/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /food & potions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /furnishings discount/i })).toBeInTheDocument();
  });

  it('runs a preset against a mocked snapshot + mocked Universalis', async () => {
    await putCachedItems([
      { id: 100, name: 'Cheap Meal', sc: 45, ui: 30, ilvl: 1, canHq: true },
      { id: 101, name: 'Expensive Meal', sc: 45, ui: 30, ilvl: 1, canHq: true },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: {
          '100': {
            listings: [{ hq: false, pricePerUnit: 40, worldName: 'Phantom' }, { hq: true, pricePerUnit: 50, worldName: 'Phantom' }],
            recentHistory: [],
            regularSaleVelocity: 1,
            lastUploadTime: Date.now(),
            averagePriceNQ: 100,
            averagePriceHQ: 100,
          },
          '101': {
            listings: [{ hq: false, pricePerUnit: 95, worldName: 'Phantom' }],
            recentHistory: [],
            regularSaleVelocity: 1,
            lastUploadTime: Date.now(),
            averagePriceNQ: 100,
            averagePriceHQ: null,
          },
        },
      }),
    }));

    render(withProviders(<Queries />));
    fireEvent.click(await screen.findByRole('button', { name: /food & potions/i }));
    fireEvent.click(screen.getByRole('button', { name: /run query/i }));

    await waitFor(() => expect(screen.getByText(/Cheap Meal/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByText(/Expensive Meal/)).toBeNull();
  });
});
