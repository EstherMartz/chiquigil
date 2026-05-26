import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { CurrencyFlipResults } from './CurrencyFlipResults';
import type { CurrencyFlipRow, CurrencyFlipSort } from './types';
import { getCurrencyById } from '../../lib/currencies';

const rows: CurrencyFlipRow[] = [
  { id: 100, name: 'Widget', sc: 1, costPerUnit: 10, salePrice: 5000, hq: false,
    gilPerUnit: 500, velocity: 2, listingCount: 4 },
  { id: 200, name: 'Gizmo HQ', sc: 1, costPerUnit: 50, salePrice: 50000, hq: true,
    gilPerUnit: 1000, velocity: 1, listingCount: 6 },
];

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {node}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderResults(sort: CurrencyFlipSort = 'gilPerUnit', onSortChange = vi.fn()) {
  return render(
    withProviders(
      <CurrencyFlipResults
        rows={rows}
        currency={getCurrencyById('poetics')!}
        totalCandidates={50}
        skippedChunks={0}
        sort={sort}
        onSortChange={onSortChange}
      />
    ),
  );
}

describe('CurrencyFlipResults', () => {
  it('renders one row per CurrencyFlipRow with item name', () => {
    renderResults();
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('Gizmo HQ')).toBeInTheDocument();
  });

  it('renders the cost column with the currency short label', () => {
    renderResults();
    expect(screen.getByText(/10.*Poetics/i)).toBeInTheDocument();
    expect(screen.getByText(/50.*Poetics/i)).toBeInTheDocument();
  });

  it('renders HQ glyph on HQ rows but not NQ rows', () => {
    renderResults();
    const widgetRow = screen.getByText('Widget').closest('tr')!;
    const gizmoRow = screen.getByText('Gizmo HQ').closest('tr')!;
    expect(within(gizmoRow).queryByAltText(/High Quality/i)).not.toBeNull();
    expect(within(widgetRow).queryByAltText(/High Quality/i)).toBeNull();
  });

  it('shows empty state copy when rows is empty', () => {
    render(
      withProviders(
        <CurrencyFlipResults
          rows={[]}
          currency={getCurrencyById('poetics')!}
          totalCandidates={0}
          skippedChunks={0}
          sort="gilPerUnit"
          onSortChange={vi.fn()}
        />
      ),
    );
    expect(screen.getByText(/no items match/i)).toBeInTheDocument();
    expect(screen.getByText(/poetics/i)).toBeInTheDocument();
  });

  it('clicking a sortable header calls onSortChange with that sort key', () => {
    const onSortChange = vi.fn();
    renderResults('gilPerUnit', onSortChange);
    fireEvent.click(screen.getByText(/sales\/day/i));
    expect(onSortChange).toHaveBeenCalledWith('velocity');
  });

  it('marks the active sort header with the gold style + arrow', () => {
    renderResults('salePrice');
    // Find the Sale column header (not table data)
    const headers = screen.getAllByText(/sale/i);
    const header = headers.find((el) => el.tagName === 'TH')!;
    expect(header.className).toMatch(/text-gold/);
    expect(header.textContent).toContain('▼');
  });
});
