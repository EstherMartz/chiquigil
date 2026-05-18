import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShoppingListPlan } from './ShoppingListPlan';
import type { IngredientSurvey } from './shoppingListSurvey';
import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';

const sampleSurvey: IngredientSurvey[] = [
  { id: 5, qty: 3, mb: { world: 'Phantom', price: 100, count: 4, isLightDc: false }, npc: null, currency: null, autoSource: 'mb' },
  { id: 6, qty: 2, mb: { world: 'Odin', price: 50, count: 1, isLightDc: true }, npc: null, currency: null, autoSource: 'mb' },
  { id: 7, qty: 1, mb: null, npc: null, currency: null, autoSource: null },
];

const sampleItems = [{ id: 99, qty: 1, craftIntermediates: false }];
const sampleSnapshot: SnapshotItem[] = [
  { id: 99, name: 'Output', sc: 1, ui: 1, ilvl: 1, canHq: false },
];
const samplePrices: MarketData = {
  99: {
    minNQ: 1500, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: 1500, medianHQ: null,
    recentSalesNQ: 10, recentSalesHQ: 0, velocity: 1,
    lastUploadTime: 0, listingCount: 1,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
  },
};

const names = new Map<number, string>([
  [5, 'Iron Ingot'],
  [6, 'Bronze Ingot'],
  [7, 'Ghost Crystal'],
  [99, 'Output'],
]);

function renderWithRouter(
  survey: IngredientSurvey[] = sampleSurvey,
  items = sampleItems,
  snapshot = sampleSnapshot,
  prices = samplePrices,
) {
  return render(
    <MemoryRouter>
      <ShoppingListPlan survey={survey} shoppingItems={items} snapshot={snapshot} prices={prices} nameById={names} />
    </MemoryRouter>,
  );
}

describe('ShoppingListPlan', () => {
  it('renders the three rollup cards with correct totals', () => {
    renderWithRouter();
    expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('400');
    expect(screen.getByText(/est. revenue/i).parentElement?.textContent).toContain('1.5k');
    expect(screen.getByText(/net profit/i).parentElement?.textContent).toContain('1.1k');
  });

  it('warns about missing ingredients in the rollup', () => {
    renderWithRouter();
    expect(screen.getByText(/1 ingredients? have no listings/i)).toBeInTheDocument();
  });

  it('omits the missing-ingredients warning when there are none', () => {
    const survey: IngredientSurvey[] = [
      { id: 5, qty: 3, mb: { world: 'Phantom', price: 100, count: 4, isLightDc: false }, npc: null, currency: null, autoSource: 'mb' },
    ];
    renderWithRouter(survey, [], [], {});
    expect(screen.queryByText(/have no listings/i)).not.toBeInTheDocument();
  });

  it('renders a card per world with ✈ for Light DC', () => {
    renderWithRouter();
    expect(screen.getAllByText('Phantom').length).toBeGreaterThan(0);
    const odinElements = screen.getAllByText('Odin');
    const odinCard = odinElements[0].closest('div');
    expect(odinCard?.textContent).toContain('✈');
    const phantomElements = screen.getAllByText('Phantom');
    const phantomCard = phantomElements[0].closest('div');
    expect(phantomCard?.textContent).not.toContain('✈');
  });

  it('renders the detail table with every ingredient including missing rows', () => {
    renderWithRouter();
    expect(screen.getByText('Iron Ingot')).toBeInTheDocument();
    expect(screen.getByText('Bronze Ingot')).toBeInTheDocument();
    expect(screen.getByText('Ghost Crystal')).toBeInTheDocument();
    expect(screen.getByText('No listings')).toBeInTheDocument();
  });

  it('renders nothing when survey is empty', () => {
    const { container } = renderWithRouter([], [], [], {});
    expect(container.textContent).toBe('');
  });

  it('renders Source toggle when both MB + NPC exist on a row', () => {
    const survey: IngredientSurvey[] = [
      { id: 5, qty: 1,
        mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false },
        npc: { price: 80 }, currency: null, autoSource: 'mb' },
    ];
    renderWithRouter(survey, [], [], {});
    expect(screen.getByRole('button', { name: /^MB$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^NPC$/i })).toBeInTheDocument();
  });

  it('renders no toggle when only one gil source exists', () => {
    renderWithRouter();
    expect(screen.queryByRole('button', { name: /^MB$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^NPC$/i })).not.toBeInTheDocument();
  });

  it('clicking NPC button updates the displayed plan (price + world)', () => {
    const survey: IngredientSurvey[] = [
      { id: 5, qty: 2,
        mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false },
        npc: { price: 80 }, currency: null, autoSource: 'mb' },
    ];
    renderWithRouter(survey, [], [], {});
    expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('200');
    fireEvent.click(screen.getByRole('button', { name: /^NPC$/i }));
    expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('160');
    expect(screen.getAllByText(/NPC vendor/i).length).toBeGreaterThan(0);
  });

  it('renders currency info-line when survey row has currency', () => {
    const survey: IngredientSurvey[] = [
      { id: 5, qty: 1,
        mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false },
        npc: null,
        currency: { id: 'poetics', label: 'Allagan Tomestone of Poetics', shortLabel: 'Poetics', costPerUnit: 10 },
        autoSource: 'mb' },
    ];
    renderWithRouter(survey, [], [], {});
    expect(screen.getByText(/^└─/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Poetics$/ })).toBeInTheDocument();
  });

  it('renders the currency name as a link to /currency-flip?currency=<id>', () => {
    const survey: IngredientSurvey[] = [
      { id: 5, qty: 1,
        mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false },
        npc: null,
        currency: { id: 'poetics', label: 'Allagan Tomestone of Poetics', shortLabel: 'Poetics', costPerUnit: 10 },
        autoSource: 'mb' },
    ];
    renderWithRouter(survey, [], [], {});
    const link = screen.getByRole('link', { name: /^Poetics$/ });
    expect(link.getAttribute('href')).toBe('/currency-flip?currency=poetics');
  });
});
