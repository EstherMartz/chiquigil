# Batch & Shopping List Polish

Four targeted improvements to align the craft batch planner with the shopping list and fix a crystal-filtering bug.

## 1. Batch Estimate Disclaimer

**Problem:** Batch summary cards show material cost and revenue numbers that differ from the shopping list, causing confusion.

**Root cause:** Batch uses `computeMaterialCost` (DC-level `minNQ`) and `pickFirstTrustedTier` (trust-capped sale price) for fast ranking. Shopping list uses `surveyIngredients` (cheapest EU-wide NQ per ingredient, cross-world) and raw `minHQ`/`minNQ` for revenue. Different pricing strategies serving different purposes.

**Solution:** Add a single-line disclaimer below the batch summary cards:

> *Estimates for ranking — see Shopping List for final costs*

Styled `text-text-dim font-mono text-[11px]`, right-aligned under the summary grid.

**Files:** `src/features/craftBatch/CraftBatchView.tsx`

## 2. Post-Send Navigation

**Problem:** After clicking "Send to Shopping List", user has no easy way to get to the shopping list.

**Solution:** After adding items, navigate to `/shopping-list` using `useNavigate` from react-router-dom.

**Files:** `src/features/craftBatch/CraftBatchView.tsx`

## 3. Craft-All Sub-Ingredients Toggle

**Problem:** Each shopping list item has an individual "Craft sub-ingredients" checkbox. No way to toggle all at once.

**Solution:**
- Add `setAllCraftIntermediates(value: boolean)` action to `useShoppingListStore`
- Add a checkbox in the shopping list footer bar (next to "{n} items") with label "Craft all sub-ingredients"
- Three states: unchecked (none set), checked (all set), indeterminate (mixed)
- Clicking when indeterminate or unchecked sets all to true; clicking when checked sets all to false

**Files:**
- `src/features/shoppingList/shoppingListStore.ts` — new store action
- `src/features/shoppingList/ShoppingListPanel.tsx` — toggle checkbox in footer

## 4. Crystal Filtering in Shopping List

**Problem:** When `hideCrystals` is enabled in settings, crystals (shards, crystals, clusters — search category 58) still appear in the shopping list ingredient breakdown.

**Root cause:** `aggregateIngredients` outputs raw ingredient IDs from recipes. Crystal filtering is never applied to these IDs — it's only applied to top-level item lists elsewhere.

**Solution:** After `aggregateIngredients` produces the `demand` map, filter out any ingredient IDs whose snapshot `sc === CRYSTALS_SEARCH_CATEGORY` before passing to `surveyIngredients`. This removes crystals from the plan, rollup spend, ingredient table, and by-world cards.

**Where to filter:** In the shopping list route/page component that orchestrates the plan, before calling `surveyIngredients`. Need access to snapshot items to resolve `sc` for each ingredient ID.

**Files:**
- Shopping list route component (where `aggregateIngredients` result flows into `surveyIngredients`)
- Import `CRYSTALS_SEARCH_CATEGORY` from `../queries/commonFilters`
- Import `hideCrystals` from settings store
