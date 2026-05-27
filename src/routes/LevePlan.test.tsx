import { describe, it, expect, vi } from 'vitest';
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
  it('renders a heading and a Run button', () => {
    render(withProviders(<LevePlan />));
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).toMatch(/leve/i);
    expect(screen.getByRole('button', { name: /run scan/i })).toBeInTheDocument();
  });

  it('fires the Run mutation on click', () => {
    render(withProviders(<LevePlan />));
    fireEvent.click(screen.getByRole('button', { name: /run scan/i }));
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
