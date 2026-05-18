import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CrossWorldListingsBlock } from './CrossWorldListingsBlock';
import type { WorldListing } from '../../lib/universalis';

const ls = (world: string, price: number, hq = false): WorldListing => ({ world, price, hq });

describe('CrossWorldListingsBlock', () => {
  it('renders nothing when listings is empty', () => {
    const { container } = render(
      <CrossWorldListingsBlock
        listings={[]}
        homeWorld="Phantom"
        homeMinNQ={500}
        homeMinHQ={null}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders rows sorted by price ASC with DC labels and HQ glyph', () => {
    render(
      <CrossWorldListingsBlock
        listings={[ls('Phantom', 989), ls('Lich', 510, true), ls('Bismarck', 489)]}
        homeWorld="Phantom"
        homeMinNQ={989}
        homeMinHQ={null}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1); // skip header
    expect(within(rows[0]).getByText(/Bismarck/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/489/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Lich/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/510/)).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText(/HQ/i)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Phantom/)).toBeInTheDocument();
    expect(within(rows[2]).queryByLabelText(/HQ/i)).toBeNull();
  });

  it('vs home shows correct sign and color, em-dash on home row', () => {
    render(
      <CrossWorldListingsBlock
        listings={[ls('Phantom', 1000), ls('Lich', 500), ls('Bismarck', 1500)]}
        homeWorld="Phantom"
        homeMinNQ={1000}
        homeMinHQ={null}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    // Sorted ASC: Lich 500, Phantom 1000 (home), Bismarck 1500
    expect(within(rows[0]).getByText(/-50%/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/^—$/)).toBeInTheDocument(); // home row
    expect(within(rows[2]).getByText(/\+50%/)).toBeInTheDocument();
  });

  it('vs home shows em-dash when home tier missing', () => {
    render(
      <CrossWorldListingsBlock
        listings={[ls('Lich', 100, true)]}
        homeWorld="Phantom"
        homeMinNQ={1000}
        homeMinHQ={null}
      />,
    );
    expect(screen.getByText(/^—$/)).toBeInTheDocument();
  });

  it('home-world row shows a "home" tag', () => {
    render(
      <CrossWorldListingsBlock
        listings={[ls('Phantom', 100)]}
        homeWorld="Phantom"
        homeMinNQ={100}
        homeMinHQ={null}
      />,
    );
    expect(screen.getByText(/^home$/i)).toBeInTheDocument();
  });

  it('skips listings with empty world', () => {
    render(
      <CrossWorldListingsBlock
        listings={[ls('', 50), ls('Lich', 500)]}
        homeWorld="Phantom"
        homeMinNQ={1000}
        homeMinHQ={null}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText(/Lich/)).toBeInTheDocument();
  });
});
