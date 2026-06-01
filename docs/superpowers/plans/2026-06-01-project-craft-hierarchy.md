# Project Craft Hierarchy (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/projects/:id`, group each task under the craft it feeds (a nested tree) instead of one flat source-grouped list — display only, no backend.

**Architecture:** A pure `buildProjectTree` adds parent→child edges over the project's existing flat tasks (a task is a child of a craft when its item is an ingredient of that craft's recipe, using the client recipe snapshot). A pure `ProjectCraftTree` renders the nested roots. `ProjectDetail` wires them in with a Tree/By-source toggle, falling back to the existing flat view when there's no nesting or the project is phase-based (CompanyCraft).

**Tech Stack:** TypeScript, React 18, react-router, @tanstack/react-query, Vitest + Testing Library, Tailwind.

Spec: `docs/superpowers/specs/2026-06-01-project-craft-hierarchy-design.md`

---

### Task 1: `buildProjectTree` pure module

**Files:**
- Create: `src/features/projects/projectTree.ts`
- Test: `src/features/projects/projectTree.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/projects/projectTree.test.ts`:

```ts
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
    expect(roots).toHaveLength(1);                                   // only 100 is unconsumed
    expect(roots[0].children[0].task.itemId).toBe(200);             // 100 → 200
    expect(roots[0].children[0].children[0].task.itemId).toBe(300); // 200 → 300
    const back = roots[0].children[0].children[0].children[0];      // 300 → 200 (cycle)
    expect(back.task.itemId).toBe(200);
    expect(back.children).toEqual([]);                              // stopped, no infinite loop
  });

  it('preserves root order from the task list', () => {
    const roots = buildProjectTree([tk(300, 'craft'), tk(100, 'craft'), tk(50, 'gather')], new Map());
    expect(roots.map((r) => r.task.itemId)).toEqual([300, 100, 50]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/projects/projectTree.test.ts`
Expected: FAIL — `buildProjectTree` not defined.

- [ ] **Step 3: Implement**

`src/features/projects/projectTree.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/projects/projectTree.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/projects/projectTree.ts src/features/projects/projectTree.test.ts
git commit -m "feat(projects): buildProjectTree craft hierarchy from tasks + recipes"
```

---

### Task 2: `ProjectCraftTree` component

**Files:**
- Create: `src/features/projects/ProjectCraftTree.tsx`
- Test: `src/features/projects/ProjectCraftTree.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/features/projects/ProjectCraftTree.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProjectCraftTree } from './ProjectCraftTree';
import type { ProjectTreeNode } from './projectTree';
import type { StoredTask } from '../../bot/craftTypes';

const tk = (itemId: number, name: string, source: StoredTask['source'], over: Partial<StoredTask> = {}): StoredTask => ({
  id: itemId, projectId: 1, itemId, itemName: name, qtyNeeded: 2, qtyDone: 0,
  source, meta: null, assigneeId: null, status: 'open', updatedAt: 0, ...over,
});
const node = (task: StoredTask, children: ProjectTreeNode[] = []): ProjectTreeNode => ({ task, children });

const renderTree = (roots: ProjectTreeNode[]) =>
  render(<MemoryRouter><ProjectCraftTree roots={roots} /></MemoryRouter>);

describe('ProjectCraftTree', () => {
  it('renders a main craft with nested components and source tags', () => {
    renderTree([node(tk(100, 'Hammer', 'craft'), [
      node(tk(200, 'Ore', 'gather')),
      node(tk(300, 'Flux', 'market')),
    ])]);
    expect(screen.getByText('Hammer')).toBeInTheDocument();
    expect(screen.getByText('Ore')).toBeInTheDocument();
    expect(screen.getByText('Gather')).toBeInTheDocument();
    expect(screen.getByText('Market')).toBeInTheDocument();
  });

  it('collapses and expands a craft’s children', async () => {
    renderTree([node(tk(100, 'Hammer', 'craft'), [node(tk(200, 'Ore', 'gather'))])]);
    expect(screen.getByText('Ore')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /collapse/i }));
    expect(screen.queryByText('Ore')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /expand/i }));
    expect(screen.getByText('Ore')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/projects/ProjectCraftTree.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/features/projects/ProjectCraftTree.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TaskSource } from '../../bot/craftTypes';
import type { ProjectTreeNode } from './projectTree';

const SOURCE_TAG: Record<TaskSource, string> = {
  craft: 'Craft', workshop: 'Workshop', gather: 'Gather',
  currency: 'Currency', vendor: 'Vendor', market: 'Market',
};

function statusClass(status: string): string {
  return status === 'done' ? 'text-green-400' : status === 'claimed' ? 'text-yellow-400' : 'text-text-low';
}

export function ProjectCraftTree({ roots }: { roots: ProjectTreeNode[] }) {
  return (
    <div className="border border-border-base rounded p-3">
      <ul className="space-y-0.5">
        {roots.map((n) => <TreeRow key={n.task.id} node={n} depth={0} />)}
      </ul>
    </div>
  );
}

function TreeRow({ node, depth }: { node: ProjectTreeNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const { task } = node;
  const hasChildren = node.children.length > 0;
  const pct = task.qtyNeeded > 0 ? Math.round((task.qtyDone / task.qtyNeeded) * 100) : 0;
  const isMain = depth === 0;

  return (
    <li>
      <div
        className={[
          'flex items-center gap-2 py-1.5 px-1 rounded border-b border-border-base/20',
          task.status === 'done' ? 'bg-green-400/5' : task.status === 'claimed' ? 'bg-yellow-400/5' : '',
        ].join(' ')}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="w-4 text-text-low hover:text-text-base font-mono text-[10px] leading-none"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="font-mono text-xs text-text-low">{task.qtyNeeded}×</span>
        <Link
          to={`/item/${task.itemId}`}
          className={`flex-1 min-w-0 truncate hover:underline ${isMain ? 'font-semibold text-text-base' : 'text-text-low'}`}
        >
          {task.itemName}
        </Link>
        <span className="font-mono text-[10px] tracking-wide text-text-low/70 border border-border-base/40 rounded px-1.5 py-0.5">
          {SOURCE_TAG[task.source]}
        </span>
        <span className="font-mono text-xs text-text-low w-20 text-right">{task.qtyDone}/{task.qtyNeeded} ({pct}%)</span>
        <span className={`font-mono text-xs w-16 text-right font-semibold ${statusClass(task.status)}`}>
          {task.status === 'done' ? '✓ done' : task.status === 'claimed' ? '⚒ claimed' : 'open'}
        </span>
      </div>
      {hasChildren && open && (
        <ul className="space-y-0.5">
          {node.children.map((child, i) => (
            <TreeRow key={`${child.task.id}:${i}`} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
```
(`▾`/`▸` are ▾/▸, `×` is ×, `✓` is ✓, `⚒` is ⚒ — write the actual glyphs in the file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/projects/ProjectCraftTree.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/projects/ProjectCraftTree.tsx src/features/projects/ProjectCraftTree.test.tsx
git commit -m "feat(projects): ProjectCraftTree nested craft hierarchy view"
```

---

### Task 3: Wire the tree into `ProjectDetail`

**Files:**
- Modify: `src/features/projects/ProjectDetail.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/features/projects/ProjectDetail.tsx`, after the existing imports, add:
```ts
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { buildProjectTree } from './projectTree';
import { ProjectCraftTree } from './ProjectCraftTree';
```

- [ ] **Step 2: Add the hooks (before the early returns)**

In the `ProjectDetail` component, the lines currently read:
```tsx
  const q = useProject(projectId);
  const [activePhase, setActivePhase] = useState<{ partKey: string; phaseIndex: number } | null>(null);
```
Add immediately after them (these must run before the `if (q.isLoading)` / error early-returns, so hook order is stable):
```tsx
  const recipes = useRecipeSnapshot(true);
  const [viewMode, setViewMode] = useState<'tree' | 'source'>('tree');
```

- [ ] **Step 3: Compute the tree after `tasks` is available**

After the existing `const isMultiCraft = projectItems.length >= 2;` line, add:
```tsx
  const treeRoots = buildProjectTree(tasks, recipes.data ?? new Map());
  const hasNesting = treeRoots.some((r) => r.children.length > 0);
  const showTreeToggle = hasNesting && !hasPhases;
  const showTree = showTreeToggle && viewMode === 'tree';
```

- [ ] **Step 4: Add the toggle + conditional rendering**

Replace this existing block:
```tsx
      {SOURCE_ORDER.map((source) => {
        const list = groups.get(source) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={source} className="border border-border-base rounded p-3">
            <h3 className="font-mono text-[10px] tracking-widest text-text-low mb-2 uppercase">
              {SOURCE_LABEL[source]} · {list.length}
            </h3>
            <ul>
              {list.map((t) => (
                <TaskRow key={t.id} t={t} userNames={userNames} />
              ))}
            </ul>
          </section>
        );
      })}
```
with:
```tsx
      {showTreeToggle && (
        <div className="flex gap-1.5">
          {(['tree', 'source'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={[
                'px-2.5 py-1 rounded font-mono text-[10px] tracking-wide border transition-colors',
                viewMode === mode
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'border-border-base/40 text-text-low hover:border-accent/50 hover:text-text-base',
              ].join(' ')}
            >
              {mode === 'tree' ? 'Tree' : 'By source'}
            </button>
          ))}
        </div>
      )}

      {showTree ? (
        <ProjectCraftTree roots={treeRoots} />
      ) : (
        SOURCE_ORDER.map((source) => {
          const list = groups.get(source) ?? [];
          if (list.length === 0) return null;
          return (
            <section key={source} className="border border-border-base rounded p-3">
              <h3 className="font-mono text-[10px] tracking-widest text-text-low mb-2 uppercase">
                {SOURCE_LABEL[source]} · {list.length}
              </h3>
              <ul>
                {list.map((t) => (
                  <TaskRow key={t.id} t={t} userNames={userNames} />
                ))}
              </ul>
            </section>
          );
        })
      )}
```

- [ ] **Step 5: Type-check and run the suite**

Run: `npx tsc --noEmit`
Expected: exit 0. (If it flags an unused `recipes.progress` or similar, ignore — we only use `recipes.data`.)

Run: `npx vitest run`
Expected: PASS (full suite, including the two new test files).

- [ ] **Step 6: Commit**

```bash
git add src/features/projects/ProjectDetail.tsx
git commit -m "feat(projects): craft-hierarchy tree view on /projects detail"
```

---

## Verification Checklist

- [ ] `npx vitest run` — full suite green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] A standard-recipe project shows the **Tree** view by default: main craft(s) at the top with their needed items nested beneath, source tags on leaves, progress/status per row; the **Tree / By source** toggle switches views.
- [ ] A project whose target has no usable recipe (no nesting) shows the original source-grouped view and no toggle.
- [ ] A CompanyCraft / phase-based project is unchanged (phase tabs + source groups, no toggle).

## Notes / Deferred

- Phase 2 (separate spec) adds the shared "mark craft done → cascade components" write path, reusing `buildProjectTree` to compute the descendant task set.
- CompanyCraft (phase-based) tree nesting is deferred — those keep the existing phase view.
- Shared intermediates are intentionally duplicated under each parent (informative for a read-only view).
