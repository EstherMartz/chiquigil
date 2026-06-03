import { describe, it, expect } from 'vitest';
import { soldByStack, listedByStack, isStackable, suggestStack, mergeStacks, partitionStacks } from './stackAnalysis';
import type { MergedStackRow } from './stackAnalysis';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';
import type { SoldStackRow, ListedStackRow } from './stackAnalysis';

const sale = (quantity: number, pricePerUnit: number, timestamp: number, hq = false): HistoryEntry =>
  ({ quantity, pricePerUnit, timestamp, hq });
const ls = (quantity: number, price: number, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller: '' });

describe('soldByStack', () => {
  it('returns [] for empty input', () => {
    expect(soldByStack([], false)).toEqual([]);
  });

  it('groups by exact stack size, sorted ascending, with median price + last sold', () => {
    const entries = [
      sale(1, 1000, 50), sale(1, 1200, 200), sale(1, 1100, 100),
      sale(5, 900, 150),
      sale(1, 9999, 300, true), // HQ — excluded from NQ
    ];
    expect(soldByStack(entries, false)).toEqual([
      { stack: 1, sales: 3, units: 3, medianUnitPrice: 1100, lastSoldMs: 200_000 },
      { stack: 5, sales: 1, units: 5, medianUnitPrice: 900, lastSoldMs: 150_000 },
    ]);
  });

  it('filters to the requested quality tier', () => {
    const entries = [sale(1, 1000, 50), sale(2, 5000, 60, true)];
    expect(soldByStack(entries, true)).toEqual([
      { stack: 2, sales: 1, units: 2, medianUnitPrice: 5000, lastSoldMs: 60_000 },
    ]);
  });
});

describe('listedByStack', () => {
  it('counts current listings per stack size, sorted ascending', () => {
    const listings = [ls(1, 100), ls(1, 110), ls(99, 90), ls(20, 95)];
    expect(listedByStack(listings, false)).toEqual([
      { stack: 1, count: 2 },
      { stack: 20, count: 1 },
      { stack: 99, count: 1 },
    ]);
  });

  it('defaults missing quantity to 1 and filters by quality', () => {
    const noQty = { world: 'Phantom', price: 50, hq: false } as WorldListing;
    const listings = [noQty, ls(5, 80), ls(5, 80, true)];
    expect(listedByStack(listings, false)).toEqual([
      { stack: 1, count: 1 },
      { stack: 5, count: 1 },
    ]);
  });
});

describe('isStackable', () => {
  it('false when every observed size is 1', () => {
    expect(isStackable(
      [{ stack: 1, sales: 5, units: 5, medianUnitPrice: 100, lastSoldMs: 1 }],
      [{ stack: 1, count: 3 }],
    )).toBe(false);
  });

  it('true when any sold or listed size exceeds 1', () => {
    expect(isStackable(
      [{ stack: 1, sales: 5, units: 5, medianUnitPrice: 100, lastSoldMs: 1 }],
      [{ stack: 99, count: 1 }],
    )).toBe(true);
  });

  it('false for empty inputs', () => {
    expect(isStackable([], [])).toBe(false);
  });
});

const sr = (stack: number, sales: number, lastSoldMs: number, medianUnitPrice = 1000): SoldStackRow =>
  ({ stack, sales, units: stack * sales, medianUnitPrice, lastSoldMs });
const lr = (stack: number, count: number): ListedStackRow => ({ stack, count });

describe('mergeStacks', () => {
  it('returns [] for empty inputs', () => {
    expect(mergeStacks([], [])).toEqual([]);
  });

  it('unions sold + listed sizes, sorted ascending', () => {
    const sold = [sr(2, 4, 100, 1500), sr(5, 1, 200, 900)];
    const listed = [lr(5, 3), lr(20, 2)];
    expect(mergeStacks(sold, listed).map((r) => r.stack)).toEqual([2, 5, 20]);
  });

  it('zeroes demand for a listed-only size', () => {
    const merged = mergeStacks([sr(2, 4, 100)], [lr(20, 2)]);
    const row = merged.find((r) => r.stack === 20)!;
    expect(row).toMatchObject({
      stack: 20, sales: 0, units: 0, medianUnitPrice: 0, lastSoldMs: 0, listedCount: 2, isGap: false,
    });
  });

  it('zeroes listedCount for a sales-only size', () => {
    const merged = mergeStacks([sr(2, 4, 100, 1500)], []);
    const row = merged.find((r) => r.stack === 2)!;
    expect(row).toMatchObject({ stack: 2, sales: 4, listedCount: 0 });
  });

  it('flags isGap on a high-demand, thin-supply size', () => {
    // totalSales = 10; threshold = max(2, 1.5) = 2. stack 2 has 8 sales, 1 listing → gap.
    const sold = [sr(2, 8, 100, 1500), sr(5, 2, 200, 900)];
    const listed = [lr(2, 1), lr(5, 4)];
    const merged = mergeStacks(sold, listed);
    expect(merged.find((r) => r.stack === 2)!.isGap).toBe(true);
    expect(merged.find((r) => r.stack === 5)!.isGap).toBe(false);
  });

  it('does not flag a gap when supply is ample', () => {
    const sold = [sr(2, 8, 100)];
    const listed = [lr(2, 6)];
    expect(mergeStacks(sold, listed)[0].isGap).toBe(false);
  });

  it('does not flag a gap when demand is below threshold', () => {
    const sold = [sr(2, 1, 100), sr(5, 20, 200)];
    const listed = [lr(2, 0)];
    expect(mergeStacks(sold, listed).find((r) => r.stack === 2)!.isGap).toBe(false);
  });
});

const merged = (
  stack: number, sales: number, listedCount: number,
  opts: { price?: number; isGap?: boolean } = {},
): MergedStackRow => ({
  stack, sales, units: stack * sales, medianUnitPrice: opts.price ?? 1000,
  lastSoldMs: 1, listedCount, isGap: opts.isGap ?? false,
});

describe('partitionStacks', () => {
  it('collapses the sub-5% tail into a rare summary', () => {
    const rows = [
      merged(1, 100, 0), merged(2, 50, 0),
      ...[3, 4, 5, 6, 7, 8, 9, 10, 12, 16].map((s) => merged(s, 1, 0)),
    ];
    const { shown, rare } = partitionStacks(rows, null);
    expect(shown.map((r) => r.stack)).toEqual([1, 2]);
    expect(rare).toMatchObject({ count: 10, totalSales: 10, totalListed: 0 });
    expect(rare!.sizes).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 12, 16]);
  });

  it('keeps a tiny gap stack visible', () => {
    const rows = [
      merged(1, 100, 0), merged(20, 1, 0, { isGap: true }),
      ...[3, 4, 5].map((s) => merged(s, 1, 0)),
    ];
    const { shown } = partitionStacks(rows, null);
    expect(shown.map((r) => r.stack)).toContain(20);
  });

  it('keeps the recommended stack visible even when tiny', () => {
    const rows = [merged(1, 100, 0), merged(20, 1, 0), merged(4, 1, 0), merged(6, 1, 0)];
    const { shown, rare } = partitionStacks(rows, { stack: 20, unitPrice: 1000, kind: 'liquid' });
    expect(shown.map((r) => r.stack)).toContain(20);
    expect(rare!.sizes).toEqual([4, 6]);
  });

  it('keeps a supply-heavy stack with no sales', () => {
    const rows = [
      merged(1, 100, 0), merged(99, 0, 50),
      ...[3, 4].map((s) => merged(s, 1, 0)),
    ];
    const { shown } = partitionStacks(rows, null);
    expect(shown.map((r) => r.stack)).toContain(99);
  });

  it('does not collapse when only one stack would be rare', () => {
    const rows = [merged(1, 100, 0), merged(2, 1, 0)];
    const { shown, rare } = partitionStacks(rows, null);
    expect(rare).toBeNull();
    expect(shown.map((r) => r.stack)).toEqual([1, 2]);
  });

  it('does not collapse an evenly-distributed set', () => {
    const rows = [3, 4, 5, 6, 7].map((s) => merged(s, 1, 0));
    const { shown, rare } = partitionStacks(rows, null);
    expect(rare).toBeNull();
    expect(shown).toHaveLength(5);
  });
});

describe('suggestStack', () => {
  it('returns null when not stackable', () => {
    expect(suggestStack([sr(1, 5, 100)], [lr(1, 2)])).toBeNull();
  });

  it('returns null on empty sales', () => {
    expect(suggestStack([], [])).toBeNull();
  });

  it('prefers a supply gap even when another size has more sales', () => {
    const sold = [sr(2, 10, 100, 1500), sr(10, 30, 200, 999)];
    const listed = [lr(10, 5)];
    expect(suggestStack(sold, listed)).toEqual({ stack: 2, unitPrice: 1500, kind: 'gap' });
  });

  it('falls back to the most-liquid size when there is no gap', () => {
    const sold = [sr(2, 5, 100), sr(10, 8, 200, 1300)];
    const listed = [lr(2, 3), lr(10, 3)];
    expect(suggestStack(sold, listed)).toEqual({ stack: 10, unitPrice: 1300, kind: 'liquid' });
  });

  it('breaks sales ties by most recent, then larger stack', () => {
    expect(suggestStack([sr(5, 4, 100), sr(9, 4, 200, 1700)], [])).toEqual(
      { stack: 9, unitPrice: 1700, kind: 'gap' },
    );
    expect(suggestStack([sr(5, 4, 100), sr(9, 4, 100, 1700)], [])).toEqual(
      { stack: 9, unitPrice: 1700, kind: 'gap' },
    );
  });
});
