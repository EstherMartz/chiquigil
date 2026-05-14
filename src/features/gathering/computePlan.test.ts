import { describe, it, expect } from 'vitest';
import { computePlan, type ComputePlanRow } from './computePlan';

function row(id: number, unitPrice: number, gilFlow: number): ComputePlanRow {
  return { id, name: `item-${id}`, unitPrice, gilFlow };
}

describe('computePlan', () => {
  it('time mode splits the item pool by gilFlow share', () => {
    const result = computePlan(
      [row(1, 100, 600), row(2, 50, 400)],
      { mode: 'time', itemCount: 2, budgetTimeMin: 10, budgetGil: 0, itemsPerMin: 100 },
    );
    // totalItems = 10 * 100 = 1000, gilFlow shares 60% / 40%
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ id: 1, qty: 600, subtotal: 60_000 });
    expect(result.rows[1]).toMatchObject({ id: 2, qty: 400, subtotal: 20_000 });
    expect(result.totalGil).toBe(80_000);
    expect(result.totalMinutes).toBe(10);
  });

  it('gil mode allocates by gilFlow share and divides by unit price', () => {
    const result = computePlan(
      [row(1, 100, 600), row(2, 50, 400)],
      { mode: 'gil', itemCount: 2, budgetTimeMin: 0, budgetGil: 100_000, itemsPerMin: 100 },
    );
    // share 60k -> qty 600 @ 100 gil; share 40k -> qty 800 @ 50 gil
    expect(result.rows[0]).toMatchObject({ id: 1, qty: 600, subtotal: 60_000 });
    expect(result.rows[1]).toMatchObject({ id: 2, qty: 800, subtotal: 40_000 });
    expect(result.totalGil).toBe(100_000);
    // total items 1400 / 100 ipm = 14 min
    expect(result.totalMinutes).toBe(14);
  });

  it('caps N at the number of available rows', () => {
    const result = computePlan(
      [row(1, 100, 600)],
      { mode: 'time', itemCount: 5, budgetTimeMin: 10, budgetGil: 0, itemsPerMin: 100 },
    );
    expect(result.rows).toHaveLength(1);
    expect(result.cappedAt).toBe(1);
  });

  it('skips rows with non-positive unit price', () => {
    const result = computePlan(
      [row(1, 100, 600), row(2, 0, 1000)],
      { mode: 'time', itemCount: 2, budgetTimeMin: 10, budgetGil: 0, itemsPerMin: 100 },
    );
    // only the valid row participates
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe(1);
    expect(result.skippedZeroPriceIds).toEqual([2]);
  });

  it('clamps per-item qty to GBRs 1-999999 range', () => {
    const result = computePlan(
      [row(1, 1, 1)],
      { mode: 'gil', itemCount: 1, budgetTimeMin: 0, budgetGil: 5_000_000_000, itemsPerMin: 100 },
    );
    expect(result.rows[0].qty).toBe(999_999);
  });

  it('returns an empty result when given no rows', () => {
    const result = computePlan(
      [],
      { mode: 'time', itemCount: 3, budgetTimeMin: 10, budgetGil: 0, itemsPerMin: 100 },
    );
    expect(result.rows).toEqual([]);
    expect(result.cappedAt).toBe(0);
    expect(result.totalGil).toBe(0);
    expect(result.totalMinutes).toBe(0);
  });
});
