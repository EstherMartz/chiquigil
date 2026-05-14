import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { GatheringPlanner } from './GatheringPlanner';
import { useGatheringPlanStore, defaultGatheringPlan } from './gatheringPlanStore';
import type { QueryResultRow } from '../queries/types';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';

const rows: QueryResultRow[] = [
  { id: 5544, name: 'Cobalt Ore', sc: 1, unitPrice: 100, averagePrice: 100, dealPct: 0, velocity: 5, gilFlow: 600, hq: false },
  { id: 5543, name: 'Rosewood Log', sc: 1, unitPrice: 50, averagePrice: 50, dealPct: 0, velocity: 5, gilFlow: 400, hq: false },
];

const catalog: GatheringCatalog = new Map([
  [5544, { level: 50, timed: false, hidden: false }],
  [5543, { level: 90, timed: true, hidden: false }],
]);

beforeEach(() => {
  localStorage.clear();
  useGatheringPlanStore.setState(defaultGatheringPlan());
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe('GatheringPlanner', () => {
  it('renders one row per pick with computed qty (time mode default)', () => {
    render(withProviders(<GatheringPlanner rows={rows} />));
    // With defaults (45 min * 100 ipm = 4500 items; gilFlow shares 60/40)
    // qty1 = 2700 ; qty2 = 1800
    expect(screen.getByText('Cobalt Ore')).toBeInTheDocument();
    expect(screen.getByText('Rosewood Log')).toBeInTheDocument();
    expect(screen.getByText(/2700|2,700/)).toBeInTheDocument();
    expect(screen.getByText(/1800|1,800/)).toBeInTheDocument();
  });

  it('switches to gil mode and recomputes', () => {
    render(withProviders(<GatheringPlanner rows={rows} />));
    fireEvent.click(screen.getByLabelText(/gil budget/i));
    // gil mode: budgetGil 500_000 default; shares 60/40
    // qty1 = round(500000*0.6/100) = 3000 ; qty2 = round(500000*0.4/50) = 4000
    expect(screen.getByText(/3000|3,000/)).toBeInTheDocument();
    expect(screen.getByText(/4000|4,000/)).toBeInTheDocument();
  });

  it('disables the export button when no rows are available', () => {
    render(withProviders(<GatheringPlanner rows={[]} />));
    expect(screen.getByRole('button', { name: /copy gbr clipboard string/i })).toBeDisabled();
  });

  it('copies an encoded blob to the clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(withProviders(<GatheringPlanner rows={rows} />));
    fireEvent.click(screen.getByRole('button', { name: /copy gbr clipboard string/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(arg.length).toBeGreaterThan(0);
  });

  it('falls back to a readonly textarea when clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(withProviders(<GatheringPlanner rows={rows} />));
    fireEvent.click(screen.getByRole('button', { name: /copy gbr clipboard string/i }));

    await waitFor(() => {
      expect(screen.getByText(/clipboard write failed/i)).toBeInTheDocument();
    });
    const textboxes = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    const textarea = textboxes.find((el) => el.hasAttribute('readonly'));
    expect(textarea).toBeDefined();
    expect(textarea!.value).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(textarea!.value.length).toBeGreaterThan(0);
  });

  it('filters out rows above maxLevel', () => {
    useGatheringPlanStore.getState().setMaxLevel(60);
    render(withProviders(<GatheringPlanner rows={rows} catalog={catalog} />));
    // Only Cobalt Ore (lvl 50) survives the filter; Rosewood Log (lvl 90) is dropped.
    expect(screen.getByText('Cobalt Ore')).toBeInTheDocument();
    expect(screen.queryByText('Rosewood Log')).not.toBeInTheDocument();
  });

  it('hides timed-node rows by default and shows them when includeTimed is on', () => {
    // Default: includeTimed = false, maxLevel = 90 → Cobalt (untimed) survives, Rosewood (timed) doesn't.
    const { rerender } = render(withProviders(<GatheringPlanner rows={rows} catalog={catalog} />));
    expect(screen.getByText('Cobalt Ore')).toBeInTheDocument();
    expect(screen.queryByText('Rosewood Log')).not.toBeInTheDocument();

    // Toggle includeTimed on; Rosewood reappears.
    useGatheringPlanStore.getState().setIncludeTimed(true);
    rerender(withProviders(<GatheringPlanner rows={rows} catalog={catalog} />));
    expect(screen.getByText('Rosewood Log')).toBeInTheDocument();
  });

  it('renders zero-price rows as a — row instead of dropping them silently', () => {
    const rowsWithZero: QueryResultRow[] = [
      { id: 5544, name: 'Cobalt Ore', sc: 1, unitPrice: 100, averagePrice: 100, dealPct: 0, velocity: 5, gilFlow: 600, hq: false },
      { id: 5543, name: 'Free Sample', sc: 1, unitPrice: 0, averagePrice: 0, dealPct: 0, velocity: 0, gilFlow: 0, hq: false },
    ];
    render(withProviders(<GatheringPlanner rows={rowsWithZero} />));
    expect(screen.getByText('Cobalt Ore')).toBeInTheDocument();
    // The skipped row's name is visible, and its row contains — markers.
    const skippedName = screen.getByText('Free Sample');
    const row = skippedName.closest('tr')!;
    expect(row.textContent).toContain('—');
  });

  it('wraps item names in interactive links', () => {
    render(withProviders(<GatheringPlanner rows={rows} />));
    const link = screen.getByRole('link', { name: /cobalt ore/i });
    expect(link).toHaveAttribute('href');
    expect(link.getAttribute('href')).toContain('universalis.app');
  });
});
