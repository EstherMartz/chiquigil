import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SessionPlanner from './SessionPlanner';
import { useSettingsStore, defaultSettings } from '../settings/store';
import { useWatchlistStore, defaultWatchlist } from '../items/watchlistStore';
import { useUiStore, defaultUi } from '../ui/uiStore';
import { clearRecipeCache } from '../../lib/recipeCache';

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

describe('SessionPlanner', () => {
  it('renders an item suggestion when market + recipe data resolve', async () => {
    // Multiple async waits (data load, Generate click, result render) — give it room.
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('universalis.app')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: {
              '49281': { listings: [{ hq: false, pricePerUnit: 250000 }], recentHistory: [], regularSaleVelocity: 4, lastUploadTime: Date.now() },
              '7': { listings: [{ hq: false, pricePerUnit: 1000 }], recentHistory: [], regularSaleVelocity: 0, lastUploadTime: Date.now() },
            },
          }),
        });
      }
      const isFor49281 = url.includes('ItemResult%3D49281');
      return Promise.resolve({
        ok: true,
        json: async () => isFor49281
          ? {
            results: [{
              fields: {
                ItemResult: { value: 49281 },
                CraftType: { fields: { Name: 'Leatherworker' } },
                RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
                Ingredient0: { value: 7 }, AmountIngredient0: 5,
              },
            }],
          }
          : { results: [] },
      });
    }));

    render(withProviders(<SessionPlanner />));

    // Wait for the Generate button to be enabled (data loaded), then click.
    const generateBtn = await screen.findByRole('button', { name: /generate/i }, { timeout: 5000 });
    await waitFor(() => expect(generateBtn).not.toBeDisabled(), { timeout: 5000 });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      // Item name now appears in both the Hero and the Docket — at least one match.
      expect(screen.getAllByText(/Courtly Lover's Temple Chain of Striking/).length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  }, 15_000);
});
