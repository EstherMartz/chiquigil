import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Item from './Item';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { useWatchlistStore, defaultWatchlist } from '../features/items/watchlistStore';
import {
  clearItemCache, clearRecipeSnapshot, putCachedItems, putCachedRecipeSnapshot,
  clearMarketCache, clearGatheringCatalog,
  clearSpecialShopCache, putCachedSpecialShop,
} from '../lib/recipeCache';
import { _resetMarketCacheForTests } from '../lib/universalis';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  await clearItemCache();
  await clearRecipeSnapshot();
  await clearMarketCache();
  await clearGatheringCatalog();
  await clearSpecialShopCache();
  _resetMarketCacheForTests();
  vi.restoreAllMocks();
});

function withProviders(initial: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/item/:id" element={<Item />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Item route', () => {
  it('shows an error banner for a non-numeric id', () => {
    render(withProviders('/item/abc'));
    expect(screen.getByText(/invalid item id/i)).toBeInTheDocument();
  });

  it('renders the item name and ilvl from the snapshot', async () => {
    await putCachedItems([
      { id: 5057, name: 'Earth Shard', sc: 58, ui: 0, ilvl: 1, canHq: false },
    ]);
    await putCachedRecipeSnapshot([]);
    // Stub fetch so Universalis price + Garland calls don't hit the network.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    render(withProviders('/item/5057'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /earth shard/i })).toBeInTheDocument();
    });
  });

  it('renders the recipe section when a recipe exists for the item', async () => {
    await putCachedItems([
      { id: 10, name: 'Maple Lumber', sc: 49, ui: 0, ilvl: 1, canHq: true },
      { id: 11, name: 'Maple Log',    sc: 49, ui: 0, ilvl: 1, canHq: false },
    ]);
    await putCachedRecipeSnapshot([
      [10, { itemResultId: 10, classJob: 'CRP', recipeLevel: 50, ingredients: [{ itemId: 11, amount: 3 }] }],
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    render(withProviders('/item/10'));

    await waitFor(() => {
      expect(screen.getByText(/crafting recipe/i)).toBeInTheDocument();
    });
    // Ingredient row is a link to /item/11
    const ingLink = await screen.findByRole('link', { name: /maple log/i });
    expect(ingLink.getAttribute('href')).toBe('/item/11');
  });

  it('renders the "used in" section for an ingredient that appears in other recipes', async () => {
    await putCachedItems([
      { id: 11, name: 'Maple Log',    sc: 49, ui: 0, ilvl: 1, canHq: false },
      { id: 10, name: 'Maple Lumber', sc: 49, ui: 0, ilvl: 1, canHq: true  },
    ]);
    await putCachedRecipeSnapshot([
      [10, { itemResultId: 10, classJob: 'CRP', recipeLevel: 50, ingredients: [{ itemId: 11, amount: 3 }] }],
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    render(withProviders('/item/11'));

    await waitFor(() => {
      expect(screen.getByText(/used in 1 recipe/i)).toBeInTheDocument();
    });
    const resultLink = await screen.findByRole('link', { name: /maple lumber/i });
    expect(resultLink.getAttribute('href')).toBe('/item/10');
  });

  it('renders the Add to watchlist button on the item header', async () => {
    await putCachedItems([
      { id: 5057, name: 'Earth Shard', sc: 58, ui: 0, ilvl: 1, canHq: false },
    ]);
    await putCachedRecipeSnapshot([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    useWatchlistStore.setState(defaultWatchlist());
    render(withProviders('/item/5057'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\+ watchlist/i })).toBeInTheDocument();
    });
  });

  it('flips to the remove state after adding', async () => {
    await putCachedItems([
      { id: 5057, name: 'Earth Shard', sc: 58, ui: 0, ilvl: 1, canHq: false },
    ]);
    await putCachedRecipeSnapshot([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    useWatchlistStore.setState(defaultWatchlist());
    render(withProviders('/item/5057'));
    const addBtn = await screen.findByRole('button', { name: /\+ watchlist/i });
    addBtn.click();
    expect(await screen.findByRole('button', { name: /on watchlist · remove/i })).toBeInTheDocument();
  });

  it('renders the CurrencySourceCard when the item is sold by a special-shop currency', async () => {
    await putCachedItems([
      { id: 5057, name: 'Earth Shard', sc: 58, ui: 0, ilvl: 1, canHq: false },
    ]);
    await putCachedRecipeSnapshot([]);
    await putCachedSpecialShop({
      byCurrency: new Map([
        ['poetics', [
          { itemId: 5057, receiveQty: 1, costPerUnit: 10, isHq: false },
        ]],
      ]),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    render(withProviders('/item/5057'));

    await waitFor(() => {
      expect(screen.getByText(/currency source/i)).toBeInTheDocument();
    });
    const poeticsLink = screen.getByRole('link', { name: /^Poetics$/ });
    expect(poeticsLink.getAttribute('href')).toBe('/currency-flip?currency=poetics');
  });

  it('hides the CurrencySourceCard when the item is not in the special-shop catalog', async () => {
    await putCachedItems([
      { id: 5057, name: 'Earth Shard', sc: 58, ui: 0, ilvl: 1, canHq: false },
    ]);
    await putCachedRecipeSnapshot([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    render(withProviders('/item/5057'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /earth shard/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/currency source/i)).not.toBeInTheDocument();
  });

  it('renders Cross-world listings section when region data is populated', async () => {
    await putCachedItems([
      { id: 5057, name: 'Earth Shard', sc: 58, ui: 0, ilvl: 1, canHq: false },
    ]);
    await putCachedRecipeSnapshot([]);
    // Mock Universalis: home (Phantom), DC (Chaos), region (Europe) all return data.
    // Region payload carries the cross-world listings the new section renders.
    const regionItem = {
      listings: [
        { hq: false, pricePerUnit: 8, worldName: 'Lich' },
        { hq: false, pricePerUnit: 10, worldName: 'Phantom' },
      ],
      recentHistory: [],
      regularSaleVelocity: 1,
      lastUploadTime: 1,
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('universalis.app')) {
        return { ok: true, status: 200, json: async () => ({ items: { '5057': regionItem } }) };
      }
      return { ok: false, status: 404 };
    }));

    render(withProviders('/item/5057'));

    await waitFor(() => {
      expect(screen.getByText(/cross-world listings/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Lich/)).toBeInTheDocument();
  });
});
