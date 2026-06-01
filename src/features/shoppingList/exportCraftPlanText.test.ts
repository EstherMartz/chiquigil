import { describe, it, expect } from 'vitest';
import { exportCraftPlanText } from './exportCraftPlanText';
import type { CraftPlan } from './buildCraftPlan';

function mkPlan(partial: Partial<CraftPlan>): CraftPlan {
  return {
    craft: partial.craft ?? new Map(),
    gather: partial.gather ?? new Map(),
    buy: partial.buy ?? new Map(),
  };
}

const nameById = new Map<number, string>([
  [1, 'Bronze Ingot'],
  [2, 'Copper Ore'],
  [3, 'Tin Ore'],
  [4, 'Maple Lumber'],
  [5, 'Maple Log'],
  [6, 'Eucalyptus'],
]);

describe('exportCraftPlanText', () => {
  it('returns an empty string for an empty plan', () => {
    expect(exportCraftPlanText(mkPlan({}), nameById)).toBe('');
  });

  it('formats each line as "Nx Name" using the item output qty', () => {
    const plan = mkPlan({
      craft: new Map([[1, { qty: 2, craftCount: 2, job: 'BSM' }]]),
      buy: new Map([[2, 4], [3, 2]]),
    });
    expect(exportCraftPlanText(plan, nameById)).toBe('2x Bronze Ingot\n4x Copper Ore\n2x Tin Ore');
  });

  it('includes all three buckets in craft → gather → buy order', () => {
    const plan = mkPlan({
      craft: new Map([[1, { qty: 2, craftCount: 2, job: 'BSM' }], [4, { qty: 1, craftCount: 1, job: 'CRP' }]]),
      gather: new Map([[5, { qty: 3, level: 10, timed: false }], [6, { qty: 10, level: 20, timed: true }]]),
      buy: new Map([[2, 4], [3, 2]]),
    });
    expect(exportCraftPlanText(plan, nameById)).toBe(
      '2x Bronze Ingot\n1x Maple Lumber\n3x Maple Log\n10x Eucalyptus\n4x Copper Ore\n2x Tin Ore',
    );
  });

  it('falls back to "Item #id" when a name is missing', () => {
    const plan = mkPlan({ buy: new Map([[999, 5]]) });
    expect(exportCraftPlanText(plan, new Map())).toBe('5x Item #999');
  });
});
