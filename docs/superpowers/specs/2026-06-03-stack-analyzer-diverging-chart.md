# Stack Size Analyzer — Diverging Demand↔Supply Chart

**Date:** 2026-06-03
**Status:** Approved (brainstorm)
**Route touched:** `/item/:id`
**Supersedes the two-table layout from** `2026-06-01-stack-analyzer-design.md`

## Goal

Make the Stack Size Analyzer **visual**. The two side-by-side tables (Sold / Listed)
make a seller cross-reference two grids to spot the thing the block exists to surface:
**stack sizes where demand outstrips supply** (the "gap"). Replace them with a single
diverging chart, keyed by stack size, where demand grows left and supply grows right —
so the gap reads as a long demand bar next to a stub of a supply bar.

No new data, no new dependencies, no chart library — CSS bars, the same technique the
old supply panel's "Depth" column already used.

## Pure compute — `src/features/items/stackAnalysis.ts`

Existing `soldByStack`, `listedByStack`, `isStackable`, `suggestStack` are unchanged.

### New: `mergeStacks(sold, listed, opts?): MergedStackRow[]`

Folds the demand and supply facets into one sorted, per-stack-size view for the chart.

- Input: `SoldStackRow[]` (already grouped) + `ListedStackRow[]` (already grouped).
- Output: one row per stack size present in **either** list (the union), sorted by
  `stack` ascending.
- `MergedStackRow = { stack, sales, units, medianUnitPrice, lastSoldMs, listedCount, isGap }`:
  - Demand fields (`sales`, `units`, `medianUnitPrice`, `lastSoldMs`) come from the matching
    `SoldStackRow`, or zeroes when the size only appears in listings.
  - `listedCount` = matching `ListedStackRow.count`, or `0` when the size only appears in sales.
  - `isGap` reuses the existing rule, computed here so the component stays dumb:
    `sales >= max(2, 0.15 * totalSales)` **and** `listedCount <= 1`, where `totalSales`
    is Σ sales across all sold rows.
- Empty union → `[]`.

Fully unit-tested; no I/O.

## UI — `src/features/items/StackAnalyzerBlock.tsx`

`StackAnalyzerBlock` (query wrapper) is unchanged. `StackAnalyzerView` keeps the NQ/HQ
`useState` toggle and the not-stackable note, but swaps the two-table grid for the chart.

### New pure component: `StackDemandSupplyChart({ rows })`

`rows: MergedStackRow[]`. Renders a column header row plus one chart row per stack:

```
        SOLD · 90d           STACK         LISTED NOW
  2.7k/u  12 ◄████████████   │ 1 ✓ gap │   ████ 1
  2.0k/u  23 ◄███████████████│ 2 ✓ gap │   ██████ 2
  3.4k/u   2 ◄███            │   5     │   ██████████ 5
```

- **Center axis**: stack size label (`font-mono text-text-cream`), with the existing
  `✓ gap` marker (jade) when `isGap`. Gap rows keep the `bg-jade/10` tint across the row.
- **Left (demand)**: a right-aligned bar, width ∝ `sales / maxSales`, `bg-jade/40`.
  Inline label = `sales` count; muted secondary = `~/unit` via `fmtGil`. `title` (hover)
  carries `Last sold {fmtRelative}` so nothing from the old table is lost. When `sales === 0`,
  no bar + muted "—".
- **Right (supply)**: a left-aligned bar, width ∝ `listedCount / maxListed`, `bg-aether/40`
  (same colour the old Depth bar used). Inline label = `listedCount`. When `listedCount === 0`,
  no bar + muted "—".
- **Independent scales**: `maxSales = max(rows.sales)`, `maxListed = max(rows.listedCount)`.
  Demand is a 90-day count and supply is a live count — different units, so each side
  normalizes to its own max. Guard divide-by-zero (`max || 1`).
- Layout: a 3-zone grid per row (`grid-cols-[1fr_auto_1fr]`) so the center axis stays
  aligned regardless of bar lengths. `overflow-x-auto` wrapper as before.

### States (in `StackAnalyzerView`)

- Not stackable (`isStackable` false) → unchanged muted note "Always sold as single units —
  stack analysis doesn't apply."
- Stackable but the merged union is empty (no sales **and** no listings for the tier) →
  "No {NQ/HQ} data in the last 90 days."
- Otherwise → `StackDemandSupplyChart`. Rows with zero on one side render that side as "—";
  no separate empty panel.

## Testing

- `mergeStacks`: union of sizes (sales-only, listed-only, both), sort ascending, demand
  zeroes when listed-only, `listedCount` 0 when sales-only, `isGap` matches the old rule
  (high demand + thin supply true; high demand + ample supply false; low demand false),
  empty → `[]`.
- `StackDemandSupplyChart` / `StackAnalyzerView` render: gap row shows the `gap` marker;
  both demand and supply labels present; NQ/HQ toggle switches tiers; not-stackable note;
  no-data note. Update the existing `StackAnalyzerBlock.test.tsx` — the old assertions on
  "Sold · last 90d" / "Listed now" become the chart's column headers (kept as labels).

## Non-goals (this round)

- The `~/unit`-vs-stack bubble plot (idea C) — out of scope.
- DC/region-wide analysis, optimal-stack auto-recommendation, trend-over-time, export —
  all still out, per the original spec.

## Files

**Modify:**
- `src/features/items/stackAnalysis.ts` — add `mergeStacks` + `MergedStackRow`.
- `src/features/items/stackAnalysis.test.ts` — `mergeStacks` tests.
- `src/features/items/StackAnalyzerBlock.tsx` — add `StackDemandSupplyChart`, rewire view.
- `src/features/items/StackAnalyzerBlock.test.tsx` — chart assertions.
