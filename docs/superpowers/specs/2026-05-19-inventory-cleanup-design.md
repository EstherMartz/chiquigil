# Inventory Cleanup Helper — Design

**Status:** Spec (pre-plan). To be implemented in a single end-to-end phase, mirroring the cadence used for Shopping List, Levequest Planner, and Material Flip.

## Goal

Given a pasted Allagan Tools / Inventory Tools CSV export, surface a per-item recommendation for what to do with each stack: **craft into something more valuable**, **sell on the Marketboard**, or **vendor / discard**. The screen exists to help the user empty a full inventory without leaving gil on the table or wasting time on items that have no good outcome.

## Non-goals

- No persistence between sessions. Re-paste at the start of each cleanup. Persistence can be added later if needed (Approach 3 in the brainstorm).
- No "buy missing ingredients in bulk" multi-craft planning. The craft suggestions are per-recipe-per-row; the user decides how many to craft.
- No HQ-output prediction. Craft profit assumes NQ output. HQ inputs from inventory still get HQ market valuation.
- No equipped-gear analysis, no glamour-dresser cleanup, no armoury chest. Those buckets typically aren't candidates for "free up space."
- Not on the gilmaking roadmap — this is a spontaneous ask alongside it, similar to how Material Flip was added.

## User flow

1. User clicks "Cleanup" in the nav. Lands on `/cleanup`.
2. Top of the page: a `<textarea>` with placeholder "Paste your Allagan Tools / Inventory Tools CSV here." A small "Clear" button and a "Parse" button (or auto-parse on paste/blur).
3. As soon as the paste is parsed and market data fans out, the three sections appear below:
   - **Craft these (N)** — items the user has enough materials for to craft something with a positive net profit, including buying ≤2 missing ingredients off the MB. Sorted by net craft profit DESC.
   - **Sell on Marketboard (N)** — items with active MB listings and a price meaningfully above NPC vendor price. Sorted by total stack revenue DESC.
   - **Vendor / discard (N)** — items with no useful MB activity. NPC vendor price > 0 → vendor row. Otherwise → discard row. Sorted by total vendor revenue DESC.
4. A row appearing in one bucket implies the bucket's action was the highest-gil-yield option for that item; the user can still ignore the recommendation and act however they like in-game. There is no checkbox / dismiss state — re-pasting after a cleanup re-derives the view.

## Architecture

This is structurally identical to existing gilmaking tools (Levequest Planner, Currency Flip, Material Flip, Shopping List): pure compute over snapshots + Universalis prices, rendered through a React Query–wrapped runner.

### Module layout

- `src/features/cleanup/parseAllaganInventory.ts` — pure CSV-text → `InventoryEntry[]`, column-name flexible.
- `src/features/cleanup/types.ts` — shared types (`InventoryEntry`, `CleanupRow`, `Bucket`, `CleanupResult`).
- `src/features/cleanup/findCraftOpportunities.ts` — pure: given inventory + recipe snapshot + market data + vendor map, return ranked craft suggestions per item.
- `src/features/cleanup/runCleanup.ts` — pure: inventory + market data + vendor map + craft opportunities → `{ craft, sellMb, vendor, discard }` buckets.
- `src/features/cleanup/CleanupResults.tsx` — renders the three sections.
- `src/features/cleanup/AllaganPasteBox.tsx` — paste textarea + parse trigger + parse-error display.
- `src/features/cleanup/CleanupView.tsx` — glues paste box + market-data fetching + results together; uses the existing `useMarketData` / snapshot hooks.
- `src/routes/Cleanup.tsx` — thin route wrapper.

Tests live next to each module (`*.test.ts` / `*.test.tsx`), per repo convention.

### Data sources (all already shipped)

- `useItemSnapshot` — item names, categories, `canHq`, `rarity`. (Needs one schema extension; see below.)
- `useRecipeSnapshot` — `Map<itemResultId, Recipe>` for craft analysis.
- `useMarketData` — Universalis prices for the inventory item set + the small set of "missing ingredients" surfaced by the craft analyzer. Single batched fetch (this hook already supports multi-item queries — same path Watchlist uses).
- `useVendorShopSnapshot` — NPC sells-to-player gil prices (already in IDB / static bundle).

### Schema extension required: NPC buy-from-player price

The current `SnapshotItem` has no field for "what NPCs will pay the player for this item." That value lives in XIVAPI's `Item.PriceLow` field. Without it, the bucketer can't compute "vendor revenue" or "is MB worth it vs vendor."

Plan:
1. Add `priceLow?: number` (optional) to `SnapshotItem`. Optional so any in-flight IDB cache without the field still type-checks; the bucketer treats missing as 0.
2. Update `parseItemSheetPage` in `src/lib/itemSnapshot.ts` to read `PriceLow`.
3. Update `SHEET_FIELDS` to request `PriceLow`.
4. Update the bake script — no code change needed, the existing script re-runs the same `fetchItemSnapshot`.
5. Bump `recipeCache.ts` `DB_VERSION` 9 → 10 and add `database.clear(ITEM_STORE); database.delete(META_STORE, ITEM_SNAPSHOT_TS_KEY)` to the `upgrade()` callback for the v9→v10 transition, so any user with a pre-extension IDB cache gets it wiped and re-hydrated from the new static bundle on next load.
6. Re-run `npm run snapshots` and commit. ~80 KB increase to `items.json`.

## Allagan CSV parsing

Allagan Tools and Inventory Tools both export inventory as CSV with a header row. Columns vary across plugin versions, so the parser detects columns by case-insensitive header name with a small alias table:

| Logical field | Accepted headers |
|---|---|
| Item ID | `Item ID`, `ID`, `ItemId` |
| Item Name | `Item Name`, `Name`, `Item` |
| Quantity | `Quantity`, `Qty`, `Amount`, `Count` |
| HQ flag | `HQ`, `High Quality`, `IsHq` |
| Location | `Location`, `Source`, `Type`, `Inventory` |

**Rules:**
- Header detection is case-insensitive. Whitespace trimmed.
- Item-ID-first preference: if both ID and name are present, the row resolves via ID and the name is used only as a display fallback.
- HQ column accepts `true`/`false`, `1`/`0`, `yes`/`no`, `HQ`/empty.
- Location is normalized to a small set: `bag`, `saddlebag`, `retainer`, `armoury`, `glamour`, `equipped`, `other`. The first three keep the row; everything else drops it silently. (Documented behavior; matches the non-goal.)
- Quantity defaults to 1 if missing or unparseable.
- Same item × HQ flag stacks: if the paste includes multiple rows for the same `(itemId, isHq)` across different locations (e.g., two retainers), the parser sums their quantities and merges to one row, preserving the union of locations as a display hint.
- Rows for unrecognized item IDs (not present in the item snapshot) are kept in the parser output but surfaced in a separate "Unrecognized rows" panel at the bottom of the page so the user knows nothing was silently dropped. This is also how items added in a future game patch (before the next snapshot re-bake) are surfaced.

**Parse-error handling:** If the textarea can't be parsed at all (no recognizable header), display a single error block: "Couldn't detect column headers. Paste should include a header row with at least Item ID or Item Name plus Quantity." No partial parsing.

**Types:**

```typescript
interface InventoryEntry {
  itemId: number;        // 0 if the row only had a name we couldn't resolve
  name: string;          // display name (from snapshot if itemId resolved, else raw CSV)
  qty: number;
  isHq: boolean;
  locations: string[];   // ['bag'], ['retainer'], ['bag', 'saddlebag'], etc.
}
```

## Bucketing algorithm

For each `InventoryEntry`, the runner computes per-action values and assigns the row to its highest-gil bucket. Equal gil → tie-break by craft > MB > vendor > discard (favors active gameplay over passive selling).

### Vendor revenue

```
vendorRevenue = priceLow × qty   // priceLow from extended SnapshotItem
```

If `priceLow === 0` → row is a discard candidate (no vendor will buy).

### Marketboard revenue (home world only for v1)

The home-world MB tier matching the row's HQ flag (NQ tier for NQ rows, HQ tier for HQ rows). Use the existing `pickHighestTrustedTier` helper from `src/lib/priceTrust.ts` to enforce a trust filter (no listings-from-a-decade-ago noise).

```
mbTier = pickHighestTrustedTier(market, { hq: row.isHq ? 'hq' : 'nq', minListings: 1 })
mbRevenue = mbTier?.medianPrice × qty   // 0 if no trusted tier
```

**MB suppression rules** (kicks the row out of "Sell on MB" even if revenue is high):
- No trusted tier at all → not eligible for MB.
- Listings count < 2 → eligible but flagged with a "thin market" pill on the row.
- MB revenue ≤ vendor revenue × 1.1 → not worth listing fees + retainer slot; the row goes to Vendor instead.

### Craft net profit (calls `findCraftOpportunities`)

For the row, find the most profitable craft target (if any) where the user has all-but-≤2 of the ingredients. See next section. If `bestCraftProfit > 0`, the row is eligible for the Craft bucket with that profit as its score.

### Bucket assignment

```
scores = {
  craft:  bestCraftProfit ?? 0,
  mb:     mbEligible ? mbRevenue : 0,
  vendor: vendorRevenue,
}
winner = max(scores)  // with tie-break order: craft > mb > vendor
if (winner === 0) → 'discard'
```

A row is in exactly one bucket. The bucket assignment shows the *recommended* action — but the row's UI still includes the runner-up's gil value so the user can see, e.g., "vendor for 50, but could MB for 60" and override mentally if they want.

## Craft opportunity analysis (`findCraftOpportunities`)

This is the most novel piece. Reference architecture: similar shape to `runMaterialFlip` / `runCraftFlip` — pure function over snapshot + market data, returns a ranked list.

### Inputs

- The full inventory: `Map<{itemId, isHq}, qty>`.
- Recipe snapshot: `Map<itemResultId, Recipe>` from `useRecipeSnapshot`.
- Market data: cached per-item Universalis tiers, used for both "output sell price" and "missing ingredient buy price."
- Vendor map: NPC sell-to-player prices, used as a floor for opportunity-cost on ingredients (if an ingredient has vendor price < MB price, use MB for the opportunity-cost calc).

### Per-recipe evaluation

For each recipe in the snapshot, compute coverage:

```
recipe = recipes.get(outputItemId)
ingredientsNeeded = [{itemId, qty}, ...]   // up to 10 slots per recipe schema
missingIngredients = []
usedFromInventory = []
for (each ing in ingredientsNeeded):
  invQty = inventory.get({itemId: ing.itemId, isHq: false}) ?? 0
           + inventory.get({itemId: ing.itemId, isHq: true}) ?? 0   // either tier counts
  if invQty >= ing.qty:
    usedFromInventory.push({ itemId, qty: ing.qty })
  else:
    missingIngredients.push({ itemId, qty: ing.qty - invQty })

if missingIngredients.length > 2: skip recipe
```

(2 is the cap from the brainstorm; the missing-piece floor exists so the cleanup doesn't suggest "go buy half the recipe.")

### Profit calculation

```
outputPrice    = pickHighestTrustedTier(outputMarket, { hq: 'nq', minListings: 1 })?.medianPrice ?? 0
if outputPrice === 0: skip recipe   // no MB activity for the output

ingredientOpportunityCost = sum over usedFromInventory of:
  max(
    pickHighestTrustedTier(ingMarket, { hq: 'nq', minListings: 1 })?.medianPrice ?? 0,
    ingredientSnapshotItem.priceLow ?? 0
  ) × qty

missingIngredientCost = sum over missingIngredients of:
  pickHighestTrustedTier(ingMarket, { hq: 'nq', minListings: 1 })?.medianPrice × qty
  // if no MB tier exists for a missing ingredient, the recipe is skipped
  // (we don't know what it costs)

netProfit = outputPrice - ingredientOpportunityCost - missingIngredientCost
```

A recipe is only eligible if `netProfit > 0`.

### Per-row best-craft pick

For a given inventory row, the recipe most relevant to it is the recipe **whose output is most profitable AND uses this row's item as an ingredient.** A single inventory item may unlock multiple recipes; we pick the top one for the row's recommendation, and the row gets a "+N more options" indicator that expands into a per-recipe list on click.

**Pragmatic compute cap:** Worst-case combinatorics across 11k recipes × 200 inventory items is bounded but not free. The function does one pass over recipes filtered by "uses at least one inventory item as an ingredient" (reverse-indexed once at the top of the run), then evaluates ingredient coverage per candidate. With the reverse index this stays comfortably under 100ms for realistic inventory sizes.

### Output shape

```typescript
interface CraftOpportunity {
  outputItemId: number;
  outputName: string;
  outputPrice: number;
  netProfit: number;
  usedFromInventory: Array<{ itemId: number; name: string; qty: number }>;
  missingIngredients: Array<{ itemId: number; name: string; qty: number; mbPrice: number }>;
}

type Bucket = 'craft' | 'sellMb' | 'vendor' | 'discard';

interface CleanupRow {
  entry: InventoryEntry;
  vendorRevenue: number;
  mbRevenue: number;
  mbListingCount: number;
  bestCraft: CraftOpportunity | null;
  otherCrafts: CraftOpportunity[];   // up to 4 more, for the "expand" UI
  bucket: Bucket;
  runnerUp: { action: Exclude<Bucket, 'discard'>; value: number } | null;
}
```

## UI layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Inventory Cleanup                                               │
│                                                                 │
│ Paste your Allagan Tools / Inventory Tools CSV below:           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ <textarea, ~8 rows>                                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ [Parse]  [Clear]   "Parsed 142 rows • 134 recognized"           │
│                                                                 │
│ ── Craft these (8) ─────────────────────────────────────────── │
│  Earth Cluster ×42      → Craft: Earthbreak Aethersand   +14k  │
│  Lightning Cluster ×31  → Craft: Bombard Coke             +9k  │
│  ...                                                            │
│                                                                 │
│ ── Sell on Marketboard (47) ────────────────────────────────── │
│  Carbonweave Cloth ×3   12.4k/ea  · trusted NQ tier  ·  37k   │
│  ...                                                            │
│                                                                 │
│ ── Vendor / discard (79) ───────────────────────────────────── │
│  Beech Branch ×17        vendor: 4g  ·  total 68g              │
│  Unmelded Junk ×1        no vendor • discard                   │
│                                                                 │
│ ── Unrecognized rows (8) ───────────────────────────────────── │
│  "Mystery Item X"  qty 4  · not in current snapshot             │
└─────────────────────────────────────────────────────────────────┘
```

Per-row interactions:
- Item name links to `/item/:id` (existing detail page).
- Craft suggestion is itself a tappable disclosure: tapping expands the row to show ingredient usage and any missing-pieces cost. Tap again to collapse.
- `+N more options` link next to the craft suggestion expands to the full per-row craft list.
- HQ marker glyph rendered next to qty when `isHq` (matches existing components).

Styling reuses the table primitives and section headers from `ShoppingListPlan.tsx` / `MaterialFlipResults.tsx`. No new design language.

## Routing & nav

- New route `/cleanup` registered in `src/App.tsx` alongside the other routes.
- New top-nav link in `src/components/Header.tsx`, slotted between "Shopping List" and "Settings" (or wherever fits visually — implementer decides).
- Route uses `useItemSnapshot` + `useRecipeSnapshot` + `useVendorShopSnapshot` + (for market data) `useMarketData` like the Watchlist / Material Flip routes do. All snapshots load from the static bundle on first visit; no XIVAPI traffic for cold cleanup.

## Testing strategy

Per repo convention, pure functions get unit tests with hand-written fixtures and view components get RTL tests with mocked hooks.

- `parseAllaganInventory.test.ts` — header variations, missing-column handling, HQ truthiness, location filtering, duplicate-row merging, malformed input.
- `findCraftOpportunities.test.ts` — full-cover recipe, 1-missing recipe, 2-missing recipe, 3-missing (skipped), no-MB-output (skipped), no-MB-missing-ingredient (skipped), profit ordering, opportunity-cost calculation.
- `runCleanup.test.ts` — bucket assignment per row, tie-breaks, MB-revenue suppression at low listings, vendorRevenue > mbRevenue suppression.
- `CleanupResults.test.tsx` — renders the three sections with sample buckets, "Unrecognized rows" panel appears with unrecognized entries, craft disclosure expands ingredient detail.
- `Cleanup.test.tsx` — route smoke test: pastes a fixture CSV, asserts rows appear under each header. Mocks `useMarketData` to avoid network.

Target ~25-30 new tests; total suite remains under a minute.

## What's deferred

These are explicit non-goals for v1 but worth listing so they don't get reinvented later:

- **Persistent cleanup state** (check off items, resume across reloads). Approach 2/3 in the brainstorm.
- **HQ output prediction** for craft suggestions. Requires the user's crafter stats and a quality-roll model. Out of scope; assume NQ.
- **Cross-DC MB selling** for cleanup. Cleanup is by definition a home-world activity (you can only list from your own retainer). Material Flip handles the cross-DC sourcing case.
- **Desynthesis / aetherial reduction / reduce-to-crystals routes.** These could be additional buckets in a future version; v1 is just craft/MB/vendor/discard.
- **Stackable "what if I sell at world X" pricing.** Out of scope — user lists on home world.
- **Multi-craft batching** (e.g., "you have enough for 8 of these — total profit Y"). The runner suggests one craft; the user does N in-game.
- **Auto-refresh / live re-derive on inventory change.** No game integration. Re-paste to re-run.

## Implementation phase estimate

In line with prior gilmaking phases (Levequest Planner, Material Flip, Shopping List). ~5-8 task blocks in the implementation plan:

1. Schema extension: add `priceLow` to `SnapshotItem`, bump DB version, re-bake.
2. Parser module + tests.
3. Craft analyzer module + tests.
4. Bucketing runner + tests.
5. Results components (Section components + CleanupRow).
6. Paste-box component + parse-error UX.
7. Route + nav wiring + route-level smoke test.

Phases 2-4 are TDD-friendly (pure compute). Phase 5-7 are RTL tests + visual smoke.

## Open questions

None blocking. Decisions locked in via the brainstorm:
- Input: Allagan Tools / Inventory Tools CSV paste only (no manual entry path).
- Craft scope: full + buy-≤2-missing-ingredients.
- Output shape: three buckets, no per-row state.
- Inventory locations parsed: bag / saddlebag / retainer. Armoury / glamour / equipped silently dropped.
- HQ rows separate from NQ rows for the same item ID.
- No persistence; re-paste each cleanup.

If anything in this spec turns out to surprise during implementation (e.g., `Item.PriceLow` doesn't behave as assumed in XIVAPI v2), the implementer reports DONE_WITH_CONCERNS rather than improvising.
