import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShoppingListPlan } from './ShoppingListPlan';
import type { ShoppingPlan } from './planShopping';

const samplePlan: ShoppingPlan = {
  perIngredient: [
    { id: 5, qty: 3, bestWorld: 'Phantom', bestPrice: 100, isLightDc: false, listingCount: 4 },
    { id: 6, qty: 2, bestWorld: 'Odin', bestPrice: 50, isLightDc: true, listingCount: 1 },
    { id: 7, qty: 1, bestWorld: null, bestPrice: null, isLightDc: false, listingCount: 0 },
  ],
  byWorldSummary: [
    { world: 'Phantom', isLightDc: false, ingredients: [{ id: 5, qty: 3, price: 100 }], total: 300 },
    { world: 'Odin', isLightDc: true, ingredients: [{ id: 6, qty: 2, price: 50 }], total: 100 },
  ],
  rollup: { spend: 400, revenue: 1500, profit: 1100, missingIngredients: 1 },
};

const names = new Map<number, string>([
  [5, 'Iron Ingot'],
  [6, 'Bronze Ingot'],
  [7, 'Ghost Crystal'],
]);

function renderWithRouter(plan: ShoppingPlan = samplePlan) {
  return render(
    <MemoryRouter>
      <ShoppingListPlan plan={plan} nameById={names} />
    </MemoryRouter>,
  );
}

describe('ShoppingListPlan', () => {
  it('renders the three rollup cards with correct totals', () => {
    renderWithRouter();
    // fmtGil: 400 stays as "400", 1500 becomes "1.5k", 1100 becomes "1.1k"
    expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('400');
    expect(screen.getByText(/est. revenue/i).parentElement?.textContent).toContain('1.5k');
    expect(screen.getByText(/net profit/i).parentElement?.textContent).toContain('1.1k');
  });

  it('warns about missing ingredients in the rollup', () => {
    renderWithRouter();
    expect(screen.getByText(/1 ingredients? have no listings/i)).toBeInTheDocument();
  });

  it('omits the missing-ingredients warning when there are none', () => {
    renderWithRouter({
      ...samplePlan,
      rollup: { ...samplePlan.rollup, missingIngredients: 0 },
    });
    expect(screen.queryByText(/have no listings/i)).not.toBeInTheDocument();
  });

  it('renders a card per world with ✈ for Light DC', () => {
    renderWithRouter();
    // Check that world names appear in the document
    expect(screen.getAllByText('Phantom').length).toBeGreaterThan(0);
    // Find the Odin world card by looking for the DC marker
    const odinElements = screen.getAllByText('Odin');
    const odinCard = odinElements[0].closest('div');
    expect(odinCard?.textContent).toContain('✈');
    // Phantom should NOT have the DC marker
    const phantomElements = screen.getAllByText('Phantom');
    const phantomCard = phantomElements[0].closest('div');
    expect(phantomCard?.textContent).not.toContain('✈');
  });

  it('renders the detail table with every ingredient including missing rows', () => {
    renderWithRouter();
    expect(screen.getByText('Iron Ingot')).toBeInTheDocument();
    expect(screen.getByText('Bronze Ingot')).toBeInTheDocument();
    expect(screen.getByText('Ghost Crystal')).toBeInTheDocument();
    // Check for the "No listings" text in the table (italic span)
    expect(screen.getByText('No listings')).toBeInTheDocument();
  });

  it('renders nothing for empty plan', () => {
    const { container } = renderWithRouter({
      perIngredient: [],
      byWorldSummary: [],
      rollup: { spend: 0, revenue: 0, profit: 0, missingIngredients: 0 },
    });
    expect(container.textContent).toBe('');
  });
});
