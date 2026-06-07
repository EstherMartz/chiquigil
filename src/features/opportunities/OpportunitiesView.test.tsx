import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/opportunities', () => ({
  loadOpportunities: vi.fn().mockResolvedValue({
    ts: 1000, opportunities: [
      { itemId: 5, kind: 'crash', world: 'Moogle', oldValue: 1000, newValue: 800, changePct: -20, velocity: 2, gilPerDay: 1600, detectedAt: 900 },
      { itemId: 9, kind: 'empty', world: '', oldValue: 5, newValue: 1, changePct: null, velocity: 4, gilPerDay: 0, detectedAt: 950 },
    ],
  }),
}));
vi.mock('../queries/useSnapshotById', () => ({
  useSnapshotById: () => new Map([[5, { id: 5, name: 'Iron Ore', ilvl: 1 }], [9, { id: 9, name: 'Onion', ilvl: 1 }]]),
}));
vi.mock('../../components/ItemNameLinks', () => ({ ItemNameLinks: ({ name }: { name: string }) => <span>{name}</span> }));

import { OpportunitiesView } from './OpportunitiesView';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><OpportunitiesView /></MemoryRouter></QueryClientProvider>,
  );
}

describe('OpportunitiesView', () => {
  it('renders a row per opportunity', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Iron Ore')).toBeInTheDocument());
    expect(screen.getByText('Onion')).toBeInTheDocument();
  });

  it('filters by kind', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Iron Ore')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Empty'));
    expect(screen.queryByText('Iron Ore')).not.toBeInTheDocument();
    expect(screen.getByText('Onion')).toBeInTheDocument();
  });
});
