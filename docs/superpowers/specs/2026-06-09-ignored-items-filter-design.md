# Ignored Items Filter — Design

**Date:** 2026-06-09
**Status:** Approved (pending spec review)

## Problem

The app has one built-in content filter: `hideCrystals`, a category toggle that
drops shards/crystals/clusters from every scan. But users routinely run into
*specific* items that show up in scans (sell well, craft well, etc.) that they
personally never want to deal with — for any reason. There is no way to say
"never show me **this item**, anywhere."

## Goal

A personal, user-managed **ignore list** of item IDs that hides those items
everywhere `hideCrystals` hides crystals, with:

- A **per-row hide control** to add an item to the list in-context, while looking
  at any scan result.
- A **master toggle** ("Hide ignored items") to switch the whole list off/on
  without losing it — the "temporary" escape hatch.
- A **management section** in Settings to review, remove, and clear the list.
- **Persistence** across reloads (browser storage, like the other settings).
- Coverage **everywhere** — every surface that currently honors `hideCrystals`.

Non-goals: named/multiple filter sets, category-based custom filters (crystals
already covers the one category case), cross-device sync.

## Architecture

Three layers, smallest-surface-first:

### 1. State — `src/features/settings/store.ts`

Extend the existing persisted zustand store (`ffxiv-helper:settings`):

- `ignoredItemIds: number[]` — default `[]`.
- `hideIgnored: boolean` — default `true` (master toggle).
- Actions:
  - `ignoreItem(id: number)` — add if absent (dedupe).
  - `unignoreItem(id: number)` — remove.
  - `clearIgnored()` — empty the list.
  - `setHideIgnored(v: boolean)`.
- Add both fields to `defaultSettings()` so zustand-persist's shallow merge
  defaults them for users with existing persisted settings (no `_v` bump or
  migration needed — missing keys fall back to the initializer's defaults).

Helper hook (same file or a small `useIgnoredItems.ts`):

- `useIgnoredItemSet(): ReadonlySet<number>` — memoized `Set` built from
  `ignoredItemIds` for O(1) membership tests in filters. Re-derives only when the
  array identity changes.

### 2. Shared predicate — `src/features/queries/commonFilters.ts`

The module already centralizes per-item gates and documents "adding a new gate
should require touching one file, not five." Add:

```ts
export interface ItemHideOpts {
  hideCrystals: boolean;
  hideIgnored: boolean;
  ignored: ReadonlySet<number>;
}

/** True when the item should be hidden from scans/plans (crystals or ignored). */
export function isItemHidden(
  item: { id: number; sc: number },
  o: ItemHideOpts,
): boolean {
  if (o.hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) return true;
  if (o.hideIgnored && o.ignored.has(item.id)) return true;
  return false;
}
```

Each existing `hideCrystals` candidate-selection site is refactored to call
`isItemHidden(item, { hideCrystals, hideIgnored, ignored })` in place of the
inline `hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY` check, threading in
`hideIgnored` + `ignored` from the store hook (and adding them to the surrounding
`useMemo` deps). Sites (all filter `SnapshotItem`-shaped objects with `id`+`sc`):

- `features/travel/TravelPlannerView.tsx`
- `features/insights/{CurrencyFlip,EmptyShelf,MaterialFlip,VendorFlip}View.tsx`
- `features/queries/QueriesView.tsx`
- `features/heatmap/HeatmapView.tsx`
- `features/gathering/useGatheringQuery.ts`
- `features/craftBatch/CraftBatchView.tsx`
- `features/session/SessionPlanner.tsx`
- `features/whatnow/WhatNowView.tsx`

**Ingredient-axis sites — deliberately NOT swapped.** Two views use `hideCrystals`
to exclude crystal *materials* from a buy/source list, which is a different axis
from the output-item ignore list. Excluding an ignored item here could drop a
material a craft actually needs, so they keep their `hideCrystals`-only logic:

- `routes/ShoppingList.tsx` — crystal materials excluded from the shopping buy list.
- `features/craftFromInventory/CraftFromInventoryView.tsx` — `excludeIngredientIds`
  for auto-sourcing. **However**, its list of craftable *outputs* (`rows`, keyed by
  `recipeItemId`) IS filtered by the ignore list — that is the output axis.

This is the "true parity with `hideCrystals`" layer: ignored items are excluded
from scans/plans at selection time everywhere, and never priced on the next scan.

### 3. Per-row hide control + live display filter

Candidate-selection filtering only takes effect on the *next* scan. For instant
feedback (click hide → the row disappears now; toggle the master switch → tables
update live without re-running), filter at the table render layer too:

- **`src/features/queries/ResultTableScaffold.tsx`** — when `hideIgnored` is on,
  drop rows whose `id ∈ useIgnoredItemSet()` from the `rows` it renders/counts.
  Every scaffold-based table inherits this. Also wrap its output in a new
  `IgnoreAffordanceContext.Provider value={true}` so the hide control knows it is
  inside a scan table.
- **`src/components/ItemNameLinks.tsx`** — add a small `✕` chip next to the
  `GT / GE / UV` chips. It only renders when (a) inside `IgnoreAffordanceContext`
  and (b) the item is not already ignored. Clicking calls `ignoreItem(id)`.
  Title: "Hide this item from scans". Because `ItemNameLinks` is the shared item
  cell across all result tables, this delivers the per-row control everywhere at
  once.
- **Non-table market surfaces** that render their own lists (not via the
  scaffold) also apply the `useIgnoredItemSet()` display filter inline:
  - `features/dashboard/tiles/ChangedDigest.tsx` (the "What changed" movers).
  - `features/heatmap/HeatmapView.tsx` (already filtered at selection in layer 2;
    no extra display filter needed since it re-derives from the snapshot memo).

`IgnoreAffordanceContext` lives in a tiny new file
(`src/features/items/ignoreAffordance.ts` or co-located with the scaffold),
defaulting to `false` so `ItemNameLinks` shows no chip outside scan tables (item
detail page, hovers, etc.).

### 4. Management UI — `src/routes/Settings.tsx`

New "Ignored items" section, styled like the existing settings rows:

- Master toggle: **Hide ignored items** (`hideIgnored`), with helper text "Turn
  off to temporarily show ignored items again without losing your list."
- List of currently-ignored items: item name (resolved from the snapshot by id) →
  remove `✕` (`unignoreItem`). Long lists scroll.
- **Clear all** button (`clearIgnored`), confirm inline.
- Empty state: "No ignored items yet. Click the ✕ next to an item in any scan to
  hide it."

## Data flow

```
User clicks ✕ on a row
  → ItemNameLinks.onHide → store.ignoreItem(id)
  → ignoredItemIds updates (persisted)
  → useIgnoredItemSet() re-derives
  → ResultTableScaffold drops the row now (live)        [display layer]
  → next scan's candidate selection excludes it          [selection layer]

User toggles "Hide ignored items" off in Settings
  → hideIgnored=false
  → scaffold + selection filters become no-ops → items reappear, list intact
```

## Testing

- **store**: `ignoreItem` dedupes; `unignoreItem` removes; `clearIgnored` empties;
  `hideIgnored` defaults true; existing persisted state without the new keys
  rehydrates to defaults.
- **`isItemHidden`**: crystal rule, ignored rule, master-off short-circuit,
  combined.
- **`ItemNameLinks`**: renders the ✕ only inside `IgnoreAffordanceContext` and
  only when not already ignored; click calls `ignoreItem`.
- **`ResultTableScaffold`**: hides ignored rows when master on; shows them when
  master off; provides the affordance context.
- **One representative selection site** (e.g. `TravelPlannerView` candidate memo
  or a direct `isItemHidden` call) to lock parity with `hideCrystals`.

## Risks / notes

- Surface is wide (~12 selection sites + 4 shared/UI files) but each selection
  edit is mechanical via `isItemHidden`. The shared display filter is the only
  behavioral logic and is unit-tested.
- `craftFromInventory` is the one non-mechanical site (different axis) — called
  out above.
- Performance: membership tests are O(1) against a `Set`; lists are tiny.
