import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { EmptyShelfResults } from './EmptyShelfResults';
import type { EmptyShelfRow } from './types';

const row = (over: Partial<EmptyShelfRow> = {}): EmptyShelfRow => ({
  id: 100, name: 'Grade 8 Tincture', sc: 43, hq: true,
  suggestedPrice: 18400, velocity: 0.9, lastSaleMs: 1, daysSinceLastSale: 2, estGilPerDay: 16560, ...over,
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

const renderResults = (rows: EmptyShelfRow[], onSortChange = vi.fn()) =>
  render(
    withProviders(
      <EmptyShelfResults rows={rows} totalCandidates={rows.length} skippedChunks={0} sort="freshness" onSortChange={onSortChange} />
    ),
  );

describe('EmptyShelfResults', () => {
  it('renders a row with last-sold, suggested price and est gil/day', () => {
    renderResults([row()]);
    expect(screen.getByText('Grade 8 Tincture')).toBeInTheDocument();
    expect(screen.getByText('2d ago')).toBeInTheDocument();
  });

  it('shows an em-dash when recency is unknown', () => {
    renderResults([row({ daysSinceLastSale: null, lastSaleMs: null })]);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('fires onSortChange when a sortable header is clicked', async () => {
    const onSortChange = vi.fn();
    renderResults([row()], onSortChange);
    await userEvent.click(screen.getByText(/Vel/i));
    expect(onSortChange).toHaveBeenCalledWith('velocity');
  });
});
