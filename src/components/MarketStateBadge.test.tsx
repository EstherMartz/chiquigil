import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketStateBadge } from './MarketStateBadge';

describe('MarketStateBadge', () => {
  it('shows Out of stock (and ignores delta) when listings is 0', () => {
    render(<MarketStateBadge delta={12} listings={0} />);
    expect(screen.getByText(/out of stock/i)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('shows No data when delta is null and listings > 0', () => {
    render(<MarketStateBadge delta={null} listings={3} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('shows Rising with + sign when delta > 5', () => {
    render(<MarketStateBadge delta={12.4} listings={3} />);
    expect(screen.getByText(/rising/i)).toBeInTheDocument();
    expect(screen.getByText(/\+12%/)).toBeInTheDocument();
  });

  it('shows Falling with - sign when delta < -5', () => {
    render(<MarketStateBadge delta={-8.7} listings={3} />);
    expect(screen.getByText(/falling/i)).toBeInTheDocument();
    expect(screen.getByText(/-9%/)).toBeInTheDocument();
  });

  it('shows Stable for delta within ±5%', () => {
    render(<MarketStateBadge delta={-2} listings={3} />);
    expect(screen.getByText(/stable/i)).toBeInTheDocument();
    expect(screen.getByText(/-2%/)).toBeInTheDocument();
  });

  it('treats exactly +5 as Stable (not Rising)', () => {
    render(<MarketStateBadge delta={5} listings={3} />);
    expect(screen.getByText(/stable/i)).toBeInTheDocument();
  });

  it('treats exactly -5 as Stable (not Falling)', () => {
    render(<MarketStateBadge delta={-5} listings={3} />);
    expect(screen.getByText(/stable/i)).toBeInTheDocument();
  });
});
