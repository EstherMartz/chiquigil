import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlannerView } from './PlannerView';
import { usePlannerStore } from './plannerStore';

function reset() {
  localStorage.clear();
  usePlannerStore.getState().resetAll();
  usePlannerStore.setState({ log: [], daily: { date: '', done: {} } });
}

describe('PlannerView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
    reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the four lanes and DAILY_TASKS', () => {
    render(<MemoryRouter><PlannerView /></MemoryRouter>);
    expect(screen.getByText('Craft')).toBeInTheDocument();
    expect(screen.getByText('Gather & Sell')).toBeInTheDocument();
    expect(screen.getByText('Content Farm')).toBeInTheDocument();
    expect(screen.getByText('Passive')).toBeInTheDocument();
    expect(screen.getByText(/done today/)).toBeInTheDocument();
  });

  it('logs gil and increments treasury', () => {
    render(<MemoryRouter><PlannerView /></MemoryRouter>);
    const startCurrent = usePlannerStore.getState().goal.current;
    const input = screen.getByPlaceholderText(/4,025,000/);
    fireEvent.change(input, { target: { value: '500000' } });
    fireEvent.click(screen.getByRole('button', { name: /add to treasury/i }));
    expect(usePlannerStore.getState().goal.current).toBe(startCurrent + 500_000);
  });

  it('resets daily checklist across a date boundary on mount', () => {
    // Pre-populate "yesterday" state with checked tasks.
    usePlannerStore.setState({
      daily: { date: '2026-05-23', done: { d1: true, d2: true } },
    });
    render(<MemoryRouter><PlannerView /></MemoryRouter>);
    const after = usePlannerStore.getState();
    expect(after.daily.date).toBe('2026-05-24');
    expect(after.daily.done).toEqual({});
  });

  it('preserves the log across the date boundary', () => {
    const yesterday = new Date('2026-05-23T10:00:00Z').getTime();
    usePlannerStore.setState({
      log: [{ ts: yesterday, amount: 12_345, note: 'yesterday sale' }],
      daily: { date: '2026-05-23', done: { d1: true } },
    });
    render(<MemoryRouter><PlannerView /></MemoryRouter>);
    expect(usePlannerStore.getState().log).toHaveLength(1);
    expect(usePlannerStore.getState().log[0].note).toBe('yesterday sale');
  });

  it('clicking + on a craft item creates a log entry and bumps treasury', () => {
    render(<MemoryRouter><PlannerView /></MemoryRouter>);
    const item = usePlannerStore.getState().lanes.craft[0];
    const startCurrent = usePlannerStore.getState().goal.current;
    // LANE_ORDER starts with 'craft', so the first "Increment units" button
    // belongs to the first craft item.
    const plusBtns = screen.getAllByRole('button', { name: /increment units/i });
    fireEvent.click(plusBtns[0]);
    expect(usePlannerStore.getState().goal.current).toBe(startCurrent + item.price);
  });
});
