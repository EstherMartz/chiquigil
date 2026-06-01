# Project Craft Hierarchy (Phase 1) — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorm)
**Route touched:** `/projects/:id` (ProjectDetail)
**Phase:** 1 of 2 (display only; Phase 2 = shared mark-done cascade, separate spec)

## Goal

On a project's detail page, group each task **under the craft it feeds**, so it's clear which mats are needed for which craft — instead of today's single flat list grouped by acquisition source (Craft / Gather / Market…). Projects can have **multiple main crafts** (multiple targets / `projectItems`), each with its own component sub-tree.

Display only: no writes, no backend, no Discord/plugin changes. Phase 2 will reuse this tree to compute the mark-done cascade.

## Current state (what we're changing)

`ProjectDetail.tsx` renders `tasks` (a flat `StoredTask[]`) grouped by `source` via `groupTasks`, with CompanyCraft phase tabs (`collectPhases`/`filterToPhase`) on top. Tasks have `itemId`, `qtyNeeded`, `qtyDone`, `status`, `source`, `assigneeId` but **no parent→child link**. The page is read-only ("View only — edit in Discord with /craft.").

## Approach — edge-building over existing tasks

Rather than re-exploding the target by quantity (the `projectItems` summary has no `itemId`, and re-derivation can drift from the stored tasks), build the hierarchy by adding parent→child **edges** over the tasks already in the project, using recipe data the client already has (`useRecipeSnapshot` → `Map<number, Recipe>`, where `Recipe.ingredients` is `{ itemId, amount }[]`).

### Pure module — `src/features/projects/projectTree.ts`

```ts
export interface ProjectTreeNode { task: StoredTask; children: ProjectTreeNode[]; }
export function buildProjectTree(tasks: StoredTask[], recipeMap: Map<number, Recipe>): ProjectTreeNode[]; // returns roots
```

Algorithm:
1. `taskByItemId` = first task per `itemId` (tasks are unique per item within a project).
2. For each task `P`, its **child item ids** = `recipeMap.get(P.itemId)?.ingredients` filtered to those that also exist as a task in this project.
3. **Consumed set** = union of all child item ids. **Roots** = tasks whose `itemId` is NOT in the consumed set (the main crafts/targets, plus any orphan task that nothing consumes).
4. Recursively build nodes from each root via the child-item-id edges. A **per-path visited set** + a **max depth (e.g. 12)** guard prevent cycles/runaway. A shared intermediate (ingredient of two crafts) is intentionally **duplicated** under each parent — that's informative ("needed by both X and Y").
5. Result preserves the input order of roots (stable).

Edge cases:
- No recipe edges at all (no craftable tasks, or recipes not loaded) → every task is a root with no children → caller detects "no nesting" and falls back to the flat view.
- `recipeMap` empty/loading → same flat fallback.

Pure and fully unit-tested.

### Component — `src/features/projects/ProjectCraftTree.tsx`

- Renders the roots as nested, indented rows (indent ∝ depth) with **expand/collapse** (local `useState` set of expanded item ids; default expanded).
- **Root nodes (main crafts)** get a prominent header style; intermediate crafts are lighter sub-headers; leaves show their **source tag** (Gather / Market / Vendor / Currency / Workshop).
- Each row reuses the existing `TaskRow` visual vocabulary: item name → `/item/:id` link, `qtyNeeded×`, `qtyDone/qtyNeeded (pct)`, and the done/claimed/open color + label. Crafts with no direct task (shouldn't normally happen — every node here is a task) are not a concern; every node carries a `task`.
- Props: `{ roots: ProjectTreeNode[]; userNames: Record<string,string> }`.

### Integration — `ProjectDetail.tsx`

- Load recipes via `useRecipeSnapshot(true)`; build `roots = buildProjectTree(tasks, recipeMap)`.
- `hasNesting` = any root has children. Add a small **"Tree / By source"** toggle (local state) shown only when `hasNesting` and the project is **not** phase-based.
- Default to **Tree** when `hasNesting`; otherwise render the existing flat source-grouped view unchanged.
- **CompanyCraft / phase-based projects** (`collectPhases(tasks).length > 1`) keep their current phase-tab + source-grouped view untouched — recipe-edge nesting doesn't model workshop phases, so those are deferred to a later phase. No toggle shown for them.
- The existing "View only — edit in Discord" note stays.

## Testing

- `buildProjectTree` unit tests: target + 2 leaves → 1 root, 2 children; target → intermediate craft → leaf (3 levels); shared intermediate duplicated under two parents; no recipes → all roots, no children; cycle guard (recipe referencing an ancestor) terminates; root order preserved.
- `ProjectCraftTree` render test: nested rows render with indentation; a leaf shows its source tag; progress/status text from the task; expand/collapse toggles child visibility.
- `ProjectDetail`: a project with a craftable target shows the tree by default and the toggle; a recipe-less/flat project shows the original source view and no toggle; a phase-based project is unchanged. (Mock `useProject` + `useRecipeSnapshot` per existing test patterns.)

## Non-goals (Phase 1)

- Any write / mark-done / cascade (Phase 2).
- CompanyCraft (phase-based) tree nesting — keep existing phase view.
- Backend, auth, Discord, or plugin changes.
- Quantity re-derivation — quantities come straight from the stored tasks.

## Files

**Add:**
- `src/features/projects/projectTree.ts` (+ `.test.ts`).
- `src/features/projects/ProjectCraftTree.tsx` (+ `.test.tsx`).

**Modify:**
- `src/features/projects/ProjectDetail.tsx` — build the tree, add the Tree/By-source toggle, render `ProjectCraftTree` for standard-recipe projects.
