import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { GlobalItemSearch } from './GlobalItemSearch';
import { clearItemCache, putCachedItems } from '../../lib/recipeCache';

beforeEach(async () => {
  await clearItemCache();
  vi.restoreAllMocks();
});

function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="path">{loc.pathname}</div>;
}

function withProviders(node: React.ReactNode, initial = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="*" element={
            <>
              {node}
              <LocationDisplay />
            </>
          } />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('GlobalItemSearch', () => {
  it('does not show a dropdown for queries shorter than the minimum length', async () => {
    await putCachedItems([
      { id: 1, name: 'Iron Ingot', sc: 48, ui: 0, ilvl: 30, canHq: true },
      { id: 2, name: 'Silver Ingot', sc: 48, ui: 0, ilvl: 40, canHq: true },
    ]);
    render(withProviders(<GlobalItemSearch />));
    const input = screen.getByPlaceholderText(/search items/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'I' } });
    // 1 char → too-short message, no results yet
    expect(screen.queryByText(/iron ingot/i)).toBeNull();
    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
  });

  it('shows up to 8 matches from the local snapshot and navigates on click', async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: 100 + i,
      name: `Test Item ${i}`,
      sc: 48,
      ui: 0,
      ilvl: 50 + i,
      canHq: false,
    }));
    await putCachedItems(items);

    render(withProviders(<GlobalItemSearch />));
    const input = screen.getByPlaceholderText(/search items/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Test' } });

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options.length).toBe(8); // bounded
    });

    // Click first result → navigates to /item/100
    fireEvent.mouseDown(screen.getAllByRole('option')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe('/item/100');
    });
  });

  it('typing "fish" surfaces Seafood items (SC 46) even when their names do not contain "fish"', async () => {
    await putCachedItems([
      { id: 5000, name: 'Goldfish',     sc: 75, ui: 0, ilvl: 1, canHq: false },  // Minion — matches name "fish"
      { id: 6000, name: 'Garlean Salmon', sc: 46, ui: 0, ilvl: 90, canHq: true }, // Seafood — no "fish" in name
      { id: 6001, name: 'Ahriman Tuna',   sc: 46, ui: 0, ilvl: 90, canHq: true }, // Seafood — no "fish" in name
      { id: 7000, name: 'Wildfowl Seeds', sc: 81, ui: 0, ilvl: 1, canHq: false }, // Seeds — should NOT appear
    ]);
    render(withProviders(<GlobalItemSearch />));
    const input = screen.getByPlaceholderText(/search items/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'fish' } });

    await waitFor(() => {
      // Both seafood items present even though neither name contains "fish".
      expect(screen.getByText('Garlean Salmon')).toBeInTheDocument();
      expect(screen.getByText('Ahriman Tuna')).toBeInTheDocument();
    });
    // The name-match Goldfish still appears (minion). Seeds do not.
    expect(screen.getByText('Goldfish')).toBeInTheDocument();
    expect(screen.queryByText('Wildfowl Seeds')).toBeNull();
  });

  it('Enter selects the cursor row and navigates', async () => {
    await putCachedItems([
      { id: 500, name: 'Cobalt Ore', sc: 47, ui: 0, ilvl: 1, canHq: false },
    ]);
    render(withProviders(<GlobalItemSearch />));
    const input = screen.getByPlaceholderText(/search items/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Cobalt' } });
    await screen.findByRole('option');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toBe('/item/500');
    });
  });
});
