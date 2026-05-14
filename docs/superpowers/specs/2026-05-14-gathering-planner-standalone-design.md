# Gathering planner — standalone route — design

Date: 2026-05-14

## Problem

The current planner sits on top of `/gathering` and consumes whatever rows `QueriesView` produces. The user has to pick a preset, hit Run in the query view, *then* look up at the planner panel. The planner can't be used independently of the browse table, and the brain-off flow ("input my budget, get a list, copy to GBR") requires more clicking than it should.

The fix: give the planner its own route with its own self-contained query. `/gathering` keeps the existing browse table untouched.

## Goals

- Stand up `/gathering/plan` as a single-purpose page: budget + a "Run query" button → ranked list → GBR clipboard export.
- Reuse the existing query plumbing (snapshot, gathering catalog, market fetch, `runQuery`) rather than rebuilding it.
- Keep `/gathering` exactly as it was before the planner shipped (browse view only).

## Non-goals

- Adding category / HQ / scope filters to the planner UI. Defaults are baked in (gatherable-only, NQ, home server, sort by gil/day, limit 100).
- Saved planner presets / named routes.
- Touching the existing browse view's behavior.
- Cross-DC scope toggle.
- Adding the planner to top-level nav. Reached via in-page link from `/gathering` and vice versa.

## User flow

1. User clicks "Plan a session →" on `/gathering` (or types `/gathering/plan` directly).
2. Page shows the planner form: budget mode (Time/Gil), budget value, item count slider, max-level, include-timed checkbox, items/min, list name. All inputs default to the values in `useGatheringPlanStore`.
3. User adjusts inputs as desired, clicks **Run query**.
4. Page fetches the gathering market data, computes the plan, renders the result table (the existing `<GatheringPlanner>` output: per-item qty, subtotal, totals row, skipped `—` rows).
5. User clicks **Copy GBR clipboard string** → blob lands on the clipboard → paste into GBR's import.
6. A small "← Browse all gatherables" link returns to `/gathering`.

## Architecture

### New files

- `src/routes/GatheringPlan.tsx`
  Route component. Owns:
  - the React Query mutation that runs the gathering market fetch + `runQuery`,
  - the resulting `QueryResultRow[]` in local state,
  - the page header, the "Run query" button, the loading/error banner, and the link back to `/gathering`.
  Renders `<GatheringPlanner rows={rows} catalog={catalog.data} />` to handle the form inputs and result table.

- `src/features/gathering/useGatheringQuery.ts`
  Small hook that exposes:
  ```ts
  function useGatheringQuery(): {
    run: () => void;
    rows: QueryResultRow[];
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    skipped: number;
  }
  ```
  Internally pulls `snapshot` (`useItemSnapshot`), `catalog` (`useGatheringCatalog`), and `world` (`useSettingsStore`). On `run()`, fetches market data via `fetchInBatches(ids, fetchMarketData)` against the user's home world, then runs `runQuery(snapshot.items, priceMap, defaultGatheringFilter)`.

  The default filter is built locally inside the hook (not exported as a preset) so the planner remains opinionated and unsharable with `QueryBuilder`:
  ```ts
  const filter: QueryFilter = {
    searchCategories: [],
    hq: 'either',
    minDealPct: 0,
    minVelocity: 0,
    minPrice: null,
    maxPrice: null,
    sort: 'gilFlow',
    limit: 100,
    scope: 'home',
    maxListings: null,
    mode: 'standard',
    minGap: null,
  };
  ```
  Candidate id list is built the same way `QueriesView` does it: intersect `snapshot.items` with `gatheringCatalog.keys()`.

### Modified files

- `src/routes/Gathering.tsx`
  Revert to its pre-planner form (renders only `QueriesView`). Add a prominent in-page link/button to `/gathering/plan` near the top — something like a small button "Plan a session →" using the same `font-mono text-[10px] tracking-widest uppercase px-3 py-2 border border-gold` style as other primary actions.

- `src/features/gathering/GatheringPlanner.tsx`
  Two small changes:
  1. Replace the empty-state copy "Run the query below to populate this plan." with "Click Run query to populate this plan." (the query no longer lives "below" — it lives in the same page header).
  2. No structural change. The component still takes `rows` + `catalog` props; the page owns the run trigger.

- `src/App.tsx`
  Register the new route:
  ```tsx
  <Route path="/gathering/plan" element={<GatheringPlan />} />
  ```

### Untouched

- `src/features/gathering/computePlan.ts` — unchanged.
- `src/features/gathering/gatheringPlanStore.ts` — unchanged.
- `src/lib/gatherBuddyExport.ts` — unchanged.
- `src/features/queries/QueriesView.tsx` — the `onRowsChange` prop stays in place (still optional, no longer consumed by `Gathering.tsx`). It's harmless dead code on the existing route; we'll leave it because the cost of removing it is higher than the cost of leaving it (it's three lines and the test stays valid).

### Data flow

```
/gathering/plan
   │
   ▼
GatheringPlan.tsx
   │  reads:        useGatheringPlanStore()  (form inputs)
   │  triggers:     useGatheringQuery().run()
   │                   │
   │                   ▼
   │            useItemSnapshot, useGatheringCatalog, settings.world
   │                   │
   │                   ▼
   │            fetchInBatches(ids, fetchMarketData)
   │                   │
   │                   ▼
   │            runQuery(snapshot, priceMap, defaultFilter)
   │                   │
   │                   ▼
   │            QueryResultRow[]
   │                   │
   ▼                   ▼
GatheringPlanner(rows, catalog)
   │  filters by maxLevel + includeTimed via catalog
   │  runs computePlan
   │  renders plan table + GBR export button
   ▼
clipboard ─→ GatherBuddy Reborn
```

## Edge cases

- **Snapshot or catalog still loading.** The Run button is disabled with a label "Loading data…" until both `useItemSnapshot` and `useGatheringCatalog` have resolved. Same pattern as `QueriesView`.
- **Market fetch fails (Universalis 5xx).** The `skipped` count from `fetchInBatches` surfaces as a `StatusBanner kind="error"` similar to `QueriesView`.
- **No results returned** (every chunk failed, or no gatherable items in snapshot). The planner shows its existing empty state (no rows). Export button stays disabled.
- **User navigates away mid-fetch.** React Query's mutation gets unmounted; nothing leaks. (Standard react-query behavior.)
- **Existing planner edge cases (zero-price rows, qty clamping, GBR format pinning, clipboard write blocked)** all continue to work because the `GatheringPlanner` component is unchanged.

## Testing

- `useGatheringQuery.test.ts`
  - Hook with seeded snapshot + gathering catalog + mocked `fetch` (returning a small `MarketData` map) yields the expected `QueryResultRow[]` after `run()` resolves.
  - When `fetchInBatches` reports errors, `skipped` is exposed correctly.

- `GatheringPlan.test.tsx`
  - Renders the page in a `MemoryRouter` with seeded snapshot + catalog. Asserts the Run button is enabled.
  - Clicks Run. Mocked fetch responds. After `waitFor`, the result table shows the expected items. The Copy GBR button is enabled.
  - Asserts the "← Browse all gatherables" link points to `/gathering`.

- `Gathering.test.tsx` *(new — was not tested before)*
  - Asserts the page renders `QueriesView` and the "Plan a session →" link to `/gathering/plan`.

Existing tests (`GatheringPlanner.test.tsx`, `computePlan.test.ts`, `gatheringPlanStore.test.ts`, `gatherBuddyExport.test.ts`, `QueriesView.test.tsx`) continue to apply unchanged.

## Out of scope (future, if asked)

- A scope toggle (home vs DC) on the planner.
- A category multiselect to restrict gatherables to a subset (e.g. only mining ores).
- Top-level nav entry for the planner.
- Saved planner sessions.
- Removing the now-unused `onRowsChange` prop from `QueriesView`. (Three lines of dead code; revisit if it grows.)
