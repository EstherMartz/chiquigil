# Stack Size Analyzer — Readability Polish

**Date:** 2026-06-03
**Status:** Approved (brainstorm)
**Route touched:** `/item/:id`
**Builds on** `2026-06-03-stack-analyzer-actionable.md`

## Goal

Make the chart's markers self-explanatory: the price line needs reference values, the
rare chip needs a way to see what's inside, and the `✓`/`▾` marks need a key.

## Data layer — `src/features/items/stackAnalysis.ts`

`RareSummary` gains the underlying rows so the expandable chip can show per-size volumes:

```ts
export interface RareSummary {
  count: number;
  sizes: number[];
  totalSales: number;
  totalListed: number;
  rows: MergedStackRow[]; // NEW — the collapsed stacks, ascending
}
```

`partitionStacks` populates `rows: rareRows`. No logic change; existing aggregates stay.

## Chart — `src/features/items/StackAnalyzerBlock.tsx`

### 1 + 3. Price markers + range labels

- Render price points as **positioned HTML dots** (absolute divs over the relative column
  band), not SVG circles — avoids the non-uniform `viewBox` distortion. Each priced column
  `i` gets a ~4px gold dot at `left: ((i + 0.5) / n) * 100%`, `top: MARKER_H + priceY(price)`.
  Keep the existing SVG polyline for the connecting line.
- **Value labels at the price extremes only.** Find the shown rows with the min and max
  `medianUnitPrice` (among `sales > 0`); render a small gold `~{fmtGil(price)}` label at each,
  with a `bg-bg-card/90` chip background for legibility over the bars. Placement: above the
  dot by default; if the dot sits in the top ~25% of the band, place the label below it so it
  doesn't clip. When all priced stacks share one price, show a single mid-line label.

### 2. Expandable rare chip

- The `+N rare sizes` chip becomes a `<button>` with `aria-expanded`. Clicking toggles a
  panel rendered below the chart band (above the caption):
  - A `flex-wrap` list of per-size entries from `rare.rows`, each
    `font-mono text-[10px]`: `{stack}: {sales} sold · {listedCount} listed`
    (omit a side when zero → `… · none listed`). `max-h-32 overflow-y-auto` when long.
  - Heading: `Rare sizes ({count})`.
- The chip keeps its `title` for the hover summary; the panel is the click-to-expand detail.
- Local `useState` `rareOpen` in `StackDemandSupplyChart`.

### 4. Marker key

- A muted footnote under the chart band: `✓ supply gap · ▾ suggested to list`
  (`font-mono text-[10px] text-text-low`). Static — documents both marks in one place.

The legend (`▲ sold (90d) ▼ listed now ◆ ~/unit`), caption, hover card, sweet-spot marker,
min-bar floor, and tail-collapse are unchanged.

## Testing — `StackAnalyzerBlock.test.tsx`

- Price extreme labels: a dataset with distinct per-unit prices renders the max-price value
  (e.g. `~3.4k`) somewhere in the chart.
- Marker key: `✓ supply gap` and `▾ suggested` text present.
- Rare chip expand: the chip is a button; after `click`, a rare size and its volume appear
  (e.g. `10: … sold`); they are absent before the click.
- Existing assertions (legend, caption, hover card, sweet-spot marker, no-tail) still pass.

`stackAnalysis.test.ts`: `partitionStacks` rare result includes `rows` matching the collapsed
sizes.

## Non-goals
- Per-point labels on every price dot (extremes only).
- A full Y-axis with gridlines (the two extreme labels + hover give the scale).
- Drill-down navigation from the rare panel (it lists sizes; clicking through to filter is a
  later possibility).

## Files

**Modify:**
- `src/features/items/stackAnalysis.ts` (+ `.test.ts`) — `RareSummary.rows`.
- `src/features/items/StackAnalyzerBlock.tsx` (+ `.test.tsx`) — dots, range labels,
  expandable rare panel, marker key.
