import { describe, it, expect } from 'vitest';
import { packSession } from './packSession';
import type { SessionCandidate } from './buildCandidates';

function mk(partial: Partial<SessionCandidate> & { id: number; profit: number; craftSeconds: number; velocity: number }): SessionCandidate {
  return {
    name: `Item ${partial.id}`,
    crafter: 'LTW',
    lvl: 100,
    setKey: `set-${partial.id}`,
    gilPerMinute: partial.profit / (partial.craftSeconds / 60),
    ...partial,
  } as SessionCandidate;
}

describe('packSession', () => {
  it('picks the highest gil/minute first and respects the time budget', () => {
    const cands = [
      mk({ id: 1, profit: 1000, craftSeconds: 60, velocity: 10 }),
      mk({ id: 2, profit: 100,  craftSeconds: 60, velocity: 10 }),
    ];
    const out = packSession(cands, { budgetMinutes: 5, overheadMinutes: 0, batchCapDays: 7, strategy: 'balanced' });
    expect(out.picks[0].id).toBe(1);
    expect(out.picks[0].batch).toBe(5);
    expect(out.totalSeconds).toBe(300);
  });

  it('caps batch by velocity × batchCapDays', () => {
    const cands = [mk({ id: 1, profit: 1000, craftSeconds: 60, velocity: 1 })];
    const out = packSession(cands, { budgetMinutes: 60, overheadMinutes: 0, batchCapDays: 3, strategy: 'balanced' });
    expect(out.picks[0].batch).toBe(3);
  });

  it('subtracts overhead from the budget', () => {
    const cands = [mk({ id: 1, profit: 100, craftSeconds: 60, velocity: 10 })];
    const out = packSession(cands, { budgetMinutes: 10, overheadMinutes: 5, batchCapDays: 7, strategy: 'balanced' });
    expect(out.picks[0].batch).toBe(5);
  });

  it('quickwin strategy prefers high-velocity items', () => {
    const cands = [
      mk({ id: 1, profit: 1000, craftSeconds: 60, velocity: 10 }),
      mk({ id: 2, profit: 1500, craftSeconds: 60, velocity: 1 }),
    ];
    const out = packSession(cands, { budgetMinutes: 1, overheadMinutes: 0, batchCapDays: 7, strategy: 'quickwin' });
    expect(out.picks[0].id).toBe(1);
  });

  it('patient strategy prefers high-margin items when gil/min is tied', () => {
    const cands = [
      mk({ id: 3, profit: 100,      craftSeconds: 6, velocity: 10 }),
      mk({ id: 4, profit: 100_000,  craftSeconds: 6_000, velocity: 10 }),
    ];
    const out = packSession(cands, { budgetMinutes: 1000, overheadMinutes: 0, batchCapDays: 7, strategy: 'patient' });
    expect(out.picks[0].id).toBe(4);
  });

  it('limits to 3 picks per setKey (diversity rule)', () => {
    const cands = Array.from({ length: 6 }, (_, i) => mk({
      id: i + 1, profit: 1000, craftSeconds: 60, velocity: 10,
      setKey: 'shared-set',
    }));
    const out = packSession(cands, { budgetMinutes: 30, overheadMinutes: 0, batchCapDays: 7, strategy: 'balanced' });
    expect(out.picks).toHaveLength(3);
  });

  it('returns empty picks when budget is zero after overhead', () => {
    const cands = [mk({ id: 1, profit: 1000, craftSeconds: 60, velocity: 10 })];
    const out = packSession(cands, { budgetMinutes: 5, overheadMinutes: 5, batchCapDays: 7, strategy: 'balanced' });
    expect(out.picks).toEqual([]);
    expect(out.totalSeconds).toBe(0);
  });

  it('summary totals expected gil and minutes', () => {
    const cands = [mk({ id: 1, profit: 1000, craftSeconds: 60, velocity: 10 })];
    const out = packSession(cands, { budgetMinutes: 3, overheadMinutes: 0, batchCapDays: 7, strategy: 'balanced' });
    expect(out.totalGil).toBe(3000);
    expect(out.totalSeconds).toBe(180);
  });
});
