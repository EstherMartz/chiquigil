# Vendor Flip — Live Filters + Always-Visible Group Chips

**Date:** 2026-06-05
**Status:** Approved, ready for plan

## Goal

Make the Vendor Flip filters feel instant and remove confusing controls:

1. **Live filters** — every filter recomputes the results table immediately from
   data already in memory; no "Run scan to refresh" friction.
2. **"Run scan" → "Refresh prices"** — the button's only remaining job is to
   re-pull fresh live market prices.
3. **Remove the "⟳ Vendors" button** — a rarely-needed escape hatch users find
   confusing.
4. **Group chips always visible** — move the category group chips out of the
   dropdown so they're visible and one-click without focusing the search box.

## Background

`VendorFlipView` ([src/features/insights/VendorFlipView.tsx](../../../src/features/insights/VendorFlipView.tsx))
scans NPC gil-shop items for marketboard flips:

- The initial scan (auto-run on load) fetches live Universalis prices for the
  **candidate items** and stores a `saleMap`.
- Today, `rows` is computed from `run.data.filterAtRun` (the filter frozen at scan
  time) for every gate except `sort`. So changing any threshold/category/HQ filter
  does **not** update the table — it sets a `stale` flag that shows
  *"Filters changed — Run scan to refresh."*
- The numeric thresholds (min profit, markup, sales/day, max listings) and HQ are
  **pure post-filters** over the already-fetched `saleMap` — they need no network.
  Categories only affect which items get fetched.

Key insight: the initial auto-run uses the **default filter (categories empty,
HQ either)**, so it already fetches the **full** candidate set. Every later filter
change therefore only narrows or post-filters data we already hold — nothing needs
a re-fetch except deliberately refreshing prices.

The group chips ([src/components/CategorySelect.tsx](../../../src/components/CategorySelect.tsx),
added earlier today) currently render **inside the dropdown**, so they only appear
after focusing the search input.

## Part A — Live filters + button cleanup

All changes in `VendorFlipView.tsx`.

### A1. Scan the full candidate set, independent of the filter

Introduce `scanIds`: every item in the vendor snapshot, excluding crystals when the
global `hideCrystals` setting is on. This is **independent of `filter`** and is what
the scan fetches. (It equals today's `candidateIds` when the filter is at its
default, which is what the auto-run already uses.)

```ts
const scanIds = useMemo(() => {
  if (!snapshot.data || !vendors.data) return [];
  const out: number[] = [];
  for (const item of snapshot.data.items) {
    if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;
    if (!vendors.data.snapshot.has(item.id)) continue;
    out.push(item.id);
  }
  return out;
}, [snapshot.data, vendors.data, hideCrystals]);
```

The scan mutation fetches `scanIds` (not the filtered list). It no longer needs to
record `filterAtRun`.

### A2. Compute rows from the live filter

```ts
const rows = useMemo(() => {
  if (!snapshot.data || !vendors.data || !run.data) return [];
  return runVendorFlip(snapshot.data.items, vendors.data.snapshot, run.data.saleMap, { ...filter, sort });
}, [snapshot.data, vendors.data, run.data, filter, sort]);
```

`runVendorFlip` already applies categories, HQ, and the numeric gates from the
filter it is given — so passing the **live** `filter` makes every filter instant.

### A3. Remove the stale mechanism

Delete `scanParamsChanged`, the `stale` variable, and `filterAtRun` from
`RunResult`. The "Filters changed — Run scan to refresh" hint is removed.

### A4. Button changes in `FilterBar`

- Remove the **"⟳ Vendors"** button and the `onRefreshVendors` prop.
- Remove the `stale` prop and its hint text.
- Relabel the primary button **"Refresh prices"**. It stays enabled (except while a
  fetch is in flight or the catalog is not ready) and calls the same
  `run.reset(); run.mutate()`.
- Remove the now-unused `useRefreshVendorShopSnapshot` import/usage from the view.
  Leave the hook itself defined in `useVendorShopSnapshot.ts` (other call sites may
  exist; do not delete the export).

### A5. Status line

Keep the existing count line; source the "candidate items" count from `scanIds`
instead of the old filtered `candidateIds`, and keep `· N results` from `rows`.

## Part B — Always-visible group chips (`CategorySelect`)

In `src/components/CategorySelect.tsx`, move the group-chip row so it renders
**above the search input and is always visible** (currently it is the first child of
the `{isOpen && (...)}` dropdown block). Behavior, tri-state styling, and toggle
logic are unchanged — only the position and the `isOpen` gating change.

Because this is the shared component, `QueryBuilder` gets always-visible chips too;
this is intended and consistent. No consumer code changes are required (both already
pass `groups={CATEGORY_GROUPS}`).

## Testing

### `CategorySelect.test.tsx`
- Remove the "focus to open the dropdown" step before clicking chips — chips are now
  always present.
- Keep: add-all, toggle-off, active `aria-pressed=true`, mixed `aria-pressed=mixed`,
  and no-chips-when-`groups`-omitted.

### `VendorFlipView.test.tsx`
- **Rewrite** the two stale-assertion tests ("marks the scan stale when a category
  is selected" and "exposes a Housing group chip that marks the scan stale"): instead
  of asserting the "Filters changed" prompt, assert the **results update live**
  after a filter/group change with **no Run-scan click**. (Adjust the fixture so a
  threshold or category change produces an observable change in rendered rows.)
- Add a test asserting **no "Vendors" button** is rendered.
- Update the primary-button query from `/run scan/i` to `/refresh prices/i` where the
  tests click it.

## Out of scope (YAGNI)

- A "prices fetched X ago" freshness indicator.
- Changing how the global hide-crystals setting interacts with an already-fetched
  scan (toggling it still implies a manual refresh — unchanged from today).
