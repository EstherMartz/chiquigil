import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConcentrationBlock } from './ConcentrationBlock';
import type { WorldListing } from '../../lib/universalis';

const l = (price: number, quantity: number, seller: string, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller });

describe('ConcentrationBlock', () => {
  it('summarizes top-seller share and seller count', () => {
    render(
      <ConcentrationBlock
        listings={[l(100, 6, 'A'), l(110, 2, 'B'), l(120, 2, 'C')]}
        canHq={false}
      />,
    );
    expect(screen.getByText(/Seller concentration/i)).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/Moderately spread/i)).toBeInTheDocument();
  });

  it('flags a single dominant seller as risky', () => {
    render(<ConcentrationBlock listings={[l(100, 5, 'A')]} canHq={false} />);
    expect(screen.getByText(/Concentrated · risky/i)).toBeInTheDocument();
  });

  it('shows a limited-data note when seller info is absent', () => {
    render(<ConcentrationBlock listings={[l(100, 1, ''), l(110, 1, '')]} canHq={false} />);
    expect(screen.getByText(/Limited data/i)).toBeInTheDocument();
  });
});
