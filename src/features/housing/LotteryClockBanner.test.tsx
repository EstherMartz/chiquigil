import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LotteryClockBanner } from './LotteryClockBanner';
import { LOTTERY_ANCHOR_UTC } from '../../lib/housingLottery';

const DAY = 86_400_000;

describe('LotteryClockBanner', () => {
  it('shows the entry phase and a craft-ahead nudge', () => {
    render(<LotteryClockBanner now={LOTTERY_ANCHOR_UTC + DAY} />);
    expect(screen.getByText(/Entry period/i)).toBeInTheDocument();
    expect(screen.getByText(/4 days/i)).toBeInTheDocument();
  });
  it('shows the results phase when in the move-in window', () => {
    render(<LotteryClockBanner now={LOTTERY_ANCHOR_UTC + 6 * DAY} />);
    expect(screen.getByText(/Results period/i)).toBeInTheDocument();
  });
});
