# What's New This Patch — Design

**Date:** 2026-06-02
**Status:** Approved (design), pending spec review

## Goal

Add a "What's New This Patch" section to the webapp that lists the items and
recipes added by the latest game update, and surfaces a live market snapshot
("how it sells") for each new item so the user can spot early-sale
opportunities.

Two requests, one page:
1. Display what's new in the patch (new items + new recipes).
2. Easily track how the new items sell (current price, velocity, recent
   sales, last-sale freshness).

## Non-goals (YAGNI)

- No time-series / price-history charts.
- No watchlist / pinning.
- No scheduled market captures.
- No manual FFXIV patch-number entry.

These stay as clean follow-ons.

## How "new" is detected

"New" = **present in the current bake, absent in the previous bake**. Because
the user re-bakes after each game update, the delta between consecutive bakes
approximates the patch's additions. There is no per-patch baseline today, so we
introduce one as a derived bake artifact.

### New bundle: `public/data/snapshots/whatsNew.json`

```jsonc
{
  "bakedAt": 1780394881071,      // current bake timestamp (ms)
  "prevBakedAt": 1779749119689,  // previous bake timestamp (ms), or null if none
  "newItems": [/* item IDs in current items.json, absent in prior items.json */],
  "newRecipeItems": [/* resulting-item IDs of recipes new since prior bake */]
}
```

- `newItems` is diffed from the `items.json` `items[].id` sets.
- `newRecipeItems` is diffed from the `recipes.json` key set. The recipe
  snapshot is `Map<itemResultId, Recipe>` (serialized as `entries: [[id, Recipe], …]`),
  so the keys are resulting-item IDs — exactly what we list and what we can
  resolve to a name via the item snapshot.

### Pure diff function

`scripts/whatsNewDiff.ts` exports a pure function used by both the bake and the
one-time backfill:

```ts
export function newIdsSince(prev: Iterable<number>, next: Iterable<number>): number[]
// returns IDs present in `next` but not in `prev`, ascending.
```

This is the only piece with real logic, so it gets a unit test
(`scripts/whatsNewDiff.test.ts`): added IDs, removed IDs (ignored), unchanged
set → empty, empty prev → all of next.

### Bake integration (`scripts/bake-snapshots.ts`)

The bake currently overwrites `items.json` and `recipes.json` in place. Reorder
so the **prior** files are read into ID sets *before* they are overwritten,
then after the new data is fetched, compute the diffs and write `whatsNew.json`.

- Add a `readPriorIds(file, key)` helper that reads the existing on-disk bundle
  (returns empty set + `prevBakedAt: null` if the file is missing — first bake).
- Capture `prevBakedAt` from the prior `items.json` `bakedAt`.
- `bakeWhatsNew(bakedAt, prevBakedAt, priorItemIds, priorRecipeIds, newItems, newRecipeKeys)`
  writes the bundle.
- Add `whatsNew` counts (`{ newItems, newRecipeItems }`) to `manifest.json`.

### One-time backfill for the current patch

`items.json` / `recipes.json` were already overwritten by today's bake, so the
prior on-disk copies are gone — but they live in git at commit `a42c4b0`
(the pre-bake state). A one-off generation step (`scripts/backfillWhatsNew.ts`,
run once, not committed as a build step) reads the prior bundles from git via
`git show a42c4b0:public/data/snapshots/items.json` (and `recipes.json`), parses
them, and produces `whatsNew.json` with the same `newIdsSince` function. No
XIVAPI re-fetch.

Expected magnitude (from the manifest delta): ~512 raw new item IDs (many
untradeable/internal — filtered in the UI), ~135 new recipes.

## Runtime data loading

Mirror the existing static-bundle pattern. `whatsNew.json` is a derived
artifact with no live XIVAPI equivalent, so it is **static-bundle only** — no
IDB cache, no live fallback.

- `src/lib/staticSnapshots.ts`: add
  ```ts
  export interface WhatsNewData { prevBakedAt: number | null; newItems: number[]; newRecipeItems: number[]; }
  export async function loadStaticWhatsNewSnapshot(): Promise<StaticBundle<WhatsNewData> | null>
  ```
  following `loadStaticItemsSnapshot` exactly.
- `src/features/queries/useWhatsNewSnapshot.ts`: a `useQuery` hook returning
  `{ prevBakedAt, newItems, newRecipeItems, bakedAt }`, `staleTime: Infinity`.
  If the bundle is missing (older deploys), returns empty arrays so the page
  renders an empty state rather than erroring.

## UI

### View — `src/features/insights/WhatsNewView.tsx`

Follows `EmptyShelfView.tsx` structure:

- Loads `useWhatsNewSnapshot()` + `useItemSnapshot()` (for names/ilvl/canHq) +
  the recipe snapshot (the existing recipe hook if one exists, else a thin
  `useQuery` over `loadStaticRecipesSnapshot`) for the Craftable badge and the
  New Recipes tab. The plan step will confirm which accessor already exists.
- **Segmented tabs:** `New Items` | `New Recipes` (reuse the existing segmented
  button styling seen in the Empty Shelf HQ-mode control).
- The active tab's IDs (`newItems` or `newRecipeItems`) are resolved to
  `SnapshotItem`s; unknown IDs (no longer in the catalog) are dropped.
- **Market fetch:** same path as Empty Shelf —
  `fetchInBatches(ids, (chunk) => fetchMarketData(world, chunk), { chunkSize: 100, concurrency: 4 })`.
- **Auto-run:** uses `useInitialScan(ready, …)` so the market snapshot loads on
  mount with no click (per the project's auto-run-scans convention). A manual
  "Refresh" path is available but no filter change is required to view results.
- **Header banner:** `512 new items since the 2026-06-02 update.` Date derived
  from `bakedAt`; if `prevBakedAt` is null, banner reads "since the first
  catalog bake."
- **FilterBar:**
  - `Tradeable only` toggle, **default on** — hides items with no market
    data returned (the internal/untradeable rows that pad the raw count).
  - `Min sales/day` (min velocity), reusing the Empty Shelf input idiom.
  - Sort control (drives the Results sort state).

### Results — `src/features/queries/WhatsNewResults.tsx`

Follows `EmptyShelfResults.tsx`:

- Wraps `ResultTableScaffold` (pagination, density toggle, CSV export, matches
  banner, mobile/desktop branching).
- Local `SortableHeader` components.
- `ItemNameLinks` for the item-name cell.
- **Columns:** Item (with **Craftable** badge when the ID is a recipe key) ·
  Price · Sales/day (velocity) · Recent sales (NQ/HQ) · Last sale (freshness
  via the existing `lastSaleMs` → "today / Xd ago" helper).
- **Sort options:** velocity (desc, default), price (desc), freshness (days
  since last sale, asc), name (asc).
- CSV export columns mirror the table.
- New Recipes tab renders the same table scoped to `newRecipeItems`; every row
  is by definition craftable, so the badge column is omitted on that tab.

### Sorting / row model — `src/features/queries/runWhatsNew.ts`

A pure builder mirroring `runEmptyShelf.ts`: takes resolved items + the
`MarketData` sale map + a recipe-key set + sort, returns sorted rows with
`{ item, market, craftable, daysSinceLastSale }`. The `Tradeable only` filter
drops rows whose ID is absent from the sale map. Reuses `DAY_MS` / freshness
math from the Empty Shelf path.

## Routing & navigation

- `src/App.tsx`: add `<Route path="/whats-new" element={<WhatsNew />} />` under
  the existing `RequireAuth` block, a `src/routes/WhatsNew.tsx` thin wrapper,
  and a `PAGE_TITLES['/whats-new']` entry.
- `src/components/layout/Header.tsx`: add a `What's New` NavLink (matching the
  Empty Shelf link added there).
- `src/components/layout/Sidebar.tsx`: add the same link to the appropriate
  `NAV_GROUPS` entry (Header and Sidebar keep separate lists, as Empty Shelf
  does).

## Testing

- **Unit:** `scripts/whatsNewDiff.test.ts` for `newIdsSince` (added / removed /
  unchanged / empty-prev cases). This is the only new non-trivial logic.
- View/Results wiring follows the established insight-page pattern and existing
  rendering tests, so no new test infrastructure is introduced.

## Files

**New**
- `scripts/whatsNewDiff.ts` — pure `newIdsSince` diff.
- `scripts/whatsNewDiff.test.ts` — unit test.
- `scripts/backfillWhatsNew.ts` — one-time current-patch generation from git.
- `public/data/snapshots/whatsNew.json` — generated bundle (committed).
- `src/features/queries/useWhatsNewSnapshot.ts` — runtime hook.
- `src/features/queries/runWhatsNew.ts` — pure row builder.
- `src/features/queries/WhatsNewResults.tsx` — results table.
- `src/features/insights/WhatsNewView.tsx` — view + filter bar + tabs.
- `src/routes/WhatsNew.tsx` — route wrapper.

**Modified**
- `scripts/bake-snapshots.ts` — read prior IDs before overwrite, bake
  `whatsNew.json`, add manifest counts.
- `src/lib/staticSnapshots.ts` — `loadStaticWhatsNewSnapshot` + `WhatsNewData`.
- `src/App.tsx` — route + page title.
- `src/components/layout/Header.tsx` — nav link.
- `src/components/layout/Sidebar.tsx` — nav link.

## Data-flow summary

```
bake (future):  prior items.json/recipes.json (read first)
                + freshly fetched items/recipes
                → newIdsSince → whatsNew.json (+ manifest counts)

backfill (now): git a42c4b0:items.json/recipes.json
                + current on-disk items.json/recipes.json
                → newIdsSince → whatsNew.json

runtime:        whatsNew.json ─┐
                items.json ────┼→ WhatsNewView → resolve IDs → fetchMarketData
                recipes.json ──┘                → runWhatsNew → WhatsNewResults
```
