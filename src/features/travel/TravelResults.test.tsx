import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TravelResults } from './TravelResults';
import type { TravelRow, TravelSort } from './types';

const rows: TravelRow[] = [
  { id: 1, name: 'Widget', sc: 5, units: 3, avgBuyPrice: 600, homeSell: 1000, cost: 1800, profit: 1200, roi: 0.6667, velocity: 5, hq: false },
];

function renderRows(r: TravelRow[], opts: { sort?: TravelSort; onSortChange?: (s: TravelSort) => void } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TravelResults
          rows={r} totalCandidates={500} skippedChunks={0}
          sort={opts.sort ?? 'profit'} onSortChange={opts.onSortChange ?? (() => {})}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TravelResults', () => {
  it('renders a row with its item name, units and ROI', () => {
    renderRows(rows);
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('shows the empty state when there are no rows', () => {
    renderRows([]);
    expect(screen.getByText(/Nothing profitable to haul back/i)).toBeInTheDocument();
  });

  it('marks the active sort column and reports header clicks', () => {
    const onSortChange = vi.fn();
    renderRows(rows, { sort: 'profit', onSortChange });
    // Active column carries the descending marker + aria-sort.
    expect(screen.getByText(/Profit ▼/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('ROI'));
    expect(onSortChange).toHaveBeenCalledWith('roi');
  });
});
