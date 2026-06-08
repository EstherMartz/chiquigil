# Material Sourcing Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Git safety (shared worktree):** Subagents share one worktree/HEAD. In EVERY dispatch allow only `git add/commit/status/log/diff/show`; FORBID `checkout`/`switch`/`reset`/`rebase`. Before each commit, confirm `git branch --show-current` prints `feature/material-sourcing-intelligence`.

**Goal:** Show, per Crafts-scan row, how much material cost is self-gatherable vs. must be bought; surface a self-source-adjusted profit; and let users filter by a minimum gatherable %.

**Architecture:** Refactor the existing material-cost calc to emit a flat list of costed leaves, classify each leaf as gather/crystal/buy using the already-loaded gathering catalog, and derive five values per row (`gatherableCost`, `buyOnlyCost`, `gatherablePct`, `selfSourceProfit`, plus a sorted ingredient breakdown). Wire those into the Crafts table UI, a new `Min gatherable %` filter, and a `Self-source Gil/day` sort. No new API calls — the catalog is already loaded and `selfSourceProfit = profit + gatherableCost`.

**Tech Stack:** TypeScript, React, Vitest + @testing-library/react, Zustand, react-router, Tailwind.

**Branch:** `feature/material-sourcing-intelligence` (spec: `docs/superpowers/specs/2026-06-08-material-sourcing-intelligence-design.md`)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/features/profit/computeProfit.ts` (modify) | Add `computeMaterialLeaves` (flat costed-leaf list); refactor `computeMaterialCost` to sum it. |
| `src/features/profit/materialSourcing.ts` (new) | Pure `classifySource` + `deriveSourcing`; `SourceKind`/`IngredientSourcing`/`MaterialSourcing` types. |
| `src/features/queries/types.ts` (modify) | Add `QuerySort` member, optional `QueryFilter.minGatherablePct`, `CraftFlipRow` fields, `filterHash`. |
| `src/features/queries/runQuery.ts` / `runRepost.ts` (modify) | Add `default` to `compare()` so the new sort member keeps them type-safe. |
| `src/lib/queryUrlParams.ts` (modify) | Encode/decode `minGatherablePct` as `mg`; accept new sort value. |
| `src/features/queries/runCraftFlip.ts` (modify) | Enrich rows with `sourcing` + `selfSourceGilPerDay`; apply `minGatherablePct` filter; support new sort. |
| `src/features/queries/QueriesView.tsx` (modify) | Pass `gatheringCatalog.data` into `runCraftFlip`; add to `derived` memo deps. |
| `src/features/queries/QueryBuilder.tsx` (modify) | `Min gatherable %` input; mode-aware `Self-source Gil/day` sort option. |
| `src/features/queries/GatherableTag.tsx` (new) | `[GATHERABLE]` pill. |
| `src/features/queries/MaterialSourcingPopover.tsx` (new) | Hover popover listing ingredient sources. |
| `src/features/queries/CraftFlipResults.tsx` (modify) | Two-line MATERIALS/PROFIT, tag, popover, compact handling, CSV columns. |

---

## Task 1: `computeMaterialLeaves` + refactor `computeMaterialCost`

**Files:**
- Modify: `src/features/profit/computeProfit.ts`
- Test: `src/features/profit/computeProfit.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/features/profit/computeProfit.test.ts` (the `mkMarket`/`recipeA` helpers already exist at the top — reuse them; do NOT redefine):

```ts
import { computeMaterialLeaves } from './computeProfit';

describe('computeMaterialLeaves', () => {
  it('returns one leaf per direct ingredient and sums to computeMaterialCost', () => {
    const recipe: Recipe = {
      itemResultId: 1, classJob: 'LTW', recipeLevel: 90,
      ingredients: [{ itemId: 99, amount: 2 }, { itemId: 88, amount: 3 }],
    };
    const market = mkMarket({ 99: { dcMin: 50 }, 88: { dcMin: 10 } });
    const recipeMap = new Map<number, Recipe | null>([[1, recipe]]);

    const leaves = computeMaterialLeaves(recipe, recipeMap, market, {});
    expect(leaves).toEqual([
      { itemId: 99, qty: 2, unitPrice: 50 },
      { itemId: 88, qty: 3, unitPrice: 10 },
    ]);
    const sum = leaves.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    expect(sum).toBe(computeMaterialCost(recipe, recipeMap, market, {}));
    expect(sum).toBe(130); // 2*50 + 3*10
  });

  it('decomposes a crafted intermediate when craftIntermediates flag is set, multiplying qty through', () => {
    const parent: Recipe = {
      itemResultId: 1, classJob: 'WVR', recipeLevel: 90,
      ingredients: [{ itemId: 5, amount: 2 }], // 2× intermediate
    };
    const intermediate: Recipe = {
      itemResultId: 5, classJob: 'WVR', recipeLevel: 50,
      ingredients: [{ itemId: 99, amount: 3 }], // each needs 3× raw
    };
    const market = mkMarket({ 5: { dcMin: 1000 }, 99: { dcMin: 10 } });
    const recipeMap = new Map<number, Recipe | null>([[1, parent], [5, intermediate]]);

    // Without the flag: the intermediate is one priced leaf.
    expect(computeMaterialLeaves(parent, recipeMap, market, {})).toEqual([
      { itemId: 5, qty: 2, unitPrice: 1000 },
    ]);

    // With the flag: look through to raw ingredient, qty 2*3 = 6.
    const leaves = computeMaterialLeaves(parent, recipeMap, market, { 5: { craftIntermediates: true } });
    expect(leaves).toEqual([{ itemId: 99, qty: 6, unitPrice: 10 }]);
    expect(leaves.reduce((s, l) => s + l.qty * l.unitPrice, 0)).toBe(60);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/profit/computeProfit.test.ts`
Expected: FAIL — `computeMaterialLeaves` is not exported.

- [ ] **Step 3: Implement `computeMaterialLeaves` and refactor `computeMaterialCost`**

In `src/features/profit/computeProfit.ts`, add the `MaterialLeaf` interface and `computeMaterialLeaves` function, then replace the body of `computeMaterialCost` to sum the leaves and DELETE the now-unused `ingredientCost` helper. Final state of lines 19–48:

```ts
export interface MaterialLeaf {
  itemId: number;
  qty: number;
  unitPrice: number;
}

/**
 * Flatten a recipe into the exact set of costed leaves computeMaterialCost prices.
 * With empty flags every direct ingredient is one leaf; when
 * flags[id].craftIntermediates is set (depth 0 only) the sub-recipe is recursed
 * and the leaf quantities are multiplied through. `mult` carries the accumulated
 * parent quantity into the recursion.
 */
export function computeMaterialLeaves(
  recipe: Recipe,
  recipeMap: Map<number, Recipe | null>,
  marketDc: MarketData,
  flags: FlagMap,
  phantom: MarketData = {},
  depth = 0,
  mult = 1,
): MaterialLeaf[] {
  const out: MaterialLeaf[] = [];
  for (const ing of recipe.ingredients) {
    const subRecipe = recipeMap.get(ing.itemId);
    const wantsCraft = flags[ing.itemId]?.craftIntermediates;
    if (wantsCraft && subRecipe && depth === 0) {
      out.push(...computeMaterialLeaves(subRecipe, recipeMap, marketDc, flags, phantom, depth + 1, mult * ing.amount));
    } else {
      out.push({ itemId: ing.itemId, qty: ing.amount * mult, unitPrice: unitCost(ing.itemId, marketDc, phantom) });
    }
  }
  return out;
}

export function computeMaterialCost(
  recipe: Recipe,
  recipeMap: Map<number, Recipe | null>,
  marketDc: MarketData,
  flags: FlagMap,
  phantom: MarketData = {},
  depth = 0,
): number {
  return computeMaterialLeaves(recipe, recipeMap, marketDc, flags, phantom, depth)
    .reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
}
```

(Keep the existing `import type { Recipe, Ingredient }` line; `Ingredient` is still used by `unitCost`'s neighbors — if tsc reports `Ingredient` unused after deleting `ingredientCost`, change the import to `import type { Recipe } from '../../lib/recipes';`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/profit/computeProfit.test.ts`
Expected: PASS (all prior `computeMaterialCost`/`computeProfit` tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/features/profit/computeProfit.ts src/features/profit/computeProfit.test.ts
git commit -m "refactor(profit): add computeMaterialLeaves, fold computeMaterialCost over it

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Sourcing classifier — `materialSourcing.ts`

**Files:**
- Create: `src/features/profit/materialSourcing.ts`
- Test: `src/features/profit/materialSourcing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/profit/materialSourcing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifySource, deriveSourcing } from './materialSourcing';
import type { MaterialLeaf } from './computeProfit';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';

const catalog: GatheringCatalog = new Map([
  [10, { level: 50, timed: false, hidden: false }], // standard node
  [11, { level: 70, timed: true, hidden: false }],  // timed node
]);
// sc: 10 standard-gather, 11 timed-gather, 20 crystal, 30 buy
const scById = new Map<number, number>([
  [10, 44], [11, 44], [20, CRYSTALS_SEARCH_CATEGORY], [30, 44],
]);

describe('classifySource', () => {
  it('classifies crystals by search category', () => {
    expect(classifySource(20, CRYSTALS_SEARCH_CATEGORY, catalog)).toBe('crystal');
  });
  it('classifies standard and timed gather nodes', () => {
    expect(classifySource(10, 44, catalog)).toBe('gather-standard');
    expect(classifySource(11, 44, catalog)).toBe('gather-timed');
  });
  it('classifies everything else as buy', () => {
    expect(classifySource(30, 44, catalog)).toBe('buy');
    expect(classifySource(999, undefined, catalog)).toBe('buy');
  });
});

describe('deriveSourcing', () => {
  it('returns null when total material cost is 0', () => {
    const leaves: MaterialLeaf[] = [{ itemId: 30, qty: 2, unitPrice: 0 }];
    expect(deriveSourcing(leaves, scById, catalog, 100)).toBeNull();
  });

  it('splits gatherable vs buy cost and derives pct + selfSourceProfit', () => {
    const leaves: MaterialLeaf[] = [
      { itemId: 30, qty: 1, unitPrice: 8000 },  // buy   8000
      { itemId: 10, qty: 2, unitPrice: 1000 },  // gather 2000
      { itemId: 20, qty: 8, unitPrice: 125 },   // crystal 1000
    ];
    const profit = 50_000;
    const s = deriveSourcing(leaves, scById, catalog, profit)!;
    expect(s.totalMaterialCost).toBe(11_000);
    expect(s.gatherableCost).toBe(3_000);       // 2000 + 1000
    expect(s.buyOnlyCost).toBe(8_000);
    expect(s.gatherablePct).toBeCloseTo((3000 / 11000) * 100);
    expect(s.selfSourceProfit).toBe(profit + 3_000); // profit + gatherableCost
  });

  it('aggregates duplicate ingredient ids and sorts buy-first then by subtotal', () => {
    const leaves: MaterialLeaf[] = [
      { itemId: 10, qty: 1, unitPrice: 1000 },
      { itemId: 10, qty: 2, unitPrice: 1000 }, // same id → merged: qty 3, subtotal 3000
      { itemId: 30, qty: 1, unitPrice: 500 },  // buy
    ];
    const s = deriveSourcing(leaves, scById, catalog, 0)!;
    expect(s.ingredients).toHaveLength(2);
    expect(s.ingredients[0]).toMatchObject({ itemId: 30, gatherable: false }); // buy first
    expect(s.ingredients[1]).toMatchObject({ itemId: 10, qty: 3, subtotal: 3000, gatherable: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/profit/materialSourcing.test.ts`
Expected: FAIL — module `./materialSourcing` not found.

- [ ] **Step 3: Implement `materialSourcing.ts`**

Create `src/features/profit/materialSourcing.ts`:

```ts
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import type { MaterialLeaf } from './computeProfit';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';

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
  ingredients: IngredientSourcing[];   // aggregated by itemId, buy-first then subtotal desc
  totalMaterialCost: number;
  gatherableCost: number;
  buyOnlyCost: number;
  gatherablePct: number;               // 0..100 (0 when total is 0, but null is returned then)
  selfSourceProfit: number;            // profit + gatherableCost
}

/**
 * Gather-vs-buy classification for a single ingredient. Crystals (by search
 * category) and any item present in the gathering catalog count as gatherable;
 * everything else (crafted intermediates, vendor/drop items) counts as buy.
 */
export function classifySource(
  itemId: number,
  sc: number | undefined,
  catalog: GatheringCatalog,
): SourceKind {
  if (sc === CRYSTALS_SEARCH_CATEGORY) return 'crystal';
  const g = catalog.get(itemId);
  if (g) return g.timed ? 'gather-timed' : 'gather-standard';
  return 'buy';
}

/**
 * Derive the per-row material sourcing breakdown from the costed leaves.
 * Returns null when the total material cost is 0 (nothing to split).
 */
export function deriveSourcing(
  leaves: MaterialLeaf[],
  scById: Map<number, number>,
  catalog: GatheringCatalog,
  profit: number,
): MaterialSourcing | null {
  const byId = new Map<number, IngredientSourcing>();
  let total = 0;
  for (const leaf of leaves) {
    const subtotal = leaf.qty * leaf.unitPrice;
    total += subtotal;
    const existing = byId.get(leaf.itemId);
    if (existing) {
      existing.qty += leaf.qty;
      existing.subtotal += subtotal;
    } else {
      const source = classifySource(leaf.itemId, scById.get(leaf.itemId), catalog);
      byId.set(leaf.itemId, {
        itemId: leaf.itemId,
        qty: leaf.qty,
        unitPrice: leaf.unitPrice,
        subtotal,
        source,
        gatherable: source !== 'buy',
      });
    }
  }
  if (total === 0) return null;

  let gatherableCost = 0;
  for (const ing of byId.values()) if (ing.gatherable) gatherableCost += ing.subtotal;
  const buyOnlyCost = total - gatherableCost;

  const ingredients = [...byId.values()].sort((a, b) => {
    if (a.gatherable !== b.gatherable) return a.gatherable ? 1 : -1; // buy first
    return b.subtotal - a.subtotal;
  });

  return {
    ingredients,
    totalMaterialCost: total,
    gatherableCost,
    buyOnlyCost,
    gatherablePct: (gatherableCost / total) * 100,
    selfSourceProfit: profit + gatherableCost,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/profit/materialSourcing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/profit/materialSourcing.ts src/features/profit/materialSourcing.test.ts
git commit -m "feat(profit): material sourcing classifier (gather/crystal/buy split)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Type changes + keep other runners type-safe

**Files:**
- Modify: `src/features/queries/types.ts`
- Modify: `src/features/queries/runQuery.ts:24-30`
- Modify: `src/features/queries/runRepost.ts:27-33`

No new test; correctness is verified by `tsc` (Step 4). This task only widens types and adds a `default` branch so the build stays green for later tasks.

- [ ] **Step 1: Edit `types.ts`**

Add the import at the top (after the existing `import type { CurrencyId }` line):

```ts
import type { MaterialSourcing } from '../profit/materialSourcing';
```

Change `QuerySort` (line 4) to:

```ts
export type QuerySort = 'discount' | 'gilFlow' | 'velocity' | 'unitPrice' | 'selfSourceGilFlow';
```

Add to the `QueryFilter` interface (after `trainedEye: boolean;`, keeping it optional to avoid churning the 17 files that build a filter literal):

```ts
  /** Crafts mode only: keep rows whose gatherable material cost is at least this % of total. null = off. */
  minGatherablePct?: number | null;
```

Add to the `CraftFlipRow` interface (after `hq: boolean;`):

```ts
  sourcing: MaterialSourcing | null;
  selfSourceGilPerDay: number;     // selfSourceProfit * velocity (=== gilPerDay when no gatherable mats)
```

Add to the `filterHash` object literal (after `te: f.trainedEye,`):

```ts
    mgp: f.minGatherablePct ?? null,
```

- [ ] **Step 2: Add `default` branches to the other two `compare()` functions**

In `src/features/queries/runQuery.ts`, the `compare` switch (lines 25–30) must handle the widened union. Add a default before the closing brace of the switch:

```ts
function compare(a: QueryResultRow, b: QueryResultRow, sort: QuerySort): number {
  switch (sort) {
    case 'discount':  return b.dealPct - a.dealPct;
    case 'gilFlow':   return b.gilFlow - a.gilFlow;
    case 'velocity':  return b.velocity - a.velocity;
    case 'unitPrice': return b.unitPrice - a.unitPrice;
    default:          return 0; // selfSourceGilFlow is craft-mode only
  }
}
```

In `src/features/queries/runRepost.ts`, the `compare` switch (lines 28–33) likewise:

```ts
function compare(a: RepostRow, b: RepostRow, sort: QuerySort): number {
  switch (sort) {
    case 'gilFlow':   return b.gilPerDay - a.gilPerDay;
    case 'discount':  return b.gapPct - a.gapPct;
    case 'unitPrice': return b.cheapest - a.cheapest;
    case 'velocity':  return b.velocity - a.velocity;
    default:          return 0; // selfSourceGilFlow is craft-mode only
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `runCraftFlip.ts` (it doesn't yet populate the two new required `CraftFlipRow` fields). That is expected and fixed in Task 5. No errors anywhere else.

> If you prefer a fully-green checkpoint here, you may temporarily skip committing until Task 5. Otherwise commit now and accept that `tsc` on `runCraftFlip.ts` is red until Task 5 (tests still run per-file).

- [ ] **Step 4: Commit**

```bash
git add src/features/queries/types.ts src/features/queries/runQuery.ts src/features/queries/runRepost.ts
git commit -m "feat(queries): types for material sourcing (row fields, filter, sort)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: URL param round-trip for `minGatherablePct`

**Files:**
- Modify: `src/lib/queryUrlParams.ts`
- Test: `src/lib/queryUrlParams.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/queryUrlParams.test.ts` (reuse the file's existing base-filter helper; if it defines one named differently, adapt the variable name):

```ts
import { filterToParams, paramsToFilter } from './queryUrlParams';
import type { QueryFilter } from '../features/queries/types';

const base: QueryFilter = {
  searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0,
  minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
  scope: 'home', maxListings: null, mode: 'craft', minGap: null, trainedEye: false,
};

describe('minGatherablePct url param', () => {
  it('omits mg when unset (null/undefined)', () => {
    expect(filterToParams({ ...base, minGatherablePct: null }).has('mg')).toBe(false);
    expect(filterToParams(base).has('mg')).toBe(false);
  });

  it('round-trips a set value via mg', () => {
    const params = filterToParams({ ...base, minGatherablePct: 50 });
    expect(params.get('mg')).toBe('50');
    expect(paramsToFilter(params, base).minGatherablePct).toBe(50);
  });

  it('decodes selfSourceGilFlow sort', () => {
    const params = new URLSearchParams('s=selfSourceGilFlow');
    expect(paramsToFilter(params, base).sort).toBe('selfSourceGilFlow');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/queryUrlParams.test.ts`
Expected: FAIL — `mg` is never written; `selfSourceGilFlow` is rejected by the sort guard.

- [ ] **Step 3: Implement encode/decode**

In `src/lib/queryUrlParams.ts`:

Add to `DEFAULTS` (after `mode: 'standard' as const,`):

```ts
  minGatherablePct: null as number | null,
```

In `filterToParams`, before `return params;`:

```ts
  // minGatherablePct: only add if set (treat undefined as null)
  if ((f.minGatherablePct ?? null) !== DEFAULTS.minGatherablePct) {
    params.set('mg', String(f.minGatherablePct));
  }
```

In `paramsToFilter`, widen the sort guard (line 147) and add the `mg` decode before `return result;`:

```ts
  // sort
  const sStr = params.get('s');
  if (sStr === 'discount' || sStr === 'gilFlow' || sStr === 'velocity'
      || sStr === 'unitPrice' || sStr === 'selfSourceGilFlow') {
    result.sort = sStr as QuerySort;
  }
```

```ts
  // minGatherablePct (clamp 0..100)
  const mgStr = params.get('mg');
  if (mgStr) {
    const num = Number(mgStr);
    if (!Number.isNaN(num)) {
      result.minGatherablePct = Math.max(0, Math.min(100, num));
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/queryUrlParams.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queryUrlParams.ts src/lib/queryUrlParams.test.ts
git commit -m "feat(queries): persist minGatherablePct + self-source sort in URL

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Enrich `runCraftFlip` rows + filter + sort

**Files:**
- Modify: `src/features/queries/runCraftFlip.ts`
- Test: `src/features/queries/runCraftFlip.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/queries/runCraftFlip.test.ts` (reuse the existing `snapshot`, `mkPrice`, `baseFilter`, `recipe1`, `recipeMap`). Add this import at the top:

```ts
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
```

Then append:

```ts
describe('runCraftFlip — material sourcing', () => {
  // itemId 99 is item 1's ingredient. Mark it as a standard gather node.
  const gathering: GatheringCatalog = new Map([[99, { level: 50, timed: false, hidden: false }]]);

  const priceMap: MarketData = {
    1:  mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8, velocity: 2, listingCount: 1 }),
    99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8, listingCount: 1 }),
  };

  it('attaches sourcing and selfSourceGilPerDay when a catalog is provided', () => {
    const out = runCraftFlip(snapshot, priceMap, recipeMap, { ...baseFilter, minVelocity: 1 }, undefined, gathering);
    expect(out).toHaveLength(1);
    const r = out[0];
    expect(r.materialCost).toBe(100);           // 50 × 2
    expect(r.sourcing).not.toBeNull();
    expect(r.sourcing!.gatherableCost).toBe(100);
    expect(r.sourcing!.gatherablePct).toBe(100);
    expect(r.sourcing!.selfSourceProfit).toBe(r.profit + 100);
    expect(r.selfSourceGilPerDay).toBe((r.profit + 100) * 2);
  });

  it('leaves sourcing null and selfSourceGilPerDay === gilPerDay when no catalog', () => {
    const out = runCraftFlip(snapshot, priceMap, recipeMap, { ...baseFilter, minVelocity: 1 });
    expect(out[0].sourcing).toBeNull();
    expect(out[0].selfSourceGilPerDay).toBe(out[0].gilPerDay);
  });

  it('minGatherablePct drops rows below the threshold (and 0-cost rows)', () => {
    // No catalog entry → 0% gatherable → excluded by a 50% floor.
    const none: GatheringCatalog = new Map();
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1, minGatherablePct: 50 }, undefined, none);
    expect(out).toEqual([]);
    // With the gather node, 100% gatherable → kept.
    const kept = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1, minGatherablePct: 50 }, undefined, gathering);
    expect(kept.map((r) => r.id)).toEqual([1]);
  });

  it('sorts by selfSourceGilFlow desc', () => {
    const recipe2: Recipe = {
      itemResultId: 2, classJob: 'WVR', recipeLevel: 50,
      ingredients: [{ itemId: 99, amount: 1 }],
    };
    const rm = new Map<number, Recipe | null>([[1, recipe1], [2, recipe2]]);
    const pm: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8, velocity: 2, listingCount: 1 }),
      2: mkPrice({ minNQ: 5000, medianNQ: 6000, recentSalesNQ: 8, velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8, listingCount: 1 }),
    };
    // item1 selfSource = (900 + 100) * 2 = 2000 ; item2 = (4950 + 50) * 1 = 5000
    const out = runCraftFlip(snapshot, pm, rm,
      { ...baseFilter, minVelocity: 1, sort: 'selfSourceGilFlow', limit: 2 }, undefined, gathering);
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/queries/runCraftFlip.test.ts`
Expected: FAIL — `runCraftFlip` takes no `gathering` arg; rows lack `sourcing`/`selfSourceGilPerDay`.

- [ ] **Step 3: Implement the enrichment**

Rewrite `src/features/queries/runCraftFlip.ts` as follows (imports, `compare`, signature, body):

```ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import type { CrafterLevels } from '../items/craftStatus';
import { pickFirstTrustedTier } from '../../lib/priceTrust';
import { computeMaterialLeaves } from '../profit/computeProfit';
import { deriveSourcing } from '../profit/materialSourcing';
import { passesMarketGate } from './commonFilters';
import type { CraftFlipRow, QueryFilter, QuerySort } from './types';

export function narrowForCraftFlip(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  filter: QueryFilter,
): number[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: number[] = [];
  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.hq === 'hq' && !item.canHq) continue;
    const m = priceMap[item.id];
    if (!m) continue;
    if (!passesMarketGate(m, { minVelocity: filter.minVelocity, maxListings: filter.maxListings ?? null })) continue;
    if (pickFirstTrustedTier(m, filter.hq, item.canHq) == null) continue;
    out.push(item.id);
  }
  return out;
}

function compare(a: CraftFlipRow, b: CraftFlipRow, sort: QuerySort): number {
  switch (sort) {
    case 'gilFlow':           return b.gilPerDay - a.gilPerDay;
    case 'velocity':          return b.velocity - a.velocity;
    case 'unitPrice':         return b.unitPrice - a.unitPrice;
    case 'selfSourceGilFlow': return b.selfSourceGilPerDay - a.selfSourceGilPerDay;
    case 'discount':
      return (b.profit / Math.max(1, b.unitPrice)) - (a.profit / Math.max(1, a.unitPrice));
  }
}

export function runCraftFlip(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  recipeMap: Map<number, Recipe | null>,
  filter: QueryFilter,
  levels?: CrafterLevels,
  gathering?: GatheringCatalog,
): CraftFlipRow[] {
  const narrowed = new Set(narrowForCraftFlip(snapshot, priceMap, filter));
  const scById = new Map<number, number>(snapshot.map((i) => [i.id, i.sc]));
  const out: CraftFlipRow[] = [];

  for (const item of snapshot) {
    if (!narrowed.has(item.id)) continue;
    const recipe = recipeMap.get(item.id);
    if (!recipe) continue;

    if (filter.trainedEye) {
      if (!levels) continue;
      if (recipe.classJob === 'ANY') continue;
      const crafterLevel = levels[recipe.classJob];
      if (crafterLevel == null) continue;
      if (recipe.recipeLevel > crafterLevel - 10) continue;
    }

    const m = priceMap[item.id];
    const tier = pickFirstTrustedTier(m, filter.hq, item.canHq);
    if (!tier) continue;

    const leaves = computeMaterialLeaves(recipe, recipeMap, priceMap, {});
    const materialCost = leaves.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const profit = tier.unit - materialCost;
    if (profit <= 0) continue;
    if (filter.minPrice != null && tier.unit < filter.minPrice) continue;
    if (filter.maxPrice != null && tier.unit > filter.maxPrice) continue;

    const sourcing = gathering ? deriveSourcing(leaves, scById, gathering, profit) : null;

    // Min gatherable % filter: only meaningful when we have a sourcing breakdown.
    if (filter.minGatherablePct != null) {
      if (!sourcing || sourcing.gatherablePct < filter.minGatherablePct) continue;
    }

    const selfSourceProfit = sourcing ? sourcing.selfSourceProfit : profit;

    out.push({
      id: item.id, name: item.name, sc: item.sc,
      unitPrice: tier.unit,
      materialCost,
      profit,
      velocity: m.velocity,
      gilPerDay: profit * m.velocity,
      hq: tier.isHq,
      sourcing,
      selfSourceGilPerDay: selfSourceProfit * m.velocity,
    });
  }

  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
```

- [ ] **Step 4: Run the tests + full type-check**

Run: `npx vitest run src/features/queries/runCraftFlip.test.ts`
Expected: PASS (all prior runCraftFlip tests still green).
Run: `npx tsc --noEmit`
Expected: errors ONLY in `QueriesView.tsx`/`CraftFlipResults.tsx` if they read new fields — but they don't yet, so expect 0 errors. (If `tsc` is clean, Task 3's red checkpoint is now resolved.)

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/runCraftFlip.ts src/features/queries/runCraftFlip.test.ts
git commit -m "feat(queries): enrich craft-flip rows with sourcing, %-filter, self-source sort

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Pass the catalog into `runCraftFlip` from `QueriesView`

**Files:**
- Modify: `src/features/queries/QueriesView.tsx:118-140`

No new test (integration wiring; verified by `tsc` + manual). The catalog hook is already mounted at line 49.

- [ ] **Step 1: Pass the catalog and add the memo dependency**

In the `derived` `useMemo`, update the craft branch (line 127) to pass `gatheringCatalog.data`:

```tsx
      case 'craft': {
        if (run.data.narrowedIds.length === 0) {
          return { kind: 'craft' as const, rows: [] as CraftFlipRow[] };
        }
        if (!recipes.data) return null;
        const rows = runCraftFlip(
          snapshot.data.items, run.data.priceMap, recipes.data, f, retainerLevels,
          gatheringCatalog.data ?? undefined,
        );
        return { kind: 'craft' as const, rows };
      }
```

Update the memo dependency array (line 140) to include the catalog so rows recompute when it finishes loading:

```tsx
  }, [run.data, recipes.data, snapshot.data, gatheringCatalog.data, retainerLevels]);
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/QueriesView.tsx
git commit -m "feat(queries): feed gathering catalog into craft-flip scan

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `Min gatherable %` input + mode-aware sort option

**Files:**
- Modify: `src/features/queries/QueryBuilder.tsx`

No new unit test (form wiring; covered by manual + the URL round-trip test). 

- [ ] **Step 1: Make the sort list mode-aware**

In `src/features/queries/QueryBuilder.tsx`, keep the module-level `SORTS` (lines 17–22) as-is, then inside the component (after `function patch(...)`, ~line 27) compute:

```tsx
  const sorts = value.mode === 'craft'
    ? [...SORTS, { id: 'selfSourceGilFlow' as const, label: 'Self-source Gil/day' }]
    : SORTS;
```

Change the Sort `<select>` options map (line 97) from `SORTS.map` to `sorts.map`:

```tsx
            {sorts.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
```

- [ ] **Step 2: Add the `Min gatherable %` input**

Insert this `<label>` block immediately AFTER the `Min gap (gil)` label block (after line 185, before the `Mode` label):

```tsx
        <label className="block">
          <span className="font-mono text-[13px] tracking-widest text-text-low">Min gatherable %</span>
          <input
            type="number" inputMode="decimal" min={0} max={100} step={5}
            value={value.minGatherablePct ?? ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              patch({ minGatherablePct: v === '' ? null : Math.max(0, Math.min(100, Number(v) || 0)) });
            }}
            className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
            title="Only show crafts where at least this % of material cost can be self-gathered."
          />
        </label>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/queries/QueryBuilder.tsx
git commit -m "feat(queries): Min gatherable % filter input + self-source sort option

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `GatherableTag` component

**Files:**
- Create: `src/features/queries/GatherableTag.tsx`

- [ ] **Step 1: Implement the tag**

Create `src/features/queries/GatherableTag.tsx`:

```tsx
/** Pill flagging a craft whose material cost is mostly self-gatherable. */
export function GatherableTag() {
  return (
    <span className="font-mono text-[9px] tracking-widest uppercase border border-jade text-jade px-1.5 py-0.5 leading-none whitespace-nowrap">
      Gatherable
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors (component unused until Task 10 — that's fine).

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/GatherableTag.tsx
git commit -m "feat(queries): GatherableTag pill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `MaterialSourcingPopover` component

**Files:**
- Create: `src/features/queries/MaterialSourcingPopover.tsx`

- [ ] **Step 1: Implement the popover**

Create `src/features/queries/MaterialSourcingPopover.tsx`:

```tsx
import type { ReactNode } from 'react';
import { fmtGil } from '../../lib/format';
import { useSnapshotById } from './useSnapshotById';
import type { MaterialSourcing, SourceKind } from '../profit/materialSourcing';

const SOURCE_LABEL: Record<SourceKind, string> = {
  'gather-standard': 'GATHER (std)',
  'gather-timed': 'GATHER (timed)',
  'crystal': 'CRYSTAL',
  'buy': 'MB',
};

/**
 * CSS-only hover popover (named Tailwind group) listing each ingredient with
 * its source type. Gatherable ingredients show `0*` (assumed self-sourced);
 * buy ingredients show their gil subtotal.
 */
export function MaterialSourcingPopover({ sourcing, children }: { sourcing: MaterialSourcing; children: ReactNode }) {
  const byId = useSnapshotById();
  const selfCount = sourcing.ingredients.filter((i) => i.gatherable).length;

  return (
    <span className="group/ms relative inline-flex items-center">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover/ms:block z-30 border border-border-hi bg-bg-card-hi text-text-cream font-mono text-[10px] tracking-normal normal-case px-3 py-2 leading-relaxed whitespace-nowrap shadow-lg text-left"
      >
        <table className="border-separate border-spacing-x-3">
          <tbody>
            {sourcing.ingredients.map((ing) => (
              <tr key={ing.itemId}>
                <td className="text-text-cream">{byId.get(ing.itemId)?.name ?? `#${ing.itemId}`}</td>
                <td className="text-text-low text-right">×{ing.qty}</td>
                <td className={ing.gatherable ? 'text-jade' : 'text-text-dim'}>{SOURCE_LABEL[ing.source]}</td>
                <td className="text-right tabular-nums">{ing.gatherable ? '0*' : fmtGil(ing.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1.5 pt-1.5 border-t border-border-base flex justify-between gap-6">
          <span>Total buy: <span className="text-text-cream">{fmtGil(sourcing.buyOnlyCost)}</span></span>
          <span>Total self: <span className="text-jade">0</span> ({selfCount} items)</span>
        </div>
        {selfCount > 0 && <div className="mt-1 text-text-low">* assumed self-sourced at 0 cost</div>}
      </span>
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/MaterialSourcingPopover.tsx
git commit -m "feat(queries): MaterialSourcingPopover ingredient breakdown

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Wire the UI into `CraftFlipResults`

**Files:**
- Modify: `src/features/queries/CraftFlipResults.tsx`
- Test: `src/features/queries/CraftFlipResults.test.tsx` (new)

- [ ] **Step 1: Write the failing component test**

Create `src/features/queries/CraftFlipResults.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CraftFlipResults } from './CraftFlipResults';
import { useUiStore } from '../ui/uiStore';
import type { CraftFlipRow } from './types';
import type { MaterialSourcing } from '../profit/materialSourcing';

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

function sourcing(pct: number, selfSourceProfit: number): MaterialSourcing {
  return {
    ingredients: [{ itemId: 99, qty: 2, unitPrice: 50, subtotal: 100, source: 'gather-standard', gatherable: true }],
    totalMaterialCost: 100, gatherableCost: 100, buyOnlyCost: 0, gatherablePct: pct, selfSourceProfit,
  };
}

const row = (over: Partial<CraftFlipRow>): CraftFlipRow => ({
  id: 1, name: 'Test Item', sc: 56, unitPrice: 1000, materialCost: 100, profit: 900,
  velocity: 2, gilPerDay: 1800, hq: true, sourcing: null, selfSourceGilPerDay: 1800, ...over,
});

beforeEach(() => {
  useUiStore.setState({ density: 'comfortable' });
});

describe('CraftFlipResults — sourcing UI', () => {
  it('shows the GATHERABLE tag when gatherablePct >= 80', () => {
    const rows = [row({ sourcing: sourcing(100, 1000), selfSourceGilPerDay: 2000 })];
    render(wrap(<CraftFlipResults rows={rows} totalCandidates={1} skippedChunks={0} />));
    expect(screen.getByText('Gatherable')).toBeInTheDocument();
  });

  it('omits the GATHERABLE tag below 80%', () => {
    const rows = [row({ sourcing: sourcing(40, 1000) })];
    render(wrap(<CraftFlipResults rows={rows} totalCandidates={1} skippedChunks={0} />));
    expect(screen.queryByText('Gatherable')).not.toBeInTheDocument();
  });

  it('hides secondary self lines in compact density (popover still present)', () => {
    useUiStore.setState({ density: 'compact' });
    const rows = [row({ sourcing: sourcing(100, 1000), selfSourceGilPerDay: 2000 })];
    render(wrap(<CraftFlipResults rows={rows} totalCandidates={1} skippedChunks={0} />));
    // The two comfy-only secondary lines use ↓/↑ arrow markers — absent in compact.
    expect(screen.queryByText(/↓/)).not.toBeInTheDocument();
    expect(screen.queryByText(/↑/)).not.toBeInTheDocument();
    // Tag still present in compact; the hover popover still renders its footer.
    expect(screen.getByText('Gatherable')).toBeInTheDocument();
    expect(screen.getByText(/Total self:/)).toBeInTheDocument();
  });

  it('shows the ↑ self-source profit line in comfy when higher than base', () => {
    const rows = [row({ sourcing: sourcing(100, 1000), selfSourceGilPerDay: 2000 })];
    render(wrap(<CraftFlipResults rows={rows} totalCandidates={1} skippedChunks={0} />));
    expect(screen.getByText(/↑/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/queries/CraftFlipResults.test.tsx`
Expected: FAIL — no "Gatherable" text rendered.

- [ ] **Step 3: Implement the rendering changes**

In `src/features/queries/CraftFlipResults.tsx`:

Add imports (after the existing `InfoTooltip` import, line 4):

```tsx
import { GatherableTag } from './GatherableTag';
import { MaterialSourcingPopover } from './MaterialSourcingPopover';
```

Extend `CSV_COLUMNS` (the array at lines 23–33) with three sourcing columns before the `hq` entry:

```tsx
  { key: 'sourcing', label: 'Gatherable Cost', value: (r) => r.sourcing?.gatherableCost ?? '' },
  { key: 'sourcing', label: 'Gatherable %', value: (r) => r.sourcing ? Math.round(r.sourcing.gatherablePct) : '' },
  { key: 'sourcing', label: 'Self-source Profit', value: (r) => r.sourcing?.selfSourceProfit ?? '' },
```

Inside the component, after `const rowY = rowPadClass(density);` (line 37), add:

```tsx
  const comfy = density === 'comfortable';
```

Replace the desktop ITEM cell (lines 113–120) to append the tag:

```tsx
                <td className={`px-3 ${rowY}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0">
                      <ItemNameLinks
                        id={r.id}
                        name={r.name}
                        suffix={r.hq && <HqStar leading />}
                        sub={categoryLabel(r.sc)}
                      />
                    </div>
                    {r.sourcing && r.sourcing.gatherablePct >= 80 && <GatherableTag />}
                  </div>
                </td>
```

Replace the desktop MATERIALS cell (line 135) with the popover + self line:

```tsx
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>
                  {r.sourcing && r.materialCost > 0 ? (
                    <MaterialSourcingPopover sourcing={r.sourcing}>
                      <span className="inline-flex flex-col items-end cursor-help">
                        <span>{fmtGil(r.materialCost)}</span>
                        {comfy && r.sourcing.gatherableCost > 0 && (
                          <span className="text-[10px] text-jade/70">↓ {fmtGil(r.sourcing.gatherableCost)} self</span>
                        )}
                      </span>
                    </MaterialSourcingPopover>
                  ) : (
                    fmtGil(r.materialCost)
                  )}
                </td>
```

Replace the desktop PROFIT cell (line 136) with the self line:

```tsx
                <td className={`px-3 ${rowY} text-right font-mono text-jade`}>
                  <span className="inline-flex flex-col items-end">
                    <span>+{fmtGil(r.profit)}</span>
                    {comfy && r.sourcing && r.sourcing.selfSourceProfit > r.profit && (
                      <span className="text-[10px] text-jade font-semibold">↑ +{fmtGil(r.sourcing.selfSourceProfit)} self</span>
                    )}
                  </span>
                </td>
```

In the mobile renderer, append the tag in the name block (after the `</div>` that closes the `flex-1 min-w-0` wrapper, line 64). Change lines 57–64 to:

```tsx
                <div className="flex-1 min-w-0">
                  <ItemNameLinks
                    id={r.id}
                    name={r.name}
                    suffix={r.hq && <HqStar leading />}
                    sub={categoryLabel(r.sc)}
                  />
                </div>
                {r.sourcing && r.sourcing.gatherablePct >= 80 && <GatherableTag />}
```

- [ ] **Step 4: Run the test + full suite + type-check**

Run: `npx vitest run src/features/queries/CraftFlipResults.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: 0 errors.
Run: `npx vitest run`
Expected: full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/CraftFlipResults.tsx src/features/queries/CraftFlipResults.test.tsx
git commit -m "feat(queries): material sourcing UI on Crafts table (tag, two-line, popover, csv)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the full test suite:** `npx vitest run` → all green.
- [ ] **Type-check:** `npx tsc --noEmit` → 0 errors.
- [ ] **Lint (if configured):** `npm run lint` → clean.
- [ ] **Manual smoke (dev server):** `/crafts` → run a craft preset. Confirm: rows with gatherable mats show `↓ … self` under MATERIALS and `↑ +… self` under PROFIT (comfy); `[GATHERABLE]` tag on ≥80% rows; hovering MATERIALS shows the ingredient popover; setting `Min gatherable % = 50` then Run scan filters the list; the URL gains `mg=50`; switching density to compact hides the secondary lines but keeps the tag.

---

## Acceptance criteria → task mapping

| AC | Task |
|---|---|
| 1. Self-source breakdown in MATERIALS (comfy) | 5, 9, 10 |
| 2. Fully-gatherable → tag + higher self-source profit | 5, 8, 10 |
| 3. `Min gatherable % = 50` filters to ≥50% | 5, 7 |
| 4. `Min gatherable %` in Copy Link URL | 4 |
| 5. MATERIALS hover shows per-ingredient source | 9, 10 |
| 6. Compact shows only the tag | 10 |
| 7. `totalMaterialCost = 0` → no indicator | 2 (null), 5, 10 |
| 8. Sub-recipes (direct-ingredient decision; intermediates = buy) | 1, 2, 5 |
| 9. Adjusted profit hidden when equal to base | 10 |
| 10. No new API calls | 6 (catalog already loaded), 2/5 (arithmetic) |
