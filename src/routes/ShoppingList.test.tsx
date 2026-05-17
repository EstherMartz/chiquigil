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
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('../features/profit/useRecipes', () => ({
  useRecipes: (ids: number[]) => ({
    data: new Map(ids.map((id) => [
      id,
      id === 100 ? { itemResultId: 100, classJob: 'CRP', recipeLevel: 1, ingredients: [{ itemId: 5, amount: 2 }] } : null,
    ])),
    isLoading: false,
    isError: false,
    error: null,
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
      },
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('../features/settings/store', () => ({
  useSettingsStore: () => ({ world: 'Phantom', dc: 'Chaos' }),
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
    fireEvent.click(screen.getByRole('button', { name: /plan shopping/i }));
    expect(screen.getByText(/total material cost/i)).toBeInTheDocument();
    expect(screen.getByText(/est. revenue/i)).toBeInTheDocument();
    // Spend = 100 × 2 = 200; revenue = 500 × 1 = 500; profit = 300
    expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('200');
    expect(screen.getByText(/est. revenue/i).parentElement?.textContent).toContain('500');
    expect(screen.getByText(/net profit/i).parentElement?.textContent).toContain('300');
  });
});
