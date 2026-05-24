import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import Crafts from './Crafts';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { clearItemCache, putCachedItems, clearRecipeSnapshot } from '../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  await clearItemCache();
  await clearRecipeSnapshot();
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

describe('Crafts route', () => {
  it('renders only craft preset chips', async () => {
    await putCachedItems([]);
    render(withProviders(<Crafts />));
    expect(await screen.findByRole('button', { name: /undersupply/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /craft-flip phantom/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mega value hq/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /fast sellers hq/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /food & potions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /furnishings discount/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reposts \(camp\)/i })).toBeNull();
  });

  it('renders the Crafts heading', async () => {
    await putCachedItems([]);
    render(withProviders(<Crafts />));
    expect(await screen.findByRole('heading', { name: /^crafts$/i })).toBeInTheDocument();
  });

  it('Undersupply preset: home-world fetch + lazy recipes + maxListings filter', async () => {
    await putCachedItems([
      { id: 200, name: 'Scarce Craft', sc: 56, ui: 65, ilvl: 90, canHq: true },
      { id: 201, name: 'Oversupplied', sc: 56, ui: 65, ilvl: 90, canHq: true },
      { id: 299, name: 'Ingredient',   sc: 47, ui: 0,  ilvl: 1,  canHq: false },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('universalis.app/api/v2/')) {
        return {
          ok: true,
          json: async () => ({
            items: {
              '200': {
                listings: [{ hq: true, pricePerUnit: 1000, worldName: 'Phantom' }],
                recentHistory: Array.from({ length: 6 }, () => ({ hq: true, pricePerUnit: 1000 })),
                regularSaleVelocity: 2,
                lastUploadTime: Date.now(),
                averagePriceNQ: null,
                averagePriceHQ: 1200,
              },
              '201': {
                listings: Array.from({ length: 6 }, () => ({ hq: true, pricePerUnit: 1000, worldName: 'Phantom' })),
                recentHistory: Array.from({ length: 6 }, () => ({ hq: true, pricePerUnit: 1000 })),
                regularSaleVelocity: 5,
                lastUploadTime: Date.now(),
                averagePriceNQ: null,
                averagePriceHQ: 1200,
              },
              '299': {
                listings: [{ hq: false, pricePerUnit: 50, worldName: 'Phantom' }],
                recentHistory: [],
                regularSaleVelocity: 5,
                lastUploadTime: Date.now(),
                averagePriceNQ: 60,
                averagePriceHQ: null,
              },
            },
          }),
        };
      }
      if (url.includes('xivapi.com/api/sheet/Recipe')) {
        const hasAfter = url.includes('after=');
        return {
          ok: true,
          json: async () => hasAfter ? { rows: [] } : {
            rows: [{
              row_id: 1,
              fields: {
                ItemResult: { value: 200 },
                CraftType: { fields: { Name: 'Leatherworker' } },
                RecipeLevelTable: { fields: { ClassJobLevel: 90 } },
                Ingredient: [{ value: 299 }],
                AmountIngredient: [2],
              },
            }],
          },
        };
      }
      if (url.includes('xivapi.com/api/search') && url.includes('ItemResult%3D200')) {
        return {
          ok: true,
          json: async () => ({
            results: [{
              fields: {
                ItemResult: { value: 200 },
                CraftType: { fields: { Name: 'Leatherworker' } },
                RecipeLevelTable: { fields: { ClassJobLevel: 90 } },
                Ingredient: [{ value: 299 }],
                AmountIngredient: [2],
              },
            }],
          }),
        };
      }
      if (url.includes('xivapi.com')) {
        return { ok: true, json: async () => ({ results: [] }) };
      }
      return { ok: false, status: 404 };
    }));

    render(withProviders(<Crafts />));
    fireEvent.click(await screen.findByRole('button', { name: /undersupply/i }));
    fireEvent.click(await screen.findByRole('button', { name: /run query/i }));

    await waitFor(
      // Item renders in both mobile card list and desktop table.
      () => expect(screen.getAllByText(/Scarce Craft/).length).toBeGreaterThanOrEqual(1),
      { timeout: 5000 },
    );
    expect(screen.queryAllByText(/Oversupplied/).length).toBe(0);
  });
});
