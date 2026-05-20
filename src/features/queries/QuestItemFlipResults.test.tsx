import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { QuestItemFlipResults } from './QuestItemFlipResults';
import type { QuestItemRow, QuestItemSort, SortDir } from './runQuestItemFlip';

function mkRow(overrides: Partial<QuestItemRow> = {}): QuestItemRow {
  const base = {
    id: 100100,
    questId: 1,
    questName: 'Way of the Carpenter',
    categoryName: 'All Classes',
    level: 5,
    itemId: 100,
    itemName: 'Maple Lumber',
    qty: 3,
    nqPrice: 120 as number | null,
    hqPrice: 2400 as number | null,
    listingCount: 4,
    velocity: 6.2,
    totalRevenue: 7200,
  };
  return { ...base, ...overrides };
}

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderRows(
  rows: QuestItemRow[],
  opts: { sortBy?: QuestItemSort; sortDir?: SortDir; onSort?: (k: QuestItemSort) => void; totalCandidates?: number } = {},
) {
  return render(
    withProviders(
      <QuestItemFlipResults
        rows={rows}
        totalCandidates={opts.totalCandidates ?? rows.length}
        sortBy={opts.sortBy ?? 'revenue'}
        sortDir={opts.sortDir ?? 'desc'}
        onSort={opts.onSort ?? (() => {})}
      />,
    ),
  );
}

describe('QuestItemFlipResults', () => {
  it('renders one row per QuestItemRow', () => {
    renderRows([
      mkRow({ itemId: 100, itemName: 'Maple Lumber' }),
      mkRow({ itemId: 200, itemName: 'Ash Lumber' }),
    ]);
    expect(screen.getByText('Maple Lumber')).toBeInTheDocument();
    expect(screen.getByText('Ash Lumber')).toBeInTheDocument();
  });

  it('renders an empty-state message when no rows', () => {
    renderRows([]);
    expect(screen.getByText(/no quest items match/i)).toBeInTheDocument();
  });

  it('item name links to Garland Tools', () => {
    renderRows([mkRow({ itemId: 100, itemName: 'Maple Lumber' })]);
    const link = screen.getByRole('link', { name: 'Maple Lumber' });
    expect(link.getAttribute('href')).toMatch(/garlandtools\.org.*100/);
  });

  it('shows category name in its own column', () => {
    renderRows([mkRow({ categoryName: 'Disciple of the Hand' })]);
    expect(screen.getByText('Disciple of the Hand')).toBeInTheDocument();
  });

  it('shows quest name in its own column', () => {
    renderRows([mkRow({ questName: 'Way of the Blacksmith' })]);
    expect(screen.getByText('Way of the Blacksmith')).toBeInTheDocument();
  });

  it('shows em-dash for null prices', () => {
    renderRows([mkRow({ nqPrice: null, hqPrice: null })]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders matches/candidates summary line', () => {
    renderRows([mkRow()], { totalCandidates: 211 });
    expect(screen.getByText(/1 matches from 211 candidates/i)).toBeInTheDocument();
  });

  it('renders a sort arrow ▼ on active DESC column', () => {
    renderRows([mkRow()], { sortBy: 'revenue', sortDir: 'desc' });
    const header = screen.getByRole('columnheader', { name: /Revenue/ });
    expect(header.textContent).toContain('▼');
  });

  it('renders a sort arrow ▲ on active ASC column', () => {
    renderRows([mkRow()], { sortBy: 'level', sortDir: 'asc' });
    const header = screen.getByRole('columnheader', { name: /Lv/ });
    expect(header.textContent).toContain('▲');
  });

  it('clicking a header calls onSort with the column key', () => {
    const onSort = vi.fn();
    renderRows([mkRow()], { onSort });
    fireEvent.click(screen.getByRole('columnheader', { name: /Sales\/day/ }));
    expect(onSort).toHaveBeenCalledWith('velocity');
  });

  it('clicking a different header calls onSort with the new key', () => {
    const onSort = vi.fn();
    renderRows([mkRow()], { sortBy: 'revenue', sortDir: 'desc', onSort });
    fireEvent.click(screen.getByRole('columnheader', { name: /Listings/ }));
    expect(onSort).toHaveBeenCalledWith('listings');
  });
});
