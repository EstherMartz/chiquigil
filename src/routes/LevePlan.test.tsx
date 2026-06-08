import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import LevePlan from './LevePlan';

const runMock = vi.fn();
vi.mock('../features/leves/useLevePlanQuery', () => ({
  useLevePlanQuery: () => ({
    run: runMock,
    rows: [],
    skipped: 0,
    ready: true,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

function withProviders(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('LevePlan route', () => {
  beforeEach(() => runMock.mockClear());

  it('renders a heading and a Run button', () => {
    render(withProviders(<LevePlan />));
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).toMatch(/leve/i);
    expect(screen.getByRole('button', { name: /run scan/i })).toBeInTheDocument();
  });

  it('auto-runs the scan once on mount when ready', () => {
    render(withProviders(<LevePlan />));
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it('fires the Run mutation again on click', () => {
    render(withProviders(<LevePlan />));
    runMock.mockClear(); // drop the auto-run so we isolate the click
    fireEvent.click(screen.getByRole('button', { name: /run scan/i }));
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
