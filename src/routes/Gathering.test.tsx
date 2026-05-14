import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import Gathering from './Gathering';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { clearItemCache, clearRecipeCache } from '../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  await clearItemCache();
  await clearRecipeCache();
  vi.restoreAllMocks();
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Gathering route', () => {
  it('renders the heading and a "Plan a session" link to /gathering/plan', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: {}, results: [] }) }));
    render(withProviders(<Gathering />));
    expect(screen.getByRole('heading', { name: /^gathering$/i })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /plan a session/i });
    expect(link).toHaveAttribute('href', '/gathering/plan');
  });
});
