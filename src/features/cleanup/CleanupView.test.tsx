import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import 'fake-indexeddb/auto';
import React from 'react';

import { CleanupView } from './CleanupView';
import * as itemSnapHook from '../queries/useItemSnapshot';
import * as recipeSnapHook from '../queries/useRecipeSnapshot';
import * as marketHook from '../watchlist/useMarketData';
import * as userStore from '../user/userStore';

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>{node}</BrowserRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { vi.restoreAllMocks(); });

describe('CleanupView', () => {
  it('parses a pasted CSV and renders rows under the expected buckets', async () => {
    vi.spyOn(itemSnapHook, 'useItemSnapshot').mockReturnValue({
      data: {
        items: [
          { id: 5, name: 'Fire Shard', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 1 },
          { id: 100, name: 'Beech Branch', sc: 1, ui: 1, ilvl: 1, canHq: false, priceLow: 5 },
        ],
        updatedAt: null,
      },
      isLoading: false, progress: 0,
    } as never);
    vi.spyOn(recipeSnapHook, 'useRecipeSnapshot').mockReturnValue({
      data: new Map(), isLoading: false, progress: 0,
    } as never);
    vi.spyOn(marketHook, 'useMarketData').mockReturnValue({
      data: { phantom: {}, dc: {}, region: {} }, isLoading: false,
    } as never);
    vi.spyOn(userStore, 'useUserStore').mockImplementation(((selector: (s: { world: string; dc: string }) => unknown) =>
      selector({ world: 'Phantom', dc: 'Chaos' })) as never);

    wrap(<CleanupView />);

    const textarea = screen.getByLabelText(/Allagan CSV paste/i);
    await userEvent.type(textarea, 'Item ID,Quantity,Location\n5,42,bag\n100,17,bag');
    await userEvent.click(screen.getByRole('button', { name: /Parse/i }));

    await waitFor(() => {
      expect(screen.getByText(/Vendor or discard \(2\)/)).toBeInTheDocument();
    });
  });

  it('shows the parse error when the paste has no headers', async () => {
    vi.spyOn(itemSnapHook, 'useItemSnapshot').mockReturnValue({
      data: { items: [], updatedAt: null }, isLoading: false, progress: 0,
    } as never);
    vi.spyOn(recipeSnapHook, 'useRecipeSnapshot').mockReturnValue({ data: new Map(), isLoading: false, progress: 0 } as never);
    vi.spyOn(marketHook, 'useMarketData').mockReturnValue({ data: { phantom: {}, dc: {}, region: {} }, isLoading: false } as never);
    vi.spyOn(userStore, 'useUserStore').mockImplementation(((selector: (s: { world: string; dc: string }) => unknown) =>
      selector({ world: 'Phantom', dc: 'Chaos' })) as never);

    wrap(<CleanupView />);

    const textarea = screen.getByLabelText(/Allagan CSV paste/i);
    await userEvent.type(textarea, 'random text without headers');
    await userEvent.click(screen.getByRole('button', { name: /Parse/i }));
    expect(await screen.findByText(/detect column headers/i)).toBeInTheDocument();
  });
});
