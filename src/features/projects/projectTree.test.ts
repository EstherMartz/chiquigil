import { describe, it, expect } from 'vitest';
import { buildProjectTree } from './projectTree';
import type { StoredTask } from '../../bot/craftTypes';
import type { Recipe } from '../../lib/recipes';
import type { RecipeMap } from '../../lib/recipeSnapshot';

let nextId = 1;
const tk = (itemId: number, source: StoredTask['source'] = 'craft'): StoredTask => ({
  id: nextId++, projectId: 1, itemId, itemName: `Item ${itemId}`,
  qtyNeeded: 1, qtyDone: 0, source, meta: null, assigneeId: null, status: 'open', updatedAt: 0,
});
const rcp = (ingItemIds: number[]): Recipe =>
  ({ itemResultId: 0, classJob: 'CRP', recipeLevel: 1, ingredients: ingItemIds.map((itemId) => ({ itemId, amount: 1 })) } as Recipe);
const recipes = (entries: Array<[number, number[]]>): RecipeMap =>
  new Map(entries.map(([id, ings]) => [id, rcp(ings)]));

describe('buildProjectTree', () => {
  it('nests a target craft over its leaf components', () => {
    const roots = buildProjectTree(
      [tk(100, 'craft'), tk(200, 'gather'), tk(300, 'market')],
      recipes([[100, [200, 300]]]),
    );
    expect(roots).toHaveLength(1);
    expect(roots[0].task.itemId).toBe(100);
    expect(roots[0].children.map((c) => c.task.itemId)).toEqual([200, 300]);
    expect(roots[0].children.every((c) => c.children.length === 0)).toBe(true);
  });

  it('nests an intermediate craft three levels deep', () => {
    const roots = buildProjectTree(
      [tk(100, 'craft'), tk(200, 'craft'), tk(300, 'gather')],
      recipes([[100, [200]], [200, [300]]]),
    );
    expect(roots).toHaveLength(1);
    expect(roots[0].children[0].task.itemId).toBe(200);
    expect(roots[0].children[0].children[0].task.itemId).toBe(300);
  });

  it('duplicates a shared intermediate under each parent', () => {
    const roots = buildProjectTree(
      [tk(100, 'craft'), tk(101, 'craft'), tk(200, 'market')],
      recipes([[100, [200]], [101, [200]]]),
    );
    expect(roots.map((r) => r.task.itemId)).toEqual([100, 101]);
    expect(roots[0].children[0].task.itemId).toBe(200);
    expect(roots[1].children[0].task.itemId).toBe(200);
  });

  it('returns every task as a flat root when there are no recipes', () => {
    const roots = buildProjectTree([tk(100, 'craft'), tk(200, 'gather')], new Map());
    expect(roots.map((r) => r.task.itemId)).toEqual([100, 200]);
    expect(roots.every((r) => r.children.length === 0)).toBe(true);
  });

  it('terminates on a deep recipe cycle without infinite recursion', () => {
    const roots = buildProjectTree(
      [tk(100, 'craft'), tk(200, 'craft'), tk(300, 'craft')],
      recipes([[100, [200]], [200, [300]], [300, [200]]]),
    );
    expect(roots).toHaveLength(1);
    expect(roots[0].children[0].task.itemId).toBe(200);
    expect(roots[0].children[0].children[0].task.itemId).toBe(300);
    const back = roots[0].children[0].children[0].children[0];
    expect(back.task.itemId).toBe(200);
    expect(back.children).toEqual([]);
  });

  it('preserves root order from the task list', () => {
    const roots = buildProjectTree([tk(300, 'craft'), tk(100, 'craft'), tk(50, 'gather')], new Map());
    expect(roots.map((r) => r.task.itemId)).toEqual([300, 100, 50]);
  });
});
