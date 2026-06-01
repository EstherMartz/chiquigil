import { describe, it, expect } from 'vitest';
import { soldByStack, listedByStack, isStackable } from './stackAnalysis';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';

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
