import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CraftFlipResults } from './CraftFlipResults';
import { useUiStore } from '../ui/uiStore';
import type { CraftFlipRow } from './types';
import type { MaterialSourcing } from '../profit/materialSourcing';

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

function sourcing(pct: number, selfSourceProfit: number): MaterialSourcing {
  return {
    ingredients: [{ itemId: 99, qty: 2, unitPrice: 50, subtotal: 100, source: 'gather-standard', gatherable: true }],
    totalMaterialCost: 100, gatherableCost: 100, buyOnlyCost: 0, gatherablePct: pct, selfSourceProfit,
  };
}

const row = (over: Partial<CraftFlipRow>): CraftFlipRow => ({
  id: 1, name: 'Test Item', sc: 56, unitPrice: 1000, materialCost: 100, profit: 900,
  velocity: 2, gilPerDay: 1800, hq: true, sourcing: null, selfSourceGilPerDay: 1800, ...over,
});

beforeEach(() => {
  useUiStore.setState({ density: 'comfortable' });
});

describe('CraftFlipResults — sourcing UI', () => {
  it('shows the GATHERABLE tag when gatherablePct >= 80', () => {
    const rows = [row({ sourcing: sourcing(100, 1000), selfSourceGilPerDay: 2000 })];
    render(wrap(<CraftFlipResults rows={rows} totalCandidates={1} skippedChunks={0} />));
    expect(screen.getAllByText('Gatherable').length).toBeGreaterThanOrEqual(1);
  });

  it('omits the GATHERABLE tag below 80%', () => {
    const rows = [row({ sourcing: sourcing(40, 1000) })];
    render(wrap(<CraftFlipResults rows={rows} totalCandidates={1} skippedChunks={0} />));
    expect(screen.queryByText('Gatherable')).not.toBeInTheDocument();
  });

  it('hides secondary self lines in compact density (popover still present)', () => {
    useUiStore.setState({ density: 'compact' });
    const rows = [row({ sourcing: sourcing(100, 1000), selfSourceGilPerDay: 2000 })];
    render(wrap(<CraftFlipResults rows={rows} totalCandidates={1} skippedChunks={0} />));
    expect(screen.queryByText(/↓/)).not.toBeInTheDocument();
    expect(screen.queryByText(/↑/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Gatherable').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Total self:/)).toBeInTheDocument();
  });

  it('shows the ↑ self-source profit line in comfy when higher than base', () => {
    const rows = [row({ sourcing: sourcing(100, 1000), selfSourceGilPerDay: 2000 })];
    render(wrap(<CraftFlipResults rows={rows} totalCandidates={1} skippedChunks={0} />));
    expect(screen.getByText(/↑/)).toBeInTheDocument();
  });
});
