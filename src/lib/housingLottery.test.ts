import { describe, it, expect } from 'vitest';
import { lotteryStatus, LOTTERY_ANCHOR_UTC } from './housingLottery';

const DAY = 86_400_000;

describe('lotteryStatus', () => {
  it('reports entry on day 0 with 5 days remaining', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC);
    expect(s.phase).toBe('entry');
    expect(s.dayInCycle).toBe(0);
    expect(s.daysRemaining).toBe(5);
    expect(s.nextPhase).toBe('results');
  });
  it('reports results on day 5 with 4 days remaining', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC + 5 * DAY);
    expect(s.phase).toBe('results');
    expect(s.dayInCycle).toBe(5);
    expect(s.daysRemaining).toBe(4);
    expect(s.nextPhase).toBe('entry');
  });
  it('rounds up partial days remaining', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC + 4 * DAY + DAY / 2);
    expect(s.phase).toBe('entry');
    expect(s.dayInCycle).toBe(4);
    expect(s.daysRemaining).toBe(1);
  });
  it('wraps across many future cycles', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC + 100 * 9 * DAY + 3 * DAY);
    expect(s.phase).toBe('entry');
    expect(s.dayInCycle).toBe(3);
  });
  it('handles times before the anchor (negative modulo)', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC - DAY);
    expect(s.dayInCycle).toBe(8);
    expect(s.phase).toBe('results');
  });
  it('currentEndsAt is the next phase boundary', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC + DAY);
    expect(s.currentEndsAt).toBe(LOTTERY_ANCHOR_UTC + 5 * DAY);
    expect(s.nextStartsAt).toBe(s.currentEndsAt);
  });
});
