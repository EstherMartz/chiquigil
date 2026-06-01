import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StackAnalyzerView } from './StackAnalyzerBlock';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';

const sale = (quantity: number, pricePerUnit: number, timestamp: number, hq = false): HistoryEntry =>
  ({ quantity, pricePerUnit, timestamp, hq });
const ls = (quantity: number, price: number, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller: '' });

describe('StackAnalyzerView', () => {
  it('renders sold + listed panels and flags a high-demand/thin-supply gap', () => {
    const entries = [
      sale(1, 1000, 10), sale(1, 1000, 20), sale(1, 1000, 30), sale(1, 1000, 40), sale(1, 1000, 50),
      sale(99, 800, 5),
    ];
    const listings = [ls(99, 790), ls(99, 800)];
    render(<StackAnalyzerView entries={entries} listings={listings} canHq={false} />);

    expect(screen.getByText(/Sold · last 90d/i)).toBeInTheDocument();
    expect(screen.getByText(/Listed now/i)).toBeInTheDocument();
    expect(screen.getByText(/gap/i)).toBeInTheDocument();
  });

  it('shows the not-stackable note when every size is 1', () => {
    render(
      <StackAnalyzerView
        entries={[sale(1, 1000, 10)]}
        listings={[ls(1, 1000)]}
        canHq={false}
      />,
    );
    expect(screen.getByText(/Always sold as single units/i)).toBeInTheDocument();
  });

  it('toggles to the HQ tier', async () => {
    const entries = [sale(1, 1000, 10), sale(5, 2000, 20, true)];
    const listings = [ls(5, 1990, true)];
    render(<StackAnalyzerView entries={entries} listings={listings} canHq />);
    expect(screen.getByText(/Always sold as single units/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'HQ' }));
    expect(screen.getByText(/Sold · last 90d/i)).toBeInTheDocument();
  });
});
