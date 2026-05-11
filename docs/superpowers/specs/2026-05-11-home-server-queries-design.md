# Home-Server Queries — Design Spec

**Date:** 2026-05-11
**Status:** Approved (in conversation)

## Goal

Make the `/queries` route actually useful for a server-locked player who isn't going to travel between worlds. Today the queries scan the whole DC — surfacing a discount whose cheapest listing is on Lich is gil-shaped data that costs an Aetheryte travel to actually exploit.

Three additions land in one shipped feature:

1. **Home/DC scope per-preset** (configurable in the builder). Each preset declares its scope. Mega Value / Fast Sellers / Food & Potions / Furnishings stay DC-wide (discovery). New presets default to home (no travel).
2. **Undersupply preset** — items selling on Phantom with ≤2 listings on Phantom. Craft and list these to fill a real supply gap.
3. **Craft-flip Phantom preset** — craftable items ranked by `(Phantom sale − Phantom material cost) × Phantom velocity`. Reuses existing recipe + profit code over the whole-market snapshot.

## Non-goals

- Server-side recipe pre-fetching. Recipes resolve lazily, after the Universalis fetch has narrowed the candidate set.
- Replacing the existing four DC-scoped presets. They keep working as-is, with `scope: 'dc'` baked into their filter.
- Gil-per-hour ranking. We don't have reliable per-item craft times for whole-snapshot items (the existing `perItemFlags` only covers the user's watchlist), so we stick to gil/day.
- Cross-DC scans. Same constraint as the current `/queries`.

## Architecture

```
Snapshot (existing IndexedDB)
        │
        ▼ filter by category + (filter.hq === 'hq' && !canHq drop) + craftableOnly
candidate ids
        │
        ▼ chunked Universalis fetch on filter.scope === 'home' ? world : dc
priceMap
        │
   craftableOnly?
   ┌──┴──┐
   no    yes
   │      │
   │      ▼ narrow by (velocity ≥ filter.minVelocity)
   │           && (listingCount ≤ filter.maxListings if set)
   │           && (chosen-tier price not null)
   │     narrowed ids   ← typically dozens to low-hundreds
   │      │
   │      ▼ useRecipes(narrowed ids)  ← lazy, only on the small set
   │     recipeMap
   │      │
   │      ▼ runCraftFlip(snapshot, priceMap, recipeMap, filter)
   │     CraftFlipRow[]
   │      ▼
   │    CraftFlipResults
   │
   ▼ runQuery(snapshot, priceMap, filter)
 QueryResultRow[]
   ▼
 QueryResults  (existing)
```

**New modules:**
- `src/features/queries/runCraftFlip.ts` — pure pipeline for craft-flip mode. Reuses `computeMaterialCost` from `src/features/profit/computeProfit.ts`. Returns `CraftFlipRow[]`.
- `src/features/queries/runCraftFlip.test.ts` — TDD coverage.
- `src/features/queries/CraftFlipResults.tsx` — sibling of `QueryResults.tsx`. Renders extra columns (Materials, Profit, Gil/day).

**Modified modules:**
- `src/features/queries/types.ts` — extend `QueryFilter` with `scope`, `maxListings`, `craftableOnly`. Add `CraftFlipRow` type. Update `filterHash` to include the new fields.
- `src/features/queries/presets.ts` — backfill `scope: 'dc'`, `maxListings: null`, `craftableOnly: false` on the existing four presets. Add the two new presets.
- `src/features/queries/presets.test.ts` — assertions for the new fields + new presets.
- `src/features/queries/runQuery.ts` — apply `maxListings` filter. The filter uses `priceMap[id].listingCount` (matches scope automatically because priceMap came from the scope-specific fetch).
- `src/features/queries/runQuery.test.ts` — add 2 tests for `maxListings`.
- `src/features/queries/QueryBuilder.tsx` — three new controls: Scope select, Max listings input, Craftable-only checkbox.
- `src/routes/Queries.tsx` — branch on `craftableOnly`, swap the Universalis target world per `scope`, lazy-trigger `useRecipes` on the narrowed set, render `CraftFlipResults` in craft-flip mode.
- `src/routes/Queries.test.tsx` — add a smoke test for Undersupply that exercises the home-world fetch + recipe path + `maxListings` filter.

## Data shapes

**Extended `QueryFilter`:**
```ts
export interface QueryFilter {
  searchCategories: number[];
  hq: HqMode;
  minDealPct: number;
  minVelocity: number;
  minPrice: number | null;
  maxPrice: number | null;
  sort: QuerySort;
  limit: number;
  // NEW:
  scope: 'home' | 'dc';
  maxListings: number | null;   // null = no cap
  craftableOnly: boolean;
}

export type QueryScope = 'home' | 'dc';
```

**`CraftFlipRow`:**
```ts
export interface CraftFlipRow {
  id: number;
  name: string;
  sc: number;
  unitPrice: number;     // chosen-tier home-world min
  materialCost: number;  // sum of ingredient mins on scope (computeMaterialCost)
  profit: number;        // unitPrice - materialCost
  velocity: number;      // scope velocity
  gilPerDay: number;     // profit × velocity
  hq: boolean;           // tier we used
}
```

**Updated `filterHash`** — add the three new fields to the hash payload so the TanStack Query cache key splits home vs DC results, listing caps, etc.

## `runCraftFlip` (pure)

```ts
function runCraftFlip(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  recipeMap: Map<number, Recipe | null>,
  filter: QueryFilter,
): CraftFlipRow[]
```

Steps:
1. **Category match:** same as `runQuery`.
2. **HQ-capability filter:** if `filter.hq === 'hq'`, drop `canHq === false`.
3. **Price + velocity:** for each candidate, read `priceMap[id]`. Skip if missing. Pick HQ when `canHq && (filter.hq === 'hq' || filter.hq === 'either')` and HQ min exists; else NQ.
4. **maxListings:** drop if `priceMap[id].listingCount > filter.maxListings`.
5. **minVelocity:** drop if `velocity < filter.minVelocity`.
6. **Recipe lookup:** `recipeMap.get(id)`. If `undefined` (not resolved) or `null` (no recipe), drop the row.
7. **Material cost:** `computeMaterialCost(recipe, recipeMap, priceMap, {}, undefined)`. (Empty per-item flags; no `craftIntermediates` recursion in this whole-market view — we don't have flags for items outside the watchlist.)
8. **Profit calc:** `profit = unitPrice - materialCost`. Drop rows where `profit <= 0`.
9. **Filter:** `dealPct` not relevant here; use `minPrice`/`maxPrice` against `unitPrice` if set.
10. **Sort + slice.**

Sort modes for craft-flip:
- `gilFlow` (default) → `gilPerDay` desc.
- `velocity` → `velocity` desc.
- `unitPrice` → `unitPrice` desc.
- `discount` → for parity, treat as profit-pct desc: `profit / unitPrice`. Documented in code.

## `runQuery` change — `maxListings`

Add right after the existing `maxPrice` check:
```ts
if (filter.maxListings != null && m.listingCount > filter.maxListings) continue;
```

`m.listingCount` is the `MarketItem.listingCount` field that already comes from the Universalis parser. When the fetch is home-scoped, this counts home-world listings; when DC-scoped, DC-wide. So `maxListings` semantics tracks `filter.scope` automatically.

## Presets

```ts
const PRESETS: QueryPreset[] = [
  {
    id: 'mega-value-hq', label: 'Mega Value HQ',
    desc: 'HQ items priced ≥1M gil currently discounted ≥30%.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 30, minVelocity: 0,
              minPrice: 1_000_000, maxPrice: null, sort: 'unitPrice', limit: 100,
              scope: 'dc', maxListings: null, craftableOnly: false },
  },
  {
    id: 'fast-sellers-hq', label: 'Fast Sellers HQ',
    desc: 'HQ items with ≥3 sales/day and ≥15% discount, sorted by gil/day.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 15, minVelocity: 3,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'dc', maxListings: null, craftableOnly: false },
  },
  {
    id: 'food-potions', label: 'Food & Potions',
    desc: 'Meals + medicine at ≥20% discount.',
    // Categories: 43 (Medicine), 45 (Meals) — see itemSearchCategories.ts
    filter: { searchCategories: [43, 45], hq: 'either', minDealPct: 20, minVelocity: 0,
              minPrice: null, maxPrice: null, sort: 'discount', limit: 100,
              scope: 'dc', maxListings: null, craftableOnly: false },
  },
  {
    id: 'furnishings', label: 'Furnishings discount',
    desc: 'Housing items at ≥30% discount.',
    filter: { searchCategories: categoriesByGroup('Housing'), hq: 'nq',
              minDealPct: 30, minVelocity: 0, minPrice: null, maxPrice: null,
              sort: 'discount', limit: 100,
              scope: 'dc', maxListings: null, craftableOnly: false },
  },
  // NEW
  {
    id: 'undersupply', label: 'Undersupply (craft + list)',
    desc: 'Items selling ≥1/day on your home world with ≤2 home-world listings. Craft and list to fill the gap.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: 2, craftableOnly: true },
  },
  {
    id: 'craft-flip', label: 'Craft-flip Phantom',
    desc: 'Craftable items ranked by home-world (sale − material cost) × velocity.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: null, craftableOnly: true },
  },
];
```

## UI

`QueryBuilder` adds a third row of controls (slotted into the existing 4-col grid):

```
┌─────────┬─────────────┬─────────────┬─────────────┐
│ HQ      │ Min disc.   │ Min vel.    │ Sort        │
├─────────┼─────────────┼─────────────┼─────────────┤
│ Min ₲   │ Max ₲       │ Limit       │ [Run query] │
├─────────┼─────────────┼─────────────┴─────────────┤
│ Scope   │ Max list.   │ ☐ Craftable only          │
└─────────┴─────────────┴───────────────────────────┘
```

Two new preset chips:
- `[Undersupply]`
- `[Craft-flip Phantom]`

`QueryResults` is left alone. A sibling component `CraftFlipResults` renders `CraftFlipRow[]`:

```
# │ Item                   │ Sale     │ Materials │ Profit   │ Vel │ Gil/day
1 │ Faerie Round Table  ★  │ 480k     │  120k     │  360k    │ 1.2 │ 432k
2 │ …
```

`Queries.tsx` branches: when `filter.craftableOnly === true`, it runs the craft-flip pipeline (price fetch → narrow → recipe fetch → `runCraftFlip`) and renders `CraftFlipResults`. Otherwise the existing path with `QueryResults`.

## Universalis scope plumbing

`Queries.tsx` currently does `fetchMarketData(dc, chunk)`. Change to:
```ts
const target = filter.scope === 'home' ? settings.world : settings.dc;
await fetchInBatches<MarketData[string]>(
  candidateIds,
  async (chunk) => fetchMarketData(target, chunk),
  { chunkSize: 100, concurrency: 4 },
);
```

Note on `MarketItem.worldListings` and `averagePriceNQ/HQ`: when querying a single world, `worldListings` will only show that one world's entries; `averagePrice` is computed per-scope by Universalis. This means home-scoped queries can still compute `dealPct` honestly (home min vs home avg), and `listingCount` reflects the home-world listings.

## Loading states

- Universalis fetch: existing `Spinner label="Fetching prices for N items…"` works.
- New: while `useRecipes(narrowedIds)` is `isLoading` in craft-flip mode, show `Spinner label="Resolving N recipes…"`.
- If recipes errors out (XIVAPI down): existing `StatusBanner kind="error">XIVAPI fetch failed.</StatusBanner>` shape.
- Rows with `recipeMap.get(id) === undefined` are dropped silently. We don't show partial profit data.

## Caching

| Cache | Scope | TTL |
|---|---|---|
| Item snapshot | IndexedDB | Forever (existing) |
| Recipes | IndexedDB | Forever (existing — `recipeCache.ts`) |
| Universalis prices | TanStack Query in-memory | 10 min (existing) |

The TanStack `queryKey` for the bulk Universalis fetch must include `filter.scope` (or be derived from `filterHash`) so home and DC fetches don't share a cache entry.

## Testing

Pure / TDD:

**`runCraftFlip.test.ts`** (~7 tests):
- Drops items with no recipe in `recipeMap` (both `undefined` and `null`).
- Drops items with velocity 0.
- Drops items where chosen-tier price is null.
- Computes correct `materialCost` from a 2-ingredient recipe.
- Computes `gilPerDay = profit × velocity`.
- Applies `maxListings` from filter.
- Sorts by `gilFlow` and slices to `limit`.

**`runQuery.test.ts`** (existing — add 2):
- `maxListings = 2` keeps items with `listingCount <= 2`, drops higher.
- `maxListings = null` is a no-op.

**`presets.test.ts`** (existing — add 3):
- Existing four presets all have `scope: 'dc'`, `maxListings: null`, `craftableOnly: false`.
- `undersupply` has `scope: 'home'`, `maxListings: 2`, `craftableOnly: true`.
- `craft-flip` has `scope: 'home'`, `craftableOnly: true`.

**`Queries.test.tsx`** (existing — add 1):
- Click Undersupply. Snapshot has two items (one with `canHq: true`, one without). Mocked fetch returns: item A — 1 listing, velocity 1, HQ min 1000, averagePriceHQ 1000; item B — 5 listings. Mocked XIVAPI returns a 2-ingredient recipe for A. Result: 1 row, item A, profit > 0. Item B filtered out by `maxListings: 2`.

Recipes are mocked via the same `vi.stubGlobal('fetch', …)` pattern that handles Universalis — `fetchRecipeForItem` uses the global `fetch`.

## Done when

- `npm test -- --run` green.
- `npm run build` clean.
- `/queries` route shows 6 preset chips.
- Clicking **Undersupply** runs a home-world price scan, lazy-fetches recipes for narrowed candidates, and returns only craftable items with `pListings ≤ 2` and Phantom velocity ≥ 1, sorted by gil/day. Empty result if none qualify.
- Clicking **Craft-flip Phantom** does the same minus the listing cap; sort defaults to gil/day; row table shows Materials and Profit columns.
- The four legacy presets still work with `scope: 'dc'`, same UX as today.
- Builder lets the user override Scope, Max listings, and Craftable-only on any preset and re-run.
- No regressions in other parts of the app (Watchlist / Home / Insights unaffected).
