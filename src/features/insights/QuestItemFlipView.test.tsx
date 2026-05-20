import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuestItemFlipView } from './QuestItemFlipView';
import type { SnapshotQuest } from '../../lib/questSnapshot';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketBundle } from '../watchlist/useMarketData';

vi.mock('../queries/useQuestSnapshot', () => ({
  useQuestSnapshot: () => ({
    data: {
      snapshot: [
        {
          questId: 1,
          questName: 'Way of the Carpenter',
          categoryName: 'All Classes',
          level: 1,
          requiredItems: [{ itemId: 100, itemName: 'Wind Shard', qty: 100 }],
        } as SnapshotQuest,
        {
          questId: 2,
          questName: 'Way of the Blacksmith',
          categoryName: 'Disciple of the Hand',
          level: 1,
          requiredItems: [{ itemId: 200, itemName: 'Bronze Ingot', qty: 5 }],
        } as SnapshotQuest,
        {
          questId: 3,
          questName: 'Way of the Crystals',
          categoryName: 'All Classes',
          level: 1,
          requiredItems: [{ itemId: 2, itemName: 'Wind Shard (crystal)', qty: 100 }],
        } as SnapshotQuest,
      ],
      updatedAt: 0,
    },
    isLoading: false,
  }),
}));

vi.mock('../queries/useItemSnapshot', () => ({
  useItemSnapshot: () => ({
    data: {
      items: [
        // sc=1 so they pass the crystal filter
        { id: 100, name: 'Wind Shard', sc: 1, ui: 1, ilvl: 1, canHq: true },
        { id: 200, name: 'Bronze Ingot', sc: 1, ui: 1, ilvl: 1, canHq: true },
        // Real crystal (sc=58) — should be excluded
        { id: 2, name: 'Wind Shard (crystal)', sc: 58, ui: 1, ilvl: 1, canHq: false },
      ] as SnapshotItem[],
      updatedAt: 0,
    },
    isLoading: false,
  }),
}));

vi.mock('../watchlist/useMarketData', () => ({
  useMarketData: () => ({
    data: {
      phantom: {
        100: { minHQ: 2400, medianHQ: 2400, minNQ: null, medianNQ: null, velocity: 6.2, listingCount: 4, recentSalesHQ: 10, recentSalesNQ: 0, avgNQ: null, avgHQ: null, lastUploadTime: 0, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
        200: { minHQ: 4100, medianHQ: 4100, minNQ: null, medianNQ: null, velocity: 3.1, listingCount: 6, recentSalesHQ: 10, recentSalesNQ: 0, avgNQ: null, avgHQ: null, lastUploadTime: 0, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
        2: { minHQ: null, medianHQ: null, minNQ: 5, medianNQ: 5, velocity: 50, listingCount: 100, recentSalesHQ: 0, recentSalesNQ: 100, avgNQ: null, avgHQ: null, lastUploadTime: 0, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
      },
      dc: {},
      region: {},
    } as MarketBundle,
    isLoading: false,
  }),
}));

function renderView(initialEntries: string[] = ['/quest-items']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <QuestItemFlipView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('QuestItemFlipView', () => {
  it('renders rows from all categories by default', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Wind Shard')).toBeInTheDocument();
      expect(screen.getByText('Bronze Ingot')).toBeInTheDocument();
    });
  });

  it('excludes items in the Crystals search category (sc=58)', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Bronze Ingot')).toBeInTheDocument());
    expect(screen.queryByText('Wind Shard (crystal)')).not.toBeInTheDocument();
  });

  it('item search filters by item name', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Wind Shard')).toBeInTheDocument());
    const searchBox = screen.getByLabelText(/item search/i);
    await user.type(searchBox, 'bronze');
    await waitFor(() => {
      expect(screen.queryByText('Wind Shard')).not.toBeInTheDocument();
      expect(screen.getByText('Bronze Ingot')).toBeInTheDocument();
    });
  });

  it('category dropdown filters by categoryName', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Wind Shard')).toBeInTheDocument());
    const categorySelect = screen.getByLabelText(/category/i);
    await user.selectOptions(categorySelect, 'Disciple of the Hand');
    await waitFor(() => {
      expect(screen.queryByText('Wind Shard')).not.toBeInTheDocument();
      expect(screen.getByText('Bronze Ingot')).toBeInTheDocument();
    });
  });

  it('category dropdown lists categories with their quest counts', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Wind Shard')).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'All categories' })).toBeInTheDocument();
    // "All Classes" has 2 quests in fixture (one is filtered crystal); counts use the snapshot pre-filter
    expect(screen.getByRole('option', { name: 'All Classes (2)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Disciple of the Hand (1)' })).toBeInTheDocument();
  });

  it('Sort by dropdown changes the active sort key', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Wind Shard')).toBeInTheDocument());
    // Initially revenue is the active sort → ▼ on Revenue header
    expect(screen.getByRole('columnheader', { name: /Revenue/ }).textContent).toContain('▼');
    const sortSelect = screen.getByLabelText(/sort by/i);
    await user.selectOptions(sortSelect, 'level');
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /Lv/ }).textContent).toContain('▲');
    });
  });

  it('clicking a sortable column header resorts the table', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Wind Shard')).toBeInTheDocument());
    // Default sort: revenue DESC → Wind Shard (100 × 2400 = 240000) before Bronze Ingot (5 × 4100 = 20500)
    let rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('Wind Shard');

    // Click Qty header twice → qty ASC → Bronze Ingot (qty 5) first
    const qtyHeader = screen.getByRole('columnheader', { name: /Qty/ });
    await user.click(qtyHeader);
    await user.click(qtyHeader);
    rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('Bronze Ingot');
  });

  it('parses ?sort=level:asc from URL params', async () => {
    renderView(['/quest-items?sort=level:asc']);
    await waitFor(() => expect(screen.getByText('Wind Shard')).toBeInTheDocument());
    const levelHeader = screen.getByRole('columnheader', { name: /Lv/ });
    expect(levelHeader.textContent).toContain('▲');
  });
});
