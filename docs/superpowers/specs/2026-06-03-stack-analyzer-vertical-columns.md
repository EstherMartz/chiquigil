# Stack Size Analyzer — Vertical Diverging Columns

**Date:** 2026-06-03
**Status:** Approved (brainstorm)
**Route touched:** `/item/:id`
**Supersedes the horizontal-rows layout from** `2026-06-03-stack-analyzer-diverging-chart.md`

## Goal

The horizontal diverging chart uses one row per stack size — ~14 rows ≈ 500px of
vertical space. Rotate it: a **vertical** diverging column band collapses every stack
size into a single ~150px-tall chart. Demand (90-day sales) columns grow up, supply
(live listings) columns grow down from a shared stack-size baseline. The "gap" signal
(tall up-column over a stub down-column) is preserved.

No compute changes — `mergeStacks` and `suggestStack` are reused as-is.

## UI — `src/features/items/StackAnalyzerBlock.tsx`

`StackAnalyzerBlock` (query wrapper) and the `StackAnalyzerView` NQ/HQ toggle + empty
states are unchanged. `StackAnalyzerView` additionally computes
`suggestStack(sold, listed)` and passes it to the chart for the caption.

### `StackDemandSupplyChart({ rows, suggestion })` (rewritten vertical)

- `rows: MergedStackRow[]`, `suggestion: StackSuggestion | null`.
- `maxSales = max(1, …rows.sales)`, `maxListed = max(1, …rows.listedCount)` (independent
  up/down scales — sales-count and listing-count are different units).
- Legend: a small `▲ sold (90d)` top label and `▼ listed now` bottom label so the two
  directions are unambiguous.
- One **column per stack**, laid out in a horizontal flex inside an `overflow-x-auto`
  wrapper; each column has `min-w` (~2.5rem) so many sizes scroll horizontally rather
  than growing the page. Each column is a vertical stack of three fixed-height zones:
  - **Demand zone** (~`h-16`): a `flex items-end` container; the bar is a `bg-jade/40`
    div with `height: (sales / maxSales) * 100%`, anchored to the baseline and growing
    up. No bar when `sales === 0`.
  - **Axis label**: the stack size (`font-mono text-text-cream`), with a jade `✓` marker
    when `isGap`. Gap columns also tint their bars a stronger jade.
  - **Supply zone** (~`h-12`): a `flex items-start` container; the bar is a `bg-aether/40`
    div with `height: (listedCount / maxListed) * 100%`, anchored to the baseline and
    growing down. No bar when `listedCount === 0`.
- **Hover detail**: each column carries a native `title` (and matching `aria-label`)
  summarizing the size, e.g. `Stack 2 · 23 sold · 2.0k/u · last sold 2d ago · 2 listed`.
  Parts are omitted when a side is empty (`… · no sales`, `… · none listed`). Native
  `title` is zero-dependency and cannot be clipped by overflow ancestors — no portal.
- **Caption** (always-visible "gap row") below the chart, from `suggestion`:
  - `kind === 'gap'` → `◆ Supply gap at stack {n} — {sales} sold/90d, ~{price}/u, {listed} listed now.`
  - `kind === 'liquid'` → `◆ Most liquid at stack {n} — {sales} sold/90d, ~{price}/u.`
  - `suggestion === null` → no caption.
  Numbers come from the matching `MergedStackRow` (sales, listedCount) plus
  `suggestion.unitPrice`; formatted with `fmtGil`.

### States (unchanged)

- Not stackable → "Always sold as single units — stack analysis doesn't apply."
- Stackable but empty union → "No {NQ/HQ} data in the last 90 days."

## Testing — `src/features/items/StackAnalyzerBlock.test.tsx`

- Replace the `Sold · 90d` / `Listed now` header assertions with the new legend text
  (`sold (90d)` / `listed now`).
- Keep: gap marker renders on a high-demand/thin-supply size; NQ/HQ toggle switches tiers;
  not-stackable note.
- **Add**: the caption names the recommended stack (e.g. the gap row references the right
  stack size and its sold count).

## Non-goals (this round)

- A styled (non-`title`) hover card — native `title` first; styled card is a possible
  later follow-up.
- Any change to `mergeStacks` / `suggestStack` / the data layer.
- DC/region-wide analysis, trend-over-time, export (still out, per the original spec).

## Files

**Modify:**
- `src/features/items/StackAnalyzerBlock.tsx` — rewrite `StackDemandSupplyChart` vertical;
  compute + pass `suggestion` from `StackAnalyzerView`.
- `src/features/items/StackAnalyzerBlock.test.tsx` — legend text + caption assertions.
