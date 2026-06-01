import { describe, it, expect } from 'vitest';
import { soldByStack, listedByStack, isStackable, suggestStack } from './stackAnalysis';
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
