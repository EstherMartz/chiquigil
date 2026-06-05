# Category Group Quick-Select

**Date:** 2026-06-05
**Status:** Approved, ready for plan

## Goal

Let users select a whole group of related item categories in one click — e.g. a
**Housing** chip selects all 11 housing categories (Furnishings, Exterior/Interior
Fixtures, Outdoor Furnishings, Chairs and Beds, Tables, Tabletop, Wall-mounted,
Rugs, Gardening Items, Paintings) at once.

## Background

The shared `CategorySelect` ([src/components/CategorySelect.tsx](../../../src/components/CategorySelect.tsx))
renders a search box, a per-category checkbox dropdown, and selected pills. It is
used by `QueryBuilder` and (as of today) the Vendor Flip FilterBar. Selecting many
related categories one-by-one is tedious.

The grouping data already exists: every `ITEM_SEARCH_CATEGORIES` entry has a `group`
field (`'Weapons' | 'Tools' | 'Armor' | 'Accessories' | 'Medicines & Meals' |
'Materials' | 'Other' | 'Housing'`), and there is already a
`categoriesByGroup(group)` helper ([src/lib/itemSearchCategories.ts:102](../../../src/lib/itemSearchCategories.ts)).

## Design

### Keep `CategorySelect` generic

`CategorySelect` only knows `{ id, name }` categories — it must not learn the
FFXIV-specific group taxonomy. Add one optional prop:

```ts
groups?: { label: string; ids: number[] }[];
```

When omitted, the component behaves exactly as today (no visual or behavioral
change for any current consumer that doesn't pass it).

### Group taxonomy helper

Add a `CATEGORY_GROUPS` export to `src/lib/itemSearchCategories.ts`, derived from
the existing `group` field, preserving first-seen group order:

```ts
export interface CategoryGroup { label: ItemSearchCategoryEntry['group']; ids: number[] }
export const CATEGORY_GROUPS: CategoryGroup[] = /* one entry per distinct group */;
```

Consumers pass `groups={CATEGORY_GROUPS}` to `CategorySelect`.

### UI

When `groups` is provided, render a row of **group toggle chips** at the top of the
open dropdown (above the existing category checkbox list), one chip per group using
its `label`. The search input, checkbox list, and selected pills below are
unchanged.

### Toggle behavior

For a chip whose category ids are `G` and the current selection is `S`:
- If every id in `G` is already in `S` → **remove** all of `G` from `S` (toggle off).
- Otherwise → **add** all of `G` to `S` (union, no duplicates).

### Chip state

- **Active** (all of `G` ⊆ `S`): emphasized style (e.g. gold border/text like the
  selected-pill / active-toggle styling already in the codebase).
- **Partial** (some but not all of `G` ⊆ `S`): a distinct muted-but-marked style.
- **Inactive** (none of `G` in `S`): default chip style.

## Consumers

- **Vendor Flip** ([src/features/insights/VendorFlipView.tsx](../../../src/features/insights/VendorFlipView.tsx)):
  pass `groups={CATEGORY_GROUPS}` to its `CategorySelect`.
- **QueryBuilder** ([src/features/queries/QueryBuilder.tsx](../../../src/features/queries/QueryBuilder.tsx)):
  pass `groups={CATEGORY_GROUPS}` to its `CategorySelect`.

No changes to filter types, runners, fetch logic, or snapshots.

## Testing

- **`CategorySelect` component tests** (new test file or extend existing):
  - Clicking a group chip when none of its ids are selected adds all of them.
  - Clicking the same chip again removes all of them (toggle off).
  - A chip renders an active state when all its ids are selected, and a partial
    state when only some are.
  - When `groups` is not passed, no chips render (back-compat).
- **Vendor Flip smoke test** ([VendorFlipView.test.tsx](../../../src/features/insights/VendorFlipView.test.tsx)):
  the Housing group chip is present and selecting it marks the scan stale.

## Out of scope (YAGNI)

- Persisting group selection to URL/localStorage.
- Collapsible/nested group trees.
- User-defined custom groups.
