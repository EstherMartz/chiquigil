# Craft Batch Planner — Design Spec

## Problem

At 8M gil, the user crafts batches of 5–10 items and lists them on the MB, then relists as things sell. Today there's no tool that helps pick a **diversified, budget-aware batch**. The craft flip table ranks individual items but doesn't account for category concentration or total capital at risk. The user ends up eyeballing it.

## Solution

A new `/craft-batch` route that auto-generates an optimized crafting batch and lets the user edit it before sending everything to the Shopping List.

## Core Algorithm

### 1. Score Pool

Reuse `runCraftFlip` logic (recipe snapshot × market data) to produce a scored pool of craftable items. Each entry has:

- `itemId`, `name`, `category` (search category from item snapshot)
- `materialCost` (via `computeMaterialCost`)
- `salePrice` (via `pickFirstTrustedTier` — HQ-preferred, DC then phantom)
- `profit` (salePrice − materialCost)
- `velocity` (sales/day from Universalis)
- `gilPerDay` (profit × velocity)

Pre-filter: drop items where `materialCost > budget`, `velocity < 0.3`, or `profit ≤ 0`.

### 2. Greedy Diversified Pick

```
batch = []
remaining = budget
categoryCounts = {}

while batch.length < batchSize AND pool is not empty:
  for each candidate in pool:
    n = categoryCounts[candidate.category] || 0
    diversityMultiplier = 1 / (2 ^ n)        // 1.0, 0.5, 0.25, ...
    candidate.score = candidate.gilPerDay × diversityMultiplier

  sort pool by score DESC
  pick = pool[0]

  if pick.materialCost > remaining: remove pick from pool, continue

  batch.push(pick)
  remaining -= pick.materialCost
  categoryCounts[pick.category] = (categoryCounts[pick.category] || 0) + 1
  remove pick from pool
```

### 3. Swap / Replacement

When the user removes an item from the batch:

- Restore the removed item to the pool
- Recalculate `categoryCounts` from the remaining batch
- Re-run the greedy pick for 1 slot with the updated budget and diversity state
- Show the suggested replacement inline (user can accept or dismiss)

## UI Layout

### Controls Bar

- **Budget slider** — range 500k to user's full gil balance (manual input also supported). Persisted in `?budget=` URL param.
- **Batch size** — number stepper, 3–15, default 8. Persisted in `?size=` URL param.
- **Generate Batch** button — triggers the algorithm. Re-clicking regenerates with current settings.

### Summary Cards (4-column grid)

| Card | Value | Subtext |
|------|-------|---------|
| Material Cost | sum of batch materialCost | `{pct}% of budget` |
| Expected Revenue | sum of `salePrice × min(velocity, 1)` | `if all sell within 1 day` |
| Expected Profit | revenue − cost | `{roi}% ROI` |
| Category Spread | stacked color bar | `{n} categories across {batchSize} items` |

### Batch Table

Columns: `#`, `Item` (ItemNameLink), `Category` (color badge), `Mat Cost`, `Sale Price`, `Profit`, `Vel/day`, `Gil/day`, `✕` (remove button).

- Sortable via `SortableHeader` (default sort: batch order / score)
- Remove button drops the item and triggers swap suggestion
- Item names link to `/item/:id`

### Action Bar (bottom)

- **Send to Shopping List** — bulk-adds all batch items via `useShoppingListStore`
- **Export CSV** — via existing `ExportCsvButton` pattern
- **Budget remaining** — live display

## Files

### New files

| File | Purpose |
|------|---------|
| `src/features/craftBatch/buildBatch.ts` | Pure function: `buildDiversifiedBatch(pool, budget, batchSize)` → `BatchResult` |
| `src/features/craftBatch/buildBatch.test.ts` | Unit tests for the algorithm |
| `src/features/craftBatch/suggestReplacement.ts` | Pure function: `suggestReplacement(pool, currentBatch, remainingBudget)` → candidate |
| `src/features/craftBatch/suggestReplacement.test.ts` | Unit tests for swap logic |
| `src/features/craftBatch/types.ts` | `BatchItem`, `BatchResult`, `BatchConfig` types |
| `src/features/craftBatch/CraftBatchView.tsx` | Main insight view component (controls + summary + table + actions) |
| `src/features/craftBatch/CraftBatchView.test.tsx` | Rendering tests |
| `src/routes/CraftBatch.tsx` | Route wrapper (thin, delegates to CraftBatchView) |

### Modified files

| File | Change |
|------|--------|
| `src/App.tsx` | Add `/craft-batch` route |
| `src/components/Header.tsx` | Add nav link |

## Data Dependencies

- **Recipe snapshot** — existing `useRecipeSnapshot()` (IDB cache)
- **Item snapshot** — existing `useItemSnapshot()` (IDB cache)
- **Market data** — existing `useMarketData(ids, world, dc, region)` with phantom + DC scopes
- **Shopping list store** — existing `useShoppingListStore.addItems()`

No new API calls, caches, or IDB stores.

## Types

```ts
interface BatchConfig {
  budget: number;       // gil
  batchSize: number;    // 3–15
}

interface BatchItem {
  itemId: number;
  name: string;
  category: string;
  materialCost: number;
  salePrice: number;
  profit: number;
  velocity: number;
  gilPerDay: number;
  score: number;        // gilPerDay × diversityMultiplier (at time of pick)
}

interface BatchResult {
  items: BatchItem[];
  totalCost: number;
  expectedRevenue: number;
  expectedProfit: number;
  roi: number;          // profit / cost
  budgetRemaining: number;
  categoryBreakdown: Record<string, number>; // category → count
}
```

## Edge Cases

- **Budget too low for any item** — show empty state: "No craftable items fit within your budget. Try increasing it."
- **Pool exhausted before batch full** — show partial batch with note: "Only {n} profitable items found within budget."
- **All items same category** — the diversity penalty naturally handles this (3rd+ items in a category are heavily penalized), but if the pool is genuinely dominated by one category the batch will reflect that. No hard cap — the soft penalty is sufficient.
- **Velocity = 0** — pre-filtered out. Items with no sales history are too risky.
- **Market data loading** — show skeleton/spinner in summary cards and table while Universalis data loads. Generate button disabled until data is ready.

## Out of Scope

- Quantity per item (v1 assumes 1 craft per item — batch diversity over volume)
- Persisting batch history across sessions
- Retainer inventory awareness
- Auto-relist / restock tracking
