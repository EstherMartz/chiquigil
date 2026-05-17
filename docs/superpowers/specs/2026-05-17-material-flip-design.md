# Material Flip — Design Spec

**Date:** 2026-05-17
**Status:** Approved (in conversation)

## Goal

Help the user, who has leveled all crafters, source crafting materials from cheaper worlds across the region so that expensive crafts cost less to make. Today the app's `runCraftFlip` prices ingredients on the home world only — opportunities that would be unlocked by a short World Visit (within DC) or a Datacenter Travel (cross-DC) are invisible.

This spec ships three things together:

1. **Material Flip discovery scan** — a new top-level tab in `/trading` that scans the whole craftables snapshot, prices ingredients region-wide (Europe = Chaos + Light), and ranks craftables by potential material savings.
2. **Per-item drill-down** — a panel on `/item/:id` showing two views of the savings: per-ingredient cheapest world (max savings, multi-hop) and best single-stop world (one-hop realism).
3. **Add to watchlist button on `/item/:id`** — fixes a UX gap the user flagged in the same conversation: today there is no easy in-context way to add an item to the watchlist after discovering it.

## Non-goals

- Rebuilding `AddItemSearch` (the "chaotic" stacked-search component in Settings). The detail-page Add button covers the missing flow; cleaning up `AddItemSearch` is a follow-up if it ends up redundant.
- Travel cost modeling. World Visit within a DC is free with daily attempts and Datacenter Travel is free with daily attempts too; we surface a `needsDcTravel` flag instead of subtracting an estimated gil cost.
- HQ ingredient pricing. Material flips always price ingredients NQ. The HQ filter in this view controls the *sale* side only, matching `runCraftFlip`.
- Sub-craft ingredient breakdown (the `craftIntermediates` flag from `computeProfit`). If the user wants to make a sub-ingredient from raws, that sub-ingredient appears as its own row in the scan.
- Cross-region scans (Japan, NA worlds). The user is on Europe; we hard-code that region for the scan.

## Architecture

```
Snapshot (craftables, IndexedDB)
        │
        ▼ filter by filter.searchCategories + (filter.hq === 'hq' ? canHq : true)
candidate ids (typically a few thousand)
        │
        ▼ chunked Universalis fetch with scope = 'Europe'
regionSaleMap: id → MarketItem (worldListings span all 14 EU worlds)
        │
        ▼ narrow: pickTrustedTier(home tier) != null
        │         && velocity ≥ filter.minVelocity
        │         && listingCount ≤ filter.maxListings
narrowed ids (typically dozens to low hundreds)
        │
        ▼ useRecipes(narrowed ids) — lazy
recipeMap
        │
        ▼ collect union of recipe.ingredients[].itemId across narrowed
        ▼ chunked Universalis fetch with scope = 'Europe' on ingredient ids
regionIngredientMap
        │
        ▼ runMaterialFlip(snapshot, regionSaleMap, regionIngredientMap, recipeMap, filter)
MaterialFlipRow[]
        │
        ▼ filter by filter.minSavings (per craft)
        ▼ sort by selected column (default: gilSavedPerDay desc)
        ▼ slice to filter.limit
        │
        ▼ MaterialFlipResults (ResultTableScaffold + sortable headers)
```

**Why two fetch passes:** craftables come from the snapshot, but most ingredients (woods, ores, fish, vendor items) aren't themselves in the craftables snapshot. Narrowing on sale-side trust first keeps the ingredient fetch small (tens to low hundreds of ingredient IDs rather than thousands).

**Chunking:** both region fetches reuse the existing chunking pattern in the trading/queries codepath (Universalis caps multi-item requests at 100 IDs). No new chunk logic — just pass `scope: 'Europe'` to the same chunked-fetch helper the Queries view uses today.

## Data model

```ts
// New
export interface MaterialFlipRow {
  id: number;
  name: string;
  sc: number;
  hq: boolean;                  // sale-side tier chosen
  salePrice: number;
  velocity: number;

  homeMatCost: number;
  bestPerIngredientCost: number;  // sum of each ingredient's cheapest-anywhere unit price × amount
  perIngredientSavings: number;   // homeMatCost - bestPerIngredientCost

  bestSingleWorld: string;        // world name that minimizes the total basket
  singleStopCost: number;
  singleStopSavings: number;      // homeMatCost - singleStopCost
  needsDcTravel: boolean;         // true when bestSingleWorld is on Light DC

  gilSavedPerDay: number;         // perIngredientSavings × velocity
  pctDiscount: number;            // perIngredientSavings / max(1, homeMatCost)
}
```

**Filter shape** (parallel to `QueryFilter`, not shared — keeps `runQuery` and `runCraftFlip` unentangled):

```ts
export interface MaterialFlipFilter {
  searchCategories: number[];
  hq: HqMode;
  minVelocity: number;
  maxListings: number | null;
  minSavings: number;       // default 1000
  includeLightDc: boolean;  // default true
  sort: MaterialFlipSort;   // default 'gilSavedPerDay'
  limit: number;            // default 200
}

export type MaterialFlipSort =
  | 'gilSavedPerDay'
  | 'savePerCraft'
  | 'pctDiscount'
  | 'salePrice'
  | 'velocity';
```

## Scan view (`/trading` Material flip tab)

A fourth tab in `Trading.tsx` between "Best deals" and "Queries":

```ts
type Tab = 'arbitrage' | 'deals' | 'materialFlip' | 'queries';
```

The view is `MaterialFlipView.tsx`, modeled after `ArbitrageView.tsx` for the surrounding scaffolding and after `runCraftFlip`/`CraftFlipResults` for the inner table.

**Filter bar:**
- Categories (multi-select; same `searchCategoriesByGroup` pattern as Craft-flip)
- HQ mode: NQ / HQ / Either (sale-tier control)
- Min sale velocity (default 1)
- Max listings (default 20)
- Min savings per craft (default 1000)
- Include Light DC (default on)

**Results table columns** (sortable headers per the pattern in commit `de7ead0`; all sortable except `#` and `Item`):

| # | Item | Sale | Home mats | Region mats | Save/craft | % | Best stop | Save/day | Vel |

- `Save/craft` cell: `+17,000` in `text-jade`. Sorts by `savePerCraft`.
- `%` cell: `38%`. Sorts by `pctDiscount`. Hidden on mobile (`hidden md:table-cell`).
- `Best stop` cell: world name with a `✈` icon and `text-text-low` `(Light DC)` sub-text when `needsDcTravel`. Not sortable.
- `Save/day` is the **default sort** (`gilSavedPerDay` desc).
- Both `Save/day` and `%` are explicitly available as sort columns per user's stated preference.

Row click → `navigate(`/item/${id}`)`. The detail page reads a `#material-flip` hash to auto-scroll the drill-down into view.

**States:** loading → `Spinner`; error → `StatusBanner`; empty → `EmptyResults` with copy "No cross-world material savings tonight. Try lowering Min savings, raising Max listings, or including Light DC."

## Per-item drill-down (`/item/:id`)

Renders only when the item has a recipe. Section header: "Material shopping (region)".

**Top summary strip** — two cards side by side:

1. **Per-ingredient cheapest** — home cost, region cheapest sum, savings
2. **Best single stop** — world name, basket cost on that world, savings vs home. Sub-text: `One travel hop, no DC change` OR `Requires DC travel ✈` based on `needsDcTravel`.

**Ingredients table:**

| Ingredient | Need | Home price | Cheapest world | Cheapest price | Save / unit |

- "Cheapest world" cell: world name in `text-jade` when different from home; plain when home is cheapest
- Ingredient name uses `ItemNameLinks` so a craftable ingredient drills further

**Data:** the same `useMarketData` extension powers this. The detail page already calls `useMarketData(priceIds, world, dc)`; we add a `region` argument so callers can opt into region listings. When set, the hook returns `region` map alongside `phantom` (world) and `dc` maps. No new IDB cache shape — `fetchMarketData` already keys by scope, so `Europe` is just another key alongside `Phantom` and `Chaos`.

**States:** no recipe → panel doesn't render; region fetch pending → inline `Spinner`; fetch failed → `StatusBanner` with retry.

## Add to watchlist button (`/item/:id`)

Lives in the item detail header, near the external links.

| Item state | Button label | Action |
|---|---|---|
| Not on watchlist, not in starter pack | `+ Watchlist` | Add via `useWatchlistStore`'s add action with `{id, name, sc, ilvl, crafter}`. Exact method name resolved in implementation. |
| On watchlist (custom item) | `✓ On watchlist · Remove` | Remove via `useWatchlistStore`'s remove action with `id`. |
| In an enabled starter pack | `In starter pack` (disabled) | None; `InfoTooltip` explains "Included via the *<pack name>* pack — disable in Settings to remove". |

**Crafter inference:** when the item has a recipe, map `recipe.craftType` (or whatever field the recipes lib uses for the job) to the `crafter` union. When there is no recipe, `crafter: null` (matches existing `customItems` shape).

**Why on the detail page, not on search results:** per the user's existing feedback ([[ux-search-results]]), search results should be a bounded autocomplete leading to a detail page; rich per-row actions on a stacked result list are the anti-pattern the user called out for `AddItemSearch`.

## Trust, edge cases, and reliability

**Sale-side trust:** reuse `pickTrustedTier` from `runCraftFlip.ts` unchanged. Rows without a trusted home tier are dropped before the ingredient fetch.

**Buy-side trust:** none. Use the raw cheapest NQ `worldListings` entry per ingredient. Rationale: the user is physically traveling to the world; a stale or weird-looking listing is visually verifiable on arrival. Cache freshness is already capped by the 30-min `MARKET_TTL_MS`.

**Edge cases:**
- Recipe with zero ingredients → skip defensively (shouldn't occur)
- An ingredient with no region listings → fall back to home price for that ingredient slot; row still included if total savings still clears `minSavings`
- An ingredient with no listings anywhere (not even home) → treat unit cost as 0 for that slot, same as `computeMaterialCost`'s existing behavior
- Home world IS the cheapest for every ingredient → `perIngredientSavings = 0`, dropped by `minSavings`
- Item is on Light DC's cheapest world AND home is on Chaos → `needsDcTravel: true`, row still included unless `includeLightDc` is off

**DC partition:** `src/lib/europeWorlds.ts` exports `CHAOS_WORLDS` and `LIGHT_WORLDS` as readonly sets plus `dcOf(world): 'Chaos' | 'Light' | null`. Stable static data — no fetching.

## Files

**New:**
- `src/features/insights/MaterialFlipView.tsx`
- `src/features/queries/runMaterialFlip.ts`
- `src/features/queries/runMaterialFlip.test.ts`
- `src/features/queries/MaterialFlipResults.tsx`
- `src/features/items/AddToWatchlistButton.tsx`
- `src/lib/europeWorlds.ts`
- `src/lib/europeWorlds.test.ts`

**Edited:**
- `src/routes/Trading.tsx` — add `materialFlip` tab
- `src/routes/Item.tsx` — render drill-down panel + Add button
- `src/routes/Item.test.tsx` — cover drill-down rendering + Add button state matrix
- `src/features/watchlist/useMarketData.ts` — accept optional `region` scope; return `region` map
- `src/lib/universalis.ts` — no functional change; possibly a `Region = 'Europe'` type alias for clarity

**Out of scope:**
- `AddItemSearch.tsx` rebuild
- Cross-region (NA, JP) support
- Travel cost gil modeling

## Testing

- `runMaterialFlip.test.ts` — per-ingredient cheapest math; single-stop basket optimization (choose world that minimizes basket, not world with the most cheapest ingredients); rows below `minSavings` dropped; `needsDcTravel` flag; HQ filter respects `canHq`; `includeLightDc: false` restricts to Chaos worlds; fallback when ingredient has no region listings.
- `europeWorlds.test.ts` — DC partition for a handful of worlds (Phantom → Chaos, Lich → Chaos, Twintania → Light, unknown → null).
- `Item.test.tsx` (extended) — drill-down panel renders when recipe exists; doesn't render when no recipe; Add button state matrix (not on / on / in starter pack).
- No standalone test for `fetchMarketData` with `Europe` scope — `fetchMarketData` already accepts any scope string and the behavior is identical.

## Open questions

None blocking. Naming of `useWatchlistStore`'s add/remove actions to be confirmed during implementation against the actual store API.
