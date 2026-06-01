import type { StoredTask } from '../../bot/craftTypes';
import type { RecipeMap } from '../../lib/recipeSnapshot';

export interface ProjectTreeNode {
  task: StoredTask;
  children: ProjectTreeNode[];
}

const MAX_DEPTH = 12;

/**
 * Build a craft hierarchy over a project's flat task list by adding parent→child
 * edges: a task C is a child of craft P when C's item is an ingredient of P's
 * recipe (and C exists as a task in this project). Roots are tasks that nothing
 * else consumes (the main crafts/targets). A shared intermediate is duplicated
 * under each parent. Roots keep the input task order. Falls back to all-flat-roots
 * when there are no recipe edges.
 */
export function buildProjectTree(tasks: StoredTask[], recipeMap: RecipeMap): ProjectTreeNode[] {
  const taskByItemId = new Map<number, StoredTask>();
  for (const t of tasks) {
    if (!taskByItemId.has(t.itemId)) taskByItemId.set(t.itemId, t);
  }

  const childIdsOf = (itemId: number): number[] => {
    const recipe = recipeMap.get(itemId);
    if (!recipe) return [];
    const out: number[] = [];
    for (const ing of recipe.ingredients) {
      if (taskByItemId.has(ing.itemId)) out.push(ing.itemId);
    }
    return out;
  };

  const consumed = new Set<number>();
  for (const t of tasks) {
    for (const childId of childIdsOf(t.itemId)) consumed.add(childId);
  }

  const build = (itemId: number, depth: number, path: Set<number>): ProjectTreeNode | null => {
    const task = taskByItemId.get(itemId);
    if (!task) return null;
    if (depth >= MAX_DEPTH || path.has(itemId)) return { task, children: [] };
    const nextPath = new Set(path).add(itemId);
    const children: ProjectTreeNode[] = [];
    for (const childId of childIdsOf(itemId)) {
      const node = build(childId, depth + 1, nextPath);
      if (node) children.push(node);
    }
    return { task, children };
  };

  const roots: ProjectTreeNode[] = [];
  const seenRoot = new Set<number>();
  for (const t of tasks) {
    if (consumed.has(t.itemId) || seenRoot.has(t.itemId)) continue;
    seenRoot.add(t.itemId);
    const node = build(t.itemId, 0, new Set());
    if (node) roots.push(node);
  }
  return roots;
}
