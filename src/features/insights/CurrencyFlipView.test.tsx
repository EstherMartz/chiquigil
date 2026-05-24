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

vi.mock('../queries/useSpecialShopSnapshot', () => ({
  useSpecialShopSnapshot: () => ({
    data: {
      snapshot: {
        byCurrency: new Map([
          ['poetics', [
            { itemId: 100, receiveQty: 1, costPerUnit: 10, isHq: false },
            { itemId: 200, receiveQty: 1, costPerUnit: 50, isHq: false },
          ]],
        ]),
      },
      updatedAt: 1700000000000,
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useRefreshSpecialShopSnapshot: () => async () => {},
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

import { CurrencyFlipView } from './CurrencyFlipView';

function renderView(initial = '/?currency=poetics') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <CurrencyFlipView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMarketDataMock.mockClear();
});

describe('CurrencyFlipView', () => {
  it('renders the currency picker + Run button on initial load', () => {
    renderView();
    expect(screen.getByRole('combobox', { name: /currency/i })).toBeInTheDocument();
    // Two "Run scan" buttons: TopStrip primary + EmptyState CTA.
    expect(screen.getAllByRole('button', { name: /run scan/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('shows candidate count for the selected currency', () => {
    renderView();
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

  it('falls back to default currency when URL has unknown ?currency= value', () => {
    renderView('/?currency=bogus');
    expect(screen.getByText(/2 candidate items/i)).toBeInTheDocument();
  });
});
