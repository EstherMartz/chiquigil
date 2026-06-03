import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StackAnalyzerView } from './StackAnalyzerBlock';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';

const sale = (quantity: number, pricePerUnit: number, timestamp: number, hq = false): HistoryEntry =>
  ({ quantity, pricePerUnit, timestamp, hq });
const ls = (quantity: number, price: number, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller: '' });

describe('StackAnalyzerView', () => {
  it('renders the demand/supply legend and flags a high-demand/thin-supply gap', () => {
    const entries = [
      sale(1, 1000, 10), sale(1, 1000, 20), sale(1, 1000, 30), sale(1, 1000, 40), sale(1, 1000, 50),
      sale(99, 800, 5),
    ];
    const listings = [ls(99, 790), ls(99, 800)];
    render(<StackAnalyzerView entries={entries} listings={listings} canHq={false} />);

    expect(screen.getByText(/sold \(90d\)/i)).toBeInTheDocument();
    expect(screen.getByText('▼ listed now')).toBeInTheDocument();
    expect(screen.getByText(/~\/unit/i)).toBeInTheDocument(); // price-line legend marker
    // The gap caption names the recommended stack (stack 1 here: strong demand, nothing listed).
    expect(screen.getByText(/gap at stack/i)).toBeInTheDocument();
  });

  it('labels the price extremes and keys the markers', () => {
    const entries = [
      sale(1, 3400, 10), sale(1, 3400, 11),
      sale(2, 1500, 20), sale(2, 1500, 21),
    ];
    render(<StackAnalyzerView entries={entries} listings={[]} canHq={false} />);
    // High end of the per-unit price range is labelled on the chart (caption shows the pick's price, not this one).
    expect(screen.getByText(/~3\.4k/)).toBeInTheDocument();
    // Marker key explains the ✓ and ▾ marks.
    expect(screen.getByText('✓ supply gap · ▾ suggested to list')).toBeInTheDocument();
  });

  it('expands the rare chip to list the collapsed sizes and their volumes', () => {
    const entries = [
      ...Array.from({ length: 20 }, (_, k) => sale(1, 1000, k + 1)),
      ...[3, 4, 5, 6, 7].map((s) => sale(s, 1000, 100 + s)),
    ];
    render(<StackAnalyzerView entries={entries} listings={[]} canHq={false} />);
    expect(screen.queryByText(/rare sizes \(\d+\)/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /rare sizes/i }));
    expect(screen.getByText(/rare sizes \(5\)/i)).toBeInTheDocument();
    expect(screen.getByText(/^3: 1 sold/)).toBeInTheDocument();
  });

  it('collapses the low-volume tail into a rare-sizes chip', () => {
    const entries = [
      ...Array.from({ length: 20 }, (_, k) => sale(1, 1000, k + 1)),
      ...[3, 4, 5, 6, 7].map((s) => sale(s, 1000, 100 + s)),
    ];
    render(<StackAnalyzerView entries={entries} listings={[]} canHq={false} />);
    expect(screen.getByText(/\+5 rare sizes/)).toBeInTheDocument();
  });

  it('shows no rare chip when there is no tail', () => {
    render(
      <StackAnalyzerView entries={[sale(1, 1000, 10), sale(2, 1000, 20)]} listings={[]} canHq={false} />,
    );
    expect(screen.queryByText(/rare sizes/)).toBeNull();
  });

  it('opens a detail card with exact numbers on column hover, and marks the pick', () => {
    const entries = [
      sale(2, 2000, 10), sale(2, 2000, 20), sale(2, 2000, 30), sale(2, 2000, 40),
      sale(10, 500, 5),
    ];
    const listings = [ls(10, 490), ls(10, 495), ls(10, 500)];
    render(<StackAnalyzerView entries={entries} listings={listings} canHq={false} />);

    // stack 2 is the gap pick → carries the sweet-spot marker.
    expect(screen.getByText('▾')).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByLabelText('Stack 2'));
    expect(screen.getByText(/8 units/)).toBeInTheDocument();
    expect(screen.getByText(/4 sales/)).toBeInTheDocument();
  });

  it('captions the recommended stack with its sold count', () => {
    const entries = [
      sale(2, 2000, 10), sale(2, 2000, 20), sale(2, 2000, 30), sale(2, 2000, 40),
      sale(10, 500, 5),
    ];
    const listings = [ls(10, 490), ls(10, 495), ls(10, 500)];
    render(<StackAnalyzerView entries={entries} listings={listings} canHq={false} />);

    // stack 2 has the demand and no supply → the gap pick.
    expect(screen.getByText(/stack 2/i)).toBeInTheDocument();
    expect(screen.getByText(/sold\/90d/i)).toBeInTheDocument();
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
    expect(screen.getByText(/sold \(90d\)/i)).toBeInTheDocument();
  });
});
