import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import SessionPlanner from './SessionPlanner';
import { useSettingsStore, defaultSettings } from '../settings/store';
import { useWatchlistStore, defaultWatchlist } from '../items/watchlistStore';
import { useUiStore, defaultUi } from '../ui/uiStore';
import { clearRecipeCache, clearItemCache, putCachedItems } from '../../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useWatchlistStore.setState(defaultWatchlist());
  useUiStore.setState(defaultUi());
  await clearRecipeCache();
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

describe('SessionPlanner', () => {
  // Whole-market scan: pre-seed snapshot, mock Universalis + XIVAPI recipe.
  it('scans the snapshot and renders a top pick after Generate', async () => {
    // Seed item catalog (snapshot) with one craftable target + one ingredient.
    await putCachedItems([
      { id: 49281, name: "Courtly Lover's Temple Chain of Striking", sc: 31, ui: 0, ilvl: 770, canHq: true },
      { id: 7,     name: 'Maple Log', sc: 49, ui: 0, ilvl: 1, canHq: false },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      // Universalis: HQ sale at 250k, NQ at 240k, velocity 4. Ingredient ~1000.
      if (url.includes('universalis.app')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: {
              '49281': {
                listings: [{ hq: true, pricePerUnit: 250000, worldName: 'Phantom' }],
                recentHistory: [],
                regularSaleVelocity: 4,
                lastUploadTime: Date.now(),
                averagePriceHQ: 260000,
              },
              '7': {
                listings: [{ hq: false, pricePerUnit: 1000, worldName: 'Phantom' }],
                recentHistory: [],
                regularSaleVelocity: 0,
                lastUploadTime: Date.now(),
              },
            },
          }),
        });
      }
      // XIVAPI recipe: 49281 is LTW lvl 100 with 5x ingredient 7.
      const isFor49281 = url.includes('ItemResult%3D49281');
      return Promise.resolve({
        ok: true,
        json: async () =>
          isFor49281
            ? {
                results: [{
                  fields: {
                    ItemResult: { value: 49281 },
                    CraftType: { fields: { Name: 'Leatherworker' } },
                    RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
                    Ingredient0: { value: 7 },
                    AmountIngredient0: 5,
                  },
                }],
              }
            : { results: [] },
      });
    }));

    render(withProviders(<SessionPlanner />));

    // Wait for the Generate button to be enabled (snapshot ready).
    const generateBtn = await screen.findByRole('button', { name: /generate/i }, { timeout: 5000 });
    await waitFor(() => expect(generateBtn).not.toBeDisabled(), { timeout: 5000 });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      // Item appears in the Hero (and the Docket) once scan + recipes resolve.
      expect(screen.getAllByText(/Courtly Lover's Temple Chain of Striking/).length).toBeGreaterThan(0);
    }, { timeout: 8000 });
  }, 20_000);
});
