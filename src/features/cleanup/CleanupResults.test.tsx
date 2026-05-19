import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import { CleanupResults } from './CleanupResults';
import type { CleanupResult } from './types';

const empty: CleanupResult = { craft: [], sellMb: [], vendor: [], discard: [], unrecognized: [] };

function withRouter(node: React.ReactNode) {
  return render(<BrowserRouter>{node}</BrowserRouter>);
}

describe('CleanupResults', () => {
  it('renders nothing when all buckets are empty and no unrecognized', () => {
    withRouter(<CleanupResults result={empty} />);
    expect(screen.queryByText(/Craft these/)).toBeNull();
    expect(screen.queryByText(/Sell on Marketboard/)).toBeNull();
    expect(screen.queryByText(/Vendor/)).toBeNull();
  });

  it('renders a craft section with row + expand interaction', async () => {
    const result: CleanupResult = {
      ...empty,
      craft: [{
        entry: { itemId: 4, name: 'Earth Cluster', qty: 42, isHq: false, locations: ['bag'] },
        vendorRevenue: 84, mbRevenue: 0, mbListingCount: 0,
        bestCraft: {
          outputItemId: 99, outputName: 'Earthbreak Aethersand', outputUnitPrice: 18000,
          netProfit: 14000,
          usedFromInventory: [{ itemId: 4, name: 'Earth Cluster', amount: 10 }],
          missingIngredients: [],
        },
        otherCrafts: [],
        bucket: 'craft',
        runnerUp: { action: 'vendor', value: 84 },
      }],
    };
    withRouter(<CleanupResults result={result} />);
    expect(screen.getByText(/Craft these \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Earth Cluster')).toBeInTheDocument();
    expect(screen.getByText(/Earthbreak Aethersand/)).toBeInTheDocument();
    expect(screen.getByText(/\+14k/)).toBeInTheDocument();

    // Toggle disclosure
    const row = screen.getByRole('button', { name: /Earthbreak Aethersand/ });
    await userEvent.click(row);
    expect(screen.getByText(/Uses from inventory/)).toBeInTheDocument();
  });

  it('renders Sell on Marketboard rows', () => {
    const result: CleanupResult = {
      ...empty,
      sellMb: [{
        entry: { itemId: 3, name: 'Carbonweave Cloth', qty: 3, isHq: false, locations: ['retainer'] },
        vendorRevenue: 100, mbRevenue: 37200, mbListingCount: 8,
        bestCraft: null, otherCrafts: [], bucket: 'sellMb',
        runnerUp: { action: 'vendor', value: 100 },
      }],
    };
    withRouter(<CleanupResults result={result} />);
    expect(screen.getByText(/Sell on Marketboard \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/37.200/)).toBeInTheDocument();
  });

  it('renders Vendor or discard rows', () => {
    const result: CleanupResult = {
      ...empty,
      vendor: [{
        entry: { itemId: 1, name: 'Beech Branch', qty: 17, isHq: false, locations: ['bag'] },
        vendorRevenue: 68, mbRevenue: 0, mbListingCount: 0,
        bestCraft: null, otherCrafts: [], bucket: 'vendor', runnerUp: null,
      }],
      discard: [{
        entry: { itemId: 2, name: 'Unmelded Junk', qty: 1, isHq: false, locations: ['bag'] },
        vendorRevenue: 0, mbRevenue: 0, mbListingCount: 0,
        bestCraft: null, otherCrafts: [], bucket: 'discard', runnerUp: null,
      }],
    };
    withRouter(<CleanupResults result={result} />);
    expect(screen.getByText(/Vendor or discard \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('Beech Branch')).toBeInTheDocument();
    expect(screen.getByText('Unmelded Junk')).toBeInTheDocument();
    expect(screen.getByText(/no vendor/i)).toBeInTheDocument();
  });

  it('renders Unrecognized rows when present', async () => {
    const result: CleanupResult = {
      ...empty,
      unrecognized: [{ itemId: 0, name: 'Mystery Item X', qty: 4, isHq: false, locations: ['bag'] }],
    };
    withRouter(<CleanupResults result={result} />);
    expect(screen.getByText(/Unrecognized rows \(1\)/)).toBeInTheDocument();
    // Unrecognized section defaults collapsed — expand it to verify the row is rendered.
    await userEvent.click(screen.getByRole('button', { name: /Unrecognized rows/ }));
    expect(screen.getByText(/Mystery Item X/)).toBeInTheDocument();
  });
});
