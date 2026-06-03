# Stack Analyzer — "Terminal" Density Pass + Linked NQ/HQ

**Date:** 2026-06-03
**Status:** Approved (brainstorm)
**Route touched:** `/item/:id`
**Builds on** `2026-06-03-stack-analyzer-polish.md`

Aesthetic target: dense but legible (Bloomberg-terminal feel) — every pixel earns its place.

## 1. Linked NQ/HQ across sections

New shared store so Supply Depth, Seller Concentration, and Stack Analyzer switch together.

- `src/features/items/qualityStore.ts` — zustand `{ hq: boolean; setHq: (hq: boolean) => void }`,
  default `hq: false`, **not persisted** (in-memory; resets to NQ per load).
- `SupplyDepthBlock`, `ConcentrationBlock`, `StackAnalyzerView`: replace local
  `useState(false)` with the store. Effective tier is `hq = canHq && storeHq` (a non-HQ item
  never shows empty HQ data even if the shared pref is HQ). Toggle `onClick` calls `setHq`.
- Tests: add `beforeEach(() => useQualityStore.setState({ hq: false }))` to the three block
  test files (singleton reset; the "toggle to HQ" tests still pass — store update re-renders).

## 2. `QualityTab` active state

Make the active pill obvious: active = filled gold `bg-gold text-bg-deep border-gold`;
inactive unchanged (`border-border-base text-text-low hover:text-text-cream`). Benefits all
three sections.

## 3. Chart — `StackDemandSupplyChart`

### Tight layout
Columns become **fixed-width** (`w-11`, no `flex-1`) and the band hugs its data (left-aligned),
so the sparse NQ case stops stretching into dead canvas; the rare chip sits flush after the
last column. `overflow-x-auto` still scrolls when there are many columns. Fixed equal widths
keep the price-line `x = (i+0.5)/n` geometry exact **and** make labels non-overlapping (each
label is narrower than its column), so every node can be labelled with no collision logic.

### Price line
- **Dots** enlarge to ~10px (`w-2.5 h-2.5`).
- **Label every priced node** with `~{fmtGil(price)}` (gold, `text-[9px]` mono, 4px above the
  dot; flips below when the dot is in the top 25% of the band).
- **Peak node** (max unit price) gets a distinct treatment: larger dot (`w-3 h-3`) + a faint
  outer ring (`ring-2 ring-gold/40`).

### Price-premium axis labels (NOT overloading ✓)
Compute the median of shown per-unit prices. Any stack with `medianUnitPrice > 1.05 × median`
gets a **gold axis label** (the stack number rendered `text-gold`). `✓` keeps its sole meaning
= supply gap. The peak ring + gold labels are the price-premium channel.

### Marker key
Bump contrast to `text-text-dim` and document all marks:
`✓ supply gap · ▾ suggested to list · gold = above-median price`.

### Rare panel → table
Replace the wrap-list with a table styled like **Supply Depth** (`font-mono text-[10px]`
header, `border-t border-border-base` rows, `px-2 py-2`), with a teal left accent
(`border-l-2 border-aether/60`) on the panel. Columns:

| Stack | Units Sold (90D) | Unit Price |
|------|------------------|-----------|

- Rows from `rare.rows` (ascending). `Units Sold` = `row.units`; `Unit Price` =
  `row.medianUnitPrice` via `fmtGil`, or `—` when `sales === 0`.
- Cap at **8 rows**; when more, render a `Show all (N)` / `Show less` toggle
  (local `showAllRare` state). Heading `Rare sizes ({count})` stays.

## Testing — `StackAnalyzerBlock.test.tsx`
- Price-premium: a stack priced >5% above the others renders its axis number in the gold class
  (assert via the element carrying `text-gold` for that stack), and the peak dot has the ring class.
- Every priced node labelled: a 3-stack dataset with 3 distinct prices shows all three `~k` labels.
- Rare table: after expand, the header cells `Units Sold` / `Unit Price` are present, a rare row
  shows its units + price, and a >8-row tail shows the `Show all` toggle that reveals the rest.
- Marker key text updated.
- Existing assertions still pass (with store reset).

`qualityStore`: `setHq` flips `hq`. (Linking itself is covered by the block tests sharing the store.)

## Non-goals
- Persisting the HQ preference across sessions (in-memory only this round).
- Per-label pixel-overlap measurement (fixed-width columns make it unnecessary).
- Drill-down/filtering from the rare table rows.

## Files
**Add:** `src/features/items/qualityStore.ts`.
**Modify:** `QualityTab.tsx`; `SupplyDepthBlock.tsx`; `ConcentrationBlock.tsx`;
`StackAnalyzerBlock.tsx` (+ `.test.tsx`); the three block test files (store reset).
