import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GatheringPlanner } from './GatheringPlanner';
import { useGatheringPlanStore, defaultGatheringPlan } from './gatheringPlanStore';
import type { QueryResultRow } from '../queries/types';

const rows: QueryResultRow[] = [
  { id: 5544, name: 'Cobalt Ore', sc: 1, unitPrice: 100, averagePrice: 100, dealPct: 0, velocity: 5, gilFlow: 600, hq: false },
  { id: 5543, name: 'Rosewood Log', sc: 1, unitPrice: 50, averagePrice: 50, dealPct: 0, velocity: 5, gilFlow: 400, hq: false },
];

beforeEach(() => {
  localStorage.clear();
  useGatheringPlanStore.setState(defaultGatheringPlan());
});

describe('GatheringPlanner', () => {
  it('renders one row per pick with computed qty (time mode default)', () => {
    render(<GatheringPlanner rows={rows} />);
    // With defaults (45 min * 100 ipm = 4500 items; gilFlow shares 60/40)
    // qty1 = 2700 ; qty2 = 1800
    expect(screen.getByText('Cobalt Ore')).toBeInTheDocument();
    expect(screen.getByText('Rosewood Log')).toBeInTheDocument();
    expect(screen.getByText(/2700|2,700/)).toBeInTheDocument();
    expect(screen.getByText(/1800|1,800/)).toBeInTheDocument();
  });

  it('switches to gil mode and recomputes', () => {
    render(<GatheringPlanner rows={rows} />);
    fireEvent.click(screen.getByLabelText(/gil budget/i));
    // gil mode: budgetGil 500_000 default; shares 60/40
    // qty1 = round(500000*0.6/100) = 3000 ; qty2 = round(500000*0.4/50) = 4000
    expect(screen.getByText(/3000|3,000/)).toBeInTheDocument();
    expect(screen.getByText(/4000|4,000/)).toBeInTheDocument();
  });

  it('disables the export button when no rows are available', () => {
    render(<GatheringPlanner rows={[]} />);
    expect(screen.getByRole('button', { name: /copy gbr clipboard string/i })).toBeDisabled();
  });

  it('copies an encoded blob to the clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(<GatheringPlanner rows={rows} />);
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

    render(<GatheringPlanner rows={rows} />);
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
});
