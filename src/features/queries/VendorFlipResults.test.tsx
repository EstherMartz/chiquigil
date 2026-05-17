import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { VendorFlipResults } from './VendorFlipResults';
import type { VendorFlipRow, VendorFlipSort } from './types';

const rows: VendorFlipRow[] = [
  { id: 100, name: 'Widget', sc: 1, vendorPrice: 100, salePrice: 1000, hq: false,
    profitPerUnit: 900, markup: 10, profitPerDay: 1800, velocity: 2, listingCount: 4 },
  { id: 200, name: 'Gizmo HQ', sc: 1, vendorPrice: 500, salePrice: 4000, hq: true,
    profitPerUnit: 3500, markup: 8, profitPerDay: 7000, velocity: 2, listingCount: 6 },
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

function renderResults(sort: VendorFlipSort = 'profitPerDay', onSortChange = vi.fn()) {
  return render(
    withProviders(
      <VendorFlipResults
        rows={rows}
        totalCandidates={50}
        skippedChunks={0}
        sort={sort}
        onSortChange={onSortChange}
      />
    ),
  );
}

describe('VendorFlipResults', () => {
  it('renders one row per VendorFlipRow with item name', () => {
    renderResults();
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('Gizmo HQ')).toBeInTheDocument();
  });

  it('renders an HQ glyph on HQ rows but not NQ rows', () => {
    renderResults();
    const widgetRow = screen.getByText('Widget').closest('tr')!;
    const gizmoRow = screen.getByText('Gizmo HQ').closest('tr')!;
    expect(within(gizmoRow).queryByLabelText(/High Quality/i)).not.toBeNull();
    // Widget (NQ) should not show HQ marker
    expect(within(widgetRow).queryByLabelText(/High Quality/i)).toBeNull();
  });

  it('shows empty state copy when rows is empty', () => {
    render(
      withProviders(
        <VendorFlipResults rows={[]} totalCandidates={0} skippedChunks={0} sort="profitPerDay" onSortChange={vi.fn()} />
      ),
    );
    expect(screen.getByText(/no vendor flips/i)).toBeInTheDocument();
  });

  it('clicking a sortable header calls onSortChange with that sort key', () => {
    const onSortChange = vi.fn();
    renderResults('profitPerDay', onSortChange);
    fireEvent.click(screen.getByText(/markup/i));
    expect(onSortChange).toHaveBeenCalledWith('markup');
  });

  it('marks the active sort header with the gold style + arrow', () => {
    renderResults('markup');
    const header = screen.getByText(/markup/i).closest('th')!;
    expect(header.className).toMatch(/text-gold/);
    expect(header.textContent).toContain('▼');
  });
});
