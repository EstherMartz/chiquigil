import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import GatheringPlan from './GatheringPlan';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { useGatheringPlanStore, defaultGatheringPlan } from '../features/gathering/gatheringPlanStore';
import { clearItemCache, putCachedItems, putCachedGatheringCatalog } from '../lib/recipeCache';
import type { SnapshotItem } from '../lib/itemSnapshot';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useGatheringPlanStore.setState(defaultGatheringPlan());
  await clearItemCache();
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

const snapshotItems: SnapshotItem[] = [
  { id: 5544, name: 'Cobalt Ore',   sc: 1, ui: 1, ilvl: 1, canHq: false },
  { id: 5543, name: 'Rosewood Log', sc: 1, ui: 1, ilvl: 1, canHq: false },
];

const marketResponse = {
  items: {
    '5544': {
      listings: [{ hq: false, pricePerUnit: 100 }],
      recentHistory: Array.from({ length: 10 }, () => ({ hq: false, pricePerUnit: 100 })),
      regularSaleVelocity: 5,
      averagePriceNQ: 110,
    },
    '5543': {
      listings: [{ hq: false, pricePerUnit: 50 }],
      recentHistory: Array.from({ length: 10 }, () => ({ hq: false, pricePerUnit: 50 })),
      regularSaleVelocity: 4,
      averagePriceNQ: 55,
    },
  },
};

describe('GatheringPlan route', () => {
  it('renders the page title, planner section, Run button, and back link', async () => {
    await putCachedItems(snapshotItems);
    await putCachedGatheringCatalog([
      [5544, { level: 50, timed: false, hidden: false }],
      [5543, { level: 60, timed: false, hidden: false }],
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => marketResponse }));

    render(withProviders(<GatheringPlan />));

    const headings = await screen.findAllByRole('heading', { name: /plan a session/i });
    const pageHeading = headings.find((h) => h.tagName.toLowerCase() === 'h2');
    expect(pageHeading).toBeDefined();
    expect(await screen.findByRole('button', { name: /run query/i })).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: /browse all gatherables/i });
    expect(backLink).toHaveAttribute('href', '/gathering');
  });

  it('clicking Run query populates the plan table', async () => {
    await putCachedItems(snapshotItems);
    await putCachedGatheringCatalog([
      [5544, { level: 50, timed: false, hidden: false }],
      [5543, { level: 60, timed: false, hidden: false }],
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => marketResponse }));

    render(withProviders(<GatheringPlan />));

    const runBtn = await screen.findByRole('button', { name: /run query/i });
    await waitFor(() => expect(runBtn).not.toBeDisabled());
    fireEvent.click(runBtn);

    await waitFor(() => expect(screen.getByText('Cobalt Ore')).toBeInTheDocument());
    expect(screen.getByText('Rosewood Log')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy gbr clipboard string/i })).not.toBeDisabled();
  });

  it('disables Run query until snapshot and catalog are ready', () => {
    // No seeded caches; fetch fails so they never resolve.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    render(withProviders(<GatheringPlan />));
    expect(screen.getByRole('button', { name: /loading data/i })).toBeDisabled();
  });
});
