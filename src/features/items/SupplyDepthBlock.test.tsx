import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupplyDepthBlock } from './SupplyDepthBlock';
import { useQualityStore } from './qualityStore';
import type { WorldListing } from '../../lib/universalis';

const l = (price: number, quantity: number, seller: string, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller });

describe('SupplyDepthBlock', () => {
  beforeEach(() => useQualityStore.setState({ hq: false }));

  it('renders price-tier rows with unit counts for the NQ book', () => {
    render(
      <SupplyDepthBlock
        listings={[l(100, 2, 'A'), l(100, 1, 'B'), l(200, 4, 'C')]}
        canHq={false}
      />,
    );
    expect(screen.getByText(/Supply depth/i)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows an empty note when the selected tier has no listings', async () => {
    render(<SupplyDepthBlock listings={[l(100, 1, 'A')]} canHq />);
    await userEvent.click(screen.getByRole('button', { name: 'HQ' }));
    expect(screen.getByText(/No HQ listings to chart/i)).toBeInTheDocument();
  });
});
