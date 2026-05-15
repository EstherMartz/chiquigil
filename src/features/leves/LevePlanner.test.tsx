import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LevePlanner } from './LevePlanner';
import { useLevePlanStore, defaultLevePlan } from './levePlanStore';
import type { LeveRow } from './computeLevePlan';

const rows: LeveRow[] = [
  { id: 100, name: 'Cobalt Ingot', classJobCode: 'BSM', level: 50, city: 'Limsa Lominsa',
    type: 'doh', grossGil: 6000, matCost: 600, netGil: 5400, exp: 8000,
    hasMatCostData: true, targetItemId: 5001, targetItemQty: 3 },
  { id: 200, name: 'Mining for Memories', classJobCode: 'MIN', level: 20, city: "Ul'dah",
    type: 'dol', grossGil: 4000, matCost: null, netGil: 4000, exp: 3000,
    hasMatCostData: true, targetItemId: 5002, targetItemQty: 5 },
];

beforeEach(() => {
  localStorage.clear();
  useLevePlanStore.setState(defaultLevePlan());
});

function withProviders(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe('LevePlanner', () => {
  it('renders one row per leve with the expected columns', () => {
    render(withProviders(<LevePlanner rows={rows} />));
    expect(screen.getByText(/Cobalt Ingot/)).toBeInTheDocument();
    expect(screen.getByText(/Mining for Memories/)).toBeInTheDocument();
    expect(screen.getByText(/5\.4k|5,400/)).toBeInTheDocument();
    expect(screen.getByText(/4k|4,000/)).toBeInTheDocument();
  });

  it("renders '—' in Mat Cost / Net Gil columns for non-DoH rows", () => {
    render(withProviders(<LevePlanner rows={[rows[1]]} />));
    const row = screen.getByText(/Mining for Memories/).closest('tr')!;
    // dolLeve has matCost=null, hasMatCostData=true → mat cell shows —
    expect(row.textContent).toContain('—');
  });

  it("shows '?' in Mat Cost when hasMatCostData=false", () => {
    const degraded: LeveRow = { ...rows[0], hasMatCostData: false, matCost: null, netGil: 6000 };
    render(withProviders(<LevePlanner rows={[degraded]} />));
    const row = screen.getByText(/Cobalt Ingot/).closest('tr')!;
    expect(row.textContent).toContain('?');
  });

  it('switches sort key when mode toggle flips to exp', () => {
    render(withProviders(<LevePlanner rows={rows} />));
    fireEvent.click(screen.getByLabelText(/exp mode/i));
    expect(useLevePlanStore.getState().mode).toBe('exp');
  });

  it('shows an empty-state message when rows is empty', () => {
    render(withProviders(<LevePlanner rows={[]} />));
    expect(screen.getByText(/run query/i)).toBeInTheDocument();
  });

  it('renders the DoH target item name as an ItemNameLinks link', () => {
    render(withProviders(<LevePlanner rows={rows} />));
    const link = screen.getByRole('link', { name: /cobalt ingot/i });
    expect(link).toHaveAttribute('href');
    expect(link.getAttribute('href')).toContain('universalis.app');
  });
});
