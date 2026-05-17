# Material Flip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-world material sourcing feature so the user can craft expensive items for less by buying ingredients on cheaper EU worlds — including a discovery scan (new tab in `/trading`), a per-item drill-down on `/item/:id`, and an in-context "Add to watchlist" button on `/item/:id`.

**Architecture:** A new `runMaterialFlip` runner mirrors the existing `runCraftFlip` pattern but consumes region-scoped (`Europe`) market data so it can compare home-world ingredient prices against the cheapest listings region-wide. The scan view (`MaterialFlipView`) lives next to `ArbitrageView` in `/trading` and is wired in as a fourth tab. The drill-down panel and Add button live on `/item/:id` and reuse the same region fetch via a small extension to `useMarketData`. World→DC partition is a static map in `src/lib/europeWorlds.ts`.

**Tech Stack:** TypeScript, React, Zustand (`useWatchlistStore`), TanStack Query (`useMarketData`), Vitest + React Testing Library, Tailwind. Universalis API supports any scope string (world / DC / region), so no fetcher change is needed.

---

## Task 1: Europe worlds partition

**Files:**
- Create: `src/lib/europeWorlds.ts`
- Test: `src/lib/europeWorlds.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/europeWorlds.test.ts
import { describe, it, expect } from 'vitest';
import { dcOf, CHAOS_WORLDS, LIGHT_WORLDS, EU_WORLDS } from './europeWorlds';

describe('europeWorlds', () => {
  it('partitions known Chaos worlds correctly', () => {
    expect(dcOf('Phantom')).toBe('Chaos');
    expect(dcOf('Lich')).toBe('Chaos');
    expect(dcOf('Cerberus')).toBe('Chaos');
  });

  it('partitions known Light worlds correctly', () => {
    expect(dcOf('Twintania')).toBe('Light');
    expect(dcOf('Odin')).toBe('Light');
    expect(dcOf('Phoenix')).toBe('Light');
  });

  it('returns null for unknown worlds', () => {
    expect(dcOf('Bahamut')).toBeNull();     // JP world
    expect(dcOf('')).toBeNull();
  });

  it('CHAOS_WORLDS and LIGHT_WORLDS are disjoint and together = EU_WORLDS', () => {
    for (const w of CHAOS_WORLDS) expect(LIGHT_WORLDS.has(w)).toBe(false);
    expect(EU_WORLDS.size).toBe(CHAOS_WORLDS.size + LIGHT_WORLDS.size);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/europeWorlds.test.ts`
Expected: FAIL — `Cannot find module './europeWorlds'`

- [ ] **Step 3: Implement the module**

```ts
// src/lib/europeWorlds.ts
export const CHAOS_WORLDS: ReadonlySet<string> = new Set([
  'Cerberus', 'Louisoix', 'Moogle', 'Omega', 'Phantom',
  'Ragnarok', 'Sagittarius', 'Spriggan',
]);

export const LIGHT_WORLDS: ReadonlySet<string> = new Set([
  'Alpha', 'Lich', 'Odin', 'Phoenix', 'Raiden',
  'Shiva', 'Twintania', 'Zodiark',
]);

export const EU_WORLDS: ReadonlySet<string> = new Set([
  ...CHAOS_WORLDS, ...LIGHT_WORLDS,
]);

export type EuDc = 'Chaos' | 'Light';

export function dcOf(world: string): EuDc | null {
  if (CHAOS_WORLDS.has(world)) return 'Chaos';
  if (LIGHT_WORLDS.has(world)) return 'Light';
  return null;
}
```

Note: In the source above, `Lich` is in Light. Update the test to match the real game (Lich is on Light DC, not Chaos). Fix the test:

```ts
// Replace the wrong assertion in the test:
//   expect(dcOf('Lich')).toBe('Chaos');
// with:
    expect(dcOf('Lich')).toBe('Light');
// And add a real Chaos example, e.g. 'Omega':
    expect(dcOf('Omega')).toBe('Chaos');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/europeWorlds.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/europeWorlds.ts src/lib/europeWorlds.test.ts
git commit -m "feat(lib): EU worlds Chaos/Light DC partition"
```

---

## Task 2: Extend `useMarketData` to support region scope

**Files:**
- Modify: `src/features/watchlist/useMarketData.ts`

This task adds an optional `region` argument. Callers that don't pass it (existing call sites) keep working unchanged.

- [ ] **Step 1: Update the hook**

Replace the contents of `src/features/watchlist/useMarketData.ts` with:

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchMarketData, type MarketData } from '../../lib/universalis';

export interface MarketBundle {
  phantom: MarketData;
  dc: MarketData;
  region: MarketData;  // empty object when region arg is not supplied
}

export function useMarketData(
  ids: number[],
  world: string,
  dc: string,
  region?: string,
) {
  const sortedIds = [...ids].sort((a, b) => a - b);
  return useQuery<MarketBundle>({
    queryKey: ['market', world, dc, region ?? null, sortedIds],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [phantom, dcRes, regionRes] = await Promise.all([
        fetchMarketData(world, sortedIds),
        fetchMarketData(dc, sortedIds),
        region ? fetchMarketData(region, sortedIds) : Promise.resolve({}),
      ]);
      return { phantom, dc: dcRes, region: regionRes };
    },
  });
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run`
Expected: All existing tests pass (the new `region` field defaults to `{}` so consumers that ignore it are unaffected).

If `Item.test.tsx` or anything else destructures `{ phantom, dc }` from `market.data`, they still work because we only added a new field.

- [ ] **Step 3: Commit**

```bash
git add src/features/watchlist/useMarketData.ts
git commit -m "feat(market): optional region scope in useMarketData"
```

---

## Task 3: Material flip types

**Files:**
- Modify: `src/features/queries/types.ts`

- [ ] **Step 1: Append types to the file**

Add these exports to the end of `src/features/queries/types.ts`:

```ts
export type MaterialFlipSort =
  | 'gilSavedPerDay'
  | 'savePerCraft'
  | 'pctDiscount'
  | 'salePrice'
  | 'velocity';

export interface MaterialFlipFilter {
  searchCategories: number[];
  hq: HqMode;
  minVelocity: number;
  maxListings: number | null;
  minSavings: number;       // gil — drop rows whose perIngredientSavings is below this
  includeLightDc: boolean;  // when false, restrict to Chaos worlds
  sort: MaterialFlipSort;
  limit: number;
}

export interface MaterialFlipRow {
  id: number;
  name: string;
  sc: number;
  hq: boolean;              // sale-side tier chosen by pickTrustedTier
  salePrice: number;
  velocity: number;

  homeMatCost: number;
  bestPerIngredientCost: number;
  perIngredientSavings: number;

  bestSingleWorld: string;
  singleStopCost: number;
  singleStopSavings: number;
  needsDcTravel: boolean;

  gilSavedPerDay: number;
  pctDiscount: number;      // 0..1
}

export function defaultMaterialFlipFilter(): MaterialFlipFilter {
  return {
    searchCategories: [], hq: 'either', minVelocity: 1, maxListings: 20,
    minSavings: 1000, includeLightDc: true, sort: 'gilSavedPerDay', limit: 200,
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/types.ts
git commit -m "feat(types): MaterialFlipFilter + MaterialFlipRow"
```

---

## Task 4: `runMaterialFlip` — per-ingredient cheapest

**Files:**
- Create: `src/features/queries/runMaterialFlip.ts`
- Test: `src/features/queries/runMaterialFlip.test.ts`

This task implements the runner with **only** per-ingredient logic. Single-stop comes in Task 5.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/queries/runMaterialFlip.test.ts
import { describe, it, expect } from 'vitest';
import { runMaterialFlip } from './runMaterialFlip';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem, WorldListing } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import { defaultMaterialFlipFilter, type MaterialFlipFilter } from './types';

const snapshot: SnapshotItem[] = [
  { id: 1, name: 'Glamour Top', sc: 56, ui: 65, ilvl: 90, canHq: true },
];

function mkSale(p: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0,
    velocity: 0, lastUploadTime: Date.now(), listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...p,
  };
}

function listing(world: string, price: number, hq = false): WorldListing {
  return { world, price, hq };
}

function ing(world: string, price: number): MarketItem {
  return mkSale({ worldListings: [listing(world, price)] });
}

const recipe1: Recipe = {
  itemResultId: 1, classJob: 'LTW', recipeLevel: 90,
  ingredients: [{ itemId: 99, amount: 2 }, { itemId: 100, amount: 1 }],
};
const recipes = new Map<number, Recipe | null>([[1, recipe1]]);

const baseFilter: MaterialFlipFilter = {
  ...defaultMaterialFlipFilter(),
  minSavings: 1, // tiny threshold for fixtures
};

describe('runMaterialFlip — per-ingredient cheapest', () => {
  it('computes homeMatCost, bestPerIngredientCost, perIngredientSavings', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 2, listingCount: 1,
        worldListings: [listing('Phantom', 10_000, true)],
      }),
    };
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [
        listing('Phantom', 100), listing('Lich', 60),
      ] }),
      100: mkSale({ worldListings: [
        listing('Phantom', 500), listing('Omega', 400),
      ] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes, 'Phantom', baseFilter);
    expect(out).toHaveLength(1);
    const r = out[0];
    // home: 100*2 + 500*1 = 700
    expect(r.homeMatCost).toBe(700);
    // best per-ingredient: 60*2 + 400*1 = 520
    expect(r.bestPerIngredientCost).toBe(520);
    expect(r.perIngredientSavings).toBe(180);
    expect(r.salePrice).toBe(10_000);
    expect(r.velocity).toBe(2);
    expect(r.gilSavedPerDay).toBe(360);
    expect(r.pctDiscount).toBeCloseTo(180 / 700);
    expect(r.hq).toBe(true);
  });

  it('drops rows with no trusted sale tier', () => {
    const saleMap: MarketData = {
      1: mkSale({  // no minHQ, no minNQ → no trusted tier
        velocity: 2, listingCount: 1,
      }),
    };
    const out = runMaterialFlip(snapshot, saleMap, {}, recipes, 'Phantom', baseFilter);
    expect(out).toEqual([]);
  });

  it('drops rows below minSavings', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 2, listingCount: 1,
      }),
    };
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [listing('Phantom', 100)] }),  // no cheaper world
      100: mkSale({ worldListings: [listing('Phantom', 500)] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes,
      'Phantom', { ...baseFilter, minSavings: 1 });
    expect(out).toEqual([]);  // savings = 0
  });

  it('falls back to home price when ingredient has no region listings', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [listing('Phantom', 100)] }),
      // 100 has no entries at all
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes,
      'Phantom', { ...baseFilter, minSavings: 1 });
    // homeMatCost = 100*2 + (missing → 0) = 200; best same; savings = 0 → dropped
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/queries/runMaterialFlip.test.ts`
Expected: FAIL — `Cannot find module './runMaterialFlip'`

- [ ] **Step 3: Implement the runner (per-ingredient only)**

```ts
// src/features/queries/runMaterialFlip.ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
import type { HqMode, MaterialFlipFilter, MaterialFlipRow } from './types';

interface SaleTier { unit: number; isHq: boolean }

function pickTrustedSaleTier(m: MarketItem, hq: HqMode, canHq: boolean): SaleTier | null {
  const candidates: Array<{ rawMin: number | null; median: number | null; recent: number; isHq: boolean }> = [];
  if ((hq === 'hq' || hq === 'either') && canHq) {
    candidates.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  }
  if (hq === 'nq' || hq === 'either') {
    candidates.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  }
  for (const c of candidates) {
    if (c.rawMin == null) continue;
    if (c.recent < MIN_RECENT_SALES) continue;
    if (c.median == null) continue;
    if (c.rawMin > c.median * MAX_LISTING_RATIO) continue;
    return { unit: Math.min(c.rawMin, c.median), isHq: c.isHq };
  }
  return null;
}

function homeIngredientPrice(m: MarketItem | undefined, homeWorld: string): number {
  if (!m) return 0;
  const nq = m.worldListings.filter((l) => !l.hq && l.world === homeWorld);
  if (nq.length) return Math.min(...nq.map((l) => l.price));
  return 0;
}

function bestRegionIngredientPrice(m: MarketItem | undefined, worldFilter: (w: string) => boolean): number | null {
  if (!m) return null;
  const nq = m.worldListings.filter((l) => !l.hq && worldFilter(l.world));
  if (nq.length === 0) return null;
  return Math.min(...nq.map((l) => l.price));
}

export function runMaterialFlip(
  snapshot: SnapshotItem[],
  saleMap: MarketData,
  ingMap: MarketData,
  recipeMap: Map<number, Recipe | null>,
  homeWorld: string,
  filter: MaterialFlipFilter,
): MaterialFlipRow[] {
  const out: MaterialFlipRow[] = [];
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;

  // Single-stop calculation is added in Task 5. Placeholder values for now.
  const worldFilter = (_w: string) => true;

  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.hq === 'hq' && !item.canHq) continue;

    const sale = saleMap[item.id];
    if (!sale) continue;
    if (sale.velocity < filter.minVelocity) continue;
    if (filter.maxListings != null && sale.listingCount > filter.maxListings) continue;

    const tier = pickTrustedSaleTier(sale, filter.hq, item.canHq);
    if (!tier) continue;

    const recipe = recipeMap.get(item.id);
    if (!recipe) continue;

    let homeMatCost = 0;
    let bestPerIngredientCost = 0;
    for (const ing of recipe.ingredients) {
      const ingMarket = ingMap[ing.itemId];
      const homeUnit = homeIngredientPrice(ingMarket, homeWorld);
      const bestUnit = bestRegionIngredientPrice(ingMarket, worldFilter);
      homeMatCost += homeUnit * ing.amount;
      bestPerIngredientCost += (bestUnit ?? homeUnit) * ing.amount;
    }

    const perIngredientSavings = homeMatCost - bestPerIngredientCost;
    if (perIngredientSavings < filter.minSavings) continue;

    out.push({
      id: item.id, name: item.name, sc: item.sc, hq: tier.isHq,
      salePrice: tier.unit, velocity: sale.velocity,
      homeMatCost, bestPerIngredientCost, perIngredientSavings,
      // Filled in by Task 5:
      bestSingleWorld: '', singleStopCost: 0, singleStopSavings: 0, needsDcTravel: false,
      gilSavedPerDay: perIngredientSavings * sale.velocity,
      pctDiscount: perIngredientSavings / Math.max(1, homeMatCost),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/queries/runMaterialFlip.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/runMaterialFlip.ts src/features/queries/runMaterialFlip.test.ts
git commit -m "feat(material-flip): per-ingredient cheapest savings runner"
```

---

## Task 5: `runMaterialFlip` — single-stop world

**Files:**
- Modify: `src/features/queries/runMaterialFlip.ts`
- Modify: `src/features/queries/runMaterialFlip.test.ts`

- [ ] **Step 1: Append failing tests for single-stop logic**

Append to `src/features/queries/runMaterialFlip.test.ts`:

```ts
describe('runMaterialFlip — single-stop world', () => {
  it('chooses the world that minimizes the full basket, not the most-cheapest-ingredients world', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    // Lich is cheapest for ingredient 99 (60 vs 100). Omega is cheapest for
    // ingredient 100 (400 vs 500). But Omega's basket (100*2 + 400 = 600) beats
    // Lich's basket (60*2 + 500 = 620). Single-stop should pick Omega.
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [
        listing('Phantom', 100), listing('Lich', 60), listing('Omega', 100),
      ] }),
      100: mkSale({ worldListings: [
        listing('Phantom', 500), listing('Lich', 500), listing('Omega', 400),
      ] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes, 'Phantom', baseFilter);
    expect(out).toHaveLength(1);
    expect(out[0].bestSingleWorld).toBe('Omega');
    expect(out[0].singleStopCost).toBe(600);
    expect(out[0].singleStopSavings).toBe(100);  // 700 home - 600 omega
    expect(out[0].needsDcTravel).toBe(false);    // Omega is Chaos
  });

  it('flags needsDcTravel when single-stop winner is on Light DC', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [
        listing('Phantom', 100), listing('Twintania', 40),
      ] }),
      100: mkSale({ worldListings: [
        listing('Phantom', 500), listing('Twintania', 300),
      ] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes, 'Phantom', baseFilter);
    expect(out[0].bestSingleWorld).toBe('Twintania');
    expect(out[0].needsDcTravel).toBe(true);
  });

  it('respects includeLightDc=false by ignoring Light worlds in both calcs', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [
        listing('Phantom', 100), listing('Twintania', 10),  // Twintania (Light) excluded
      ] }),
      100: mkSale({ worldListings: [
        listing('Phantom', 500), listing('Omega', 400),
      ] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes,
      'Phantom', { ...baseFilter, includeLightDc: false });
    expect(out).toHaveLength(1);
    // per-ingredient best uses only Chaos: 100*2 + 400 = 600 (NOT 10*2)
    expect(out[0].bestPerIngredientCost).toBe(600);
    expect(out[0].bestSingleWorld).toBe('Omega');
  });

  it('falls back to home as the single-stop when no other world has all ingredients', () => {
    const saleMap: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    // Lich has 99 cheap but not 100 at all. Phantom has both.
    const ingMap: MarketData = {
      99: mkSale({ worldListings: [
        listing('Phantom', 100), listing('Lich', 60),
      ] }),
      100: mkSale({ worldListings: [
        listing('Phantom', 500),
      ] }),
    };
    const out = runMaterialFlip(snapshot, saleMap, ingMap, recipes, 'Phantom', baseFilter);
    expect(out[0].bestSingleWorld).toBe('Phantom');
    expect(out[0].singleStopCost).toBe(700);
    expect(out[0].singleStopSavings).toBe(0);
    // But per-ingredient savings still picks Lich for ingredient 99:
    expect(out[0].perIngredientSavings).toBe(80);  // 700 - (60*2 + 500)
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/features/queries/runMaterialFlip.test.ts`
Expected: 4 NEW tests fail (assertions on `bestSingleWorld`, `needsDcTravel`, etc. don't match the placeholder values from Task 4).

- [ ] **Step 3: Add the single-stop logic**

Edit `src/features/queries/runMaterialFlip.ts`. Add this import at the top:

```ts
import { dcOf, CHAOS_WORLDS, EU_WORLDS } from '../../lib/europeWorlds';
```

Then add this helper above `runMaterialFlip`:

```ts
function findBestSingleStop(
  ingredients: { itemId: number; amount: number }[],
  ingMap: MarketData,
  candidateWorlds: Iterable<string>,
  homeWorld: string,
  homeMatCost: number,
): { world: string; cost: number } {
  let best = { world: homeWorld, cost: homeMatCost };
  for (const world of candidateWorlds) {
    let total = 0;
    let complete = true;
    for (const ing of ingredients) {
      const m = ingMap[ing.itemId];
      if (!m) { complete = false; break; }
      const here = m.worldListings.filter((l) => !l.hq && l.world === world);
      if (here.length === 0) { complete = false; break; }
      total += Math.min(...here.map((l) => l.price)) * ing.amount;
    }
    if (complete && total < best.cost) best = { world, cost: total };
  }
  return best;
}
```

Now (a) delete the two placeholder lines above the loop (`// Single-stop calculation is added in Task 5. Placeholder values for now.` and `const worldFilter = (_w: string) => true;`), and (b) replace the inside of the main loop, starting where it computes `homeMatCost`. The new code inside the loop, after the existing guards (catSet / hq / sale / velocity / maxListings / tier / recipe), looks like:

```ts
    const candidateWorlds = filter.includeLightDc ? EU_WORLDS : CHAOS_WORLDS;
    const worldFilter = (w: string) => candidateWorlds.has(w);

    let homeMatCost = 0;
    let bestPerIngredientCost = 0;
    for (const ing of recipe.ingredients) {
      const ingMarket = ingMap[ing.itemId];
      const homeUnit = homeIngredientPrice(ingMarket, homeWorld);
      const bestUnit = bestRegionIngredientPrice(ingMarket, worldFilter);
      homeMatCost += homeUnit * ing.amount;
      bestPerIngredientCost += (bestUnit ?? homeUnit) * ing.amount;
    }

    const perIngredientSavings = homeMatCost - bestPerIngredientCost;
    if (perIngredientSavings < filter.minSavings) continue;

    const singleStop = findBestSingleStop(
      recipe.ingredients, ingMap, candidateWorlds, homeWorld, homeMatCost,
    );

    out.push({
      id: item.id, name: item.name, sc: item.sc, hq: tier.isHq,
      salePrice: tier.unit, velocity: sale.velocity,
      homeMatCost, bestPerIngredientCost, perIngredientSavings,
      bestSingleWorld: singleStop.world,
      singleStopCost: singleStop.cost,
      singleStopSavings: homeMatCost - singleStop.cost,
      needsDcTravel: dcOf(singleStop.world) === 'Light',
      gilSavedPerDay: perIngredientSavings * sale.velocity,
      pctDiscount: perIngredientSavings / Math.max(1, homeMatCost),
    });
```

Remove the now-unused `const worldFilter = (_w: string) => true;` placeholder from Task 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/queries/runMaterialFlip.test.ts`
Expected: PASS (8 tests total — 4 from Task 4 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/runMaterialFlip.ts src/features/queries/runMaterialFlip.test.ts
git commit -m "feat(material-flip): single-stop world basket optimizer"
```

---

## Task 6: `runMaterialFlip` — sort + slice + narrow helper

**Files:**
- Modify: `src/features/queries/runMaterialFlip.ts`
- Modify: `src/features/queries/runMaterialFlip.test.ts`

The view needs a way to narrow candidate IDs for the ingredient fetch (sale-side trust only) before recipes are pulled. Mirrors `narrowForCraftFlip`.

- [ ] **Step 1: Append failing tests**

Append to `runMaterialFlip.test.ts`:

```ts
import { narrowForMaterialFlip } from './runMaterialFlip';

describe('narrowForMaterialFlip', () => {
  it('keeps items that pass velocity + listings + sale-tier trust', () => {
    const sale: MarketData = {
      1: mkSale({
        minHQ: 10_000, medianHQ: 10_000, recentSalesHQ: 8,
        velocity: 2, listingCount: 1,
      }),
    };
    expect(narrowForMaterialFlip(snapshot, sale, baseFilter)).toEqual([1]);
  });

  it('drops items below minVelocity / over maxListings / no trusted tier', () => {
    const sale: MarketData = {
      1: mkSale({  // no trusted tier
        velocity: 5, listingCount: 1,
      }),
    };
    expect(narrowForMaterialFlip(snapshot, sale, baseFilter)).toEqual([]);
  });
});

describe('runMaterialFlip — sort + slice', () => {
  const twoItems: SnapshotItem[] = [
    { id: 1, name: 'A', sc: 56, ui: 0, ilvl: 90, canHq: true },
    { id: 2, name: 'B', sc: 56, ui: 0, ilvl: 90, canHq: true },
  ];
  const recipeA: Recipe = { itemResultId: 1, classJob: 'LTW', recipeLevel: 90, ingredients: [{ itemId: 99, amount: 1 }] };
  const recipeB: Recipe = { itemResultId: 2, classJob: 'LTW', recipeLevel: 90, ingredients: [{ itemId: 99, amount: 1 }] };
  const rm = new Map<number, Recipe | null>([[1, recipeA], [2, recipeB]]);

  function fixtures(): { sale: MarketData; ing: MarketData } {
    return {
      sale: {
        1: mkSale({ minHQ: 1000, medianHQ: 1000, recentSalesHQ: 8, velocity: 5, listingCount: 1 }),
        2: mkSale({ minHQ: 1000, medianHQ: 1000, recentSalesHQ: 8, velocity: 1, listingCount: 1 }),
      },
      ing: {
        99: mkSale({ worldListings: [listing('Phantom', 100), listing('Lich', 50)] }),
      },
    };
  }

  it('default sort = gilSavedPerDay desc', () => {
    const { sale, ing } = fixtures();
    // Both rows: savings = 50; A velocity 5 → 250/day; B velocity 1 → 50/day
    const out = runMaterialFlip(twoItems, sale, ing, rm, 'Phantom', baseFilter);
    expect(out.map((r) => r.id)).toEqual([1, 2]);
  });

  it('respects limit', () => {
    const { sale, ing } = fixtures();
    const out = runMaterialFlip(twoItems, sale, ing, rm, 'Phantom', { ...baseFilter, limit: 1 });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('sort=pctDiscount sorts by pct desc', () => {
    const { sale, ing } = fixtures();
    // Both items have the same pct discount; order is stable on id.
    // Make B have a larger pct by giving it a more expensive home ingredient.
    ing[99] = mkSale({ worldListings: [listing('Phantom', 100), listing('Lich', 50)] });
    sale[2] = mkSale({ minHQ: 1000, medianHQ: 1000, recentSalesHQ: 8, velocity: 1, listingCount: 1 });
    const out = runMaterialFlip(twoItems, sale, ing, rm, 'Phantom',
      { ...baseFilter, sort: 'pctDiscount' });
    // Both have identical pctDiscount (50/100); both kept; tie-break by id asc.
    expect(out.map((r) => r.id)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/features/queries/runMaterialFlip.test.ts`
Expected: New tests fail (`narrowForMaterialFlip` not exported; sort/limit not yet implemented).

- [ ] **Step 3: Add narrow helper + sort + slice**

In `src/features/queries/runMaterialFlip.ts`, export `narrowForMaterialFlip` and add sort+slice at the end of `runMaterialFlip`:

```ts
export function narrowForMaterialFlip(
  snapshot: SnapshotItem[],
  saleMap: MarketData,
  filter: MaterialFlipFilter,
): number[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: number[] = [];
  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.hq === 'hq' && !item.canHq) continue;
    const m = saleMap[item.id];
    if (!m) continue;
    if (m.velocity < filter.minVelocity) continue;
    if (filter.maxListings != null && m.listingCount > filter.maxListings) continue;
    if (pickTrustedSaleTier(m, filter.hq, item.canHq) == null) continue;
    out.push(item.id);
  }
  return out;
}

function compareRows(a: MaterialFlipRow, b: MaterialFlipRow, sort: MaterialFlipFilter['sort']): number {
  switch (sort) {
    case 'gilSavedPerDay': return b.gilSavedPerDay - a.gilSavedPerDay;
    case 'savePerCraft':   return b.perIngredientSavings - a.perIngredientSavings;
    case 'pctDiscount':    return b.pctDiscount - a.pctDiscount;
    case 'salePrice':      return b.salePrice - a.salePrice;
    case 'velocity':       return b.velocity - a.velocity;
  }
}
```

At the end of `runMaterialFlip` (just before `return out;`), add:

```ts
  out.sort((a, b) => {
    const cmp = compareRows(a, b, filter.sort);
    return cmp !== 0 ? cmp : a.id - b.id;  // stable tie-break by id asc
  });
  return out.slice(0, filter.limit);
```

Replace the existing `return out;` line. (`pickTrustedSaleTier` stays file-scoped — the narrow helper uses it via the same file scope.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/queries/runMaterialFlip.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/runMaterialFlip.ts src/features/queries/runMaterialFlip.test.ts
git commit -m "feat(material-flip): narrow helper + sort + slice"
```

---

## Task 7: `MaterialFlipResults` table component

**Files:**
- Create: `src/features/queries/MaterialFlipResults.tsx`

This is a pure presentational component modeled on `CraftFlipResults`. No tests in this task — it's covered by integration testing in Task 9.

- [ ] **Step 1: Create the component**

```tsx
// src/features/queries/MaterialFlipResults.tsx
import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { InfoTooltip } from '../../components/InfoTooltip';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { MaterialFlipRow, MaterialFlipSort } from './types';

interface Props {
  rows: MaterialFlipRow[];
  totalCandidates: number;
  skippedChunks: number;
  sort: MaterialFlipSort;
  onSortChange: (next: MaterialFlipSort) => void;
}

function SortableHeader({
  active, dir, onClick, children, align = 'right', hideOnMobile = false,
}: {
  active: boolean;
  dir: 'desc';
  onClick: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  hideOnMobile?: boolean;
}) {
  const tail = active ? (dir === 'desc' ? ' ▼' : ' ▲') : '';
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none text-${align} ${
        hideOnMobile ? 'hidden md:table-cell' : ''
      } ${active ? 'text-gold' : 'text-text-dim'}`}
      onClick={onClick}
    >
      {children}{tail}
    </th>
  );
}

export function MaterialFlipResults({ rows, totalCandidates, skippedChunks, sort, onSortChange }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={
        <EmptyResults>
          No cross-world material savings tonight. Try lowering Min savings,
          raising Max listings, or including Light DC.
        </EmptyResults>
      }
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2 text-text-dim">#</th>
              <th className="text-left px-3 py-2 text-text-dim">Item</th>
              <SortableHeader active={sort === 'salePrice'} dir="desc" onClick={() => onSortChange('salePrice')}>
                <InfoTooltip label="Cheapest trusted listing on your home world. Your sell price.">Sale</InfoTooltip>
              </SortableHeader>
              <th className="text-right px-3 py-2 text-text-dim hidden md:table-cell">
                <InfoTooltip label="Total ingredient cost using only home-world prices.">Home mats</InfoTooltip>
              </th>
              <th className="text-right px-3 py-2 text-text-dim hidden md:table-cell">
                <InfoTooltip label="Total cost if you bought each ingredient on its cheapest world in the region (max savings; multi-hop).">
                  Region mats
                </InfoTooltip>
              </th>
              <SortableHeader active={sort === 'savePerCraft'} dir="desc" onClick={() => onSortChange('savePerCraft')}>
                <InfoTooltip label="Home mats − region mats. Maximum savings per craft if you visit every cheapest world.">
                  Save/craft
                </InfoTooltip>
              </SortableHeader>
              <SortableHeader active={sort === 'pctDiscount'} dir="desc" onClick={() => onSortChange('pctDiscount')} hideOnMobile>
                <InfoTooltip label="Savings as a fraction of home material cost.">%</InfoTooltip>
              </SortableHeader>
              <th className="text-left px-3 py-2 text-text-dim hidden md:table-cell">
                <InfoTooltip label="If you make ONE hop, this is the world where your full basket totals the least.">
                  Best stop
                </InfoTooltip>
              </th>
              <SortableHeader active={sort === 'gilSavedPerDay'} dir="desc" onClick={() => onSortChange('gilSavedPerDay')}>
                <InfoTooltip label="Save/craft × home velocity. Expected daily gil saved.">Save/day</InfoTooltip>
              </SortableHeader>
              <SortableHeader active={sort === 'velocity'} dir="desc" onClick={() => onSortChange('velocity')} hideOnMobile>
                <InfoTooltip label="Sales per day on your home world.">Vel</InfoTooltip>
              </SortableHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className={`px-3 ${rowY} font-mono text-text-low`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks
                    id={r.id}
                    name={r.name}
                    suffix={r.hq && <HqStar leading />}
                    sub={categoryLabel(r.sc)}
                  />
                </td>
                <td className={`px-3 ${rowY} text-right font-mono`}>{fmtGil(r.salePrice)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>{fmtGil(r.homeMatCost)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>{fmtGil(r.bestPerIngredientCost)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-jade`}>+{fmtGil(r.perIngredientSavings)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>{Math.round(r.pctDiscount * 100)}%</td>
                <td className={`px-3 ${rowY} hidden md:table-cell`}>
                  <span className="text-aether">{r.bestSingleWorld}</span>
                  {r.needsDcTravel && <span className="text-text-low ml-1">✈ (Light DC)</span>}
                </td>
                <td className={`px-3 ${rowY} text-right font-mono text-gold-hi`}>{fmtGil(Math.round(r.gilSavedPerDay))}</td>
                <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/MaterialFlipResults.tsx
git commit -m "feat(material-flip): MaterialFlipResults table"
```

---

## Task 8: `MaterialFlipView` orchestrator

**Files:**
- Create: `src/features/insights/MaterialFlipView.tsx`

Two-pass fetch: first sale-side region prices on the whole snapshot, narrow on trust, then fetch region prices for the union of ingredient IDs once recipes resolve.

- [ ] **Step 1: Create the view**

```tsx
// src/features/insights/MaterialFlipView.tsx
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipes } from '../profit/useRecipes';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import {
  runMaterialFlip, narrowForMaterialFlip,
} from '../queries/runMaterialFlip';
import { MaterialFlipResults } from '../queries/MaterialFlipResults';
import { defaultMaterialFlipFilter, type MaterialFlipFilter, type MaterialFlipSort } from '../queries/types';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

const REGION = 'Europe';

interface RunResult {
  saleMap: MarketData;
  narrowedIds: number[];
  ingredientIds: number[];
  ingMap: MarketData;
  skipped: number;
  filterAtRun: MaterialFlipFilter;
}

export function MaterialFlipView() {
  const { world } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const [filter, setFilter] = useState<MaterialFlipFilter>(defaultMaterialFlipFilter);

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

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(REGION, chunk),
        { chunkSize: 25, concurrency: 4 },
      );
      const narrowedIds = narrowForMaterialFlip(snapshot.data.items, sale.data, filter);
      return {
        saleMap: sale.data, narrowedIds, ingredientIds: [], ingMap: {},
        skipped: sale.errors.length, filterAtRun: filter,
      };
    },
  });

  const recipes = useRecipes(run.data?.narrowedIds ?? []);

  // Second pass: fetch region prices for the union of ingredient IDs once recipes resolve.
  const ingFetch = useMutation<{ ingMap: MarketData; ids: number[]; skipped: number }>({
    mutationFn: async () => {
      const ids = new Set<number>();
      for (const id of run.data?.narrowedIds ?? []) {
        const r = recipes.data?.get(id);
        if (!r) continue;
        for (const ing of r.ingredients) ids.add(ing.itemId);
      }
      const idArr = [...ids];
      if (idArr.length === 0) return { ingMap: {}, ids: idArr, skipped: 0 };
      const res = await fetchInBatches<MarketData[string]>(
        idArr,
        (chunk) => fetchMarketData(REGION, chunk),
        { chunkSize: 25, concurrency: 4 },
      );
      return { ingMap: res.data, ids: idArr, skipped: res.errors.length };
    },
  });

  // Auto-fire ingFetch when recipes resolve.
  useEffect(() => {
    if (recipes.data && run.data && !ingFetch.isPending && !ingFetch.data) {
      ingFetch.mutate();
    }
  }, [recipes.data, run.data]);  // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!snapshot.data || !run.data || !recipes.data || !ingFetch.data) return [];
    return runMaterialFlip(
      snapshot.data.items, run.data.saleMap, ingFetch.data.ingMap,
      recipes.data, world, run.data.filterAtRun,
    );
  }, [snapshot.data, run.data, recipes.data, ingFetch.data, world]);

  function onSortChange(next: MaterialFlipSort) {
    setFilter({ ...filter, sort: next });
  }

  return (
    <div className="space-y-4">
      <FilterBar value={filter} onChange={setFilter} onRun={() => { run.reset(); ingFetch.reset(); run.mutate(); }} busy={run.isPending} />

      <div className="font-mono text-[10px] text-text-low">
        {candidateIds.length.toLocaleString()} candidate items
        {run.data && <> · {run.data.narrowedIds.length.toLocaleString()} narrowed</>}
      </div>

      {run.isPending && <Spinner label={`Fetching region prices for ${candidateIds.length} items…`} />}
      {run.isError && <StatusBanner kind="error">Region fetch failed: {(run.error as Error).message}</StatusBanner>}
      {recipes.isLoading && run.data && <Spinner label={`Resolving ${run.data.narrowedIds.length} recipes…`} />}
      {ingFetch.isPending && <Spinner label="Fetching region prices for ingredients…" />}

      {rows.length >= 0 && run.data && ingFetch.data && (
        <MaterialFlipResults
          rows={rows}
          totalCandidates={run.data.narrowedIds.length}
          skippedChunks={run.data.skipped + (ingFetch.data?.skipped ?? 0)}
          sort={filter.sort}
          onSortChange={onSortChange}
        />
      )}
    </div>
  );
}

function FilterBar({ value, onChange, onRun, busy }: {
  value: MaterialFlipFilter; onChange: (f: MaterialFlipFilter) => void;
  onRun: () => void; busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min sale velocity</span>
        <input
          type="number" min={0} step={0.5} value={value.minVelocity}
          onChange={(e) => onChange({ ...value, minVelocity: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Max listings</span>
        <input
          type="number" min={0} step={1} value={value.maxListings ?? 0}
          onChange={(e) => onChange({ ...value, maxListings: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min savings/craft</span>
        <input
          type="number" min={0} step={500} value={value.minSavings}
          onChange={(e) => onChange({ ...value, minSavings: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-32 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox" checked={value.includeLightDc}
          onChange={(e) => onChange({ ...value, includeLightDc: e.target.checked })}
        />
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Include Light DC</span>
      </label>
      <button
        onClick={onRun} disabled={busy}
        className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50"
      >
        {busy ? 'Running…' : 'Run scan'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/insights/MaterialFlipView.tsx
git commit -m "feat(material-flip): MaterialFlipView orchestrator"
```

---

## Task 9: Hook `MaterialFlipView` into `/trading`

**Files:**
- Modify: `src/routes/Trading.tsx`
- Modify: `src/routes/Trading.test.tsx`

- [ ] **Step 1: Update existing test + add new ones**

`Trading.test.tsx` already has a `withProviders(node)` helper and a test asserting "three tabs". First, update the existing tab-count assertion to include Material flip:

```ts
// In the existing "renders three tabs with Arbitrage active by default" test:
// rename it and add the Material flip assertion.
  it('renders four tabs with Arbitrage active by default', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));
    render(withProviders(<Trading />));
    expect(screen.getByRole('button', { name: /arbitrage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /best deals/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /material flip/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /queries/i })).toBeInTheDocument();
  });
```

Then append a new test for tab switching:

```ts
  it('switches to MaterialFlipView when its tab is clicked', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));
    render(withProviders(<Trading />));
    fireEvent.click(screen.getByRole('button', { name: /material flip/i }));
    // FilterBar's "Run scan" button is the stable target for this view.
    expect(screen.getByRole('button', { name: /run scan/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/Trading.test.tsx`
Expected: FAIL — `Material flip` button not found.

- [ ] **Step 3: Add the tab**

Edit `src/routes/Trading.tsx`:

```ts
import { MaterialFlipView } from '../features/insights/MaterialFlipView';
// ...
type Tab = 'arbitrage' | 'deals' | 'materialFlip' | 'queries';

const TABS: { id: Tab; label: string }[] = [
  { id: 'arbitrage',    label: 'Arbitrage' },
  { id: 'deals',        label: 'Best deals' },
  { id: 'materialFlip', label: 'Material flip' },
  { id: 'queries',      label: 'Queries' },
];
```

And in the JSX:

```tsx
      {tab === 'materialFlip' && <MaterialFlipView />}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/Trading.test.tsx`
Expected: PASS.

- [ ] **Step 5: Manually verify in browser**

Run: `npm run dev`
Open `/trading`, click "Material flip", click "Run scan". A fresh scan against Universalis Europe may take 20–60 seconds depending on snapshot size. Confirm the table populates (or the empty state shows if no rows clear the threshold).

- [ ] **Step 6: Commit**

```bash
git add src/routes/Trading.tsx src/routes/Trading.test.tsx
git commit -m "feat(trading): Material flip tab"
```

---

## Task 10: Per-item drill-down panel on `/item/:id`

**Files:**
- Modify: `src/routes/Item.tsx`

The drill-down is a new section component that renders inside `Item`'s JSX, gated on recipe presence. Reuses the region scope added in Task 2.

- [ ] **Step 1: Switch `useMarketData` to also fetch region prices**

In `Item.tsx`, change:

```ts
const market = useMarketData(priceIds, world, dc);
```

to:

```ts
const market = useMarketData(priceIds, world, dc, 'Europe');
```

- [ ] **Step 2: Add the drill-down component to the same file**

First, add this import at the top of `src/routes/Item.tsx` (alongside the existing imports — `Recipe`, `MarketItem`, `SnapshotItem`, `Gil`, `fmtGil`, `ItemNameLinks`, `SectionHeader` are already imported):

```ts
import { dcOf } from '../lib/europeWorlds';
```

Then append the components at the bottom of the file (after `HeaderBlock`, `PricesBlock`, etc.):

```tsx
function findBestSingleStopFor(
  ingredients: Recipe['ingredients'],
  regionByIngId: Record<string, MarketItem | undefined>,
  homeWorld: string,
  homeBasketCost: number,
): { world: string; cost: number } {
  let best = { world: homeWorld, cost: homeBasketCost };
  const worlds = new Set<string>();
  for (const ing of ingredients) {
    const m = regionByIngId[ing.itemId];
    if (!m) continue;
    for (const l of m.worldListings) if (!l.hq) worlds.add(l.world);
  }
  for (const world of worlds) {
    let total = 0;
    let complete = true;
    for (const ing of ingredients) {
      const m = regionByIngId[ing.itemId];
      const here = m?.worldListings.filter((l) => !l.hq && l.world === world) ?? [];
      if (here.length === 0) { complete = false; break; }
      total += Math.min(...here.map((l) => l.price)) * ing.amount;
    }
    if (complete && total < best.cost) best = { world, cost: total };
  }
  return best;
}

function MaterialShoppingBlock({
  recipe, homeWorld, regionMap, itemNames,
}: {
  recipe: Recipe;
  homeWorld: string;
  regionMap: Record<string, MarketItem | undefined> | undefined;
  itemNames: SnapshotItem[] | undefined;
}) {
  if (!regionMap) return null;

  let homeMatCost = 0;
  let bestPerIngredientCost = 0;
  const rows = recipe.ingredients.map((ing) => {
    const m = regionMap[ing.itemId];
    const homeNq = m?.worldListings.filter((l) => !l.hq && l.world === homeWorld) ?? [];
    const homeUnit = homeNq.length ? Math.min(...homeNq.map((l) => l.price)) : 0;
    const allNq = m?.worldListings.filter((l) => !l.hq) ?? [];
    const cheapest = allNq.length
      ? allNq.reduce((a, b) => (a.price <= b.price ? a : b))
      : null;
    homeMatCost += homeUnit * ing.amount;
    bestPerIngredientCost += (cheapest?.price ?? homeUnit) * ing.amount;
    return {
      ing,
      name: itemNames?.find((it) => it.id === ing.itemId)?.name ?? `Item #${ing.itemId}`,
      homeUnit,
      cheapestWorld: cheapest?.world ?? homeWorld,
      cheapestUnit: cheapest?.price ?? homeUnit,
    };
  });
  const perIngredientSavings = homeMatCost - bestPerIngredientCost;
  const singleStop = findBestSingleStopFor(recipe.ingredients, regionMap, homeWorld, homeMatCost);
  const singleStopSavings = homeMatCost - singleStop.cost;
  const needsDcTravel = dcOf(singleStop.world) === 'Light';

  if (perIngredientSavings <= 0 && singleStopSavings <= 0) {
    return (
      <section id="material-flip">
        <SectionHeader label="Material shopping (region)" compact />
        <div className="border border-border-base bg-bg-card p-4 text-text-low text-sm italic">
          Your home world is already the cheapest source for every ingredient.
        </div>
      </section>
    );
  }

  return (
    <section id="material-flip">
      <SectionHeader label="Material shopping (region)" compact />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="border border-border-base bg-bg-card p-4">
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">Per-ingredient cheapest</div>
          <div className="text-sm">Home: <Gil value={homeMatCost} /></div>
          <div className="text-sm">Region cheapest: <Gil value={bestPerIngredientCost} /></div>
          <div className="text-sm text-jade">Save: <Gil value={perIngredientSavings} /></div>
        </div>
        <div className="border border-border-base bg-bg-card p-4">
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">Best single stop</div>
          <div className="text-sm">
            <span className="text-aether">{singleStop.world}</span>: <Gil value={singleStop.cost} />
          </div>
          <div className="text-sm text-jade">Save vs home: <Gil value={singleStopSavings} /></div>
          <div className="text-xs text-text-low">
            {needsDcTravel ? 'Requires DC travel ✈' : 'One travel hop, no DC change'}
          </div>
        </div>
      </div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">Ingredient</th>
              <th className="text-right px-3 py-2">Need</th>
              <th className="text-right px-3 py-2">Home price</th>
              <th className="text-left px-3 py-2">Cheapest world</th>
              <th className="text-right px-3 py-2">Cheapest price</th>
              <th className="text-right px-3 py-2">Save/unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const save = r.homeUnit - r.cheapestUnit;
              const isHome = r.cheapestWorld === homeWorld;
              return (
                <tr key={r.ing.itemId} className="border-t border-border-base hover:bg-bg-card-hi">
                  <td className="px-3 py-2">
                    <ItemNameLinks id={r.ing.itemId} name={r.name} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.ing.amount}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtGil(r.homeUnit)}</td>
                  <td className={`px-3 py-2 ${isHome ? 'text-text-low' : 'text-jade'}`}>{r.cheapestWorld}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtGil(r.cheapestUnit)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${save > 0 ? 'text-jade' : 'text-text-low'}`}>
                    {save > 0 ? `+${fmtGil(save)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Render the block inside `Item`**

Inside the `Item` component's returned JSX, just after the existing `<RecipeBlock />` invocation, add:

```tsx
{recipe && (
  <MaterialShoppingBlock
    recipe={recipe}
    homeWorld={world}
    regionMap={market.data?.region}
    itemNames={snapshot.data?.items}
  />
)}
```

- [ ] **Step 4: Verify it compiles and existing tests pass**

Run: `npx vitest run src/routes/Item.test.tsx`
Expected: PASS — existing tests stub `fetch` to 404 so region listings come back empty; `MaterialShoppingBlock` just shows the "already cheapest" empty card, which is harmless.

- [ ] **Step 5: Manually verify in browser**

Run: `npm run dev`
Open `/item/<some-craftable-id>` (e.g. an item from the watchlist). Confirm the "Material shopping (region)" section appears below the recipe.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Item.tsx
git commit -m "feat(item): material shopping drill-down panel"
```

---

## Task 11: `AddToWatchlistButton` component

**Files:**
- Create: `src/features/items/AddToWatchlistButton.tsx`
- Test: `src/features/items/AddToWatchlistButton.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/items/AddToWatchlistButton.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddToWatchlistButton } from './AddToWatchlistButton';
import { useWatchlistStore, defaultWatchlist } from './watchlistStore';
import type { Recipe } from '../../lib/recipes';

beforeEach(() => {
  localStorage.clear();
  useWatchlistStore.setState(defaultWatchlist());
});

const baseProps = {
  itemId: 1234,
  itemName: 'Test Glamour',
  ilvl: 90,
  recipe: { itemResultId: 1234, classJob: 'LTW', recipeLevel: 90, ingredients: [] } satisfies Recipe,
};

describe('AddToWatchlistButton', () => {
  it('shows "+ Watchlist" when the item is not added', () => {
    render(<AddToWatchlistButton {...baseProps} />);
    expect(screen.getByRole('button', { name: /\+ watchlist/i })).toBeInTheDocument();
  });

  it('adds the item with the recipe crafter when clicked', () => {
    render(<AddToWatchlistButton {...baseProps} />);
    fireEvent.click(screen.getByRole('button'));
    const stored = useWatchlistStore.getState().customItems;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: 1234, name: 'Test Glamour', crafter: 'LTW', lvl: 90, cat: 'Glamour' });
  });

  it('uses crafter "ANY" when no recipe is provided', () => {
    render(<AddToWatchlistButton {...baseProps} recipe={null} />);
    fireEvent.click(screen.getByRole('button'));
    expect(useWatchlistStore.getState().customItems[0].crafter).toBe('ANY');
  });

  it('shows the remove state once added and removes on click', () => {
    useWatchlistStore.getState().addCustomItem({
      id: 1234, name: 'Test Glamour', crafter: 'LTW', lvl: 90, cat: 'Glamour',
    });
    render(<AddToWatchlistButton {...baseProps} />);
    const btn = screen.getByRole('button', { name: /on watchlist · remove/i });
    fireEvent.click(btn);
    expect(useWatchlistStore.getState().customItems).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/items/AddToWatchlistButton.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// src/features/items/AddToWatchlistButton.tsx
import { useWatchlistStore } from './watchlistStore';
import type { Recipe } from '../../lib/recipes';
import type { TrackedItem, CrafterCode } from './types';

interface Props {
  itemId: number;
  itemName: string;
  ilvl: number;
  recipe: Recipe | null;
}

export function AddToWatchlistButton({ itemId, itemName, ilvl, recipe }: Props) {
  const customItems = useWatchlistStore((s) => s.customItems);
  const addCustomItem = useWatchlistStore((s) => s.addCustomItem);
  const removeCustomItem = useWatchlistStore((s) => s.removeCustomItem);
  const onList = customItems.some((i) => i.id === itemId);

  function handleAdd() {
    const crafter: CrafterCode = recipe?.classJob ?? 'ANY';
    const lvl = recipe?.recipeLevel || ilvl || 1;
    const item: TrackedItem = { id: itemId, name: itemName, crafter, lvl, cat: 'Glamour' };
    addCustomItem(item);
  }

  if (onList) {
    return (
      <button
        onClick={() => removeCustomItem(itemId)}
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-crimson hover:text-crimson transition-colors"
      >
        ✓ On watchlist · Remove
      </button>
    );
  }
  return (
    <button
      onClick={handleAdd}
      className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-3 py-2 hover:bg-aether hover:text-bg-deep transition-colors"
    >
      + Watchlist
    </button>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/items/AddToWatchlistButton.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/items/AddToWatchlistButton.tsx src/features/items/AddToWatchlistButton.test.tsx
git commit -m "feat(watchlist): AddToWatchlistButton for item detail page"
```

---

## Task 12: Wire `AddToWatchlistButton` into `/item/:id` header

**Files:**
- Modify: `src/routes/Item.tsx`

- [ ] **Step 1: Pass the recipe + ilvl to the header**

In `Item.tsx`, change the `HeaderBlock` invocation to also pass `recipe` and rename the destructured props in the `HeaderBlock` signature:

```tsx
<HeaderBlock
  name={displayName}
  ilvl={displayIlvl}
  sc={displaySc}
  canHq={canHq}
  rarity={item?.rarity}
  itemId={itemId}
  recipe={recipe ?? null}
/>
```

And update the `HeaderBlock` function's signature to:

```tsx
function HeaderBlock({ name, ilvl, sc, canHq, rarity, itemId, recipe }: {
  name: string; ilvl: number; sc: number; canHq: boolean; rarity: number | undefined; itemId: number; recipe: Recipe | null;
}) {
```

- [ ] **Step 2: Render the button next to the Garland link**

Inside `HeaderBlock`'s JSX, change the trailing `<a … Open on Garland ↗</a>` into a wrapper holding both the button and the link:

```tsx
<div className="flex flex-wrap gap-2 self-start sm:self-end">
  <AddToWatchlistButton itemId={itemId} itemName={name} ilvl={ilvl} recipe={recipe} />
  <a
    href={garlandItemUrl(itemId)}
    target="_blank"
    rel="noopener noreferrer"
    className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-aether px-3 py-2 hover:border-aether transition-colors"
    title="Open on Garland Tools"
  >
    Open on Garland ↗
  </a>
</div>
```

Add the import at the top of `Item.tsx`:

```ts
import { AddToWatchlistButton } from '../features/items/AddToWatchlistButton';
```

- [ ] **Step 3: Extend `Item.test.tsx` to cover the new button**

Append to `src/routes/Item.test.tsx`:

```ts
import { useWatchlistStore, defaultWatchlist } from '../features/items/watchlistStore';

it('renders the Add to watchlist button on the item header', async () => {
  await putCachedItems([
    { id: 5057, name: 'Earth Shard', sc: 58, ui: 0, ilvl: 1, canHq: false },
  ]);
  await putCachedRecipeSnapshot([]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  useWatchlistStore.setState(defaultWatchlist());
  render(withProviders('/item/5057'));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /\+ watchlist/i })).toBeInTheDocument();
  });
});

it('flips to the remove state after adding', async () => {
  await putCachedItems([
    { id: 5057, name: 'Earth Shard', sc: 58, ui: 0, ilvl: 1, canHq: false },
  ]);
  await putCachedRecipeSnapshot([]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  useWatchlistStore.setState(defaultWatchlist());
  render(withProviders('/item/5057'));
  const addBtn = await screen.findByRole('button', { name: /\+ watchlist/i });
  addBtn.click();
  expect(await screen.findByRole('button', { name: /on watchlist · remove/i })).toBeInTheDocument();
});
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Manually verify in browser**

Run: `npm run dev`
Open `/item/<some-item-id>`. Confirm the `+ Watchlist` button appears in the header. Click it — it should switch to `✓ On watchlist · Remove`. Reload the page — it should remember the state (zustand persist).

- [ ] **Step 6: Commit**

```bash
git add src/routes/Item.tsx src/routes/Item.test.tsx
git commit -m "feat(item): Add to watchlist button on item header"
```

---

## Task 13: Type check + lint pass

**Files:** none

- [ ] **Step 1: Run the full type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 3: Build to catch anything Vite warns about**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 4: If everything is green, no commit needed.** If anything failed, fix in place and commit the fix with a focused message.

---

## Self-review notes

This plan implements every section of the spec:
- §Architecture → Tasks 1, 2, 4, 5, 6 (europeWorlds, region useMarketData, runner)
- §Data model → Task 3 (types) + Tasks 4–6 (fields populated)
- §Scan view → Tasks 7, 8, 9
- §Per-item drill-down → Task 10
- §Add to watchlist button → Tasks 11, 12
- §Trust / edge cases → covered in Task 4 (no-tier drop) + Task 5 (no-listings fallback to home) + Task 6 (narrow helper)
- §Testing → Tasks 1, 4, 5, 6, 9, 11, 12 each add the spec'd tests
