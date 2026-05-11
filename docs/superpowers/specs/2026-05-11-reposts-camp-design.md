# Reposts (Camp) — Design Spec

**Date:** 2026-05-11
**Status:** Approved (in conversation)

## Goal

Add a "Reposts (camp)" preset to `/queries` that surfaces items where someone undercut their own market and left a big gap below the next price on the home world. Buy the cheapest listing, relist just under the wall, pocket the gap minus Universalis's 5% sale tax. The classic camp-the-board play, but data-driven.

## Non-goals

- Auto-refresh / push notifications. The user manually clicks "Run query" to refetch.
- Cross-world price comparison (you can't travel to grab the cheap one and resell on your home world without leaving — out of scope for this server-locked tool).
- Tracking individual listings over time. Each run is a fresh snapshot.

## Architecture decision: introduce `QueryFilter.mode`

The existing `QueryFilter.craftableOnly: boolean` only distinguished two pipelines. With Reposts we have three: standard runQuery, craft-flip, repost. Time to upgrade.

**Replace `craftableOnly: boolean` with `mode: 'standard' | 'craft' | 'repost'`.**

| Old | New |
|---|---|
| `craftableOnly: false` | `mode: 'standard'` |
| `craftableOnly: true` | `mode: 'craft'` |
| (new) | `mode: 'repost'` |

This touches:
- `types.ts` — drop `craftableOnly`, add `mode` + `QueryMode` + `minGap`.
- `filterHash` — replace `co` key with `m: f.mode`, add `g: f.minGap`.
- All six existing presets — translate `craftableOnly` to `mode`.
- `QueryBuilder` — replace the "Craftable only" checkbox with a Mode select.
- `Queries.tsx` — switch branch on `filter.mode`.
- `runQuery.ts` — irrelevant, only checks filter fields not `mode`.
- `narrowForCraftFlip` / `runCraftFlip` — irrelevant, called explicitly by route.
- Existing tests that referenced `craftableOnly` — translate to `mode`.

## Architecture diagram

```
Snapshot (existing IndexedDB)
        │
        ▼ filter by category + hq-capability
candidate ids
        │
        ▼ Universalis fetch on (scope === 'home' ? world : dc)
priceMap
        │
        ▼ switch on filter.mode:
   ┌────┼────────┐
 'standard'  'craft'  'repost'
   │         │         │
   │         ▼         │
   │   narrow → useRecipes (lazy) → runCraftFlip
   │         │         │
   │         ▼         ▼
runQuery  runCraftFlip  runRepost
   │         │         │
   ▼         ▼         ▼
QueryResults  CraftFlipResults  RepostResults
```

## Data shapes

**Extended `QueryFilter`:**
```ts
export type QueryMode = 'standard' | 'craft' | 'repost';

export interface QueryFilter {
  searchCategories: number[];
  hq: HqMode;
  minDealPct: number;
  minVelocity: number;
  minPrice: number | null;
  maxPrice: number | null;
  sort: QuerySort;
  limit: number;
  scope: QueryScope;
  maxListings: number | null;
  mode: QueryMode;        // replaces craftableOnly
  minGap: number | null;  // NEW
}
```

**`RepostRow`:**
```ts
export interface RepostRow {
  id: number;
  name: string;
  sc: number;
  cheapest: number;     // home-world min for the picked tier
  wall: number;         // next strictly-higher home-world price on that tier
  gap: number;          // wall − cheapest
  gapPct: number;       // round((gap / wall) × 100)
  taxedProfit: number;  // round(wall × 0.95 − cheapest)
  velocity: number;
  gilPerDay: number;    // taxedProfit × velocity
  hq: boolean;
}
```

**Updated `filterHash`:**
```ts
return JSON.stringify({
  sc: [...f.searchCategories].sort((a, b) => a - b),
  hq: f.hq,
  d: f.minDealPct,
  v: f.minVelocity,
  p: [f.minPrice, f.maxPrice],
  s: f.sort,
  l: f.limit,
  scope: f.scope,
  ml: f.maxListings,
  m: f.mode,
  g: f.minGap,
});
```

## `runRepost` (pure)

```ts
function runRepost(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  filter: QueryFilter,
): RepostRow[]
```

Pipeline:

1. **Category match** — same as `runQuery` / `runCraftFlip`.
2. **Velocity + listings** — drop items below `minVelocity`; drop items above `maxListings` (when set).
3. **Tier selection:** decide which tiers to evaluate per `filter.hq`:
   - `'hq'` → `[HQ]`, but skip the item if `!item.canHq`.
   - `'nq'` → `[NQ]`.
   - `'either'` → `[HQ, NQ]` (drop HQ from list if `!item.canHq`).
4. **For each tier:** read `m.worldListings`, filter to that tier (by `l.hq`), sort prices ascending. Need at least 2 listings. Find `wall = prices.find(p => p > prices[0])` — the first strictly-higher price. If no `wall`, skip this tier (ties at the bottom).
5. **Pick best:** among all tiers that survive, pick the one with the largest `(wall − cheapest)`. Record the picked tier's `isHq` flag.
6. **Compute:** `gap = wall - cheapest`, `gapPct = round(gap / wall × 100)`, `taxedProfit = round(wall × 0.95 - cheapest)`.
7. **Threshold filters:** drop the item if any of these fail:
   - `filter.minGap != null && gap < filter.minGap`
   - `gapPct < filter.minDealPct`
   - `taxedProfit <= 0`
   - `filter.minPrice != null && cheapest < filter.minPrice`
   - `filter.maxPrice != null && cheapest > filter.maxPrice`
8. **Build row** with `gilPerDay = taxedProfit × m.velocity`.
9. **Sort** by `filter.sort`:
   - `gilFlow` → `gilPerDay` desc
   - `discount` → `gapPct` desc
   - `unitPrice` → `cheapest` desc
   - `velocity` → `velocity` desc
10. **Slice** to `filter.limit`.

**Tax assumption:** retainer-board sales incur 5% Universalis tax. Implementation rounds with `Math.round(wall × 0.95 - cheapest)`. Undercut margin (listing at `wall − 1`) is ignored as noise.

**`worldListings` scope:** when `filter.scope === 'home'`, Universalis returns listings only for the home world, so `worldListings` is already correctly scoped. Reposts preset locks `scope: 'home'` so we never hit a DC-wide multi-world listings array.

## Preset

```ts
{
  id: 'reposts', label: 'Reposts (camp)',
  desc: 'Home-world items where the cheapest listing is ≥10k below the next price (gap ≥30%). Buy + relist for instant gil.',
  filter: { searchCategories: [], hq: 'either', minDealPct: 30, minVelocity: 1,
            minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
            scope: 'home', maxListings: null, mode: 'repost', minGap: 10_000 },
},
```

Total preset count goes from 6 to 7. Order on the chip strip: DC presets first (Mega Value HQ, Fast Sellers HQ, Food & Potions, Furnishings), then home craft presets (Undersupply, Craft-flip Phantom), then the camp preset (Reposts).

## UI

**QueryBuilder.tsx** — two changes:

1. **Mode select** replaces "Craftable only" checkbox. The control sits in the same grid cell:
```tsx
<label className="block">
  <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Mode</span>
  <select value={value.mode} onChange={(e) => patch({ mode: e.target.value as QueryMode })}
    className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm">
    <option value="standard">Standard</option>
    <option value="craft">Craft-flip</option>
    <option value="repost">Reposts</option>
  </select>
</label>
```

2. **Min gap input** added next to Max listings (sensible grid placement). Number, nullable. Tooltip clarifies "absolute gil floor for repost gap".

**RepostResults.tsx** — new sibling of QueryResults / CraftFlipResults. Columns:

```
# │ Item               │ Cheapest │ Wall    │ Gap    │ %    │ Profit (after tax) │ Vel │ Gil / day
1 │ Pixie Cotton ★     │ 80k      │ 150k    │ +70k   │ 47%  │ +62k               │ 1.5 │ 93k
```

Cells use existing `fmtGil`, `categoryLabel`, jade for positive deltas, gold-hi for headline gil/day. Mobile-hides `Wall`, `Gap` (raw), `Velocity` columns.

**Queries.tsx** — `derived` useMemo switches on `filter.mode`:

```tsx
switch (f.mode) {
  case 'craft':
    if (run.data.narrowedIds.length === 0) return { kind: 'craft', rows: [] };
    if (!recipes.data) return null;
    return { kind: 'craft', rows: runCraftFlip(snapshot.data.items, run.data.priceMap, recipes.data, f) };
  case 'repost':
    return { kind: 'repost', rows: runRepost(snapshot.data.items, run.data.priceMap, f) };
  case 'standard':
  default:
    return { kind: 'query', rows: runQuery(snapshot.data.items, run.data.priceMap, f) };
}
```

The mutation's `narrowForCraftFlip` call only fires when `f.mode === 'craft'` (same condition as the old `f.craftableOnly`). The "N narrowed for recipe lookup" hint also only renders for craft mode. `useRecipes(narrowedIds ?? [])` still works because narrowedIds is empty for non-craft modes.

Spinner for repost mode is the same Universalis "Fetching prices…" — no second wait step. Empty state in RepostResults: "No repost opportunities. Lower Min gap, lower Min discount %, or widen categories."

## Caching

No change. Universalis price results still cache per `filterHash` in TanStack Query (10 min). Item snapshot still cached forever in IndexedDB. The `mode` field gets included in `filterHash`, so each pipeline's results cache independently.

## Testing

**`runRepost.test.ts`** — ~9 tests:
- Drops items below `minVelocity`.
- Drops items with `< 2` listings on the relevant tier.
- Skips ties at the bottom (all sellers at the same price → no wall).
- Computes `gap`, `gapPct`, `taxedProfit` correctly (use a concrete example: cheapest 100, wall 200 → gap 100, gapPct 50, taxedProfit = round(200×0.95 − 100) = 90).
- Drops items below `minGap`.
- Drops items below `minDealPct` (treated as gap percentage).
- Picks the larger-gap tier when both NQ and HQ qualify.
- Respects `filter.hq` ('hq' considers only HQ; 'nq' only NQ; 'either' considers both).
- Sorts by `gilFlow` / `discount` correctly + slices to `limit`.

**`runQuery.test.ts`** — `baseFilter` translates `craftableOnly: false` → `mode: 'standard'`, adds `minGap: null`.

**`runCraftFlip.test.ts`** — same translation, plus `mode: 'craft'` in the file's `baseFilter`.

**`presets.test.ts`** — update existing assertions: the test that checks "existing four presets default to dc scope, no list cap, non-craftable mode" becomes "...mode: 'standard'". The Undersupply / Craft-flip assertions become `mode: 'craft'`. Add a new assertion for the Reposts preset: `mode: 'repost'`, `scope: 'home'`, `minGap: 10_000`.

**`Queries.test.tsx`** — Smoke test for Reposts:
- Seed snapshot with 2 items: id 300 (Pixie Cotton, NQ-only) with 5 listings (1 at 80k, 4 at 150k → gap 70k, gapPct 47%); id 301 (Tied Sellers) with 3 listings all at 100k (no wall, should be filtered).
- Mock Universalis fetch to return appropriate `worldListings` for both.
- Click Reposts → click Run.
- Assert "Pixie Cotton" renders. Assert "Tied Sellers" does not.

## Done when

- `npm test -- --run` green (~198 tests; 189 + 9 runRepost tests + 1 smoke).
- `npm run build` clean.
- `/queries` shows 7 preset chips. Clicking **Reposts (camp)** scans home-world prices, returns items with gap ≥ 10k AND ≥ 30%, tax-adjusts the profit, sorts by gil/day. Renders `RepostResults`.
- QueryBuilder shows a **Mode** select (Standard / Craft-flip / Reposts) + a **Min gap** input. Switching the mode flips pipelines on the next Run.
- Existing presets work unchanged in behavior: Standard / Craft pipelines still produce identical results.
- No regressions in other features (Watchlist, Home, Insights, Settings unaffected).
