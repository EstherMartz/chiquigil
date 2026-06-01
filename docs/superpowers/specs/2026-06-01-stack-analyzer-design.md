# Stack Size Analyzer — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorm)
**Route touched:** `/item/:id`

## Goal

On the item detail page, show which **stack sizes** an item actually sells as, and which sizes are currently listed — so a seller can spot patterns like "99-stacks barely move, 20-stacks sell fast" and gaps like "20s sell often and nobody's listing them → list 20s."

This is a per-item demand-vs-supply view sliced by stack size. All data is already on the page; no new infrastructure.

## Data sources (both already available)

- **Demand** — 90-day sale history. Each Universalis sale (`HistoryEntry` in `src/lib/universalisHistory.ts`) carries `quantity` (the stack size it sold as), `pricePerUnit`, `timestamp`, `hq`. The block fetches it with `useQuery(['item-history', world, itemId, 90], …)` at the **home-world** scope (where the user sells). 90 days (not 30) for a larger sample on rare big stacks. Same query shape `MarketSnapshotRow` already uses, so React Query dedupes when the scope matches.
- **Supply** — current home-world listings: `phantomMarket.worldListings`. These now carry `quantity` (added in the supply-depth ship, 2026-06-01). Pure, already loaded — no fetch.

## Pure compute — `src/features/items/stackAnalysis.ts`

No I/O; fully unit-tested.

### `soldByStack(entries: HistoryEntry[], hq: boolean): SoldStackRow[]`
- Filters to the requested quality tier.
- Groups by **exact** stack size (`quantity`). FFXIV stacks cluster at 1/5/10/20/50/99, so exact sizes stay readable; no banding.
- Each `SoldStackRow = { stack, sales, units, medianUnitPrice, lastSoldMs }`:
  - `sales` = transaction count in the group.
  - `units` = Σ `quantity`.
  - `medianUnitPrice` = median of the group's `pricePerUnit` values (median to resist RMT outliers, matching the app's existing robustness convention).
  - `lastSoldMs` = most recent `timestamp * 1000`.
- Sorted by `stack` ascending. Empty input → `[]`.

### `listedByStack(listings: WorldListing[], hq: boolean): ListedStackRow[]`
- Filters to the requested quality tier and `price > 0`.
- Groups by exact stack size (`quantity ?? 1`).
- Each `ListedStackRow = { stack, count }` (count = number of current listings at that size).
- Sorted by `stack` ascending. Empty input → `[]`.

### `isStackable(sold: SoldStackRow[], listed: ListedStackRow[]): boolean`
- `true` when any observed stack size (in either list) is `> 1`. Used to suppress the analyzer's tables for non-stackable items (gear) in favour of a one-line note.

### Gap flag (derived in the component, not stored)
- A sold row is a "supply gap" when it has meaningful demand but thin current supply. Concretely: `sales >= max(2, 0.15 * totalSales)` **and** the matching `listedByStack` entry for that stack is absent or `count <= 1`. Rendered as a jade tint + a small "↙ gap" marker on the sold row. Pure presentation; no new data.

## UI — `src/features/items/StackAnalyzerBlock.tsx`

- `SectionHeader label="Stack size analyzer" compact`.
- Shared `QualityTab` NQ/HQ toggle (default NQ), shown only when `canHq`. Filters both facets.
- Two panels in a `md:grid-cols-2` grid:
  - **Sold (last 90d)** — table: `Stack · Sales · Units · ~ price/unit · Last sold` (relative via `fmtRelative`). Gap rows tinted jade with the "↙ gap" marker.
  - **Listed now** — table: `Stack · Listings`, with a small CSS depth-bar (width ∝ count / maxCount).
- States:
  - History loading → `Spinner`.
  - History error → silent (treat as no sales); the supply panel still renders from listings.
  - Not stackable (`isStackable` false) → a single muted note "Always sold as single units — stack analysis doesn't apply." and no tables.
  - Stackable but no sales in 90d → "No sales in the last 90 days." in the Sold panel; Listed panel still renders.

## Mount — `src/routes/Item.tsx`

Mount near the supply-depth / concentration blocks:

```tsx
{phantomMarket && (
  <StackAnalyzerBlock
    itemId={itemId}
    scope={world}
    listings={phantomMarket.worldListings}
    canHq={canHq}
  />
)}
```

The block owns its own history query (so it renders independently of other blocks). Guarded on `phantomMarket` so it doesn't appear before market data resolves.

## Testing

- `soldByStack`: grouping by exact size, sort ascending, median price, units sum, lastSoldMs, HQ filter, empty.
- `listedByStack`: grouping, sort, `quantity ?? 1` default, HQ filter, empty.
- `isStackable`: all-1 → false; any >1 → true; empty → false.
- `StackAnalyzerBlock` render test: sold + listed tables present; not-stackable note; gap marker appears on a high-demand/low-supply row; quality toggle switches tiers. History query mocked (vi.mock the fetch) or fed via a query-client wrapper following existing item-block test patterns.

## Non-goals (this round)

- DC/region-wide stack analysis (home-world only — that's where the user sells).
- Recommending an optimal stack size or auto-pricing — the view informs; the human decides.
- Historical trend of stack-size mix over time (current snapshot + 90-day aggregate only).
- Persisting or exporting the analysis.

## Files

**Modify:**
- `src/routes/Item.tsx` — mount the block.

**Add:**
- `src/features/items/stackAnalysis.ts` (+ `.test.ts`).
- `src/features/items/StackAnalyzerBlock.tsx` (+ `.test.tsx`).
