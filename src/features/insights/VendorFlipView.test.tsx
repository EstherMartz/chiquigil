import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../queries/useItemSnapshot', () => ({
  useItemSnapshot: () => ({
    data: {
      items: [
        { id: 100, name: 'Widget', sc: 1, ui: 1, ilvl: 1, canHq: false },
        { id: 200, name: 'Gizmo', sc: 1, ui: 1, ilvl: 1, canHq: false },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('../queries/useVendorShopSnapshot', () => ({
  useVendorShopSnapshot: () => ({
    data: { snapshot: new Map([[100, 100], [200, 100]]), updatedAt: 1700000000000 },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('../settings/store', () => ({
  useSettingsStore: (selector?: (s: any) => any) => {
    const state = { world: 'Phantom', hideCrystals: false, hideIgnored: true, ignoredItemIds: [] };
    return selector ? selector(state) : state;
  },
}));

const fetchMarketDataMock = vi.fn(async (_scope: string, ids: number[]) => {
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    out[String(id)] = {
      minNQ: 1000, minHQ: null,
      avgNQ: null, avgHQ: null,
      medianNQ: 1000, medianHQ: null,
      recentSalesNQ: 20, recentSalesHQ: 0,
      velocity: 2, lastUploadTime: 0, listingCount: 5,
      worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    };
  }
  return out;
});

vi.mock('../../lib/universalis', () => ({
  fetchMarketData: (...args: unknown[]) => fetchMarketDataMock(args[0] as string, args[1] as number[]),
}));

import { VendorFlipView } from './VendorFlipView';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VendorFlipView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMarketDataMock.mockClear();
});

describe('VendorFlipView', () => {
  it('renders the filter strip + initial idle state with candidate count', () => {
    renderView();
    expect(screen.getAllByRole('button', { name: /refresh prices/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2 candidate items/i)).toBeInTheDocument();
  });

  it('auto-scans on load, fetches home-world prices, and renders rows', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Widget')).toBeInTheDocument();
      expect(screen.getByText('Gizmo')).toBeInTheDocument();
    });
    expect(fetchMarketDataMock).toHaveBeenCalledWith('Phantom', expect.arrayContaining([100, 200]));
  });

  it('renders the category filter control', () => {
    renderView();
    expect(screen.getByPlaceholderText(/search categories/i)).toBeInTheDocument();
  });

  it('updates results live when Min profit is raised — no refetch', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());
    const callsBefore = fetchMarketDataMock.mock.calls.length;

    // Each fixture row profits 900/u; raising the floor above that drops them live.
    fireEvent.change(screen.getByLabelText(/min profit/i), { target: { value: '5000' } });

    await waitFor(() => expect(screen.queryByText('Widget')).not.toBeInTheDocument());
    expect(fetchMarketDataMock.mock.calls.length).toBe(callsBefore);
  });

  it('applies a group chip live without refetching', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());
    const callsBefore = fetchMarketDataMock.mock.calls.length;

    // Fixture items are category 1 (Primary Arms); selecting Housing yields no matches.
    fireEvent.click(screen.getByRole('button', { name: 'Housing' }));

    await waitFor(() => expect(screen.queryByText('Widget')).not.toBeInTheDocument());
    expect(fetchMarketDataMock.mock.calls.length).toBe(callsBefore);
  });

  it('does not render a Vendors button', () => {
    renderView();
    expect(screen.queryByRole('button', { name: /vendors/i })).not.toBeInTheDocument();
  });
});
