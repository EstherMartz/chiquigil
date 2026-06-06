import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TravelResults } from './TravelResults';
import type { TravelRow } from './types';

const rows: TravelRow[] = [
  { id: 1, name: 'Widget', sc: 5, units: 3, avgBuyPrice: 600, homeSell: 1000, cost: 1800, profit: 1200, roi: 0.6667, velocity: 5, hq: false },
];

function renderRows(r: TravelRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><TravelResults rows={r} totalCandidates={500} skippedChunks={0} /></MemoryRouter>
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
});
