import { describe, it, expect } from 'vitest';
import {
  listingGap, classifyCraftRisk, passesMaxRisk, RISK_ORDER,
} from './craftListingAnalysis';
import type { WorldListing } from '../../lib/universalis';

const l = (price: number, quantity: number, seller: string, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller });

describe('listingGap', () => {
  it('reports no second tier and onlyListing for a single listing', () => {
    const g = listingGap([l(100, 1, 'A')], false);
    expect(g.onlyListing).toBe(true);
    expect(g.hasSecondTier).toBe(false);
    expect(g.gap).toBe(0);
    expect(g.gapPct).toBe(Infinity);
  });

  it('reports a 0 gap (tied) when many listings share the cheapest price', () => {
    const g = listingGap([l(100, 1, 'A'), l(100, 1, 'B'), l(100, 1, 'C')], false);
    expect(g.onlyListing).toBe(false);
    expect(g.hasSecondTier).toBe(false);
    expect(g.gap).toBe(0);
    expect(g.gapPct).toBe(0);
  });

  it('computes gap to the next distinct price tier', () => {
    const g = listingGap([l(70_000, 1, 'A'), l(70_000, 1, 'A'), l(200_000, 1, 'B')], false);
    expect(g.hasSecondTier).toBe(true);
    expect(g.secondTier).toBe(200_000);
    expect(g.gap).toBe(130_000);
    expect(g.gapPct).toBeCloseTo(130_000 / 70_000, 5);
  });

  it('ignores the other quality tier', () => {
    const g = listingGap([l(100, 1, 'A', true), l(150, 1, 'B', true), l(50, 1, 'C', false)], true);
    expect(g.cheapest).toBe(100);
    expect(g.secondTier).toBe(150);
  });

  it('returns empty (no listings) for an empty/other-tier list', () => {
    const g = listingGap([l(100, 1, 'A', false)], true);
    expect(g.empty).toBe(true);
    expect(g.onlyListing).toBe(false);
  });
});

describe('classifyCraftRisk', () => {
  const base = {
    empty: false, onlyListing: false, gapPct: 0.1,
    sellerCount: 5, topSellerShare: 0.3, clearDays: 2 as number | null,
  };
  it('EMPTY when there are no listings', () => {
    expect(classifyCraftRisk({ ...base, empty: true })).toBe('EMPTY');
  });
  it('OPEN when a single seller holds the market (one listing)', () => {
    expect(classifyCraftRisk({ ...base, onlyListing: true, sellerCount: 1, topSellerShare: 1, gapPct: Infinity })).toBe('OPEN');
  });
  it('DOMINATED when the top seller holds >60% (and >1 seller)', () => {
    expect(classifyCraftRisk({ ...base, sellerCount: 4, topSellerShare: 0.76 })).toBe('DOMINATED');
  });
  it('DOMINATED when prices are jammed (<2% gap) with a crowd (>5 sellers)', () => {
    expect(classifyCraftRisk({ ...base, sellerCount: 7, topSellerShare: 0.2, gapPct: 0.01 })).toBe('DOMINATED');
  });
  it('OPEN with big gap, few/non-dominant sellers, fast clear', () => {
    expect(classifyCraftRisk({ ...base, gapPct: 0.25, sellerCount: 2, clearDays: 2 })).toBe('OPEN');
  });
  it('CROWDED when stock just sits (>5d to clear)', () => {
    expect(classifyCraftRisk({ ...base, gapPct: 0.1, sellerCount: 4, clearDays: 8 })).toBe('CROWDED');
  });
  it('CROWDED when a large crowd of sellers (>=8)', () => {
    expect(classifyCraftRisk({ ...base, sellerCount: 9, topSellerShare: 0.2, clearDays: 2 })).toBe('CROWDED');
  });
  it('HEALTHY for tied prices when only a few sellers (PRD edge case)', () => {
    expect(classifyCraftRisk({ ...base, gapPct: 0, sellerCount: 3, topSellerShare: 0.4, clearDays: 2 })).toBe('HEALTHY');
  });
  it('defaults to HEALTHY when no rule fires', () => {
    expect(classifyCraftRisk({ ...base, gapPct: 0.1, sellerCount: 4, topSellerShare: 0.5, clearDays: 4 })).toBe('HEALTHY');
  });
});

describe('passesMaxRisk', () => {
  it('any allows everything', () => {
    for (const r of RISK_ORDER) expect(passesMaxRisk(r, 'any')).toBe(true);
  });
  it('healthy excludes CROWDED and DOMINATED', () => {
    expect(passesMaxRisk('OPEN', 'healthy')).toBe(true);
    expect(passesMaxRisk('HEALTHY', 'healthy')).toBe(true);
    expect(passesMaxRisk('EMPTY', 'healthy')).toBe(true);
    expect(passesMaxRisk('CROWDED', 'healthy')).toBe(false);
    expect(passesMaxRisk('DOMINATED', 'healthy')).toBe(false);
  });
  it('open only allows OPEN and EMPTY', () => {
    expect(passesMaxRisk('OPEN', 'open')).toBe(true);
    expect(passesMaxRisk('EMPTY', 'open')).toBe(true);
    expect(passesMaxRisk('HEALTHY', 'open')).toBe(false);
    expect(passesMaxRisk('CROWDED', 'open')).toBe(false);
  });
});
