import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PathCardView } from './PathCard';
import type { PathCard } from './comparePaths';

const base: PathCard = {
  id: 'sell-raw', kind: 'sell-raw', label: 'Sell raw (MB)', itemId: 1, itemName: 'Ore',
  salePrice: 1000, matCost: 0, profitPerUnit: 950, velocity: 4,
  unitsMovedPerDay: 4, gilPerDay: 3800, timeToSellHours: 6, stack: null,
  risk: 'Steady', effort: 'none',
};

function renderCard(card: PathCard, opts: { isWinner?: boolean; quantity?: number } = {}) {
  return render(
    <MemoryRouter>
      <PathCardView card={card} isWinner={opts.isWinner ?? false} quantity={opts.quantity ?? 1} />
    </MemoryRouter>,
  );
}

describe('PathCardView', () => {
  it('renders the path label and a BEST badge for the winner', () => {
    renderCard(base, { isWinner: true });
    expect(screen.getByText('Sell raw (MB)')).toBeInTheDocument();
    expect(screen.getByText(/BEST/)).toBeInTheDocument();
  });

  it('shows a supply-gap star when the stack profile has a gap', () => {
    renderCard({
      ...base,
      stack: {
        stackSizes: [{ stackSize: 5, soldLast90d: 15, listedNow: 0, avgPricePerUnit: 90 }],
        dominantStack: 5, volumeAtBest: 15, listedAtBest: 0, supplyGap: true, listingEventsPerDay: 2,
      },
    });
    expect(screen.getByText(/★/)).toBeInTheDocument();
  });

  it('shows an overcrowding warning at high quantity', () => {
    renderCard({ ...base, unitsMovedPerDay: 1, velocity: 1 }, { quantity: 30 });
    expect(screen.getByText(/take ~30/)).toBeInTheDocument();
  });
});
