import { describe, it, expect } from 'vitest';
import { classifySource, deriveSourcing } from './materialSourcing';
import type { MaterialLeaf } from './computeProfit';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';

const catalog: GatheringCatalog = new Map([
  [10, { level: 50, timed: false, hidden: false }],
  [11, { level: 70, timed: true, hidden: false }],
]);
const scById = new Map<number, number>([
  [10, 44], [11, 44], [20, CRYSTALS_SEARCH_CATEGORY], [30, 44],
]);

describe('classifySource', () => {
  it('classifies crystals by search category', () => {
    expect(classifySource(20, CRYSTALS_SEARCH_CATEGORY, catalog)).toBe('crystal');
  });
  it('classifies standard and timed gather nodes', () => {
    expect(classifySource(10, 44, catalog)).toBe('gather-standard');
    expect(classifySource(11, 44, catalog)).toBe('gather-timed');
  });
  it('classifies everything else as buy', () => {
    expect(classifySource(30, 44, catalog)).toBe('buy');
    expect(classifySource(999, undefined, catalog)).toBe('buy');
  });
});

describe('deriveSourcing', () => {
  it('returns null when total material cost is 0', () => {
    const leaves: MaterialLeaf[] = [{ itemId: 30, qty: 2, unitPrice: 0 }];
    expect(deriveSourcing(leaves, scById, catalog, 100)).toBeNull();
  });

  it('splits gatherable vs buy cost and derives pct + selfSourceProfit', () => {
    const leaves: MaterialLeaf[] = [
      { itemId: 30, qty: 1, unitPrice: 8000 },
      { itemId: 10, qty: 2, unitPrice: 1000 },
      { itemId: 20, qty: 8, unitPrice: 125 },
    ];
    const profit = 50_000;
    const s = deriveSourcing(leaves, scById, catalog, profit)!;
    expect(s.totalMaterialCost).toBe(11_000);
    expect(s.gatherableCost).toBe(3_000);
    expect(s.buyOnlyCost).toBe(8_000);
    expect(s.gatherablePct).toBeCloseTo((3000 / 11000) * 100);
    expect(s.selfSourceProfit).toBe(profit + 3_000);
  });

  it('aggregates duplicate ingredient ids and sorts buy-first then by subtotal', () => {
    const leaves: MaterialLeaf[] = [
      { itemId: 10, qty: 1, unitPrice: 1000 },
      { itemId: 10, qty: 2, unitPrice: 1000 },
      { itemId: 30, qty: 1, unitPrice: 500 },
    ];
    const s = deriveSourcing(leaves, scById, catalog, 0)!;
    expect(s.ingredients).toHaveLength(2);
    expect(s.ingredients[0]).toMatchObject({ itemId: 30, gatherable: false });
    expect(s.ingredients[1]).toMatchObject({ itemId: 10, qty: 3, subtotal: 3000, gatherable: true });
  });
});
