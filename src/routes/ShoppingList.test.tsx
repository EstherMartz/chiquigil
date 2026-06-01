import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
        { id: 3, name: 'Maple Branch', sc: 1, ui: 1, ilvl: 1, canHq: false },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('../features/queries/useRecipeSnapshot', () => ({
  useRecipeSnapshot: () => ({
    data: new Map([
      [100, { itemResultId: 100, classJob: 'CRP', recipeLevel: 1, ingredients: [{ itemId: 5, amount: 2 }, { itemId: 2, amount: 4 }, { itemId: 3, amount: 5 }] }],
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
        3: {
          minNQ: 30, minHQ: null,
          worldListings: [{ world: 'Phantom', price: 30, hq: false }],
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

  it('renders the craft and gather sections immediately (no Plan click needed)', () => {
    useShoppingListStore.getState().addItem(100, 1);
    renderRoute();
    // Craft/gather sections render as soon as recipes + catalog resolve.
    expect(screen.getByText(/Craft \(/i)).toBeInTheDocument();
    expect(screen.getByText(/Gather \(/i)).toBeInTheDocument();
    // Widget (target) and Iron Ingot (craftable intermediate) both land in Craft.
    expect(screen.getAllByText('Widget').length).toBeGreaterThan(1); // panel + craft section
    expect(screen.getByText('Iron Ingot')).toBeInTheDocument();
    // Iron Ore (gatherable leaf) lands in Gather.
    expect(screen.getByText('Iron Ore')).toBeInTheDocument();
  });

  it('prices the Buy list after clicking Plan shopping, excluding crystals', () => {
    useShoppingListStore.getState().addItem(100, 1);
    renderRoute();
    // The Buy survey is gated behind the Plan button to avoid eager market fetches.
    expect(screen.queryByText(/total material cost/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /plan shopping/i }));

    // Buy section now rendered.
    expect(screen.getByText(/total material cost/i)).toBeInTheDocument();
    // Maple Branch (non-crystal buy leaf) is priced in the breakdown: 30 × 5 = 150.
    expect(screen.getByText('Maple Branch')).toBeInTheDocument();
    expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('150');
    // Fire Shard is a non-gatherable buy leaf too, but hideCrystals filters it out —
    // it is absent from the breakdown for the RIGHT reason (filtered, not un-rendered).
    expect(screen.queryByText('Fire Shard')).not.toBeInTheDocument();
  });

  it('fully recurses craftable intermediates regardless of the per-item flag', () => {
    // The engine always expands the full tree. Item 100 → 2× Iron Ingot (5),
    // and Iron Ingot → 3× Iron Ore (10), so 5 is crafted and 10 (qty 6) is gathered.
    useShoppingListStore.getState().addItem(100, 1);
    renderRoute();
    expect(screen.getByText(/Craft \(/i)).toBeInTheDocument();
    expect(screen.getByText(/Gather \(/i)).toBeInTheDocument();
    // Iron Ingot is crafted (intermediate), Iron Ore is gathered (raw leaf).
    expect(screen.getByText('Iron Ingot')).toBeInTheDocument();
    expect(screen.getByText('Iron Ore')).toBeInTheDocument();
  });

  it('moves a gatherable leaf into the Buy list when "Buy instead" is clicked', () => {
    useShoppingListStore.getState().addItem(100, 1);
    renderRoute();
    // Iron Ore starts in the Gather section. Find its row's "Buy instead" button.
    const ironOreRow = screen.getByText('Iron Ore').closest('tr');
    expect(ironOreRow).not.toBeNull();
    const buyBtn = ironOreRow!.querySelector('button');
    expect(buyBtn?.textContent).toMatch(/buy instead/i);
    fireEvent.click(buyBtn!);
    // The override banner appears once an item is moved to Buy.
    expect(screen.getByText(/moved to buy/i)).toBeInTheDocument();
  });
});
