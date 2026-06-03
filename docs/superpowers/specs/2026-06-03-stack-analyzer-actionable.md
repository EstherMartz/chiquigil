# Stack Size Analyzer — Actionable Chart (collapse tail + price line + hover)

**Date:** 2026-06-03
**Status:** Approved (brainstorm)
**Route touched:** `/item/:id`
**Builds on** `2026-06-03-stack-analyzer-vertical-columns.md`

## Goal

The vertical column chart shows the raw distribution, but real items are heavily
front-loaded (almost all sales at stack 1–2) with a long tail of 1-sale stack sizes.
That tail crowds the axis, forces horizontal scrolling, and dwarfs the smaller bars.
Make the chart **actionable**: collapse the noise, surface per-unit price (the core
"does bulk pay more?" question), and expose exact numbers on hover.

## Data layer — `src/features/items/stackAnalysis.ts`

### New: `partitionStacks(rows, suggestion): { shown, rare }`

- `rows: MergedStackRow[]`, `suggestion: StackSuggestion | null`.
- `totalSales = Σ rows.sales`, `totalListed = Σ rows.listedCount`.
- A row is **shown** when any of:
  - `sales >= RARE_SHARE * totalSales` (demand-relevant), or
  - `listedCount >= RARE_SHARE * totalListed` (supply-relevant), or
  - `isGap`, or
  - `stack === suggestion?.stack` (the recommended pick).
- `RARE_SHARE = 0.05`.
- Everything else is **rare**. Only collapse when `rare.length >= 2`; otherwise keep all
  rows shown and return `rare: null` (a one-size chip isn't worth it).
- Returns `{ shown: MergedStackRow[]; rare: RareSummary | null }` where
  `RareSummary = { count: number; sizes: number[]; totalSales: number; totalListed: number }`.
  `shown` preserves ascending stack order.
- Pure, fully unit-tested.

`mergeStacks` and `suggestStack` are unchanged.

## Chart — `src/features/items/StackAnalyzerBlock.tsx`

`StackAnalyzerView` passes `rows` + `suggestion` as today; the chart calls
`partitionStacks` internally. Scales are computed over **shown** rows only.

### `StackDemandSupplyChart`

1. **Tail collapse** — render only `shown` columns. When `rare` is non-null, append a
   muted trailing chip `+{count} rare sizes` whose `title`/`aria-label` reads e.g.
   `Stacks 7, 9, 12, 38… · 6 sold · 4 listed`. The chip is not a bar — a small bordered
   box at the right of the band. With the tail gone, typical items no longer scroll.

2. **Min bar height** — any non-zero bar gets `min-height: 3px` so a 1-sale stack still
   shows a visible tick. (Chosen over a log scale, which would make bar length
   non-proportional and can't plot zero.)

3. **Price line overlay** — an SVG over the demand band (`preserveAspectRatio="none"`,
   `viewBox="0 0 n H"`, where `n = shown.length`, `H` = demand-zone px height). For each
   shown row with `sales > 0`, plot a point at `x = i + 0.5`, `y` mapped from the row's
   `medianUnitPrice` onto `[0.15H, 0.85H]` inverted (higher price → higher on chart);
   join with a gold polyline + small dots. If every shown price is equal, draw a flat
   mid-line. Columns are equal-width, so `x = i + 0.5` lands at each column centre.
   Rows with `sales === 0` break the line (no point).

4. **Inline legend** — one row above the band: `▲ sold (90d)   ▼ listed now   ◆ ~/unit`,
   replacing the split top-corner labels.

5. **Sweet-spot marker** — the column whose `stack === suggestion?.stack` shows a small
   `▾` badge above its demand bar (in addition to the existing jade tint + `✓` axis mark),
   visually tying the caption to the chart. No marker when `suggestion` is null.

6. **Styled hover card** — replace the per-column native `title` with a portaled card
   (same `document.body` portal + viewport-clamped fixed positioning as `RecipeHover`,
   to escape overflow ancestors). On column `mouseenter`/`focus` the chart records the
   hovered row + the trigger's bounding rect; the card renders **stack size · units sold ·
   {sales} transactions · ~{median}/u · {listedCount} listed** (parts omitted when a side
   is empty). `mouseleave`/`blur` closes it. The rare chip keeps a native `title` (its
   detail is a flat list, not worth a card).

The caption row (`suggestionCaption`) below the chart is unchanged.

### States (unchanged)
Not stackable note; "No {NQ/HQ} data" empty state.

## Testing

`stackAnalysis.test.ts`:
- `partitionStacks`: sub-5% tail collapses; a tiny gap stack stays shown; a tiny
  recommended stack stays shown; a supply-heavy/no-sales stack stays shown; `rare: null`
  when ≤1 would-be-rare row; `RareSummary` counts/sizes/sums correct.

`StackAnalyzerBlock.test.tsx`:
- Legend includes the `~/unit` marker.
- `+N rare sizes` chip renders when there's a collapsible tail, and does *not* render for
  a small item with no tail.
- Hovering a column opens a card showing that stack's exact numbers (units, transactions,
  price, listings); leaving closes it.
- The recommended column carries the sweet-spot marker.
- Existing assertions (legend text, caption names recommended stack, NQ/HQ toggle,
  not-stackable note) still pass.

## Non-goals
- Log-scale Y axis (replaced by min-height).
- Expanding the rare chip into a drill-down list (its `title` lists the sizes; a click-to-
  expand is a possible later follow-up).
- Any change to `mergeStacks` / `suggestStack` / the data fetch.

## Files

**Modify:**
- `src/features/items/stackAnalysis.ts` (+ `.test.ts`) — `partitionStacks` + `RareSummary`.
- `src/features/items/StackAnalyzerBlock.tsx` (+ `.test.tsx`) — collapse, price line,
  legend, sweet-spot marker, styled hover card.
