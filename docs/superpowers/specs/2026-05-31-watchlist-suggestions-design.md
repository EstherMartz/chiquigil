# Watchlist Suggestions — Design

**Date:** 2026-05-31
**Status:** Proposed

## Context

The watchlist is populated by hard-coded starter packs + manual custom-adds. There's
no way to *discover* what's worth tracking in a category — the user has to already
know an item exists and search it. Meanwhile the app already scans the whole catalog
and ranks items by profit for the `/trading` and `/crafts` pages (`runCraftFlip`), and
`categoryPresetMap` already maps each watchlist category to a preset query. So
"suggest the best untracked items for category X, one-click add" is mostly assembly.

**Decisions (from the user):** show suggestions in **both** places — an inline
per-category strip on the Watchlist *and* a dedicated Discover view; fetch
**on-demand per category** (no heavy whole-catalog scan); rank by **gil/day**.

**Wrinkle to fix:** `AddToWatchlistButton` hard-codes `cat: 'Glamour'`. Suggestions
know their category, so they'll tag `cat` correctly; I'll also give the manual Add
button a category inference from the item's search category so it stops mislabeling.

## Goal

For a chosen watchlist category, fetch that category's slice of the market on demand,
rank craftable items by gil/day, drop ones already tracked, and present the top few
with a one-click "+ track" that adds them with the correct `cat`. Surface inline on
the Watchlist (per active category) and in a Discover panel (all categories).

## Part A — Category → search-category map

New `src/features/watchlist/categorySearchCats.ts`: map each `ItemCategory` to the
`ItemSearchCategory` sc ids that define it, reusing `categoriesByGroup` where it fits:
- `Food` → [44, 45, 46] (Ingredients/Meals/Seafood), `Tincture` → [43, 6] (Medicine),
  `Dye` → [54], `Materia` → [57], `Minion` → [75], `Housing` → `categoriesByGroup('Housing')`,
  `Glamour`/`Raid` → `categoriesByGroup('Armor'|'Weapons'|'Accessories')`, `Fish` → [46].
- Export `searchCatsForCategory(cat): number[]` (empty ⇒ unsupported, e.g. a curated
  set with no clean sc analogue → no suggestions for it).

## Part B — Pure ranking core (tested)

New `src/features/watchlist/suggestions.ts`:
```ts
export interface Suggestion {
  id: number; name: string; cat: ItemCategory; crafter: CrafterCode; lvl: number;
  unitPrice: number; materialCost: number; profit: number; velocity: number; gilPerDay: number;
}
export function rankSuggestions(args: {
  cat: ItemCategory;
  snapshot: SnapshotItem[];
  market: MarketData;
  recipes: Map<number, Recipe | null>;
  trackedIds: Set<number>;     // already on the watchlist → excluded
  excludedIds: Set<number>;    // user-dismissed → excluded
  limit: number;
}): Suggestion[]
```
Implementation reuses `runCraftFlip` with a gil/day (`sort: 'gilFlow'`) filter scoped to
`searchCatsForCategory(cat)`, then maps `CraftFlipRow → Suggestion` (deriving
`crafter`/`lvl` from the recipe, tagging `cat`), filtering out tracked + excluded ids.
Pure — unit-tested for ranking, exclusion, and unsupported-category (empty) cases.

## Part C — On-demand fetch hook

New `src/features/watchlist/useCategorySuggestions.ts`: a `useMutation`/`useQuery` that,
for a given category, (1) narrows the snapshot to that category's sc ids, (2) bulk-fetches
just those items' market data via `fetchInBatches`/`fetchMarketData` (same machinery as
the heatmap/WhatNow scans, but scoped to one category — far smaller), (3) ensures recipe
data, then (4) returns `rankSuggestions(...)`. Lazy: only runs when asked (panel opened /
category selected). Reuses `useItemSnapshot`, `useRecipeSnapshot`, `useSelectedItems`
(tracked ids), `useWatchlistStore` (excluded ids).

## Part D — Inline strip on the Watchlist

New `SuggestionStrip` component, rendered in `src/routes/Watchlist.tsx` above the table
when a specific category is selected (not "All"/unsupported). Collapsed by default with a
"✦ Suggest items for {cat}" button; on expand it fires the hook and lists the top ~5
untracked items (name · gil/day · margin · velocity) each with **+ track** (calls
`addCustomItem` with the suggestion's `cat`) and a **dismiss** (adds to `excludedItems`).
Reuses the FilterBar's `catFilter` from `useUiStore`.

## Part E — Discover panel (all categories)

New route `src/routes/Discover.tsx` + `DiscoverView` (nav entry under "Planning" near
Watchlist; route + `PAGE_TITLES` in `App.tsx`, nav in `Sidebar.tsx`). Lists each
supported category as a section, each lazily running `useCategorySuggestions` (or one
shared scan) and showing its top few with the same + track / dismiss controls. Sections
load on demand (expand-to-load) so opening Discover isn't a giant fetch.

## Part F — Fix manual-add category inference

`AddToWatchlistButton` currently hard-codes `cat: 'Glamour'`. Add a tiny
`inferCategory(sc, name)` (in `categorySearchCats.ts`, reverse of Part A) and pass the
item's `sc` so manual adds get the right `cat`. Pure + tested.

## Phasing

1. Core: `categorySearchCats.ts` + `suggestions.ts` (+ tests). The tested engine.
2. Hook: `useCategorySuggestions.ts`.
3. Inline `SuggestionStrip` on the Watchlist.
4. Discover route/view.
5. Manual-add category inference fix.

## Verification

- **Vitest** for the pure core: `rankSuggestions` (gil/day order, excludes tracked +
  dismissed, unsupported category → []), `searchCatsForCategory`/`inferCategory` mapping.
  Mirror the `runCraftFlip`/`aggregate` test style.
- **Manual** (`npm run dev`): on the Watchlist pick "Food" → open suggestions → top
  untracked food crafts appear ranked by gil/day; **+ track** adds it (tagged Food, shows
  in the table on next render); **dismiss** removes it and it doesn't return. Open Discover
  → each category section loads its top picks. Add a custom item from an item page →
  confirm it lands in the right category, not Glamour.
- Full `npm test` + typecheck.

## Files at a glance

**Create:** `src/features/watchlist/categorySearchCats.ts` (+ test),
`src/features/watchlist/suggestions.ts` (+ test),
`src/features/watchlist/useCategorySuggestions.ts`,
`src/features/watchlist/SuggestionStrip.tsx`,
`src/routes/Discover.tsx`, `src/features/watchlist/DiscoverView.tsx`.

**Modify:** `src/routes/Watchlist.tsx` (strip), `src/App.tsx` (route + title),
`src/components/layout/Sidebar.tsx` (nav), `src/features/items/AddToWatchlistButton.tsx`
(category inference).

**Reuse:** `runCraftFlip` + `QueryFilter`, `categoriesByGroup`, `fetchInBatches`/
`fetchMarketData`, `useItemSnapshot`/`useRecipeSnapshot`, `useSelectedItems`,
`useWatchlistStore` (addCustomItem/toggleExcluded), `fmtGil`.
