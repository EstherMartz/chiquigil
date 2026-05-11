# Home-Server Queries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `/queries` route with per-preset home/DC scope, a listing-cap filter, and two craft-oriented presets (Undersupply, Craft-flip Phantom) that surface gil-making opportunities a server-locked player can act on without travel.

**Architecture:** `QueryFilter` gains three fields (`scope`, `maxListings`, `craftableOnly`). Universalis fetch target is chosen per `filter.scope`. When `craftableOnly` is true, results pipeline narrows the candidate set by velocity/listing/HQ checks, kicks off a lazy `useRecipes` on the narrowed ids, then runs a new pure `runCraftFlip` that joins prices + recipes + ingredient costs and ranks by gil/day. A sibling `CraftFlipResults` component renders the wider row shape.

**Tech Stack:** Same as today. No new deps. Reuses existing `computeMaterialCost`, `useRecipes`, `fetchInBatches`, `fetchMarketData`.

**Approval:** Design approved in conversation. Spec: `docs/superpowers/specs/2026-05-11-home-server-queries-design.md`.

---

## Conventions

- TDD for pure helpers.
- One commit per task.
- `npm test -- --run` + `npm run build` stay green at every commit.
- Run from `c:/Users/esthe/Documents/Dev/ffxiv-helper`.

---

## Task 1: Extend QueryFilter + add CraftFlipRow + update filterHash

**Files:**
- Modify: `src/features/queries/types.ts`

- [ ] **Step 1: Edit `src/features/queries/types.ts`**

Replace the file contents with:
```ts
export type HqMode = 'hq' | 'nq' | 'either';
export type QuerySort = 'discount' | 'gilFlow' | 'velocity' | 'unitPrice';
export type QueryScope = 'home' | 'dc';

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
  craftableOnly: boolean;
}

export interface QueryPreset {
  id: string;
  label: string;
  desc: string;
  filter: QueryFilter;
}

export interface QueryResultRow {
  id: number;
  name: string;
  sc: number;
  unitPrice: number;
  averagePrice: number;
  dealPct: number;
  velocity: number;
  gilFlow: number;
  hq: boolean;
}

export interface CraftFlipRow {
  id: number;
  name: string;
  sc: number;
  unitPrice: number;
  materialCost: number;
  profit: number;
  velocity: number;
  gilPerDay: number;
  hq: boolean;
}

export function filterHash(f: QueryFilter): string {
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
    co: f.craftableOnly,
  });
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: this will FAIL until presets, runQuery, and other consumers are updated to set the three new required fields. That's OK — proceed; later tasks fix it. But also: TypeScript errors should be limited to the missing-fields style (`Property 'scope' is missing in type ...`). If anything else breaks, stop and report.

Actually, we want a clean build at every commit. To avoid leaving the repo in a broken state, do steps 1+3 in this task together (`types.ts` + `presets.ts` minimal update), then run build at the end of step 3.

- [ ] **Step 3: Minimally patch `src/features/queries/presets.ts`**

In the same task, append `scope: 'dc'`, `maxListings: null`, `craftableOnly: false` to each of the four existing preset filters. Don't add the new presets yet (that's Task 3). The existing test file should still pass without modification — those tests check for category arrays, IDs, and sort modes, not the new fields.

Open `src/features/queries/presets.ts`. For each of the four existing presets, edit the `filter` object to include the three new fields. Example for mega-value-hq:
```ts
filter: { searchCategories: [], hq: 'hq', minDealPct: 30, minVelocity: 0,
          minPrice: 1_000_000, maxPrice: null, sort: 'unitPrice', limit: 100,
          scope: 'dc', maxListings: null, craftableOnly: false },
```

Do the same for fast-sellers-hq, food-potions, furnishings.

- [ ] **Step 4: Build + run all tests**

```bash
npm run build
npm test -- --run
```

Expected: clean build. All existing tests still pass (174). The runQuery tests use the QueryFilter type — confirm they don't break. (They shouldn't: tests build `baseFilter` via spread, so the new required fields need to be present in `baseFilter`. The runQuery test will need an update — but do that in Task 2 alongside the maxListings change.)

If tests fail because `baseFilter` in runQuery.test.ts is missing the new fields, that's the next task. Leave the test failures for now — but DO NOT commit with failing tests. Instead, do an intermediate fix here: edit `src/features/queries/runQuery.test.ts` to add the three new fields to `baseFilter`:
```ts
const baseFilter: QueryFilter = {
  searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0,
  minPrice: null, maxPrice: null, sort: 'discount', limit: 100,
  scope: 'dc', maxListings: null, craftableOnly: false,
};
```

Run tests again — should pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/types.ts src/features/queries/presets.ts src/features/queries/runQuery.test.ts
git commit -m "feat(queries): extend QueryFilter with scope/maxListings/craftableOnly"
```

---

## Task 2: runQuery — add maxListings filter

**Files:**
- Modify: `src/features/queries/runQuery.ts`
- Modify: `src/features/queries/runQuery.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/features/queries/runQuery.test.ts` inside the existing `describe('runQuery', ...)` block:
```ts
it('applies maxListings when set', () => {
  const priceMap: MarketData = {
    1: mkPrice({ minNQ: 50, averagePriceNQ: 100, listingCount: 2 }),
    2: mkPrice({ minNQ: 50, averagePriceNQ: 100, listingCount: 5 }),
  };
  const out = runQuery(snapshot, priceMap, { ...baseFilter, hq: 'nq', maxListings: 2 });
  expect(out.map((r) => r.id)).toEqual([1]);
});

it('maxListings = null is a no-op', () => {
  const priceMap: MarketData = {
    1: mkPrice({ minNQ: 50, averagePriceNQ: 100, listingCount: 99 }),
  };
  const out = runQuery(snapshot, priceMap, { ...baseFilter, hq: 'nq', maxListings: null });
  expect(out.map((r) => r.id)).toEqual([1]);
});
```

Note: `mkPrice` currently spreads into a default `MarketItem` that has `listingCount: 0`. Adding `listingCount` to the partial is supported by the existing `Partial<MarketData[string]>` parameter type.

- [ ] **Step 2: Run tests to confirm failure**

```bash
npx vitest --run src/features/queries/runQuery.test.ts
```

Expected: 2 new failures.

- [ ] **Step 3: Implement the filter**

Open `src/features/queries/runQuery.ts`. After the `if (filter.maxPrice != null && tier.unit > filter.maxPrice) continue;` line, add:
```ts
if (filter.maxListings != null && m.listingCount > filter.maxListings) continue;
```

- [ ] **Step 4: Run tests, confirm green**

```bash
npx vitest --run src/features/queries/runQuery.test.ts
```

Expected: 9 passed (7 old + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/runQuery.ts src/features/queries/runQuery.test.ts
git commit -m "feat(queries): runQuery applies maxListings filter"
```

---

## Task 3: Presets — add Undersupply + Craft-flip Phantom

**Files:**
- Modify: `src/features/queries/presets.ts`
- Modify: `src/features/queries/presets.test.ts`

- [ ] **Step 1: Add the two new presets**

Open `src/features/queries/presets.ts`. After the `furnishings` preset, add inside the `PRESETS` array:
```ts
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
```

- [ ] **Step 2: Add tests covering the new fields**

Append to `src/features/queries/presets.test.ts` inside the existing `describe('PRESETS', ...)`:
```ts
it('existing four presets default to dc scope, no list cap, non-craftable mode', () => {
  for (const id of ['mega-value-hq', 'fast-sellers-hq', 'food-potions', 'furnishings']) {
    const p = getPreset(id)!;
    expect(p.filter.scope).toBe('dc');
    expect(p.filter.maxListings).toBeNull();
    expect(p.filter.craftableOnly).toBe(false);
  }
});

it('undersupply preset is home-scope, maxListings 2, craftable-only', () => {
  const p = getPreset('undersupply')!;
  expect(p.filter.scope).toBe('home');
  expect(p.filter.maxListings).toBe(2);
  expect(p.filter.craftableOnly).toBe(true);
  expect(p.filter.minVelocity).toBeGreaterThanOrEqual(1);
});

it('craft-flip preset is home-scope, no list cap, craftable-only', () => {
  const p = getPreset('craft-flip')!;
  expect(p.filter.scope).toBe('home');
  expect(p.filter.maxListings).toBeNull();
  expect(p.filter.craftableOnly).toBe(true);
});
```

- [ ] **Step 3: Run tests, confirm green**

```bash
npx vitest --run src/features/queries/presets.test.ts
```

Expected: 9 passed (6 old + 3 new).

- [ ] **Step 4: Commit**

```bash
git add src/features/queries/presets.ts src/features/queries/presets.test.ts
git commit -m "feat(queries): undersupply + craft-flip presets"
```

---

## Task 4: runCraftFlip (pure helper) + narrowForCraftFlip

**Files:**
- Create: `src/features/queries/runCraftFlip.ts`
- Create: `src/features/queries/runCraftFlip.test.ts`

- [ ] **Step 1: Write failing tests**

Write `src/features/queries/runCraftFlip.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { narrowForCraftFlip, runCraftFlip } from './runCraftFlip';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { QueryFilter } from './types';

const snapshot: SnapshotItem[] = [
  { id: 1, name: 'Glamour Top', sc: 56, ui: 65, ilvl: 90, canHq: true },
  { id: 2, name: 'Cheap Dye',    sc: 56, ui: 65, ilvl: 50, canHq: false },
  { id: 3, name: 'No Recipe',    sc: 56, ui: 65, ilvl: 50, canHq: true },
];

function mkPrice(p: Partial<MarketData[string]>): MarketData[string] {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    velocity: 0, lastUploadTime: Date.now(), listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...p,
  };
}

const baseFilter: QueryFilter = {
  searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0,
  minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
  scope: 'home', maxListings: null, craftableOnly: true,
};

// Recipes: item 1 costs (50 NQ ingredient × 2); item 3 has no recipe.
const recipe1: Recipe = {
  itemResultId: 1, classJob: 'LTW', recipeLevel: 90,
  ingredients: [{ itemId: 99, amount: 2 }],
};

const recipeMap = new Map<number, Recipe | null>([
  [1, recipe1],
  [3, null],
]);

describe('narrowForCraftFlip', () => {
  it('keeps items with velocity ≥ minVelocity, listingCount within cap, and a usable tier', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, averagePriceHQ: 1500, velocity: 1, listingCount: 1 }),
      2: mkPrice({ minNQ: 100,  averagePriceNQ: 200,  velocity: 5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap, { ...baseFilter, minVelocity: 1, maxListings: 2 });
    expect(out.sort()).toEqual([1, 2]);
  });

  it('drops items with no price-map entry', () => {
    const out = narrowForCraftFlip(snapshot, {}, baseFilter);
    expect(out).toEqual([]);
  });

  it('drops items exceeding maxListings', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 100, averagePriceHQ: 200, velocity: 1, listingCount: 5 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap, { ...baseFilter, maxListings: 2 });
    expect(out).toEqual([]);
  });

  it('drops items below minVelocity', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 100, averagePriceHQ: 200, velocity: 0.5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap, { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('honors hq=hq by dropping items where item.canHq is false', () => {
    const priceMap: MarketData = {
      2: mkPrice({ minNQ: 100, averagePriceNQ: 200, velocity: 5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap, { ...baseFilter, hq: 'hq' });
    expect(out).toEqual([]);
  });
});

describe('runCraftFlip', () => {
  it('drops items with no recipe in recipeMap (undefined or null)', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, averagePriceHQ: 1500, velocity: 1, listingCount: 1 }),
      3: mkPrice({ minHQ: 500,  averagePriceHQ: 800,  velocity: 1, listingCount: 1 }),
    };
    // Pass map containing 3 → null (no recipe), and snapshot includes both, but 2 (no entry) too.
    const out = runCraftFlip(snapshot, priceMap, recipeMap, { ...baseFilter, minVelocity: 1 });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('computes materialCost, profit, and gilPerDay', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, averagePriceHQ: 1500, velocity: 2, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, averagePriceNQ: 60, listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap, { ...baseFilter, minVelocity: 1 });
    expect(out).toHaveLength(1);
    expect(out[0].materialCost).toBe(100); // 50 × 2
    expect(out[0].unitPrice).toBe(1000);   // HQ sale (canHq)
    expect(out[0].profit).toBe(900);
    expect(out[0].gilPerDay).toBe(1800);   // 900 × 2
    expect(out[0].hq).toBe(true);
  });

  it('drops items with profit ≤ 0', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 50, averagePriceHQ: 100, velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 100, averagePriceNQ: 120, listingCount: 1 }),
    };
    // material cost = 100 × 2 = 200; sale = 50; profit = -150
    const out = runCraftFlip(snapshot, priceMap, recipeMap, { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('sorts by gilFlow desc and slices to limit', () => {
    const recipe2: Recipe = {
      itemResultId: 2, classJob: 'WVR', recipeLevel: 50,
      ingredients: [{ itemId: 99, amount: 1 }],
    };
    const rm = new Map<number, Recipe | null>([[1, recipe1], [2, recipe2]]);
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, averagePriceHQ: 1500, velocity: 2, listingCount: 1 }),
      2: mkPrice({ minNQ: 5000, averagePriceNQ: 6000, velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, averagePriceNQ: 60, listingCount: 1 }),
    };
    // item 1: profit (1000 - 100) × 2 = 1800
    // item 2: profit (5000 -  50) × 1 = 4950
    const out = runCraftFlip(snapshot, priceMap, rm, { ...baseFilter, minVelocity: 1, limit: 2 });
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

```bash
npx vitest --run src/features/queries/runCraftFlip.test.ts
```

Expected: FAIL — module not defined.

- [ ] **Step 3: Implement**

Write `src/features/queries/runCraftFlip.ts`:
```ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import { computeMaterialCost } from '../profit/computeProfit';
import type { CraftFlipRow, HqMode, QueryFilter, QuerySort } from './types';

function pickTier(m: MarketItem, hq: HqMode, canHq: boolean): { unit: number; isHq: boolean } | null {
  const hqUnit = m.minHQ;
  const nqUnit = m.minNQ;
  if (hq === 'hq') {
    if (!canHq || hqUnit == null) return null;
    return { unit: hqUnit, isHq: true };
  }
  if (hq === 'nq') {
    if (nqUnit == null) return null;
    return { unit: nqUnit, isHq: false };
  }
  // 'either' — prefer HQ when item is HQ-capable and HQ price exists; else NQ.
  if (canHq && hqUnit != null) return { unit: hqUnit, isHq: true };
  if (nqUnit != null) return { unit: nqUnit, isHq: false };
  return null;
}

function hasUsableTier(m: MarketItem, hq: HqMode, canHq: boolean): boolean {
  return pickTier(m, hq, canHq) !== null;
}

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
    if (m.velocity < filter.minVelocity) continue;
    if (filter.maxListings != null && m.listingCount > filter.maxListings) continue;
    if (!hasUsableTier(m, filter.hq, item.canHq)) continue;
    out.push(item.id);
  }
  return out;
}

function compare(a: CraftFlipRow, b: CraftFlipRow, sort: QuerySort): number {
  switch (sort) {
    case 'gilFlow':   return b.gilPerDay - a.gilPerDay;
    case 'velocity':  return b.velocity - a.velocity;
    case 'unitPrice': return b.unitPrice - a.unitPrice;
    case 'discount':  // profit margin desc
      return (b.profit / Math.max(1, b.unitPrice)) - (a.profit / Math.max(1, a.unitPrice));
  }
}

export function runCraftFlip(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  recipeMap: Map<number, Recipe | null>,
  filter: QueryFilter,
): CraftFlipRow[] {
  const narrowed = new Set(narrowForCraftFlip(snapshot, priceMap, filter));
  const out: CraftFlipRow[] = [];

  for (const item of snapshot) {
    if (!narrowed.has(item.id)) continue;
    const recipe = recipeMap.get(item.id);
    if (!recipe) continue;                    // undefined (unresolved) or null (no recipe) — drop

    const m = priceMap[item.id];
    const tier = pickTier(m, filter.hq, item.canHq);
    if (!tier) continue;

    const materialCost = computeMaterialCost(recipe, recipeMap, priceMap, {});
    const profit = tier.unit - materialCost;
    if (profit <= 0) continue;
    if (filter.minPrice != null && tier.unit < filter.minPrice) continue;
    if (filter.maxPrice != null && tier.unit > filter.maxPrice) continue;

    out.push({
      id: item.id, name: item.name, sc: item.sc,
      unitPrice: tier.unit,
      materialCost,
      profit,
      velocity: m.velocity,
      gilPerDay: profit * m.velocity,
      hq: tier.isHq,
    });
  }

  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
```

- [ ] **Step 4: Run tests, confirm green**

```bash
npx vitest --run src/features/queries/runCraftFlip.test.ts
```

Expected: 9 passed (5 narrow + 4 run).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/runCraftFlip.ts src/features/queries/runCraftFlip.test.ts
git commit -m "feat(queries): runCraftFlip pure pipeline + narrowForCraftFlip"
```

---

## Task 5: CraftFlipResults component

**Files:**
- Create: `src/features/queries/CraftFlipResults.tsx`

- [ ] **Step 1: Implement**

Write `src/features/queries/CraftFlipResults.tsx`:
```tsx
import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import type { CraftFlipRow } from './types';

interface Props {
  rows: CraftFlipRow[];
  totalCandidates: number;
  skippedChunks: number;
}

export function CraftFlipResults({ rows, totalCandidates, skippedChunks }: Props) {
  if (rows.length === 0) {
    return (
      <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
        No craft-flip opportunities. Try lowering Min velocity, raising Max listings, or widening categories.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] text-text-low">
        Showing {rows.length} of {totalCandidates} candidates
        {skippedChunks > 0 && <span className="text-crimson"> · {skippedChunks} batch(es) skipped (Universalis error)</span>}
      </div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Sale</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Materials</th>
              <th className="text-right px-3 py-2">Profit</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Velocity</th>
              <th className="text-right px-3 py-2">Gil / day</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className="px-3 py-2.5 font-mono text-text-low">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="text-text-cream">{r.name} {r.hq && <span className="text-gold">★</span>}</div>
                  <div className="font-mono text-[10px] text-text-low">{categoryLabel(r.sc)}</div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.unitPrice)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">{fmtGil(r.materialCost)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-jade">+{fmtGil(r.profit)}</td>
                <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">{r.velocity.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gold-hi">{fmtGil(Math.round(r.gilPerDay))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/CraftFlipResults.tsx
git commit -m "feat(queries): CraftFlipResults table component"
```

---

## Task 6: QueryBuilder — three new controls

**Files:**
- Modify: `src/features/queries/QueryBuilder.tsx`

- [ ] **Step 1: Update imports**

Open `src/features/queries/QueryBuilder.tsx`. Update the type import at the top:
```ts
import type { HqMode, QueryFilter, QueryScope, QuerySort } from './types';
```

- [ ] **Step 2: Add the new controls**

Inside the existing grid (the `<div className="grid grid-cols-2 md:grid-cols-4 gap-3">` block), after the `Limit` input + `Run query` button, add a new row of controls. Since the grid is 4 columns and the existing 8 cells fill 2 rows of 4, append these three cells (they'll start a third row, with the remaining grid cell empty):

```tsx
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Scope</span>
          <select
            value={value.scope}
            onChange={(e) => patch({ scope: e.target.value as QueryScope })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          >
            <option value="home">Home world</option>
            <option value="dc">DC</option>
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Max listings</span>
          <input
            type="number" min={0} step={1}
            value={value.maxListings ?? ''}
            onChange={(e) => patch({ maxListings: nullableIntInput(e) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="flex items-center gap-2 mt-5 text-sm">
          <input
            type="checkbox"
            checked={value.craftableOnly}
            onChange={(e) => patch({ craftableOnly: e.target.checked })}
          />
          <span>Craftable only <span className="text-text-low font-mono text-[10px]">(adds recipe lookup)</span></span>
        </label>
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/features/queries/QueryBuilder.tsx
git commit -m "feat(queries): builder controls for scope / maxListings / craftableOnly"
```

---

## Task 7: Queries route — branch on craftableOnly, scope-aware fetch, lazy useRecipes

**Files:**
- Modify: `src/routes/Queries.tsx`

This is the biggest task. The route currently has one pipeline (price fetch → runQuery → render). The new shape is: price fetch → if craftableOnly { narrow → useRecipes → runCraftFlip → CraftFlipResults } else { runQuery → QueryResults }.

- [ ] **Step 1: Replace the file contents**

Open `src/routes/Queries.tsx`. Replace the entire file with:
```tsx
import { useMemo, useState } from 'react';
import { useSettingsStore } from '../features/settings/store';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useMutation } from '@tanstack/react-query';
import { fetchInBatches } from '../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../lib/universalis';
import { PRESETS, getPreset } from '../features/queries/presets';
import { runQuery } from '../features/queries/runQuery';
import { runCraftFlip, narrowForCraftFlip } from '../features/queries/runCraftFlip';
import { useRecipes } from '../features/profit/useRecipes';
import { QueryBuilder } from '../features/queries/QueryBuilder';
import { QueryResults } from '../features/queries/QueryResults';
import { CraftFlipResults } from '../features/queries/CraftFlipResults';
import type { QueryFilter, QueryResultRow, CraftFlipRow } from '../features/queries/types';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

const DEFAULT_FILTER: QueryFilter = PRESETS[0].filter;

interface PriceFetchResult {
  priceMap: MarketData;
  candidateIds: number[];
  narrowedIds: number[];   // only populated for craftableOnly runs
  skipped: number;
  filterAtRun: QueryFilter;
}

export default function Queries() {
  const { world, dc } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const [filter, setFilter] = useState<QueryFilter>(DEFAULT_FILTER);
  const [activePresetId, setActivePresetId] = useState<string | null>(PRESETS[0].id);

  const candidateIds = useMemo(() => {
    if (!snapshot.data) return [];
    const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
    const out: number[] = [];
    for (const item of snapshot.data.items) {
      if (catSet && !catSet.has(item.sc)) continue;
      if (filter.hq === 'hq' && !item.canHq) continue;
      out.push(item.id);
    }
    return out;
  }, [snapshot.data, filter.searchCategories, filter.hq]);

  const run = useMutation<PriceFetchResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      const target = filter.scope === 'home' ? world : dc;
      const result = await fetchInBatches<MarketData[string]>(
        candidateIds,
        async (chunk) => fetchMarketData(target, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      const narrowedIds = filter.craftableOnly
        ? narrowForCraftFlip(snapshot.data.items, result.data, filter)
        : [];
      return {
        priceMap: result.data,
        candidateIds: [...candidateIds],
        narrowedIds,
        skipped: result.errors.length,
        filterAtRun: filter,
      };
    },
  });

  // Lazy recipe fetch — only when craftableOnly is on AND we have narrowedIds.
  const recipes = useRecipes(run.data?.narrowedIds ?? []);

  function applyPreset(id: string) {
    const p = getPreset(id);
    if (!p) return;
    setFilter(p.filter);
    setActivePresetId(id);
    run.reset();
  }

  function onFilterChange(next: QueryFilter) {
    setFilter(next);
    setActivePresetId(null);
  }

  // Derive rows based on filter mode (using the snapshot-at-mutation-time data).
  const derived = useMemo(() => {
    if (!run.data || !snapshot.data) return null;
    const f = run.data.filterAtRun;
    if (f.craftableOnly) {
      // Nothing survived narrowing — render empty results immediately (no recipe wait).
      if (run.data.narrowedIds.length === 0) {
        return { kind: 'craft' as const, rows: [] as CraftFlipRow[] };
      }
      if (!recipes.data) return null;
      const rows: CraftFlipRow[] = runCraftFlip(snapshot.data.items, run.data.priceMap, recipes.data, f);
      return { kind: 'craft' as const, rows };
    }
    const rows: QueryResultRow[] = runQuery(snapshot.data.items, run.data.priceMap, f);
    return { kind: 'query' as const, rows };
  }, [run.data, recipes.data, snapshot.data]);

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <h2 className="font-display text-lg text-gold tracking-wide">Best Deals Queries</h2>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
              activePresetId === p.id ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
            }`}
            title={p.desc}
          >
            {p.label}
          </button>
        ))}
      </div>

      {snapshot.isLoading && (
        <Spinner label={`Loading item DB (one-time, ~30s)… ${snapshot.progress.toLocaleString()} items`} />
      )}
      {snapshot.isError && (
        <StatusBanner kind="error">XIVAPI item snapshot failed: {(snapshot.error as Error).message}</StatusBanner>
      )}

      {snapshot.data && (
        <>
          <QueryBuilder
            value={filter}
            onChange={onFilterChange}
            onRun={() => run.mutate()}
            busy={run.isPending || (filter.craftableOnly && recipes.isLoading)}
          />
          <div className="font-mono text-[10px] text-text-low">
            {candidateIds.length.toLocaleString()} items in scope
            {run.data?.filterAtRun.craftableOnly && (
              <> · {run.data.narrowedIds.length.toLocaleString()} narrowed for recipe lookup</>
            )}
          </div>

          {run.isPending && <Spinner label={`Fetching prices for ${candidateIds.length} items…`} />}
          {run.isError && <StatusBanner kind="error">Query failed: {(run.error as Error).message}</StatusBanner>}
          {run.data?.filterAtRun.craftableOnly && recipes.isLoading && (
            <Spinner label={`Resolving ${run.data.narrowedIds.length} recipes…`} />
          )}
          {recipes.isError && <StatusBanner kind="error">XIVAPI recipe fetch failed.</StatusBanner>}

          {derived?.kind === 'query' && (
            <QueryResults
              rows={derived.rows}
              totalCandidates={candidateIds.length}
              skippedChunks={run.data?.skipped ?? 0}
            />
          )}
          {derived?.kind === 'craft' && (
            <CraftFlipResults
              rows={derived.rows}
              totalCandidates={run.data?.narrowedIds.length ?? 0}
              skippedChunks={run.data?.skipped ?? 0}
            />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: clean build. If TypeScript complains about `useRecipes` import path, verify it's `../features/profit/useRecipes` (the existing module).

- [ ] **Step 3: Run all tests**

```bash
npm test -- --run
```

Expected: all green (existing 174 + the new tests from Tasks 1–4 = ~190).

Note: the existing `Queries.test.tsx` smoke test should still pass. It uses the default preset (Mega Value HQ → DC scope, non-craftable), so the new code path is opt-in.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Queries.tsx
git commit -m "feat(queries): route branches on craftableOnly + scope-aware fetch + lazy recipes"
```

---

## Task 8: Smoke test for Undersupply path

**Files:**
- Modify: `src/routes/Queries.test.tsx`

- [ ] **Step 1: Append the test**

Open `src/routes/Queries.test.tsx`. Inside the existing `describe('Queries route', ...)`, append:
```tsx
  it('Undersupply preset: home-world fetch + lazy recipes + maxListings filter', async () => {
    await putCachedItems([
      { id: 200, name: 'Scarce Craft', sc: 56, ui: 65, ilvl: 90, canHq: true },
      { id: 201, name: 'Oversupplied', sc: 56, ui: 65, ilvl: 90, canHq: true },
      { id: 299, name: 'Ingredient',   sc: 47, ui: 0,  ilvl: 1,  canHq: false },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      // Universalis (item prices) — match by URL pattern
      if (url.includes('universalis.app/api/v2/')) {
        return {
          ok: true,
          json: async () => ({
            items: {
              '200': {
                listings: [{ hq: true, pricePerUnit: 1000, worldName: 'Phantom' }],
                recentHistory: [],
                regularSaleVelocity: 2,
                lastUploadTime: Date.now(),
                averagePriceNQ: null,
                averagePriceHQ: 1200,
              },
              '201': {
                listings: Array.from({ length: 6 }, () => ({ hq: true, pricePerUnit: 1000, worldName: 'Phantom' })),
                recentHistory: [],
                regularSaleVelocity: 5,
                lastUploadTime: Date.now(),
                averagePriceNQ: null,
                averagePriceHQ: 1200,
              },
              '299': {
                listings: [{ hq: false, pricePerUnit: 50, worldName: 'Phantom' }],
                recentHistory: [],
                regularSaleVelocity: 5,
                lastUploadTime: Date.now(),
                averagePriceNQ: 60,
                averagePriceHQ: null,
              },
            },
          }),
        };
      }
      // XIVAPI recipe search — return a recipe for item 200, nothing for 201
      if (url.includes('xivapi.com/api/search') && url.includes('ItemResult%3D200')) {
        return {
          ok: true,
          json: async () => ({
            results: [{
              fields: {
                ItemResult: { value: 200 },
                CraftType: { fields: { Name: 'Leatherworker' } },
                RecipeLevelTable: { fields: { ClassJobLevel: 90 } },
                Ingredient0: { value: 299 },
                AmountIngredient0: 2,
              },
            }],
          }),
        };
      }
      // Any other XIVAPI call (no-results for narrowing fall-through)
      if (url.includes('xivapi.com')) {
        return { ok: true, json: async () => ({ results: [] }) };
      }
      return { ok: false, status: 404 };
    }));

    render(withProviders(<Queries />));
    fireEvent.click(await screen.findByRole('button', { name: /undersupply/i }));
    fireEvent.click(screen.getByRole('button', { name: /run query/i }));

    // Item 200 should appear (canHq, 1 listing, velocity 2, recipe resolved).
    // Item 201 dropped by maxListings (6 > 2).
    await waitFor(
      () => expect(screen.getByText(/Scarce Craft/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByText(/Oversupplied/)).toBeNull();
  });
```

- [ ] **Step 2: Run tests**

```bash
npx vitest --run src/routes/Queries.test.tsx
```

Expected: 3 passed (2 existing + 1 new). If the new test flakes, raise the `waitFor` timeout to 10000ms.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Queries.test.tsx
git commit -m "test(queries): Undersupply preset smoke test"
```

---

## Task 9: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README section**

Open `README.md`. Find the existing "Best Deals Queries" section. Replace it with:
```markdown

## Best Deals Queries

A `/queries` route inspired by Saddlebag Exchange. Scans the Chaos DC (or your home
world, per-preset) and ranks items by discount, gil/day, velocity, or unit price.

- **Item DB:** one-time fetch of ~80k marketable items from XIVAPI, cached in IndexedDB
  forever. Refresh from Settings after a game patch.
- **Bulk fetcher:** chunks IDs into 100-per-batch Universalis calls with concurrency 4.
  A whole-market scan takes ~10–40s depending on filters.
- **DC presets:** *Mega Value HQ*, *Fast Sellers HQ*, *Food & Potions*, *Furnishings discount*.
  Use these to find deals across the DC.
- **Home-world presets (no travel):**
  - *Undersupply (craft + list)* — items selling on your home world with ≤2 listings.
    Craft and list to fill a real supply gap.
  - *Craft-flip Phantom* — craftable items ranked by `(sale − material cost) × velocity`
    on your home world. Lazy recipe lookup over the narrowed candidate set.
- **Builder:** every filter is editable — scope (Home / DC), HQ/NQ, category multi-select,
  min discount, min velocity, max listings, price range, sort, limit, and a
  Craftable-only toggle that swaps in the craft-flip pipeline.
```

- [ ] **Step 2: Final test + build**

```bash
npm test -- --run
npm run build
```

Expected: all tests green (~190 total), clean build.

If anything fails, stop and report BLOCKED — do not commit a broken state.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: home-server queries in README"
```

---

## Done when

- `npm test -- --run` green.
- `npm run build` clean.
- `/queries` shows 6 preset chips: 4 DC + 2 home-world (Undersupply, Craft-flip Phantom).
- Clicking **Undersupply**: route fetches home-world prices, narrows candidates by velocity ≥ 1 + listings ≤ 2, kicks off `useRecipes` on narrowed ids, renders `CraftFlipResults` table with profit + gil/day columns.
- Clicking **Craft-flip Phantom**: same path but no listing cap.
- Builder lets the user override scope, maxListings, and craftable-only on any preset.
- Existing 4 presets behave exactly as before (DC-scoped, non-craftable).
- No regressions in other features.
