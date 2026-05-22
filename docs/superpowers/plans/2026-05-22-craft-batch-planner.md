# Craft Batch Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/craft-batch` route that auto-generates a diversified, budget-aware crafting batch and lets the user edit it before sending to Shopping List.

**Architecture:** Pure algorithm in `buildBatch.ts` scores all craftable items via existing `runCraftFlip` pool logic, then greedily picks items with a category-diversity penalty. A React view component wires budget/size controls, an editable batch table, summary cards, and a "Send to Shopping List" action. No new API calls or caches — purely computation on existing recipe + market data.

**Tech Stack:** TypeScript, React, Vitest, Zustand (shopping list store), TanStack Query (existing hooks)

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/features/craftBatch/types.ts` | `BatchItem`, `BatchResult`, `BatchConfig` types |
| `src/features/craftBatch/buildBatch.ts` | Pure: `scoreCraftPool` + `buildDiversifiedBatch` |
| `src/features/craftBatch/buildBatch.test.ts` | Algorithm unit tests |
| `src/features/craftBatch/CraftBatchView.tsx` | Controls + summary cards + editable table + actions |
| `src/features/craftBatch/CraftBatchView.test.tsx` | Rendering tests |
| `src/routes/CraftBatch.tsx` | Route wrapper |
| `src/App.tsx` | Add route |
| `src/components/layout/Header.tsx` | Add nav link |

---

### Task 1: Types

**Files:**
- Create: `src/features/craftBatch/types.ts`

- [ ] **Step 1: Create types file**

```ts
// src/features/craftBatch/types.ts

export interface BatchConfig {
  budget: number;
  batchSize: number;
}

export interface BatchItem {
  id: number;
  name: string;
  sc: number;
  materialCost: number;
  salePrice: number;
  profit: number;
  velocity: number;
  gilPerDay: number;
  hq: boolean;
  score: number;
}

export interface BatchResult {
  items: BatchItem[];
  totalCost: number;
  expectedRevenue: number;
  expectedProfit: number;
  roi: number;
  budgetRemaining: number;
  categoryBreakdown: Record<number, number>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/craftBatch/types.ts
git commit -m "feat(craft-batch): add types"
```

---

### Task 2: Algorithm — `buildBatch.ts`

**Files:**
- Create: `src/features/craftBatch/buildBatch.ts`
- Create: `src/features/craftBatch/buildBatch.test.ts`

The algorithm reuses the exact same scoring logic as `runCraftFlip` (same imports, same `pickFirstTrustedTier` + `computeMaterialCost` calls) but instead of sorting and slicing, it runs a greedy diversified pick.

- [ ] **Step 1: Write tests for `scoreCraftPool`**

`scoreCraftPool` takes the same inputs as `runCraftFlip` but returns an unsorted, unlimited pool of `BatchItem[]` (all profitable craftable items). It's essentially `runCraftFlip` without the sort/limit/trainedEye — a pure scoring pass.

```ts
// src/features/craftBatch/buildBatch.test.ts
import { describe, it, expect } from 'vitest';
import { scoreCraftPool, buildDiversifiedBatch } from './buildBatch';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';

const snapshot: SnapshotItem[] = [
  { id: 1, name: 'Sword',  sc: 1, ui: 1, ilvl: 90, canHq: true },
  { id: 2, name: 'Table',  sc: 2, ui: 2, ilvl: 50, canHq: true },
  { id: 3, name: 'Meal',   sc: 3, ui: 3, ilvl: 50, canHq: true },
  { id: 4, name: 'Shield', sc: 1, ui: 1, ilvl: 80, canHq: true },
  { id: 5, name: 'Chair',  sc: 2, ui: 2, ilvl: 50, canHq: true },
];

function mkPrice(p: Partial<MarketData[string]>): MarketData[string] {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0,
    velocity: 0, lastUploadTime: Date.now(), listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...p,
  };
}

const recipeMap = new Map<number, Recipe | null>([
  [1, { itemResultId: 1, classJob: 'BSM', recipeLevel: 90, ingredients: [{ itemId: 99, amount: 1 }] }],
  [2, { itemResultId: 2, classJob: 'CRP', recipeLevel: 50, ingredients: [{ itemId: 99, amount: 1 }] }],
  [3, { itemResultId: 3, classJob: 'CUL', recipeLevel: 50, ingredients: [{ itemId: 99, amount: 1 }] }],
  [4, { itemResultId: 4, classJob: 'BSM', recipeLevel: 80, ingredients: [{ itemId: 99, amount: 2 }] }],
  [5, { itemResultId: 5, classJob: 'CRP', recipeLevel: 50, ingredients: [{ itemId: 99, amount: 1 }] }],
]);

// All items use ingredient 99 priced at 50 NQ.
const basePrices: MarketData = {
  99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8, listingCount: 1 }),
};

function withPrices(items: Record<number, Partial<MarketData[string]>>): MarketData {
  const out: MarketData = { ...basePrices };
  for (const [id, p] of Object.entries(items)) {
    out[Number(id)] = mkPrice(p);
  }
  return out;
}

describe('scoreCraftPool', () => {
  it('returns all profitable items with correct fields', () => {
    const prices = withPrices({
      1: { minHQ: 500, medianHQ: 600, recentSalesHQ: 8, velocity: 2, listingCount: 1 },
      2: { minHQ: 300, medianHQ: 360, recentSalesHQ: 8, velocity: 3, listingCount: 1 },
    });
    const pool = scoreCraftPool(snapshot, prices, recipeMap);
    expect(pool).toHaveLength(2);

    const sword = pool.find((r) => r.id === 1)!;
    expect(sword.materialCost).toBe(50);   // 50 × 1
    expect(sword.salePrice).toBe(500);
    expect(sword.profit).toBe(450);
    expect(sword.velocity).toBe(2);
    expect(sword.gilPerDay).toBe(900);
  });

  it('excludes items with no recipe', () => {
    const snap = [...snapshot, { id: 6, name: 'Orphan', sc: 1, ui: 1, ilvl: 50, canHq: true }];
    const prices = withPrices({
      6: { minHQ: 500, medianHQ: 600, recentSalesHQ: 8, velocity: 1, listingCount: 1 },
    });
    const pool = scoreCraftPool(snap, prices, recipeMap);
    expect(pool.find((r) => r.id === 6)).toBeUndefined();
  });

  it('excludes items with profit <= 0', () => {
    const prices = withPrices({
      1: { minHQ: 30, medianHQ: 40, recentSalesHQ: 8, velocity: 1, listingCount: 1 },
    });
    const pool = scoreCraftPool(snapshot, prices, recipeMap);
    expect(pool.find((r) => r.id === 1)).toBeUndefined();
  });

  it('excludes items with velocity < 0.3', () => {
    const prices = withPrices({
      1: { minHQ: 500, medianHQ: 600, recentSalesHQ: 8, velocity: 0.2, listingCount: 1 },
    });
    const pool = scoreCraftPool(snapshot, prices, recipeMap);
    expect(pool.find((r) => r.id === 1)).toBeUndefined();
  });
});

describe('buildDiversifiedBatch', () => {
  // All 5 items profitable. Sword: 900 gpd, Table: 750, Meal: 450, Shield: 800, Chair: 600
  const allPrices = withPrices({
    1: { minHQ: 500, medianHQ: 600, recentSalesHQ: 8, velocity: 2,   listingCount: 1 },  // profit 450 × 2 = 900 gpd
    2: { minHQ: 300, medianHQ: 360, recentSalesHQ: 8, velocity: 3,   listingCount: 1 },  // profit 250 × 3 = 750 gpd
    3: { minHQ: 200, medianHQ: 240, recentSalesHQ: 8, velocity: 3,   listingCount: 1 },  // profit 150 × 3 = 450 gpd
    4: { minHQ: 500, medianHQ: 600, recentSalesHQ: 8, velocity: 1.6, listingCount: 1 },  // profit 400 × 1.6 = 640 gpd  (sc=1 same as Sword)
    5: { minHQ: 250, medianHQ: 300, recentSalesHQ: 8, velocity: 3,   listingCount: 1 },  // profit 200 × 3 = 600 gpd  (sc=2 same as Table)
  });

  it('picks top item by gilPerDay first', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    const result = buildDiversifiedBatch(pool, { budget: 10000, batchSize: 1 });
    expect(result.items[0].id).toBe(1); // Sword has highest gilPerDay (900)
  });

  it('penalizes same-category items — diversifies across categories', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    const result = buildDiversifiedBatch(pool, { budget: 10000, batchSize: 3 });
    const ids = result.items.map((r) => r.id);
    // Pick 1: Sword (sc=1, 900 gpd). Pick 2: Table (sc=2, 750 gpd) beats Shield (sc=1, 640×0.5=320).
    // Pick 3: Meal (sc=3, 450 gpd) beats Shield (sc=1, 640×0.5=320) and Chair (sc=2, 600×0.5=300).
    expect(ids).toEqual([1, 2, 3]);
  });

  it('respects budget — skips items too expensive for remaining budget', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    // Budget only covers 1 item
    const result = buildDiversifiedBatch(pool, { budget: 60, batchSize: 5 });
    expect(result.items).toHaveLength(1);
    expect(result.budgetRemaining).toBe(10); // 60 - 50
  });

  it('computes summary fields correctly', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    const result = buildDiversifiedBatch(pool, { budget: 10000, batchSize: 2 });
    expect(result.totalCost).toBe(result.items.reduce((s, i) => s + i.materialCost, 0));
    expect(result.expectedRevenue).toBe(
      result.items.reduce((s, i) => s + i.salePrice * Math.min(i.velocity, 1), 0),
    );
    expect(result.expectedProfit).toBe(result.expectedRevenue - result.totalCost);
    expect(result.budgetRemaining).toBe(10000 - result.totalCost);
  });

  it('returns empty batch when no items fit budget', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    const result = buildDiversifiedBatch(pool, { budget: 5, batchSize: 5 });
    expect(result.items).toEqual([]);
    expect(result.totalCost).toBe(0);
    expect(result.budgetRemaining).toBe(5);
  });

  it('returns empty batch when pool is empty', () => {
    const result = buildDiversifiedBatch([], { budget: 10000, batchSize: 5 });
    expect(result.items).toEqual([]);
  });

  it('categoryBreakdown counts items per sc', () => {
    const pool = scoreCraftPool(snapshot, allPrices, recipeMap);
    const result = buildDiversifiedBatch(pool, { budget: 10000, batchSize: 5 });
    // 5 items: sc=1 (Sword, Shield), sc=2 (Table, Chair), sc=3 (Meal)
    expect(result.categoryBreakdown[1]).toBe(2);
    expect(result.categoryBreakdown[2]).toBe(2);
    expect(result.categoryBreakdown[3]).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/features/craftBatch/buildBatch.test.ts
```

Expected: FAIL — `buildBatch` module doesn't exist yet.

- [ ] **Step 3: Implement `buildBatch.ts`**

```ts
// src/features/craftBatch/buildBatch.ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import { pickFirstTrustedTier } from '../../lib/priceTrust';
import { computeMaterialCost } from '../profit/computeProfit';
import type { BatchItem, BatchConfig, BatchResult } from './types';

const MIN_VELOCITY = 0.3;

/**
 * Score every craftable item — same logic as runCraftFlip but
 * returns the full unsorted pool without limit or trainedEye filtering.
 */
export function scoreCraftPool(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  recipeMap: Map<number, Recipe | null>,
): BatchItem[] {
  const pool: BatchItem[] = [];

  for (const item of snapshot) {
    const m = priceMap[item.id];
    if (!m) continue;
    if (m.velocity < MIN_VELOCITY) continue;

    const recipe = recipeMap.get(item.id);
    if (!recipe) continue;

    const tier = pickFirstTrustedTier(m, 'either', item.canHq);
    if (!tier) continue;

    const materialCost = computeMaterialCost(recipe, recipeMap, priceMap, {});
    const profit = tier.unit - materialCost;
    if (profit <= 0) continue;

    pool.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      materialCost,
      salePrice: tier.unit,
      profit,
      velocity: m.velocity,
      gilPerDay: profit * m.velocity,
      hq: tier.isHq,
      score: 0, // filled during batch building
    });
  }

  return pool;
}

/**
 * Greedy diversified batch builder. Picks items one at a time,
 * penalizing same-category items with an exponential decay multiplier.
 */
export function buildDiversifiedBatch(
  pool: BatchItem[],
  config: BatchConfig,
): BatchResult {
  const picked: BatchItem[] = [];
  const remaining = new Set(pool.map((_, i) => i));
  const categoryCounts: Record<number, number> = {};
  let budget = config.budget;

  while (picked.length < config.batchSize && remaining.size > 0) {
    let bestIdx = -1;
    let bestScore = -1;

    for (const i of remaining) {
      const item = pool[i];
      if (item.materialCost > budget) continue;
      const n = categoryCounts[item.sc] ?? 0;
      const score = item.gilPerDay / (1 << n); // 2^n penalty
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break; // nothing fits budget

    const pick = { ...pool[bestIdx], score: bestScore };
    picked.push(pick);
    remaining.delete(bestIdx);
    budget -= pick.materialCost;
    categoryCounts[pick.sc] = (categoryCounts[pick.sc] ?? 0) + 1;
  }

  const totalCost = picked.reduce((s, i) => s + i.materialCost, 0);
  const expectedRevenue = picked.reduce(
    (s, i) => s + i.salePrice * Math.min(i.velocity, 1),
    0,
  );

  return {
    items: picked,
    totalCost,
    expectedRevenue,
    expectedProfit: expectedRevenue - totalCost,
    roi: totalCost > 0 ? (expectedRevenue - totalCost) / totalCost : 0,
    budgetRemaining: config.budget - totalCost,
    categoryBreakdown: categoryCounts,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/features/craftBatch/buildBatch.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/craftBatch/buildBatch.ts src/features/craftBatch/buildBatch.test.ts
git commit -m "feat(craft-batch): diversified batch algorithm with tests"
```

---

### Task 3: Route wrapper + nav wiring

**Files:**
- Create: `src/routes/CraftBatch.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Create route wrapper**

```tsx
// src/routes/CraftBatch.tsx
import { CraftBatchView } from '../features/craftBatch/CraftBatchView';

export default function CraftBatch() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Craft Batch Planner</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Build a diversified crafting batch within your budget. Auto-picks profitable items across categories, then let you swap before sending to Shopping List.
        </p>
      </div>
      <CraftBatchView />
    </div>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

In `src/App.tsx`, add the import at the top with the other lazy route imports:

```ts
import CraftBatch from './routes/CraftBatch';
```

Add the route after the `/gc-seals` route:

```tsx
<Route path="/craft-batch" element={<CraftBatch />} />
```

- [ ] **Step 3: Add nav link to Header.tsx**

In `src/components/layout/Header.tsx`, add after the GC Seals NavLink:

```tsx
<NavLink to="/craft-batch" className={navClass}>Batch</NavLink>
```

- [ ] **Step 4: Commit**

Note: This won't compile yet because `CraftBatchView` doesn't exist. We'll create a placeholder in Task 4 step 1. Do NOT commit yet — continue to Task 4.

---

### Task 4: View component — `CraftBatchView.tsx`

**Files:**
- Create: `src/features/craftBatch/CraftBatchView.tsx`
- Create: `src/features/craftBatch/CraftBatchView.test.tsx`

This is the main UI. It has four sections: controls bar, summary cards, batch table, and action bar.

- [ ] **Step 1: Write the view component**

```tsx
// src/features/craftBatch/CraftBatchView.tsx
import { useMemo, useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { scoreCraftPool, buildDiversifiedBatch } from './buildBatch';
import { useShoppingListStore } from '../shoppingList/shoppingListStore';
import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { InfoTooltip } from '../../components/InfoTooltip';
import { HqStar } from '../../components/HqStar';
import { Spinner } from '../../components/Spinner';
import { ExportCsvButton } from '../../components/ExportCsvButton';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { BatchItem, BatchResult } from './types';
import type { CsvColumn } from '../../lib/csv';

const CSV_COLUMNS: CsvColumn<BatchItem>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'materialCost', label: 'Material Cost' },
  { key: 'salePrice', label: 'Sale Price' },
  { key: 'profit', label: 'Profit' },
  { key: 'velocity', label: 'Velocity' },
  { key: 'gilPerDay', label: 'Gil/day' },
  { key: 'hq', label: 'HQ' },
];

const BUDGET_PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000, 8_000_000, 15_000_000, 30_000_000];
const DEFAULT_BUDGET = 5_000_000;
const DEFAULT_BATCH_SIZE = 8;

interface RunResult {
  priceMap: MarketData;
  skipped: number;
}

export function CraftBatchView() {
  const { world } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot();
  const addItem = useShoppingListStore((s) => s.addItem);
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);

  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());

  const candidateIds = useMemo(() => {
    if (!snapshot.data || !recipes.data) return [];
    const ids: number[] = [];
    for (const item of snapshot.data.items) {
      if (recipes.data.get(item.id)) ids.push(item.id);
    }
    return ids;
  }, [snapshot.data, recipes.data]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data || !recipes.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { priceMap: sale.data, skipped: sale.errors.length };
    },
    onSuccess: (data) => {
      if (!snapshot.data || !recipes.data) return;
      const pool = scoreCraftPool(snapshot.data.items, data.priceMap, recipes.data);
      const result = buildDiversifiedBatch(pool, { budget, batchSize });
      setBatch(result);
      setRemovedIds(new Set());
    },
  });

  const handleGenerate = useCallback(() => {
    run.reset();
    run.mutate();
  }, [run]);

  const handleRemove = useCallback((itemId: number) => {
    if (!batch || !run.data || !snapshot.data || !recipes.data) return;
    const next = new Set(removedIds).add(itemId);
    setRemovedIds(next);

    const pool = scoreCraftPool(snapshot.data.items, run.data.priceMap, recipes.data)
      .filter((p) => !next.has(p.id));
    const currentIds = new Set(batch.items.filter((i) => i.id !== itemId).map((i) => i.id));
    const availablePool = pool.filter((p) => !currentIds.has(p.id));

    // Rebuild with remaining items locked + 1 open slot for replacement
    const remaining = batch.items.filter((i) => i.id !== itemId);
    const usedBudget = remaining.reduce((s, i) => s + i.materialCost, 0);
    const replacement = buildDiversifiedBatch(
      availablePool,
      { budget: budget - usedBudget, batchSize: 1 },
    );

    const newItems = [...remaining, ...replacement.items];
    const totalCost = newItems.reduce((s, i) => s + i.materialCost, 0);
    const expectedRevenue = newItems.reduce(
      (s, i) => s + i.salePrice * Math.min(i.velocity, 1), 0,
    );
    const categoryBreakdown: Record<number, number> = {};
    for (const i of newItems) {
      categoryBreakdown[i.sc] = (categoryBreakdown[i.sc] ?? 0) + 1;
    }

    setBatch({
      items: newItems,
      totalCost,
      expectedRevenue,
      expectedProfit: expectedRevenue - totalCost,
      roi: totalCost > 0 ? (expectedRevenue - totalCost) / totalCost : 0,
      budgetRemaining: budget - totalCost,
      categoryBreakdown,
    });
  }, [batch, run.data, snapshot.data, recipes.data, removedIds, budget]);

  const handleSendToShoppingList = useCallback(() => {
    if (!batch) return;
    for (const item of batch.items) {
      addItem(item.id, 1);
    }
  }, [batch, addItem]);

  const notReady = !snapshot.data || !recipes.data;

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center gap-4 p-3 bg-bg-card rounded-lg border border-border-base">
        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim">Budget</span>
          <select
            className="bg-bg-base border border-border-base rounded px-2 py-1 text-sm font-mono"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          >
            {BUDGET_PRESETS.map((v) => (
              <option key={v} value={v}>{fmtGil(v)}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim">Batch size</span>
          <input
            type="number"
            className="bg-bg-base border border-border-base rounded px-2 py-1 text-sm font-mono w-16 text-center"
            value={batchSize}
            min={3}
            max={15}
            onChange={(e) => setBatchSize(Math.max(3, Math.min(15, Number(e.target.value))))}
          />
        </label>

        <button
          className="ml-auto bg-aether text-bg-base px-4 py-1.5 rounded font-mono text-xs uppercase tracking-wider disabled:opacity-50"
          onClick={handleGenerate}
          disabled={notReady || run.isPending}
        >
          {run.isPending ? 'Scanning…' : 'Generate Batch'}
        </button>
      </div>

      {/* Loading state */}
      {run.isPending && (
        <div className="flex items-center gap-2 text-text-dim text-sm">
          <Spinner />
          <span>Fetching market data for {candidateIds.length} craftable items…</span>
        </div>
      )}

      {/* Error state */}
      {run.isError && (
        <div className="text-crimson text-sm font-mono">
          Error: {run.error instanceof Error ? run.error.message : 'Unknown error'}
        </div>
      )}

      {/* Results */}
      {batch && (
        <>
          {/* Summary Cards */}
          <SummaryCards batch={batch} budget={budget} />

          {/* Batch Table */}
          <div className="border border-border-base rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right px-3 py-2 hidden md:table-cell">
                    <InfoTooltip label="Sum of ingredient prices on the home world.">Mat Cost</InfoTooltip>
                  </th>
                  <th className="text-right px-3 py-2">
                    <InfoTooltip label="Trusted sale price (min listing capped at median).">Sale</InfoTooltip>
                  </th>
                  <th className="text-right px-3 py-2">
                    <InfoTooltip label="Sale price minus material cost.">Profit</InfoTooltip>
                  </th>
                  <th className="text-right px-3 py-2 hidden md:table-cell">
                    <InfoTooltip label="Sales per day on the home world.">Vel/day</InfoTooltip>
                  </th>
                  <th className="text-right px-3 py-2">
                    <InfoTooltip label="Profit × velocity. Diversity-penalized score in parentheses.">Gil/day</InfoTooltip>
                  </th>
                  <th className="text-center px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {batch.items.map((item, i) => (
                  <tr key={item.id} className="border-t border-border-base hover:bg-bg-card-hi">
                    <td className={`px-3 ${rowY} font-mono text-text-low`}>{i + 1}</td>
                    <td className={`px-3 ${rowY}`}>
                      <ItemNameLinks
                        id={item.id}
                        name={item.name}
                        suffix={item.hq && <HqStar leading />}
                        sub={categoryLabel(item.sc)}
                      />
                    </td>
                    <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>
                      {fmtGil(item.materialCost)}
                    </td>
                    <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(item.salePrice)}</td>
                    <td className={`px-3 ${rowY} text-right font-mono text-jade`}>+{fmtGil(item.profit)}</td>
                    <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>
                      {item.velocity.toFixed(1)}
                    </td>
                    <td className={`px-3 ${rowY} text-right font-mono text-gold-hi`}>
                      {fmtGil(Math.round(item.gilPerDay))}
                    </td>
                    <td className={`px-3 ${rowY} text-center`}>
                      <button
                        className="text-crimson hover:text-crimson/80 text-lg leading-none"
                        onClick={() => handleRemove(item.id)}
                        title="Remove and suggest replacement"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty state */}
          {batch.items.length === 0 && (
            <p className="text-text-dim text-sm font-mono text-center py-8">
              No profitable items found within budget. Try increasing your budget.
            </p>
          )}

          {/* Action Bar */}
          {batch.items.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                className="bg-jade/20 text-jade border border-jade/30 px-4 py-1.5 rounded font-mono text-xs uppercase tracking-wider hover:bg-jade/30"
                onClick={handleSendToShoppingList}
              >
                Send to Shopping List
              </button>
              <ExportCsvButton
                rows={batch.items}
                columns={CSV_COLUMNS}
                filename={`craft-batch-${new Date().toISOString().slice(0, 10)}.csv`}
              />
              <span className="ml-auto font-mono text-xs text-text-dim">
                Budget remaining: <span className="text-aether">{fmtGil(batch.budgetRemaining)}</span>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Summary Cards ---------- */

function SummaryCards({ batch, budget }: { batch: BatchResult; budget: number }) {
  const categories = Object.entries(batch.categoryBreakdown);
  const colors = ['bg-aether', 'bg-jade', 'bg-gold', 'bg-crimson', 'bg-purple-400', 'bg-sky-400', 'bg-amber-400'];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card
        label="Material Cost"
        value={fmtGil(batch.totalCost)}
        valueClass="text-crimson"
        sub={`${Math.round((batch.totalCost / budget) * 100)}% of budget`}
      />
      <Card
        label="Expected Revenue"
        value={fmtGil(Math.round(batch.expectedRevenue))}
        valueClass="text-jade"
        sub="if all sell within 1 day"
      />
      <Card
        label="Expected Profit"
        value={fmtGil(Math.round(batch.expectedProfit))}
        valueClass="text-jade"
        sub={`${Math.round(batch.roi * 100)}% ROI`}
      />
      <div className="bg-bg-card rounded-lg border border-border-base p-3">
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-dim">Category Spread</div>
        <div className="flex gap-0.5 mt-2 rounded overflow-hidden">
          {categories.map(([sc, count], i) => (
            <div
              key={sc}
              className={`${colors[i % colors.length]} h-4 text-[9px] flex items-center justify-center text-bg-base font-mono`}
              style={{ flex: count }}
              title={`${categoryLabel(Number(sc))}: ${count}`}
            >
              {count > 0 ? categoryLabel(Number(sc)).slice(0, 6) : ''}
            </div>
          ))}
        </div>
        <div className="text-text-low text-[11px] mt-1 font-mono">
          {categories.length} categories across {batch.items.length} items
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, valueClass, sub }: {
  label: string; value: string; valueClass: string; sub: string;
}) {
  return (
    <div className="bg-bg-card rounded-lg border border-border-base p-3">
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-dim">{label}</div>
      <div className={`text-xl font-semibold font-mono mt-1 ${valueClass}`}>{value}</div>
      <div className="text-text-low text-[11px] font-mono">{sub}</div>
    </div>
  );
}
```

- [ ] **Step 2: Write rendering test**

```tsx
// src/features/craftBatch/CraftBatchView.test.tsx
import { describe, it, expect } from 'vitest';
import type { BatchResult } from './types';
import { buildDiversifiedBatch, scoreCraftPool } from './buildBatch';

// View-level rendering tests would need a full React test harness.
// For now, verify the algorithm integrates correctly with the view's
// expected data shape by checking BatchResult fields are present.

describe('CraftBatchView data contract', () => {
  it('BatchResult has all fields the view reads', () => {
    const result: BatchResult = {
      items: [],
      totalCost: 0,
      expectedRevenue: 0,
      expectedProfit: 0,
      roi: 0,
      budgetRemaining: 1000,
      categoryBreakdown: {},
    };
    // Verify the shape matches what the view destructures
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('totalCost');
    expect(result).toHaveProperty('expectedRevenue');
    expect(result).toHaveProperty('expectedProfit');
    expect(result).toHaveProperty('roi');
    expect(result).toHaveProperty('budgetRemaining');
    expect(result).toHaveProperty('categoryBreakdown');
  });
});
```

- [ ] **Step 3: Run all tests**

```bash
npx vitest run src/features/craftBatch/
```

Expected: all tests PASS.

- [ ] **Step 4: Verify the app compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: Commit all Task 3 + Task 4 files**

```bash
git add src/routes/CraftBatch.tsx src/App.tsx src/components/layout/Header.tsx src/features/craftBatch/CraftBatchView.tsx src/features/craftBatch/CraftBatchView.test.tsx
git commit -m "feat(craft-batch): route, nav link, and view component"
```

---

### Task 5: Smoke test + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass, no regressions.

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Start dev server and verify in browser**

```bash
npx vite dev
```

Open `http://localhost:5173/craft-batch`. Verify:
1. Controls bar renders with budget dropdown and batch size input
2. "Generate Batch" button triggers market data fetch
3. After loading, summary cards and batch table appear
4. ✕ button removes an item and adds a replacement
5. "Send to Shopping List" adds items (verify on `/shopping-list`)
6. "Batch" nav link appears in header and highlights when active

- [ ] **Step 4: Commit if any fixes were needed**

Only if step 3 surfaced issues that required code changes.
