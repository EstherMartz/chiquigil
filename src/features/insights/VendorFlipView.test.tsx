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
  useRefreshVendorShopSnapshot: () => async () => {},
}));

vi.mock('../settings/store', () => ({
  useSettingsStore: () => ({ world: 'Phantom' }),
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
    // Two "Run scan" buttons: FilterBar primary + EmptyState CTA. Both should be present.
    expect(screen.getAllByRole('button', { name: /run scan/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2 candidate items/i)).toBeInTheDocument();
  });

  it('runs the scan, fetches home-world prices, and renders rows', async () => {
    renderView();
    fireEvent.click(screen.getAllByRole('button', { name: /run scan/i })[0]);
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

  it('marks the scan stale when a category is selected after a scan', async () => {
    renderView();
    // Run an initial scan so stale-detection can apply (stale requires run.data != null).
    fireEvent.click(screen.getAllByRole('button', { name: /run scan/i })[0]);
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

    // Open the category dropdown and narrow to a single, uniquely-named category.
    const search = screen.getByPlaceholderText(/search categories/i);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Primary Arms' } });
    fireEvent.click(screen.getByRole('checkbox'));

    // Changing a scan parameter should surface the "Run scan to refresh" prompt.
    await waitFor(() =>
      expect(screen.getByText(/filters changed — run scan to refresh/i)).toBeInTheDocument(),
    );
  });

  it('exposes a Housing group chip that marks the scan stale when selected', async () => {
    renderView();
    fireEvent.click(screen.getAllByRole('button', { name: /run scan/i })[0]);
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

    fireEvent.focus(screen.getByPlaceholderText(/search categories/i));
    fireEvent.click(screen.getByRole('button', { name: 'Housing' }));

    await waitFor(() =>
      expect(screen.getByText(/filters changed — run scan to refresh/i)).toBeInTheDocument(),
    );
  });
});
