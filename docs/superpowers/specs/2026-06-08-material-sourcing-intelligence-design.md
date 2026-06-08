# Material Sourcing Intelligence — Design Spec

**Date:** 2026-06-08
**Branch:** `feature/material-sourcing-intelligence`
**Status:** Approved design, pending implementation plan
**Source:** PRD "Material Sourcing Breakdown on the Crafts Page"

## Problem

The Crafts scan (`/crafts`) shows a single `MATERIALS` cost number per item with no
visibility into *where* those materials come from. A crafter who can gather their own
mats has a fundamentally different profit picture than one who buys everything, but the
app can't express that distinction. Users must context-switch to Craft Helper or a
third-party site to judge whether a margin is real for their playstyle.

## Goals

1. Show, per Crafts row, how much of the material cost is self-gatherable vs. must be bought.
2. Surface a "self-source adjusted profit" — margin assuming the user gathers what they can.
3. Let users filter the scan to items where ≥ N% of material cost (by value) is gatherable.
4. Require **no new user input** and **no new API calls** — reuse data already loaded.

## Non-Goals

- Retainer ventures, fishing, the Gathering page itself.
- Per-job gatherer configuration ("my jobs" filter) — future enhancement; all gatherable
  items are treated as accessible.
- Timed-node timers/alarms.
- Changes to the Craft Helper page.
- Deep-linking the `[GATHERABLE]` tag into the Gathering page (decided out of scope; possible
  fast-follow).

## Key findings from codebase analysis

- **Material cost is NOT decomposed today.** [runCraftFlip.ts](../../../src/features/queries/runCraftFlip.ts)
  calls `computeMaterialCost(recipe, recipeMap, priceMap, {})` with empty flags, so every
  *direct* ingredient is priced at the marketboard via `unitCost`; crafted intermediates are
  priced at MB, not recursed into. (PRD AC#8's "look through to raw ingredients" does not
  match current behavior.)
- **Decision (confirmed):** classify exactly the leaves the cost calc already prices. A crafted
  intermediate counts as **buy**. This guarantees `gatherableCost + buyOnlyCost === totalMaterialCost`,
  needs zero new fetches, and diverges from strict AC#8 only for items containing sub-crafts.
- **The gathering catalog is already loaded on the Crafts page.** `useGatheringCatalog()` runs in
  [QueriesView.tsx](../../../src/features/queries/QueriesView.tsx) for all categories and resolves
  from the static bundle (`loadStaticGatheringCatalog`) with no XIVAPI call in the common case. It
  is currently only *consumed* in gathering mode; we wire it into craft mode.
- **`selfSourceProfit` is free to derive:** `selfSourceProfit = netSale − buyOnlyCost` and
  `profit = netSale − totalMaterialCost`, therefore **`selfSourceProfit = profit + gatherableCost`**.
  No re-pricing required.
- **Classification source:** `GatheringCatalog = Map<itemId, { level, timed, hidden }>`
  ([gatheringCatalog.ts](../../../src/lib/gatheringCatalog.ts)). Crystals are identified by
  `sc === CRYSTALS_SEARCH_CATEGORY` ([commonFilters.ts](../../../src/features/queries/commonFilters.ts)).

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Intermediate handling | Classify direct ingredients only; intermediates = buy. Numbers stay consistent, no new fetches. |
| Self-source sortable | **Yes** — add "Self-source Gil/day" to the Sort dropdown (craft mode only). |
| `[GATHERABLE]` deep-link | **No** — informational tag only for v1. |
| Crystals | Treated as gatherable (free self-source) by default. |

## Architecture

### 1. Leaf-level cost breakdown (refactor — no behavior change)

In [computeProfit.ts](../../../src/features/profit/computeProfit.ts), introduce:

```ts
export interface MaterialLeaf { itemId: number; qty: number; unitPrice: number; }

export function computeMaterialLeaves(
  recipe: Recipe,
  recipeMap: Map<number, Recipe | null>,
  dc: MarketData,
  flags: FlagMap,
  phantom?: MarketData,
  depth?: number,
  mult?: number,            // accumulated quantity multiplier for decomposition
): MaterialLeaf[];
```

It walks the exact same tree `ingredientCost` walks: when `flags[itemId]?.craftIntermediates`
is set and a sub-recipe exists at depth 0, recurse (multiplying `qty` through); otherwise emit
one leaf priced via the existing `unitCost`. `computeMaterialCost` is refactored to
`sum(computeMaterialLeaves(...).map(l => l.qty * l.unitPrice))`, leaving its output identical.
Existing `computeProfit` callers are unaffected.

> Leaves with the same `itemId` need not be merged for cost (sum is identical), but `deriveSourcing`
> will aggregate by `itemId` for display so the tooltip shows one row per material.

### 2. Sourcing classifier (new) — `src/features/profit/materialSourcing.ts`

```ts
export type SourceKind = 'gather-standard' | 'gather-timed' | 'crystal' | 'buy';

export interface IngredientSourcing {
  itemId: number;
  qty: number;
  unitPrice: number;
  subtotal: number;        // qty * unitPrice
  source: SourceKind;
  gatherable: boolean;     // source !== 'buy'
}

export interface MaterialSourcing {
  ingredients: IngredientSourcing[];   // aggregated by itemId, sorted buy-first then by subtotal desc
  totalMaterialCost: number;
  gatherableCost: number;
  buyOnlyCost: number;
  gatherablePct: number;               // gatherableCost / total * 100 (0 when total is 0)
  selfSourceProfit: number;            // profit + gatherableCost
}

export function classifySource(
  itemId: number,
  sc: number | undefined,
  catalog: GatheringCatalog,
): SourceKind;

export function deriveSourcing(
  leaves: MaterialLeaf[],
  scById: Map<number, number>,
  catalog: GatheringCatalog,
  profit: number,
): MaterialSourcing | null;            // null when totalMaterialCost === 0
```

`classifySource`:
- `sc === CRYSTALS_SEARCH_CATEGORY` → `'crystal'`
- `catalog.get(itemId)?.timed === true` → `'gather-timed'`
- `catalog.get(itemId)` present → `'gather-standard'`
- else → `'buy'`

This is intentionally lighter than `craftLists/resolveList.classifyLeaf` — we only need
gather-vs-buy, so no dependency on special-shop / vendor / monster-drop maps.

### 3. Data flow

- [QueriesView.tsx](../../../src/features/queries/QueriesView.tsx): pass `gatheringCatalog.data`
  into `runCraftFlip(...)` and add it to the `derived` `useMemo` dependency array. While the catalog
  is still loading (`undefined`), rows degrade to all-buy; they recompute automatically when it
  arrives.
- [runCraftFlip.ts](../../../src/features/queries/runCraftFlip.ts):
  - Accept a new optional `gathering?: GatheringCatalog` parameter.
  - Build `scById` from the `snapshot` array it already iterates.
  - For each row: `const leaves = computeMaterialLeaves(recipe, recipeMap, priceMap, {})`,
    `materialCost = sum`, `sourcing = gathering ? deriveSourcing(leaves, scById, gathering, profit) : null`.
  - Attach `sourcing` and a precomputed `selfSourceGilPerDay` to the row.
  - Apply the `minGatherablePct` filter post-lookup (see below).
  - Support the `selfSourceGilFlow` sort in `compare()`.

### 4. Row type changes — [types.ts](../../../src/features/queries/types.ts)

```ts
export interface CraftFlipRow {
  // ...existing...
  sourcing: MaterialSourcing | null;
  selfSourceGilPerDay: number;     // selfSourceProfit * velocity (=== gilPerDay when no gatherable mats)
}

export type QuerySort = 'discount' | 'gilFlow' | 'velocity' | 'unitPrice' | 'selfSourceGilFlow';

export interface QueryFilter {
  // ...existing...
  minGatherablePct: number | null;  // default null = no filter
}
```

### 5. Filter: `minGatherablePct`

- `QueryBuilder`: numeric input (0–100, nullable) inserted between *Min gap (gil)* and *Mode*,
  labeled `Min gatherable %` with an `InfoTooltip`: "Only show crafts where at least this % of
  material cost can be self-gathered." Follows the existing nullable-numeric input pattern.
- `queryUrlParams.ts`: add to `DEFAULTS`, encode in `filterToParams` (key `mg`), decode in
  `paramsToFilter`. Round-trips so Copy Link preserves it.
- `runCraftFlip`: when `filter.minGatherablePct != null`, keep a row only if
  `row.sourcing != null && row.sourcing.gatherablePct >= filter.minGatherablePct`. (0-cost items
  have `sourcing === null` and are therefore excluded when the filter is active.)

### 6. Sort: `selfSourceGilFlow`

- `compare()` gains `case 'selfSourceGilFlow': return b.selfSourceGilPerDay - a.selfSourceGilPerDay;`
- `QueryBuilder` `SORTS`: append `{ id: 'selfSourceGilFlow', label: 'Self-source Gil/day' }`
  **only when `filter.mode === 'craft'`** (the dropdown is shared across modes; other modes don't
  produce this metric).

### 7. UI rendering — [CraftFlipResults.tsx](../../../src/features/queries/CraftFlipResults.tsx)

COMFY mode:
- **MATERIALS cell:** line 1 = existing total (unchanged). Line 2 = `↓ {gatherableCost} self` in
  muted jade, smaller font — rendered only when `sourcing && gatherableCost > 0`.
- **MATERIALS hover popover** (`MaterialSourcingPopover`, CSS group-hover like `InfoTooltip`): per
  ingredient `name ×qty — SOURCE — subtotal`, with `Total buy` and `Total self (n items)` footer.
  Buy ingredients show their gil subtotal; gatherable ones show `0*` with a "* assumed self-sourced
  at 0 cost" note. Item names via the snapshot/`useSnapshotById` lookup already available.
- **PROFIT cell:** line 1 = existing profit (unchanged). Line 2 = `↑ +{selfSourceProfit} self` in
  brighter green, smaller font — rendered only when `selfSourceProfit > profit`.
- **`[GATHERABLE]` tag** (`GatherableTag`) when `sourcing && gatherablePct >= 80`, rendered in the
  ITEM cell beside `ItemNameLinks`, styled like the app's existing mono/uppercase border pills.

COMPACT mode:
- Only the `[GATHERABLE]` tag and the MATERIALS hover popover. No secondary lines.

CSV export: add `gatherableCost`, `selfSourcePct`, `selfSourceProfit` columns.

## Edge cases

- **0 material cost** → `sourcing = null` → no second lines, no tag, no popover; excluded by the
  `%` filter when it is set.
- **No gatherable mats** (`selfSourceProfit === profit`) → no second profit line; `selfSourceGilPerDay === gilPerDay`.
- **Catalog still loading** → `sourcing = null` (all-buy); rows recompute when it resolves.
- **HQ/NQ** → gatherable status is independent of HQ mode.

## Testing (Vitest)

- `computeMaterialLeaves`: leaf-sum equals `computeMaterialCost` for representative recipes; qty
  multiplies correctly through a decomposition (flags enabling `craftIntermediates`).
- `materialSourcing`: `classifySource` returns crystal/timed/standard/buy correctly;
  `deriveSourcing` aggregates by itemId, computes `gatherablePct`, asserts
  `selfSourceProfit === profit + gatherableCost`, returns `null` on 0 total.
- `runCraftFlip`: `minGatherablePct` excludes below-threshold and 0-cost rows; `selfSourceGilFlow`
  orders by self-source gil/day; rows carry `sourcing`.
- `queryUrlParams`: `minGatherablePct` round-trips through `filterToParams`/`paramsToFilter`.
- (Optional) component test: `[GATHERABLE]` at ≥80%; compact hides secondary lines.

## Files

**New**
- `src/features/profit/materialSourcing.ts` (+ `materialSourcing.test.ts`)
- `src/features/queries/MaterialSourcingPopover.tsx`
- `src/features/queries/GatherableTag.tsx`

**Modified**
- `src/features/profit/computeProfit.ts` (+ test) — add `computeMaterialLeaves`, refactor `computeMaterialCost`
- `src/features/queries/runCraftFlip.ts` (+ test) — enrich rows, filter, sort, `scById`
- `src/features/queries/types.ts` — `CraftFlipRow`, `QueryFilter`, `QuerySort`
- `src/features/queries/QueriesView.tsx` — pass catalog into `runCraftFlip`, memo dep
- `src/features/queries/QueryBuilder.tsx` — `Min gatherable %` input, mode-aware sort option
- `src/lib/queryUrlParams.ts` (+ test) — encode/decode `minGatherablePct`
- `src/features/queries/CraftFlipResults.tsx` — MATERIALS/PROFIT lines, tag, popover, compact, CSV

## Acceptance criteria mapping

1. Rows with ≥1 gatherable ingredient show the self-source breakdown in MATERIALS (COMFY) — §7.
2. Fully-gatherable items show `[GATHERABLE]` + a higher self-source profit — §7.
3. `Min gatherable % = 50` returns only ≥50% rows — §5.
4. `Min gatherable %` is in the Copy Link URL — §5.
5. Hovering MATERIALS shows per-ingredient source tooltip — §7.
6. COMPACT shows only the tag, no secondary lines — §7.
7. `totalMaterialCost = 0` → no indicator — Edge cases.
8. Sub-recipes: handled per the **direct-ingredient** decision (intermediates = buy); documented
   divergence from the PRD's look-through wording. Numbers stay internally consistent.
9. Adjusted profit never shown when equal to base profit — §7 / Edge cases.
10. No new API calls — catalog already loaded; `selfSourceProfit` derived arithmetically.
