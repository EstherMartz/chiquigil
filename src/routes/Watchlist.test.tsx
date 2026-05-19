import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Watchlist from './Watchlist';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { useWatchlistStore, defaultWatchlist } from '../features/items/watchlistStore';
import { useUiStore, defaultUi } from '../features/ui/uiStore';
import { clearRecipeCache, clearRecipeSnapshot } from '../lib/recipeCache';
import * as staticLoader from '../lib/staticSnapshots';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useWatchlistStore.setState(defaultWatchlist());
  useUiStore.setState(defaultUi());
  await clearRecipeCache();
  await clearRecipeSnapshot();
  vi.restoreAllMocks();
  vi.spyOn(staticLoader, 'loadStaticRecipesSnapshot').mockResolvedValue(null);
  vi.spyOn(staticLoader, 'loadStaticItemsSnapshot').mockResolvedValue(null);
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
              '7':     { listings: [{ hq: false, pricePerUnit: 1000 }], recentHistory: [], regularSaleVelocity: 0, lastUploadTime: Date.now() },
            },
          }),
        });
      }
      // Bulk Recipe sheet (snapshot-backed useRecipes).
      if (url.includes('/api/sheet/Recipe')) {
        const hasAfter = url.includes('after=');
        return Promise.resolve({
          ok: true,
          json: async () => hasAfter ? { rows: [] } : {
            rows: [{
              row_id: 1,
              fields: {
                ItemResult: { value: 49281 },
                CraftType: { fields: { Name: 'Leatherworker' } },
                RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
                Ingredient: [{ value: 7 }], AmountIngredient: [5],
              },
            }],
          },
        });
      }
      // Legacy per-item recipe search — kept harmless.
      return Promise.resolve({
        ok: true,
        json: async () => {
          const isFor49281 = url.includes('ItemResult%3D49281');
          return isFor49281
            ? {
                results: [{
                  fields: {
                    ItemResult: { value: 49281 },
                    CraftType: { fields: { Name: 'Leatherworker' } },
                    RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
                    Ingredient: [{ value: 7 }], AmountIngredient: [5],
                  },
                }],
              }
            : { results: [] };
        },
      });
    }));

    render(withProviders(<Watchlist />));

    await waitFor(() => {
      expect(screen.getByText(/Courtly Lover's Temple Chain of Striking/)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/245k/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
