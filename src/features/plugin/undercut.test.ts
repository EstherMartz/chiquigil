import { describe, it, expect } from 'vitest';
import { computeUndercuts } from './undercut';
import type { OwnListing } from './protocol';

const L = (over: Partial<OwnListing>): OwnListing => ({ itemId: 1, hq: false, unitPrice: 1000, qty: 1, ...over });

describe('computeUndercuts', () => {
  it('flags an undercut and measures the gap', () => {
    const rows = computeUndercuts([L({ itemId: 5, unitPrice: 1000 })], () => 800);
    expect(rows[0]).toMatchObject({ itemId: 5, status: 'undercut', floor: 800, undercutBy: 200 });
  });

  it('reports holding when you are at or below the floor', () => {
    const rows = computeUndercuts([L({ unitPrice: 800 })], () => 800);
    expect(rows[0]).toMatchObject({ status: 'holding', undercutBy: 0 });
  });

  it('reports unknown when there is no floor data', () => {
    const rows = computeUndercuts([L({})], () => null);
    expect(rows[0]).toMatchObject({ status: 'unknown', floor: null, undercutBy: null });
  });

  it('matches floor by quality and sorts worst undercut first', () => {
    const floorOf = (id: number, hq: boolean) => (hq ? 5000 : (id === 2 ? 100 : 950));
    const rows = computeUndercuts([
      L({ itemId: 1, hq: false, unitPrice: 1000 }), // undercut by 50
      L({ itemId: 2, hq: false, unitPrice: 1000 }), // undercut by 900
      L({ itemId: 3, hq: true, unitPrice: 5000 }),  // holding
    ], floorOf);
    expect(rows.map((r) => r.itemId)).toEqual([2, 1, 3]);
    expect(rows[0].undercutBy).toBe(900);
  });
});
