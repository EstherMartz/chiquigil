# Item Path Comparator — Design

**Date:** 2026-06-06
**Status:** Approved (design), pending implementation plan

## Overview

Add a "Compare Paths" feature that helps the player decide what to do with an item
they have or plan to acquire: sell it raw on the Market Board (MB), craft it into one
or more outputs, vendor it, or sell a crafted intermediate. The comparator surfaces all
viable paths side-by-side with consistent, scannable metrics — including stack-volume
profile data — so the player can make a fast, informed decision.

It is **additive**: it does not replace the existing `Craft → sell math` card or the
Batch Planner. It is a single-item decision helper.

## Entry Points

1. **Item page button** — `+ COMPARE PATHS` in the `HeaderBlock` action bar of
   `src/routes/Item.tsx`, alongside `+ Watchlist`, `+ Craft Helper`, `+ Project`. Shown
   **only if** the item has a crafting recipe **or** is used as an ingredient in recipes.
   Same outlined style as `+ Craft Helper` (`border border-aether text-aether px-3 py-2
   hover:bg-aether hover:text-bg-deep` + `font-mono text-[10px] tracking-widest uppercase`).
   Clicking scrolls to the comparator section on the same page.
2. **Standalone page** — `/compare` route, added to the sidebar `NAV_GROUPS` **Planning**
   group between **Batch** (`/craft-batch`) and **Craft Helper** (`/shopping-list`). Has an
   item search input (reuse `GlobalItemSearch` idiom) to look up any item and run the
   comparison independently.

## Paths Computed

For a given source item:

| Path | Condition to show |
|------|-------------------|
| **Sell raw (MB)** | Always |
| **Vendor** | Only if an NPC buys the item (`priceLow > 0`); show that gil price |
| **Craft → [output]** | For each recipe the item is used in — top N outputs sorted by Gil/day desc, cap at **5** by default, with a "show more" toggle for the rest |
| **Craft intermediate** | If the item itself has a crafting recipe — show cost to craft vs buy outright; link/surface the existing `Craft → sell math` card |

## Architecture — 3 layers

### 1. Pure engine — `src/features/compare/comparePaths.ts`

No React, no network. Fully unit-testable (TDD).

Types:

```ts
type PathKind = 'sell-raw' | 'vendor' | 'craft-output' | 'craft-intermediate';
type Effort = 'none' | 'craft' | 'gather-craft';

interface StackProfile {
  stackSizes: { stackSize: number; soldLast90d: number; listedNow: number; avgPricePerUnit: number }[];
  dominantStack: number;        // stack size with highest 90d UNITS sold
  volumeAtBest: number;         // units sold last 90d at dominantStack
  listedAtBest: number;         // current listings at dominantStack
  supplyGap: boolean;           // volumeAtBest > 0 && listedAtBest === 0
  listingEventsPerDay: number;  // unitsMovedPerDay / dominantStack
}

interface PathCard {
  kind: PathKind;
  label: string;                // e.g. "Sell raw (MB)", "Craft → Iron Ingot"
  itemId: number;               // the item actually sold on this path (output for craft paths)
  itemName: string;
  salePrice: number;            // per unit
  matCost: number;              // per unit (0 for raw/vendor sell of source you already hold)
  profitPerUnit: number;        // salePrice - matCost
  velocity: number;             // raw sales/day of the sold item
  unitsMovedPerDay: number;     // effectiveUnitsPerDay(velocity, listingCount)
  gilPerDay: number;            // profitPerUnit * unitsMovedPerDay  ← primary sort metric
  timeToSellHours: number;      // ~ 24 / velocity (1 unit)
  stack: StackProfile;
  risk: string;                 // from riskLabel()
  effort: Effort;
}
```

Functions:

- `buildStackProfile(history, listings, hq, unitsMovedPerDay)` — wraps existing
  `stackAnalysis` (`soldByStack` / `listedByStack` / `mergeStacks`). `dominantStack` = the
  stack size with the highest 90d **units** (`SoldStackRow.units`). `supplyGap` = the merged
  row's `isGap` for the dominant stack (or `volumeAtBest > 0 && listedAtBest === 0`).
- `computePathMetrics({ market, stackProfile, matCost, hq })` — produces sale price (reuse
  `robustSellPrice`), `profitPerUnit`, `unitsMovedPerDay` (= `effectiveUnitsPerDay`),
  `gilPerDay`, `timeToSellHours`, `risk` (`riskLabel`), `effort`.
- `pickWinner(cards, qty)` — returns winning card id. Primary: max `gilPerDay`. Tiebreak 1:
  min `daysToClear(qty)`. Tiebreak 2: min effort rank (none < craft < gather-craft).
- `quantityWarnings(card, qty)` — returns `{ overcrowding?: string; flood?: string }`:
  - **overcrowding** (amber) if `daysToClear > 14`: "At X/day, N units would take ~Y days
    to sell. Consider splitting or choosing a faster path."
  - **flood** (red) if `qty > velocity * 7`: "Crafting this many would likely flood the market."
- `buildSummaryLine(cards, winnerId, qty)` — Verdict-style one-liner, e.g. "Best play:
  Sell raw — 86k/day, clears in under a day. Crafting Iron Ingot yields more per unit but
  would take 2.5 days to move."

Helpers: `daysToClear(card, qty) = qty / card.unitsMovedPerDay`.

### 2. Data hook — `src/features/compare/useComparePaths.ts`

Inputs: `sourceItemId`, `materialSource` ('home' | 'region' | 'self'), `quantity`.

Flow:
1. Read `recipe` (`useRecipeSnapshot`), `usedIn` entries (`useUsedInIndex`), and
   `priceLow` (`useItemSnapshot`).
2. **Bounded fetch strategy** (caps expensive 90d-history calls at ≤6 items):
   - Bulk-fetch *cached* `market` (`fetchMarketData`) for the source item and all used-in
     output items in one multi-id call.
   - Rank used-in outputs by a provisional gil/day (profit × velocity, no stack yet) and
     take the **top 5**.
   - Fetch *live* market (`fetchMarketLive`) + 90d history (`fetchHistoryWithin`,
     `withinSeconds = 90d`) for: source item + the top-5 outputs only.
   - "Show more" lazily fetches the next batch's history on demand.
3. Build a `PathCard` per applicable path via the engine. Compute material cost per the
   selected `materialSource` using the shared `materialCost` util (below).
4. Return `{ cards, winnerId, summary, loading, error, hasMore, loadMore }`.

Use React Query for caching; key on `(scope, sourceItemId, materialSource)`.

### 3. UI — `src/features/compare/`

- `ComparePathsSection.tsx` — the section used by **both** the item page and the standalone
  route. Renders: `SectionHeader` (❖ "Compare Paths"), `CompareControls`, the verdict
  summary line (left teal border like `VerdictCard`), and the horizontal card row. Cards
  are `flex` row with horizontal scroll on desktop when > 3, vertical stack on mobile.
- `PathCard.tsx` — single card matching the spec layout (path label, winner badge, item
  name, sale price, profit/unit, velocity, time-to-sell, gil/day; stack profile block with
  dominant stack, volume at best, listed at best, `★` supply-gap badge, effective
  throughput; risk; effort). Per-card quantity warnings.
- `CompareControls.tsx` — "How many do you have?" number input (default 1) +
  "Materials from" toggle (Home MB / Region / Self-sourced).

Styling tokens (from `tailwind.config.ts`): winner card `border-l-[3px] border-l-aether`;
supply-gap `★` in `text-gold`; overcrowding warning `text-gold` (amber); flood warning
`text-crimson` (red); section heading via `SectionHeader` default ❖ sigil.

## Quantity & Batch Threshold

Top-of-comparator quantity input (default 1). When `quantity > 1`, each card adds:
- **Total profit** = `profitPerUnit × quantity`
- **Days to clear** = `quantity / unitsMovedPerDay` (1 decimal)
- **⚠ Overcrowding** (amber) when days to clear > 14.
- **⚠ Velocity cap / flood** (red) when `quantity > velocity × 7`.

## Material Cost Toggle

"Materials from" toggle with three options matching the item page:
- **Home MB** (default) — ingredient `minNQ ?? minHQ` at home world.
- **Region** — cheapest single world (`findBestSingleStopFor`).
- **Self-sourced** — `selfSourceCost` (recursive gather/craft/currency floor).

Switching recalculates `profitPerUnit` and `gilPerDay` across all cards in real time.

### Targeted refactor: shared `materialCost` util

The cost logic (`recipeMaterialCost`, `findBestSingleStopFor`, `selfSourceCost`) is
currently split between `src/routes/Item.tsx` and
`src/features/items/CraftSellMathCard.tsx`. Lift it into a shared
`src/features/items/materialCost.ts` exporting the three cost functions so the existing
sell-math card **and** the comparator compute material cost identically. The existing card
is refactored to consume the shared util (behavior unchanged); covered by tests.

## Metric Definitions (hybrid model)

- `unitsMovedPerDay = effectiveUnitsPerDay(velocity, listingCount)` — the existing
  competition-share model from `verdict/pricing.ts` (`velocity × 1/(1+listingCount)`).
  This is always ≤ velocity, so the spec's `min(velocity, throughput)` collapses to it.
- **`gilPerDay = profitPerUnit × unitsMovedPerDay`** — primary sort + winner metric.
- **Stack cadence is shown as context, not folded into gilPerDay:**
  `listingEventsPerDay = unitsMovedPerDay / dominantStack`. Surfaced ("Effective
  throughput") and emphasized only when `dominantStack > 1` so it meaningfully changes
  listing effort.
- `timeToSellHours ≈ 24 / velocity` (1 unit). `daysToClear = qty / unitsMovedPerDay`.
- **Effort**: `none` (raw sell / vendor); `craft` (every ingredient has an MB price);
  `gather-craft` (any ingredient lacks MB availability → must gather).
- **Risk**: reuse `riskLabel(confidence, velocity)` → Strong / Steady / Slow seller /
  Low confidence. (The spec's "Strong/Medium/Low/Volatile" is replaced by the app's
  existing taxonomy for consistency.)

## Winner Logic

Primary: highest `gilPerDay` (using `unitsMovedPerDay`, not raw velocity). Tiebreak 1:
lowest `daysToClear` for the given quantity. Tiebreak 2: lowest effort. The winning card
gets a `★ BEST` badge and a teal left border. A one-line `buildSummaryLine` verdict sits
above the cards.

## Reuse Map

| Need | Existing source |
|------|-----------------|
| Stack profile | `src/features/items/stackAnalysis.ts` (`soldByStack`, `listedByStack`, `mergeStacks`) |
| Throughput | `src/features/items/verdict/pricing.ts` (`effectiveUnitsPerDay`, `captureShare`) |
| Sale price | `src/features/items/verdict/pricing.ts` (`robustSellPrice`) |
| Risk label | `src/features/items/verdict/pricing.ts` (`riskLabel`) |
| Material cost | new shared `materialCost.ts` (lifted from `Item.tsx` + `CraftSellMathCard.tsx`) |
| Used-in recipes | `src/features/items/usedInIndex.ts` (`useUsedInIndex`) |
| Recipe lookup | `src/features/queries/useRecipeSnapshot.ts` |
| Vendor buyback price | `priceLow` from `useItemSnapshot` |
| Market + history | `src/lib/universalis.ts`, `src/lib/universalisHistory.ts` |
| Section heading | `src/components/SectionHeader.tsx` (❖) |
| Item search | `src/components/layout/GlobalItemSearch.tsx` |
| Colors | `tailwind.config.ts` (`aether`, `gold`, `crimson`, `jade`) |

## Routing / Sidebar

- `src/App.tsx`: import `Compare`, add `'/compare': 'Compare'` to `PAGE_TITLES`, add
  `<Route path="/compare" element={<Compare />} />`.
- `src/routes/Compare.tsx`: minimal wrapper → item search + `ComparePathsSection`.
- `src/components/layout/Sidebar.tsx`: add `{ label: 'Compare', path: '/compare' }` to the
  Planning group between Batch and Craft Helper.

## Scope Boundaries (v1)

- Does **not** replace the `Craft → sell math` card (additive; links into it).
- Does **not** replace the Batch Planner (single-item helper).
- **No HQ-probability / stats-based crafting modeling** — use the existing "depends on gear"
  placeholder or the existing HQ rate if already computed.

## Testing

- Engine (`comparePaths.ts`): unit tests for `buildStackProfile` (dominant/gap derivation),
  `computePathMetrics`, `pickWinner` (primary + both tiebreaks), `quantityWarnings`
  (overcrowding/flood thresholds), `buildSummaryLine`.
- `materialCost.ts`: tests proving parity with the previous inline behavior (home/region/self).
- Component smoke tests for `PathCard` rendering states (winner badge, supply-gap, warnings).
