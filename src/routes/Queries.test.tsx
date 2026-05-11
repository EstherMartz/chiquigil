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

  it('Undersupply preset: home-world fetch + lazy recipes + maxListings filter', async () => {
    await putCachedItems([
      { id: 200, name: 'Scarce Craft', sc: 56, ui: 65, ilvl: 90, canHq: true },
      { id: 201, name: 'Oversupplied', sc: 56, ui: 65, ilvl: 90, canHq: true },
      { id: 299, name: 'Ingredient',   sc: 47, ui: 0,  ilvl: 1,  canHq: false },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      // Universalis (item prices) — match by URL pattern
      if (url.includes('universalis.app/api/v2/')) {
        return {
          ok: true,
          json: async () => ({
            items: {
              '200': {
                listings: [{ hq: true, pricePerUnit: 1000, worldName: 'Phantom' }],
                recentHistory: [],
                regularSaleVelocity: 2,
                lastUploadTime: Date.now(),
                averagePriceNQ: null,
                averagePriceHQ: 1200,
              },
              '201': {
                listings: Array.from({ length: 6 }, () => ({ hq: true, pricePerUnit: 1000, worldName: 'Phantom' })),
                recentHistory: [],
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
      // XIVAPI recipe search — return a recipe for item 200, nothing for 201
      if (url.includes('xivapi.com/api/search') && url.includes('ItemResult%3D200')) {
        return {
          ok: true,
          json: async () => ({
            results: [{
              fields: {
                ItemResult: { value: 200 },
                CraftType: { fields: { Name: 'Leatherworker' } },
                RecipeLevelTable: { fields: { ClassJobLevel: 90 } },
                Ingredient0: { value: 299 },
                AmountIngredient0: 2,
              },
            }],
          }),
        };
      }
      // Any other XIVAPI call (e.g. for items that don't qualify) — return no results
      if (url.includes('xivapi.com')) {
        return { ok: true, json: async () => ({ results: [] }) };
      }
      return { ok: false, status: 404 };
    }));

    render(withProviders(<Queries />));
    fireEvent.click(await screen.findByRole('button', { name: /undersupply/i }));
    fireEvent.click(screen.getByRole('button', { name: /run query/i }));

    // Item 200 should appear (canHq, 1 listing, velocity 2, recipe resolved).
    // Item 201 dropped by maxListings (6 > 2).
    await waitFor(
      () => expect(screen.getByText(/Scarce Craft/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByText(/Oversupplied/)).toBeNull();
  });
});
