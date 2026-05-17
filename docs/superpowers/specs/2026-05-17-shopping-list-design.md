# Shopping List — Design Spec

**Date:** 2026-05-17
**Status:** Approved (in conversation)

## Goal

When the user plans a crafting session, they pick several items they want to craft, then need to figure out: what materials do I need, where do I buy them, and what's the total cost vs. expected revenue? Today they do this one item at a time on `/item/:id` (Material Flip drill-down). With multiple items in flight, ingredients overlap and the per-item view doesn't aggregate — they manually tally.

This spec ships a **persistent multi-craft shopping list** at `/shopping-list` that aggregates ingredient demand across N items, runs a single region-wide price scan, and presents two complementary plan views (per-world summary + flat detail table) plus a rollup of total spend / revenue / profit.

## Non-goals

- **NPC vendor / Grand Company / scrip sources.** Deferred until P2-3 (NPC vendor flip) lands; once we have a unified `ItemSource` model, the detail table will gain a "Source" column. v1 is **Marketboard only**.
- **Region parametrization.** Hard-coded to Europe (Chaos + Light), same as Material Flip.
- **Travel cost modeling.** Same approach as Material Flip — flag Light-DC stops with ✈, don't subtract gil.
- **Crafting time / gil-per-day ranking on the list.** This is a session-planning tool, not a profit ranker. Use Watchlist for that.
- **Multi-list / named lists.** Single persistent list. If the user finishes a session, they hit "Clear list" and start fresh.
- **Cross-character or cloud sync.** localStorage only.
- **HQ ingredient sourcing.** Ingredients priced NQ, matching Material Flip / `runCraftFlip`.

## Architecture

```
shoppingListStore (Zustand + persist)
   items: { id, qty, craftIntermediates }[]
        │
        ▼ resolve recipes via useRecipes (existing IDB cache)
recipeMap: id → Recipe | null
        │
        ▼ aggregateIngredients(items, recipeMap)
ingredientDemand: Map<itemId, qty>   // recursed where craftIntermediates=true
        │
        ▼ useMarketData(ingredientIds, world, dc, scope='Europe')
regionPriceMap: id → MarketItem (worldListings span 14 EU worlds)
        │
        ▼ planShopping(ingredientDemand, regionPriceMap, items, recipeMap)
ShoppingPlan {
  perIngredient: { id, qty, bestWorld, bestPrice, isLightDc, listingCount }[],
  byWorldSummary: { world, isLightDc, ingredients: { id, qty, price }[], total }[],
  rollup: { spend, revenue, profit, missingIngredients: number },
}
```

- Compute is pure (`aggregateIngredients`, `planShopping`) — no extra store fields for results, memoized at the route level.
- Re-runs when `items`, `recipeMap`, or `regionPriceMap` change.
- `findBestSingleStop` from `runMaterialFlip.ts` is **not** needed here (per-ingredient best world only, no single-stop optimization). Extraction stays on the deferred-cleanup list; this plan does not pull it forward.

## UI

### Route & nav

- New top-level route `/shopping-list`.
- NavLink in `Header.tsx` between Leves and Settings (positioned next to other planning tools).
- Page title: "Shopping List".

### Page layout

Three vertical sections inside a `max-w-7xl mx-auto px-4` container, matching existing route conventions:

**A. Craft list panel** (top)
- Header row: search input (`GlobalItemSearch`-style autocomplete restricted to craftable items) + qty number input (default 1) + "Add" button.
- List body: one row per item showing name, qty (editable), per-item "Craft intermediates" toggle (`☐ Craft sub-ingredients`), remove button (×).
- Footer: "{N} items" count + "Plan shopping" button (primary) + "Clear list" button (ghost).
- Empty state: "Add items from the watchlist, an item page, or the search box above."

**B. Rollup strip** (middle, only when plan computed)
- Three stat cards in a flex row: **Total material cost** (gil) / **Est. revenue** (Σ item HQ market × qty) / **Net profit** (revenue − spend, jade if >0, crimson if <0).
- If `rollup.missingIngredients > 0`, show a "⚠ {N} ingredients have no listings" sub-line under the spend card.

**C. Plan views** (bottom, only when plan computed)
- **By-world summary cards**: one card per world that contributes, sorted by `total` desc. Card header = world name + ✈ chip for Light DC + total gil. Card body = bullet list of ingredients to buy on that world with qty × price.
- **Flat detail table**: sortable columns — Ingredient | Qty | Best world | Price | Subtotal | (✈ flag column). Uses `SortableHeader` + `ResultTableScaffold` patterns.

### Cross-route entry points

- **Watchlist row**: existing per-item ⚙ menu gains "Add to shopping list" action (alongside existing per-item settings).
- **`/item/:id`**: new `AddToShoppingListButton` next to the existing `AddToWatchlistButton`. Three states matching the watchlist button: "+ Shopping list" / "✓ On list · Remove" / disabled "Not craftable" (when item has no recipe).

### State persistence

- Zustand store with `persist` middleware (key: `shoppingList`).
- Shape: `{ items: { id: number, qty: number, craftIntermediates: boolean }[] }`.
- Actions: `addItem(id, qty?)` (dedupes — increments qty if already present), `removeItem(id)`, `setQty(id, qty)`, `setCraftIntermediates(id, bool)`, `clear()`.

## Edge cases

- **Empty list**: show empty state, no compute, no fetch.
- **Item not craftable**: block at the input — show "Not craftable" inline error, don't add. On already-listed items that lose their recipe after snapshot refresh, render with warning chip and exclude from compute.
- **Ingredient with no listings on any EU world**: render in detail table as "No listings", exclude from rollup costs, count toward `missingIngredients` so totals aren't silently understated.
- **Price fetch fails**: reuse `StatusBanner kind="error"` pattern from `Watchlist.tsx`. Keep the list visible, hide rollup/plan views until retry.
- **Duplicate add**: increment existing row's qty instead of creating a duplicate.
- **Large lists**: cap at 50 items in the UI (warn at 40). Aggregate fetch size is small enough that 50 items × ~6 unique ingredients ≈ 1–3 Universalis batches.
- **Stale prices**: reuse the existing `MarketStateBadge` / staleness chip patterns from `WatchlistTable` in the detail table.
- **localStorage quota**: list payload is tiny (id + qty + bool per row), no realistic risk.

## Testing

Following the repo's existing Vitest + RTL conventions, colocated `.test.ts(x)`.

**Unit tests (pure logic):**
- `shoppingListStore.test.ts` — add/remove/setQty/setCraftIntermediates/clear; dedupe-by-id increments qty; persistence round-trip via store hydration.
- `aggregateIngredients.test.ts` — flat list (no intermediates), recursive (one intermediate craft), mixed; recipe-yield math (e.g. recipe yields 3 → demand divides correctly); missing-recipe item is skipped.
- `planShopping.test.ts` — given aggregated demand + price map, returns per-ingredient cheapest world, by-world summary, and rollup totals; flags Light-DC stops; handles ingredients with zero listings.

**Component tests (RTL):**
- `ShoppingListPanel.test.tsx` — add via search, qty edit, remove, clear; "Not craftable" inline error blocks add; duplicate add increments.
- `ShoppingListPlan.test.tsx` — renders rollup cards with correct totals from mock plan result; renders by-world summary + detail table; ✈ chip shows for Light-DC worlds; missing-listing row renders.
- `AddToShoppingListButton.test.tsx` — three states; wires to store; disabled when not craftable.

**Integration (light):**
- `ShoppingList.test.tsx` (route) — empty state → add 2 items → mock prices → plan renders end-to-end.

Skip: cross-route navigation tests, full Universalis network (mocked at hook level like Material Flip tests).

## Files (anticipated)

**Create:**
- `src/features/shoppingList/shoppingListStore.ts`
- `src/features/shoppingList/aggregateIngredients.ts`
- `src/features/shoppingList/planShopping.ts`
- `src/features/shoppingList/ShoppingListPanel.tsx`
- `src/features/shoppingList/ShoppingListPlan.tsx`
- `src/features/shoppingList/AddToShoppingListButton.tsx`
- `src/routes/ShoppingList.tsx`
- (Tests colocated per file above)

**Modify:**
- `src/App.tsx` — route registration.
- `src/components/layout/Header.tsx` — NavLink.
- `src/routes/Item.tsx` — add `AddToShoppingListButton` next to watchlist button.
- `src/features/watchlist/WatchlistTable.tsx` — "Add to shopping list" in per-item action (or modal).
- `src/features/queries/runMaterialFlip.ts` — extract `findBestSingleStop` to shared util that both consume.

## Phased delivery

v1 ships everything above (Marketboard only). After P2-3 (NPC vendor flip) lands, follow-up adds the "Source" column to the detail table — at that point, ingredient rows show their cheapest source across MB / vendor / GC scrip uniformly.
