export type LotteryPhase = 'entry' | 'results';

export interface LotteryStatus {
  phase: LotteryPhase;
  dayInCycle: number;     // 0..8
  currentEndsAt: number;  // epoch ms of the next phase transition
  nextPhase: LotteryPhase;
  nextStartsAt: number;   // === currentEndsAt
  msRemaining: number;
  daysRemaining: number;
}

const DAY_MS = 86_400_000;
const CYCLE_DAYS = 9;
const ENTRY_DAYS = 5;

// Calibrated to the known 2026 schedule (an entry period began Apr 26 2026).
export const LOTTERY_ANCHOR_UTC = Date.UTC(2026, 3, 26, 8, 0, 0);

export function lotteryStatus(now: number): LotteryStatus {
  const cycleMs = CYCLE_DAYS * DAY_MS;
  let offset = (now - LOTTERY_ANCHOR_UTC) % cycleMs;
  if (offset < 0) offset += cycleMs;
  const cycleStart = now - offset;
  const dayInCycle = Math.floor(offset / DAY_MS);
  const phase: LotteryPhase = dayInCycle < ENTRY_DAYS ? 'entry' : 'results';
  const boundaryDay = phase === 'entry' ? ENTRY_DAYS : CYCLE_DAYS;
  const currentEndsAt = cycleStart + boundaryDay * DAY_MS;
  const msRemaining = currentEndsAt - now;
  return {
    phase,
    dayInCycle,
    currentEndsAt,
    nextPhase: phase === 'entry' ? 'results' : 'entry',
    nextStartsAt: currentEndsAt,
    msRemaining,
    daysRemaining: Math.ceil(msRemaining / DAY_MS),
  };
}
