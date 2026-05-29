import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictCard } from './VerdictCard';
import type { MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';

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
