# Auto-run default scans on load

**Date:** 2026-05-30
**Status:** Approved (pending spec review)

## Problem

Across the app, insight/query pages gate their results behind a manual **Run scan** click,
showing an `EmptyState` until the user clicks. But "scanning" no longer hits the network:
`fetchMarketData` ([src/lib/universalis.ts](../../../src/lib/universalis.ts)) reads **from
cache only** (pre-seeded from the bot's hourly `market-cache.json`), and recipes come from a
bulk snapshot ([src/features/profit/useRecipes.ts](../../../src/features/profit/useRecipes.ts))
that loads once then resolves locally. A "scan" is therefore a cache read plus local
computation — effectively instant once the one-time catalog/recipe snapshots are loaded.

The manual gate is friction with no remaining cost justification. The user wants default
results to appear automatically on load, with the Run-scan click reserved for re-running
after they have manually changed a filter.

## Goals

- Every scan-gated view auto-runs its **default** scan once, automatically, as soon as its
  data is ready — no click required to see the default results.
- Switching a **preset** auto-runs (a preset is a curated default).
- Manually editing a **filter field** does **not** auto-run. Current results stay visible
  (stale), and a subtle hint invites the user to Run scan to refresh.
- The Run scan button remains for manual refresh.

## Non-goals

- No debounced "fully reactive" re-run on every keystroke (rejected Approach B).
- No persistence of results across navigations / no new result store (deferred Approach C).
- No change to how snapshots/caches load, or to the scan computation itself.

## Approach

Approach A — **auto-run-on-ready**. The first run becomes automatic; everything after the
first run keeps today's manual semantics.

### 1. Shared hook: `useInitialScan`

New file `src/features/queries/useInitialScan.ts` (colocated with the other query hooks).

```ts
// Fires run() exactly once, when `ready` first becomes true.
// Re-mount (e.g. tab switch that unmounts the view) gets a fresh auto-run.
export function useInitialScan(ready: boolean, run: () => void): void
```

Implementation: a `useRef` "already fired" guard plus a `useEffect` keyed on `ready`. It must
fire only on the `false -> true` transition and never again for the life of the component, so
that a later manual `run.reset()` (which clears `run.data`) does not retrigger it.

This hook is the single shared mechanism; each view supplies its own `ready` boolean and its
own `run` thunk.

### 2. "Stale" affordance

A view's results are **stale** when the live `filter` differs from the filter captured at the
last run (`filterAtRun`), or when a field-only view's inputs differ from the values used in
the last run. When stale and not currently running, show a small hint adjacent to the Run scan
button: `Filters changed — Run scan to refresh`. Stale results stay rendered underneath.

- For QueryBuilder-based views, add an optional `stale?: boolean` prop to
  [QueryBuilder.tsx](../../../src/features/queries/QueryBuilder.tsx); it renders the hint next
  to the existing Run button.
- For field-only views (DcFlip, Movers), render the same hint inline beside their local Run
  scan button.

Staleness derivation: each view already keeps `run.data.filterAtRun` (QueriesView,
MaterialFlip, CurrencyFlip, VendorFlip) or local field state vs. the values baked into the
last `run` (DcFlip, Movers). Compare current filter/fields to the last-run snapshot. Where a
view does not currently store the field values used at run time, capture them into the
mutation result (mirroring the existing `filterAtRun` pattern) so the comparison is exact.

### 3. Per-view wiring

| View | `ready` condition | Presets? | Notes |
|------|-------------------|----------|-------|
| `QueriesView` | `snapshot.data && catalogReady` | yes | `applyPreset` calls `run.mutate()` after `setFilter` (auto-run on preset switch). `onFilterChange` stays manual + marks stale. `useInitialScan` covers first load and deep-links (URL params / `?preset=`). |
| `DcFlipView` | `snapshot.data` | no | `useInitialScan`; field edits manual + stale hint. |
| `MoversView` | `snapshot.data` | no | `useInitialScan`; field edits manual + stale hint. |
| `MaterialFlipView` | `snapshot.data` | yes | `useInitialScan` fires stage-1 `run`; existing `useEffect` continues to chain the ingredient fetch. |
| `CurrencyFlipView` | `snapshot.data && shop.data` | yes (currency) | `useInitialScan`; preset/currency switch auto-runs, field edits manual + stale hint. |
| `VendorFlipView` | `snapshot.data && vendors.data` | yes | same as CurrencyFlip. |
| `BestDealsView` | n/a — already reactive | n/a | No run-gate today; computes directly from snapshot. Verify it still displays defaults on load; no change expected. |

### 4. Empty-state semantics

The "click Run scan to start" empty states (e.g. DcFlip's `⇄` prompt) become unreachable on
the happy path because the scan auto-runs. Keep them only as fallbacks for the **not-ready**
case (catalog still loading) or genuine **zero-result** runs (which already have their own
"No items found" message). Remove the action-button variant that exists solely to start the
first scan.

## Data flow

```
mount
  -> snapshot / shop / vendors / catalog snapshots load (one-time, unchanged)
  -> ready flips true
  -> useInitialScan fires run.mutate() once
  -> fetchMarketData (cache read) + local compute (runQuery / runDcFlip / ...)
  -> results render

user switches preset       -> setFilter + run.mutate()  -> results render
user edits a filter field  -> setFilter only            -> results marked stale + hint
user clicks Run scan        -> run.mutate()              -> results refresh, stale cleared
```

## Error handling

Unchanged. Auto-run uses the same mutation path, so existing `run.isError` /
`StatusBanner` handling applies. If a view is not ready (snapshot failed), the existing error
banners render and `useInitialScan` simply never fires (ready stays false).

## Testing

- `useInitialScan`: fires once on `false -> true`; does not refire on subsequent `ready`
  truthy renders; does not refire after `run.reset()`.
- QueriesView: renders default-preset results without a click once snapshot+catalog ready;
  switching presets re-runs; editing a field shows the stale hint and does **not** re-run
  until Run scan is clicked.
- DcFlip / Movers: default results appear on load; editing a field shows stale hint; Run scan
  refreshes.
- Extend existing `*.test.tsx` for the touched views rather than adding parallel suites.

## Risks

- **Double-run on mount** if both `useInitialScan` and an existing effect fire. Mitigated by
  the ref guard and by auditing each view's existing effects (notably MaterialFlip's
  ingredient-fetch effect, which depends on `run.data` and so only runs *after* the initial
  run — no conflict).
- **One-time snapshot cost surfaced earlier**: auto-running a craft/material preset triggers
  the recipe snapshot load (~5–15s) on first visit instead of on first click. Acceptable and
  already covered by the existing `Spinner` loading states.
