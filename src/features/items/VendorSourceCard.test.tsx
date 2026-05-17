import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VendorSourceCard } from './VendorSourceCard';
import type { MarketItem } from '../../lib/universalis';

function mkMarket(opts: { minNQ?: number | null; minHQ?: number | null; medianNQ?: number | null; medianHQ?: number | null; recentNQ?: number; recentHQ?: number }): MarketItem {
  return {
    minNQ: opts.minNQ ?? null,
    minHQ: opts.minHQ ?? null,
    avgNQ: null, avgHQ: null,
    medianNQ: opts.medianNQ ?? opts.minNQ ?? null,
    medianHQ: opts.medianHQ ?? opts.minHQ ?? null,
    recentSalesNQ: opts.recentNQ ?? 10,
    recentSalesHQ: opts.recentHQ ?? 10,
    velocity: 1, lastUploadTime: 0, listingCount: 5,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
  };
}

describe('VendorSourceCard', () => {
  it('renders the vendor price line', () => {
    render(<VendorSourceCard vendorPrice={108} homeMarket={undefined} canHq={true} worldLabel="Phantom" />);
    expect(screen.getByText(/Sold by NPC/i)).toBeInTheDocument();
    expect(screen.getByText(/108/)).toBeInTheDocument();
  });

  it('omits the profit comparison line when no trusted home tier exists', () => {
    render(<VendorSourceCard vendorPrice={108} homeMarket={undefined} canHq={true} worldLabel="Phantom" />);
    expect(screen.queryByText(/profit/i)).not.toBeInTheDocument();
  });

  it('shows the profit comparison line when a trusted HQ tier exists (canHq=true)', () => {
    const market = mkMarket({ minNQ: 500, minHQ: 4200, recentNQ: 20, recentHQ: 20 });
    render(<VendorSourceCard vendorPrice={108} homeMarket={market} canHq={true} worldLabel="Phantom" />);
    expect(screen.getByText(/Phantom HQ/i)).toBeInTheDocument();
    expect(screen.getByText(/4.2k/)).toBeInTheDocument();
    expect(screen.getByText(/profit/i)).toBeInTheDocument();
    expect(screen.getByText(/4.1k/)).toBeInTheDocument();
  });

  it('falls back to NQ tier when canHq=false', () => {
    const market = mkMarket({ minNQ: 600, recentNQ: 20 });
    render(<VendorSourceCard vendorPrice={100} homeMarket={market} canHq={false} worldLabel="Phantom" />);
    expect(screen.getByText(/Phantom NQ/i)).toBeInTheDocument();
    expect(screen.getByText(/600/)).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();   // profit
  });

  it('omits the profit line when sale tier is below trust threshold (e.g. zero recent sales)', () => {
    const market = mkMarket({ minNQ: 600, recentNQ: 0 });
    render(<VendorSourceCard vendorPrice={100} homeMarket={market} canHq={false} worldLabel="Phantom" />);
    expect(screen.queryByText(/profit/i)).not.toBeInTheDocument();
  });
});
