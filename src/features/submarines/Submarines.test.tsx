import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Submarines from '../../routes/Submarines';

function renderWithProviders() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Submarines />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Submarines page', () => {
  it('renders both tabs', () => {
    renderWithProviders();
    expect(screen.getByText('Route valuator')).toBeDefined();
    expect(screen.getByText('Loot pricer')).toBeDefined();
  });

  it('renders rank and slots inputs', () => {
    renderWithProviders();
    const inputs = screen.getAllByDisplayValue('1');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('shows route valuator empty state by default', () => {
    renderWithProviders();
    expect(screen.getByText(/Select sectors/i)).toBeDefined();
  });
});
