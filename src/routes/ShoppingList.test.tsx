import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useShoppingListStore, defaultShoppingList } from '../features/shoppingList/shoppingListStore';

// Mock data hooks before importing the component.
vi.mock('../features/queries/useItemSnapshot', () => ({
  useItemSnapshot: () => ({
    data: {
      items: [
        { id: 100, name: 'Widget', sc: 1, ui: 1, ilvl: 1, canHq: true },
        { id: 5, name: 'Iron Ingot', sc: 1, ui: 1, ilvl: 1, canHq: false },
        { id: 2, name: 'Fire Shard', sc: 58, ui: 1, ilvl: 1, canHq: false },
        { id: 10, name: 'Iron Ore', sc: 1, ui: 1, ilvl: 1, canHq: false },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('../features/queries/useRecipeSnapshot', () => ({
  useRecipeSnapshot: () => ({
    data: new Map([
      [100, { itemResultId: 100, classJob: 'CRP', recipeLevel: 1, ingredients: [{ itemId: 5, amount: 2 }, { itemId: 2, amount: 4 }] }],
      [5, { itemResultId: 5, classJob: 'BSM', recipeLevel: 1, ingredients: [{ itemId: 10, amount: 3 }] }],
    ]),
    isLoading: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    error: null,
    progress: 0,
  }),
}));

vi.mock('../features/watchlist/useMarketData', () => ({
  useMarketData: () => ({
    data: {
      phantom: {},
      dc: {},
      region: {
        100: {
          minNQ: null, minHQ: 500,
          worldListings: [{ world: 'Phantom', price: 500, hq: true }],
          velocity: 0, lastUploadTime: 0, listingCount: 1,
          averagePriceNQ: null, averagePriceHQ: null,
          avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
          recentSalesNQ: 0, recentSalesHQ: 0,
        },
        5: {
          minNQ: 100, minHQ: null,
          worldListings: [{ world: 'Phantom', price: 100, hq: false }],
          velocity: 0, lastUploadTime: 0, listingCount: 1,
          averagePriceNQ: null, averagePriceHQ: null,
          avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
          recentSalesNQ: 0, recentSalesHQ: 0,
        },
        2: {
          minNQ: 10, minHQ: null,
          worldListings: [{ world: 'Phantom', price: 10, hq: false }],
          velocity: 0, lastUploadTime: 0, listingCount: 1,
          averagePriceNQ: null, averagePriceHQ: null,
          avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
          recentSalesNQ: 0, recentSalesHQ: 0,
        },
        10: {
          minNQ: 20, minHQ: null,
          worldListings: [{ world: 'Phantom', price: 20, hq: false }],
          velocity: 0, lastUploadTime: 0, listingCount: 1,
          averagePriceNQ: null, averagePriceHQ: null,
          avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
          recentSalesNQ: 0, recentSalesHQ: 0,
        },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('../features/settings/store', () => ({
  useSettingsStore: () => ({ world: 'Phantom', dc: 'Chaos', hideCrystals: true }),
}));

vi.mock('../features/queries/useVendorShopSnapshot', () => ({
  useVendorShopSnapshot: () => ({
    data: { vendors: new Map(), updatedAt: null },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('../features/queries/useSpecialShopSnapshot', () => ({
  useSpecialShopSnapshot: () => ({
    data: { snapshot: { byCurrency: new Map() }, updatedAt: null },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('../features/queries/useGatheringCatalog', () => ({
  useGatheringCatalog: () => ({
    data: new Map([
      [10, { id: 10, name: 'Iron Ore', level: 1, timed: false }],
      // Item 5 (Iron Ingot) and 2 (Fire Shard) are not gatherables; they'll go to buy or craft
    ]),
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

import ShoppingList from './ShoppingList';

beforeEach(() => {
  localStorage.clear();
  useShoppingListStore.setState(defaultShoppingList());
});

function renderRoute() {
  return render(<MemoryRouter><ShoppingList /></MemoryRouter>);
}

describe('ShoppingList route', () => {
  it('renders empty state when no items', () => {
    renderRoute();
    expect(screen.getByText(/add items from the watchlist/i)).toBeInTheDocument();
  });

  it('renders the plan after the user adds an item and clicks Plan shopping', () => {
    useShoppingListStore.getState().addItem(100, 1);
    renderRoute();
    // Craft/gather sections render immediately with the new engine
    expect(screen.getByText(/Craft \(/i)).toBeInTheDocument();
    expect(screen.getByText(/Gather \(/i)).toBeInTheDocument();
    // Check that craft section contains Widget (it appears as a link in the craft table)
    const craftLinks = screen.getAllByText('Widget');
    expect(craftLinks.length).toBeGreaterThan(1); // One in panel, one in craft section
    // Iron Ore (gatherable) should appear in the Gather section
    expect(screen.getByText('Iron Ore')).toBeInTheDocument();
  });

  it('excludes crystal ingredients when hideCrystals is enabled', () => {
    useShoppingListStore.getState().addItem(100, 1);
    renderRoute();
    // Craft/Gather sections should appear immediately
    expect(screen.getByText(/Craft \(/i)).toBeInTheDocument();
    // Fire Shard (crystal, sc=58) should not appear anywhere due to hideCrystals
    expect(screen.queryByText('Fire Shard')).not.toBeInTheDocument();
    // Iron Ingot should appear (not a crystal)
    expect(screen.getByText('Iron Ingot')).toBeInTheDocument();
    // Iron Ore (gatherable leaf) should appear
    expect(screen.getByText('Iron Ore')).toBeInTheDocument();
  });

  it('expands sub-ingredients when craftIntermediates is enabled', () => {
    useShoppingListStore.getState().addItem(100, 1);
    useShoppingListStore.getState().setCraftIntermediates(100, true);
    renderRoute();
    // With craftIntermediates on item 100:
    // Recipe: 100 needs 2x item 5 + 4x item 2
    // Item 5 has sub-recipe: 3x item 10
    // The engine should craft both 100 and 5, with 5's leaves expanded to 6x item 10
    // Item 2 (crystal, sc=58) is filtered by hideCrystals
    // Result: craft section shows 100 and 5, gather section shows 6x item 10
    expect(screen.getByText(/Craft \(/i)).toBeInTheDocument();
    expect(screen.getByText(/Gather \(/i)).toBeInTheDocument();
    expect(screen.getByText('Iron Ore')).toBeInTheDocument();
    // Iron Ingot appears in the Craft section as an intermediate craft
    expect(screen.getByText('Iron Ingot')).toBeInTheDocument();
  });
});
