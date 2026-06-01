import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { VerdictCard } from './VerdictCard';
import type { MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { HistoryEntry } from '../../lib/universalisHistory';

const sale = (quantity: number, pricePerUnit: number, timestamp: number, hq = false): HistoryEntry =>
  ({ quantity, pricePerUnit, timestamp, hq });

const DAY = 86_400_000;
const NOW = 1_000 * DAY;
function mkt(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: NOW - 1_000,
    listingCount: 0, worldListings: [], ...over,
  } as MarketItem;
}
const recipe = { itemResultId: 1, classJob: 'CRP', recipeLevel: 50, ingredients: [] } as unknown as Recipe;

describe('VerdictCard', () => {
  it('renders the verdict headline and best play', () => {
    render(
      <VerdictCard
        phantom={mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5, listingCount: 1 })}
        region={undefined} recipe={undefined} vendorPrice={undefined}
        materialCost={0} homeWorld="Home" canHq={false} now={NOW}
      />,
    );
    expect(screen.getByText('✦ Verdict')).toBeInTheDocument();
    expect(screen.getByText('List on MB')).toBeInTheDocument();
  });

  it('surfaces a runner-up line when a second play qualifies', () => {
    render(
      <VerdictCard
        phantom={mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5, listingCount: 1 })}
        region={undefined} recipe={recipe} vendorPrice={undefined}
        materialCost={200} homeWorld="Home" canHq={false} now={NOW}
      />,
    );
    expect(screen.getByText(/also viable/i)).toBeInTheDocument();
  });
});

describe('VerdictCard stack suggestion', () => {
  it('shows a quality-labelled SELL AS column for an NQ gap, with no duplicate left insight', () => {
    const history = [
      sale(2, 1500, 10), sale(2, 1500, 20), sale(2, 1500, 30), sale(2, 1500, 40), sale(2, 1500, 50),
    ];
    render(
      <VerdictCard
        phantom={mkt({ minNQ: 1500, avgNQ: 1500, recentSalesNQ: 10, velocity: 5, listingCount: 1, worldListings: [] })}
        region={undefined} recipe={undefined} vendorPrice={undefined}
        materialCost={0} homeWorld="Home" canHq={false} now={NOW}
        history={history}
      />,
    );
    const col = screen.getByText('Sell as').parentElement as HTMLElement;
    expect(within(col).getByText(/2-stack/)).toBeInTheDocument();
    expect(within(col).getByText('NQ')).toBeInTheDocument();
    expect(within(col).getByText(/under-supplied/i)).toBeInTheDocument();
    // The left insight line was removed — the suggestion is shown only once (the column).
    expect(screen.queryByText(/Best as/i)).toBeNull();
    expect(screen.queryByText(/Most sales are/i)).toBeNull();
  });

  it('uses HQ history and labels HQ when the best play is HQ', () => {
    const history = [
      sale(99, 4800, 10, true), sale(99, 4800, 20, true), sale(99, 4800, 30, true),
      sale(2, 100, 40, false), // NQ noise — must be ignored when the verdict is HQ
    ];
    render(
      <VerdictCard
        phantom={mkt({ minHQ: 5000, avgHQ: 5000, recentSalesHQ: 10, velocity: 5, listingCount: 1, worldListings: [] })}
        region={undefined} recipe={undefined} vendorPrice={undefined}
        materialCost={0} homeWorld="Home" canHq now={NOW}
        history={history}
      />,
    );
    const col = screen.getByText('Sell as').parentElement as HTMLElement;
    expect(within(col).getByText(/99-stack/)).toBeInTheDocument();
    expect(within(col).getByText('HQ')).toBeInTheDocument();
    expect(within(col).queryByText(/2-stack/)).toBeNull(); // the NQ size is not used
  });

  it('renders nothing extra for a non-stackable item', () => {
    const history = [sale(1, 1000, 10)];
    render(
      <VerdictCard
        phantom={mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5, listingCount: 1, worldListings: [] })}
        region={undefined} recipe={undefined} vendorPrice={undefined}
        materialCost={0} homeWorld="Home" canHq={false} now={NOW}
        history={history}
      />,
    );
    expect(screen.queryByText('Sell as')).toBeNull();
    expect(screen.getByText('List on MB')).toBeInTheDocument();
  });
});
