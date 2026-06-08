import { describe, it, expect } from 'vitest';
import { groupByWorld, gilPerMillion } from './dcFlipGroups';
import type { DcFlipRow } from './dcFlip';

function row(p: Partial<DcFlipRow> & { id: number; buyWorld: string; dcPrice: number; netSpread: number }): DcFlipRow {
  return {
    name: `item-${p.id}`,
    phantomPrice: p.dcPrice + p.netSpread,
    spread: p.netSpread,
    velocity: 1,
    ...p,
  } as DcFlipRow;
}

describe('gilPerMillion', () => {
  it('netSpread per million of capital', () => {
    expect(gilPerMillion(278_000, 637_000)).toBeCloseTo(436.4, 0);
  });
  it('zero capital → 0 (no divide-by-zero)', () => {
    expect(gilPerMillion(100, 0)).toBe(0);
  });
});

describe('groupByWorld', () => {
  it('groups rows by buyWorld and sums capital + net spread', () => {
    const rows = [
      row({ id: 1, buyWorld: 'Omega', dcPrice: 499_000, netSpread: 122_000 }),
      row({ id: 2, buyWorld: 'Omega', dcPrice: 138_000, netSpread: 147_000 }),
      row({ id: 3, buyWorld: 'Louisoix', dcPrice: 200_000, netSpread: 85_000 }),
    ];
    const groups = groupByWorld(rows, {});
    const omega = groups.find((g) => g.world === 'Omega')!;
    expect(omega.itemCount).toBe(2);
    expect(omega.totalCapital).toBe(637_000);
    expect(omega.totalNetSpread).toBe(269_000);
    expect(omega.fitCount).toBe(2);
    expect(omega.rows.every((r) => r.withinBudget)).toBe(true);
  });

  it('sorts groups by gil/M desc, tie-break net spread desc', () => {
    const rows = [
      row({ id: 1, buyWorld: 'A', dcPrice: 1_000_000, netSpread: 100_000 }),
      row({ id: 2, buyWorld: 'B', dcPrice: 1_000_000, netSpread: 300_000 }),
    ];
    const groups = groupByWorld(rows, {});
    expect(groups.map((g) => g.world)).toEqual(['B', 'A']);
  });

  it('orders rows within a group by net spread desc', () => {
    const rows = [
      row({ id: 1, buyWorld: 'Omega', dcPrice: 10, netSpread: 50 }),
      row({ id: 2, buyWorld: 'Omega', dcPrice: 10, netSpread: 200 }),
    ];
    const groups = groupByWorld(rows, {});
    expect(groups[0].rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it('maxCapital grays out rows once running buy total exceeds the cap', () => {
    const rows = [
      row({ id: 1, buyWorld: 'Omega', dcPrice: 800_000, netSpread: 200_000 }),
      row({ id: 2, buyWorld: 'Omega', dcPrice: 300_000, netSpread: 150_000 }),
      row({ id: 3, buyWorld: 'Omega', dcPrice: 150_000, netSpread: 100_000 }),
    ];
    const groups = groupByWorld(rows, { maxCapital: 1_000_000 });
    const omega = groups[0];
    expect(omega.itemCount).toBe(3);
    expect(omega.fitCount).toBe(1);
    expect(omega.rows.map((r) => r.withinBudget)).toEqual([true, false, false]);
    expect(omega.totalCapital).toBe(800_000);
    expect(omega.totalNetSpread).toBe(200_000);
  });

  it('no maxCapital → all rows within budget', () => {
    const rows = [row({ id: 1, buyWorld: 'Omega', dcPrice: 9_000_000, netSpread: 1 })];
    const groups = groupByWorld(rows, {});
    expect(groups[0].rows[0].withinBudget).toBe(true);
    expect(groups[0].fitCount).toBe(1);
  });
});
