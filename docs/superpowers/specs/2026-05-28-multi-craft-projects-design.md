# Multi-Craft Projects

**Date:** 2026-05-28
**Status:** Approved

## Problem

Each craft project supports exactly one target item. Crafting a full gear set (helm, body, gloves, legs, boots) requires five separate projects — clutter in the board, no shared task merging across pieces.

## Goal

Allow a single project to contain multiple items. Shared ingredients (e.g. Iron Ingot needed by both helm and body) merge into one task. Existing single-item projects and all other commands remain unchanged.

---

## Schema

One new table, additive migration:

```sql
CREATE TABLE IF NOT EXISTS project_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL,
  item_name  TEXT NOT NULL,
  qty        INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

`projects.target_item_id` and `projects.target_qty` are kept for backward compatibility.
- Single-item projects: populated as today.
- Multi-item projects: `target_item_id = 0`, `target_qty = 0`. `project.name` is the user-supplied set name.

---

## Store Interface Changes

Three new methods on `CraftStore`:

```typescript
addProjectItem(projectId: number, itemId: number, itemName: string, qty: number): Promise<void>;
getProjectItems(projectId: number): Promise<Array<{ id: number; itemId: number; itemName: string; qty: number }>>;
replaceTasks(projectId: number, tasks: CraftTask[]): Promise<void>; // DELETE + INSERT in one tx
```

---

## Command Changes

### `/craft new` — item option becomes optional

| Option | Change |
|---|---|
| `item` | Now optional |
| `qty` | Now optional (default 1 when item provided; ignored when item omitted) |
| `name` | Required when `item` omitted; optional otherwise (existing default: `Nx ItemName`) |

**Behaviour:**
- `item` provided → existing single-item flow, unchanged. Project posted immediately.
- `item` omitted → creates empty project (`target_item_id = 0`). No announcement yet. Bot replies (ephemeral): `"Proyecto #N creado. Usa /craft add-item id:N para añadir piezas."` in Qiqirn voice.

### `/craft add-item` — new subcommand

Options: `id` (integer, project ID), `item` (string, item name), `qty` (integer, default 1).

**Flow:**
1. Resolve `item` via `searchItems`. Error if not found.
2. Load project — error if not found / not open / wrong guild.
3. `store.addProjectItem(projectId, itemId, itemName, qty)`.
4. Load all `project_items` for this project.
5. For each item: `explode` + `buildBreakdown`. Merge tasks by `(itemId, source)` — sum `qtyNeeded`.
6. `store.replaceTasks(projectId, mergedTasks)`.
7. If `project.messageId` is null → post announcement + create thread (same as current new-project flow). Save `messageId` + `threadId`.
8. Else → edit existing announcement message.
9. `refreshBoard`.
10. Reply ephemeral: Qiqirn confirms item added, shows updated task count.

**Merge rule:** Group tasks by `(itemId, source)`. Sum `qtyNeeded`. Keep `meta` from first occurrence (vendor price, gather level, etc.). `itemName` identical for same `itemId`.

---

## Render

`buildProjectMessage` title already uses `project.name` — no change needed. Embed body shows the merged flat task list, identical to today.

For the embed description, when `project_items` has multiple rows, prepend a small item summary line:

```
Items: Ironworks Helm ×1 · Ironworks Body ×1 · Ironworks Gloves ×1
```

This requires passing the item list into `buildProjectMessage`. Signature change:

```typescript
buildProjectMessage(
  project: CraftProject,
  tasks: StoredTask[],
  projectItems?: Array<{ itemName: string; qty: number }>,
): { embeds: unknown[]; components: unknown[] }
```

When `projectItems` is undefined or length ≤ 1, render unchanged.

---

## Error Cases

| Situation | Response |
|---|---|
| `/craft new` without item and without name | Ephemeral error: name required |
| `/craft add-item` on closed project | Ephemeral error |
| `/craft add-item` on project from different guild | Ephemeral error |
| Item not found by name | Ephemeral error (existing S.ITEM_NOT_FOUND) |
| No recipe found for item | Ephemeral error (existing S.NO_RECIPE) |

---

## Out of Scope

- `/craft remove-item` — deferred
- Per-item task attribution in the embed — deferred (user chose merging)
- Web `/projects` mirror — read-only, auto-reflects DB, no change needed
