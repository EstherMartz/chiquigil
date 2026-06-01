import { describe, it, expect } from 'vitest';
import { buildCraftPlan, type SourceKind } from './buildCraftPlan';
import type { Recipe } from '../../lib/recipes';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import type { ShoppingListItem } from './shoppingListStore';

function mkRecipe(itemId: number, ingredients: { itemId: number; amount: number }[]): Recipe {
  return { itemResultId: itemId, classJob: 'CRP', recipeLevel: 1, ingredients };
}
function item(id: number, qty = 1): ShoppingListItem {
  return { id, qty, craftIntermediates: false };
}
const noGather: GatheringCatalog = new Map();

describe('buildCraftPlan', () => {
  it('returns empty buckets for an empty list', () => {
    const plan = buildCraftPlan([], new Map(), noGather);
    expect(plan.craft.size).toBe(0);
    expect(plan.gather.size).toBe(0);
    expect(plan.buy.size).toBe(0);
  });

  it('crafts the target and buys a non-gatherable leaf', () => {
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
    ]);
    const plan = buildCraftPlan([item(100)], recipes, noGather);
    expect(plan.craft.get(100)?.craftCount).toBe(1);
    expect(plan.buy.get(5)).toBe(3);
    expect(plan.gather.size).toBe(0);
  });

  it('routes a gatherable leaf into the gather bucket with level/timed', () => {
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
    ]);
    const gathering: GatheringCatalog = new Map([[5, { level: 50, timed: true, hidden: false }]]);
    const plan = buildCraftPlan([item(100)], recipes, gathering);
    expect(plan.gather.get(5)).toEqual({ qty: 3, level: 50, timed: true });
    expect(plan.buy.has(5)).toBe(false);
  });

  it('recurses fully: crafts intermediates, leaves bottom out', () => {
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
    ]);
    const plan = buildCraftPlan([item(100)], recipes, noGather);
    expect(plan.craft.has(100)).toBe(true);
    expect(plan.craft.has(50)).toBe(true);
    expect(plan.buy.get(10)).toBe(8);
    expect(plan.buy.has(50)).toBe(false);
  });

  it('override "buy" on an intermediate stops recursion and moves it to buy', () => {
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
    ]);
    const overrides = new Map<number, SourceKind>([[50, 'buy']]);
    const plan = buildCraftPlan([item(100)], recipes, noGather, overrides);
    expect(plan.craft.has(50)).toBe(false);
    expect(plan.buy.get(50)).toBe(2);
    expect(plan.buy.has(10)).toBe(false);
  });

  it('override "buy" on a gatherable leaf moves it from gather to buy', () => {
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
    ]);
    const gathering: GatheringCatalog = new Map([[5, { level: 50, timed: false, hidden: false }]]);
    const overrides = new Map<number, SourceKind>([[5, 'buy']]);
    const plan = buildCraftPlan([item(100)], recipes, gathering, overrides);
    expect(plan.gather.has(5)).toBe(false);
    expect(plan.buy.get(5)).toBe(3);
  });

  it('merges quantities across multiple targets', () => {
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
      [200, mkRecipe(200, [{ itemId: 5, amount: 4 }])],
    ]);
    const plan = buildCraftPlan([item(100, 1), item(200, 2)], recipes, noGather);
    expect(plan.buy.get(5)).toBe(3 + 4 * 2);
  });

  it('puts a non-craftable target into a bucket (gather if gatherable, else buy)', () => {
    const gathering: GatheringCatalog = new Map([[7, { level: 10, timed: false, hidden: false }]]);
    const plan = buildCraftPlan(
      [item(7), item(9)],
      new Map<number, Recipe | null>([[7, null], [9, null]]),
      gathering,
    );
    expect(plan.gather.get(7)?.qty).toBe(1);
    expect(plan.buy.get(9)).toBe(1);
    expect(plan.craft.size).toBe(0);
  });
});
