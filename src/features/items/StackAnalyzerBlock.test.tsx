import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StackAnalyzerView } from './StackAnalyzerBlock';
import { SupplyDepthBlock } from './SupplyDepthBlock';
import { useQualityStore } from './qualityStore';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';

const sale = (quantity: number, pricePerUnit: number, timestamp: number, hq = false): HistoryEntry =>
  ({ quantity, pricePerUnit, timestamp, hq });
const ls = (quantity: number, price: number, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller: '' });

describe('StackAnalyzerView', () => {
  beforeEach(() => useQualityStore.setState({ hq: false }));

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

  it('labels every priced node and keys the markers', () => {
    const entries = [
      sale(1, 1000, 10), sale(1, 1000, 11), sale(1, 1000, 12),
      sale(2, 2000, 20), sale(2, 2000, 21), sale(2, 2000, 22),
      sale(5, 3000, 30), sale(5, 3000, 31), sale(5, 3000, 32),
    ];
    render(<StackAnalyzerView entries={entries} listings={[]} canHq={false} />);
    // Every priced node carries a ~/unit label (exact text — caption uses "~k/u").
    expect(screen.getByText('~1.0k')).toBeInTheDocument();
    expect(screen.getByText('~2.0k')).toBeInTheDocument();
    expect(screen.getByText('~3.0k')).toBeInTheDocument();
    // Marker key documents all three marks.
    expect(screen.getByText('✓ supply gap · ▾ suggested to list · gold = above-median price')).toBeInTheDocument();
  });

  it('flags above-median price stacks in gold and rings the peak', () => {
    const entries = [
      sale(1, 1000, 10), sale(1, 1000, 11), sale(1, 1000, 12),
      sale(2, 2000, 20), sale(2, 2000, 21), sale(2, 2000, 22),
      sale(5, 3000, 30), sale(5, 3000, 31), sale(5, 3000, 32),
    ];
    const { container } = render(<StackAnalyzerView entries={entries} listings={[]} canHq={false} />);
    // Median price = 2000; stack 5 at 3000 is >5% above → gold axis label.
    expect(screen.getByText('5')).toHaveClass('text-gold');
    expect(screen.getByText('1')).toHaveClass('text-text-cream');
    // Peak (highest price) dot carries the ring treatment.
    expect(container.querySelector('.ring-2')).toBeTruthy();
  });

  it('expands the rare chip into a per-size table', () => {
    const entries = [
      ...Array.from({ length: 20 }, (_, k) => sale(1, 1000, k + 1)),
      ...[3, 4, 5, 6, 7].map((s) => sale(s, 1000, 100 + s)),
    ];
    render(<StackAnalyzerView entries={entries} listings={[]} canHq={false} />);
    expect(screen.queryByText(/units sold/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /rare sizes/i }));
    expect(screen.getByText(/rare sizes \(5\)/i)).toBeInTheDocument();
    expect(screen.getByText(/units sold/i)).toBeInTheDocument();
    expect(screen.getByText(/unit price/i)).toBeInTheDocument();
  });

  it('caps the rare table at 8 rows with a show-all toggle', () => {
    const entries = [
      ...Array.from({ length: 30 }, (_, k) => sale(1, 1000, k + 1)),
      ...[3, 4, 5, 6, 7, 8, 9, 10, 12, 16].map((s) => sale(s, 1500, 100 + s)),
    ];
    render(<StackAnalyzerView entries={entries} listings={[]} canHq={false} />);
    fireEvent.click(screen.getByRole('button', { name: /rare sizes/i }));
    // 1 header row + 8 capped body rows.
    expect(screen.getAllByRole('row')).toHaveLength(9);

    fireEvent.click(screen.getByRole('button', { name: /show all \(10\)/i }));
    expect(screen.getAllByRole('row')).toHaveLength(11); // header + all 10
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

  it('links NQ/HQ across sections through the shared store', async () => {
    // NQ stack analysis is non-stackable (stack 1 only); HQ has a real stack (5).
    const entries = [sale(1, 1000, 10), sale(5, 2000, 20, true)];
    const listings = [ls(5, 1990, true)];
    render(
      <>
        <SupplyDepthBlock listings={listings} canHq />
        <StackAnalyzerView entries={entries} listings={listings} canHq />
      </>,
    );
    expect(screen.getByText(/Always sold as single units/i)).toBeInTheDocument();

    // Switch HQ on the *Supply Depth* section…
    await userEvent.click(screen.getAllByRole('button', { name: 'HQ' })[0]);
    // …and the Stack Analyzer section follows.
    expect(screen.getByText(/sold \(90d\)/i)).toBeInTheDocument();
  });
});
