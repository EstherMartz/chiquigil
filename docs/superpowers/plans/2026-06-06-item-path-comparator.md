# Item Path Comparator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Compare Paths" feature (item-page section + `/compare` standalone page) that shows, side-by-side, what to do with an item — sell raw on the MB, vendor it, craft it into outputs, or craft the intermediate — with consistent gil/day, stack-profile, and quantity-threshold metrics, and a recommended winner.

**Architecture:** A pure, fully-unit-tested engine (`src/features/compare/comparePaths.ts`) computes path cards, winner, and warnings from already-fetched data. A data hook (`useComparePaths`) fetches market + 90-day history (bounded to ≤6 items) and feeds the engine. Presentational components render the cards. Material-cost logic is first lifted into a shared `materialCost.ts` so the comparator and the existing `Craft → sell math` card compute cost identically.

**Tech Stack:** React 18 + TypeScript, React Router 7, TanStack Query v5, Zustand, Tailwind, Vitest (+ @testing-library/react). Tests are colocated `*.test.ts(x)`. Run a single test file with `npx vitest run <path>`; run all with `npm test -- --run`.

---

## File Structure

**Created:**
- `src/features/items/materialCost.ts` — shared material-cost functions (moved out of `Item.tsx` + `CraftSellMathCard.tsx`) + new `recipeMaterialCostHome`.
- `src/features/items/materialCost.test.ts` — tests for the moved/added cost functions.
- `src/features/compare/comparePaths.ts` — pure engine (types, stack profile, card builders, winner, warnings, summary, `buildComparison`).
- `src/features/compare/comparePaths.test.ts` — engine tests.
- `src/features/compare/useComparePaths.ts` — data hook (fetch + shape + call `buildComparison`).
- `src/features/compare/PathCard.tsx` — single path card.
- `src/features/compare/PathCard.test.tsx` — render smoke tests.
- `src/features/compare/CompareControls.tsx` — quantity input + material-source toggle.
- `src/features/compare/ComparePathsSection.tsx` — section shell shared by item page + standalone route.
- `src/routes/Compare.tsx` — `/compare` standalone page (item search + section).

**Modified:**
- `src/features/items/CraftSellMathCard.tsx` — import cost fns from `materialCost`; re-export the symbols other modules pull from it.
- `src/routes/Item.tsx` — remove local `findBestSingleStopFor` (now in `materialCost`), import it; add `+ COMPARE PATHS` button + render `ComparePathsSection`.
- `src/App.tsx` — register `/compare` route + page title.
- `src/components/layout/Sidebar.tsx` — add **Compare** nav item in Planning group.

---

## Task 1: Shared `materialCost.ts` (refactor, no behavior change)

Lift the pure material-cost functions out of `Item.tsx` and `CraftSellMathCard.tsx` into one module so the comparator reuses them. Re-export from `CraftSellMathCard` so existing importers/tests keep working unchanged.

**Files:**
- Create: `src/features/items/materialCost.ts`
- Create: `src/features/items/materialCost.test.ts`
- Modify: `src/features/items/CraftSellMathCard.tsx`
- Modify: `src/routes/Item.tsx`

- [ ] **Step 1: Create `materialCost.ts` with the moved + new functions**

Create `src/features/items/materialCost.ts`:

```ts
import type { Recipe } from '../../lib/recipes';
import type { MarketItem, MarketData } from '../../lib/universalis';

/** Cheapest currency offer for an item, if any (label for display + cost in that currency). */
export type CurrencyResolver = (itemId: number) => { label: string; cost: number } | null;

/** Home-world material cost of one craft: sum of each ingredient's cheapest listing × amount. */
export function recipeMaterialCostHome(
  recipe: Recipe,
  homeMarket: Record<string, MarketItem | undefined> | undefined,
): number {
  if (!homeMarket) return 0;
  let total = 0;
  for (const ing of recipe.ingredients) {
    const m = homeMarket[String(ing.itemId)];
    const px = m?.minNQ ?? m?.minHQ ?? 0;
    total += px * ing.amount;
  }
  return total;
}

/**
 * Cheapest single world to buy every ingredient at once (region scope). Falls back
 * to the home basket cost if no single world stocks the whole recipe.
 */
export function findBestSingleStopFor(
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

function marketUnit(itemId: number, market: MarketData): number {
  const m = market[itemId];
  return m?.minNQ ?? m?.minHQ ?? 0;
}

/**
 * Gil cost to *self-source* one unit: gatherable and currency-obtainable
 * ingredients cost 0 gil, craftable ones recurse (÷ the sub-recipe's yield),
 * everything else falls back to its market buy price. Cycle-protected.
 */
export function selfSourceCost(
  recipe: Recipe,
  recipeMap: Map<number, Recipe | null>,
  market: MarketData,
  gatherableIds: Set<number>,
  currencyOf: CurrencyResolver = () => null,
  seen: Set<number> = new Set(),
): number {
  let total = 0;
  for (const ing of recipe.ingredients) {
    total += selfSourceUnit(ing.itemId, recipeMap, market, gatherableIds, currencyOf, seen) * ing.amount;
  }
  return total;
}

function selfSourceUnit(
  itemId: number,
  recipeMap: Map<number, Recipe | null>,
  market: MarketData,
  gatherableIds: Set<number>,
  currencyOf: CurrencyResolver,
  seen: Set<number>,
): number {
  if (gatherableIds.has(itemId)) return 0;
  if (currencyOf(itemId)) return 0;
  const sub = recipeMap.get(itemId);
  if (sub && !seen.has(itemId)) {
    const next = new Set(seen).add(itemId);
    const perBatch = selfSourceCost(sub, recipeMap, market, gatherableIds, currencyOf, next);
    return perBatch / (sub.amountResult ?? 1);
  }
  return marketUnit(itemId, market);
}

export type IngredientSourceKind = 'gather' | 'currency' | 'craft' | 'buy';

export interface BreakdownRow {
  itemId: number;
  amount: number;
  kind: IngredientSourceKind;
  unitCost: number;
  lineCost: number;
  yield?: number;
  currencyLabel?: string;
  currencyCost?: number;
  children?: BreakdownRow[];
}

/** Recursive self-source breakdown, mirroring selfSourceCost so costs reconcile. */
export function selfSourceBreakdown(
  recipe: Recipe,
  recipeMap: Map<number, Recipe | null>,
  market: MarketData,
  gatherableIds: Set<number>,
  currencyOf: CurrencyResolver = () => null,
  seen: Set<number> = new Set([recipe.itemResultId]),
): BreakdownRow[] {
  return recipe.ingredients.map((ing) => {
    const gatherable = gatherableIds.has(ing.itemId);
    const offer = gatherable ? null : currencyOf(ing.itemId);
    const sub = recipeMap.get(ing.itemId);
    const craftable = !gatherable && !offer && !!sub && !seen.has(ing.itemId);
    const kind: IngredientSourceKind = gatherable ? 'gather'
      : offer ? 'currency'
      : craftable ? 'craft'
      : 'buy';

    const unitCost = selfSourceUnit(ing.itemId, recipeMap, market, gatherableIds, currencyOf, new Set(seen));
    const row: BreakdownRow = {
      itemId: ing.itemId, amount: ing.amount, kind, unitCost, lineCost: unitCost * ing.amount,
    };
    if (offer) {
      row.currencyLabel = offer.label;
      row.currencyCost = offer.cost;
    }
    if (craftable && sub) {
      row.yield = sub.amountResult ?? 1;
      row.children = selfSourceBreakdown(sub, recipeMap, market, gatherableIds, currencyOf, new Set(seen).add(ing.itemId));
    }
    return row;
  });
}
```

- [ ] **Step 2: Write failing tests for `materialCost.ts`**

Create `src/features/items/materialCost.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { recipeMaterialCostHome, findBestSingleStopFor, selfSourceCost } from './materialCost';
import type { Recipe } from '../../lib/recipes';
import type { MarketItem, MarketData } from '../../lib/universalis';

const mkMarket = (partial: Partial<MarketItem>): MarketItem => ({
  minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
  recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
  worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null,
  ...partial,
});

const recipe = (ingredients: { itemId: number; amount: number }[]): Recipe =>
  ({ itemResultId: 99, classJob: 'CRP', recipeLevel: 1, ingredients, amountResult: 1 });

describe('recipeMaterialCostHome', () => {
  it('sums cheapest listing × amount over ingredients', () => {
    const market: Record<string, MarketItem | undefined> = {
      '1': mkMarket({ minNQ: 100 }),
      '2': mkMarket({ minNQ: null, minHQ: 50 }),
    };
    expect(recipeMaterialCostHome(recipe([{ itemId: 1, amount: 2 }, { itemId: 2, amount: 3 }]), market)).toBe(350);
  });

  it('returns 0 when market is undefined', () => {
    expect(recipeMaterialCostHome(recipe([{ itemId: 1, amount: 1 }]), undefined)).toBe(0);
  });
});

describe('findBestSingleStopFor', () => {
  it('picks the single world that stocks every ingredient cheapest', () => {
    const region: Record<string, MarketItem | undefined> = {
      '1': mkMarket({ worldListings: [
        { world: 'Cerberus', price: 80, hq: false, quantity: 1 },
        { world: 'Moogle', price: 120, hq: false, quantity: 1 },
      ] }),
      '2': mkMarket({ worldListings: [
        { world: 'Cerberus', price: 40, hq: false, quantity: 1 },
        { world: 'Moogle', price: 30, hq: false, quantity: 1 },
      ] }),
    };
    // Cerberus stocks both: 80 + 40 = 120. Moogle stocks both: 120 + 30 = 150. Home basket 999.
    const r = findBestSingleStopFor(recipe([{ itemId: 1, amount: 1 }, { itemId: 2, amount: 1 }]), region, 'Phantom', 999);
    expect(r).toEqual({ world: 'Cerberus', cost: 120 });
  });
});

describe('selfSourceCost', () => {
  it('gatherable ingredients cost 0', () => {
    const market: MarketData = { '1': mkMarket({ minNQ: 500 }) };
    expect(selfSourceCost(recipe([{ itemId: 1, amount: 3 }]), new Map(), market, new Set([1]))).toBe(0);
  });

  it('non-gatherable falls back to market buy price', () => {
    const market: MarketData = { '1': mkMarket({ minNQ: 500 }) };
    expect(selfSourceCost(recipe([{ itemId: 1, amount: 2 }]), new Map(), market, new Set())).toBe(1000);
  });
});
```

- [ ] **Step 3: Run the tests — verify they PASS**

Run: `npx vitest run src/features/items/materialCost.test.ts`
Expected: PASS (all assertions green — the implementation from Step 1 already satisfies them).

- [ ] **Step 4: Point `CraftSellMathCard.tsx` at the shared module and re-export**

In `src/features/items/CraftSellMathCard.tsx`:

1. Replace the top import line `import { findBestSingleStopFor } from '../../routes/Item';` with:

```ts
import {
  findBestSingleStopFor,
  selfSourceCost,
  type CurrencyResolver,
} from './materialCost';
```

2. Delete these now-moved definitions from this file: `export type CurrencyResolver`, `selfSourceCost`, `selfSourceUnit`, `marketUnit`, `selfSourceBreakdown`, `IngredientSourceKind`, `BreakdownRow` (lines defining them — keep `craftSellMath`, `CraftSellMathInput`, `CraftSellMathOutput`, `humanizeDays`, and the `CraftSellMathCard` component).

3. Add a re-export so existing importers (`IngredientBreakdownModal`, `CraftSellMathCard.test.ts`) keep resolving these from this module:

```ts
export {
  selfSourceCost,
  selfSourceBreakdown,
  type CurrencyResolver,
  type IngredientSourceKind,
  type BreakdownRow,
} from './materialCost';
```

(Note: `selfSourceCost` and `CurrencyResolver` appear in both the import and the re-export — that's fine; the import binds them for local use in the component, the re-export forwards them for consumers.)

- [ ] **Step 5: Remove `findBestSingleStopFor` from `Item.tsx` and import it**

In `src/routes/Item.tsx`:

1. Delete the entire `export function findBestSingleStopFor(...) { ... }` block (currently around lines 691–716).
2. Add to the import block near the top:

```ts
import { findBestSingleStopFor } from '../features/items/materialCost';
```

(`MaterialShoppingBlock` in this file calls `findBestSingleStopFor` — it now resolves via the import.)

- [ ] **Step 6: Run the full test suite + lint — verify nothing regressed**

Run: `npx vitest run src/features/items/CraftSellMathCard.test.ts src/features/items/materialCost.test.ts`
Expected: PASS (the existing `CraftSellMathCard.test.ts` still imports `craftSellMath`, `selfSourceCost`, `selfSourceBreakdown` from `./CraftSellMathCard` and resolves them via the re-export).

Run: `npm run lint`
Expected: no errors (no unused imports, no missing references).

- [ ] **Step 7: Commit**

```bash
git add src/features/items/materialCost.ts src/features/items/materialCost.test.ts src/features/items/CraftSellMathCard.tsx src/routes/Item.tsx
git commit -m "refactor: extract shared materialCost util from Item + CraftSellMathCard"
```

---

## Task 2: Engine — types + `buildStackProfile`

**Files:**
- Create: `src/features/compare/comparePaths.ts`
- Create: `src/features/compare/comparePaths.test.ts`

- [ ] **Step 1: Write the failing test for `buildStackProfile`**

Create `src/features/compare/comparePaths.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildStackProfile } from './comparePaths';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';

const sale = (quantity: number, pricePerUnit: number, timestamp: number, hq = false): HistoryEntry =>
  ({ quantity, pricePerUnit, timestamp, hq });
const ls = (quantity: number, price: number, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller: '' });

describe('buildStackProfile', () => {
  it('returns null when there is no demand data', () => {
    expect(buildStackProfile([], [], false, 5)).toBeNull();
  });

  it('picks the dominant stack by units sold and flags a supply gap', () => {
    // stacks of 5 dominate units (3 sales × 5 = 15 units) vs stacks of 1 (2 units).
    // No current listings at stack 5 → supply gap.
    const history = [
      sale(1, 100, 10), sale(1, 100, 20),
      sale(5, 90, 30), sale(5, 90, 40), sale(5, 90, 50),
    ];
    const listings = [ls(1, 100), ls(1, 110)];
    const profile = buildStackProfile(history, listings, false, 10);
    expect(profile).not.toBeNull();
    expect(profile!.dominantStack).toBe(5);
    expect(profile!.volumeAtBest).toBe(15);
    expect(profile!.listedAtBest).toBe(0);
    expect(profile!.supplyGap).toBe(true);
    // 10 units/day moved in stacks of 5 → 2 listing events/day
    expect(profile!.listingEventsPerDay).toBeCloseTo(2);
  });

  it('no supply gap when the dominant stack has current listings', () => {
    const history = [sale(5, 90, 30), sale(5, 90, 40)];
    const listings = [ls(5, 95)];
    const profile = buildStackProfile(history, listings, false, 5);
    expect(profile!.dominantStack).toBe(5);
    expect(profile!.listedAtBest).toBe(1);
    expect(profile!.supplyGap).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `npx vitest run src/features/compare/comparePaths.test.ts`
Expected: FAIL with "Failed to resolve import ./comparePaths" / "buildStackProfile is not a function".

- [ ] **Step 3: Implement types + `buildStackProfile`**

Create `src/features/compare/comparePaths.ts`:

```ts
import type { MarketItem, WorldListing } from '../../lib/universalis';
import type { HistoryEntry } from '../../lib/universalisHistory';
import { soldByStack, listedByStack, mergeStacks } from '../items/stackAnalysis';

export type PathKind = 'sell-raw' | 'vendor' | 'craft-output' | 'craft-intermediate';
export type Effort = 'none' | 'craft' | 'gather-craft';

export interface StackProfile {
  stackSizes: { stackSize: number; soldLast90d: number; listedNow: number; avgPricePerUnit: number }[];
  dominantStack: number;
  volumeAtBest: number;
  listedAtBest: number;
  supplyGap: boolean;
  listingEventsPerDay: number;
}

export interface PathCard {
  id: string;
  kind: PathKind;
  label: string;
  itemId: number;
  itemName: string;
  salePrice: number;
  matCost: number;
  profitPerUnit: number;
  velocity: number;
  unitsMovedPerDay: number;
  gilPerDay: number;
  timeToSellHours: number;
  stack: StackProfile | null;
  risk: string;
  effort: Effort;
}

/**
 * Derive the per-stack-size profile for one sold item. `dominantStack` is the
 * stack size with the most 90-day UNITS sold (tie-break: larger stack).
 * `supplyGap` uses the strict spec rule: real demand at that size, zero current
 * listings. `listingEventsPerDay` converts the units you can move into discrete
 * listing actions. Returns null when there is no 90-day demand.
 */
export function buildStackProfile(
  history: HistoryEntry[],
  listings: WorldListing[],
  hq: boolean,
  unitsMovedPerDay: number,
): StackProfile | null {
  const sold = soldByStack(history, hq);
  if (sold.length === 0) return null;
  const listed = listedByStack(listings, hq);
  const merged = mergeStacks(sold, listed);

  const dominant = sold.reduce((best, r) =>
    r.units > best.units || (r.units === best.units && r.stack > best.stack) ? r : best,
  );
  const dominantRow = merged.find((r) => r.stack === dominant.stack);
  const listedAtBest = dominantRow?.listedCount ?? 0;
  const volumeAtBest = dominant.units;
  const supplyGap = volumeAtBest > 0 && listedAtBest === 0;
  const listingEventsPerDay = dominant.stack > 0 ? unitsMovedPerDay / dominant.stack : unitsMovedPerDay;

  return {
    stackSizes: merged.map((r) => ({
      stackSize: r.stack,
      soldLast90d: r.units,
      listedNow: r.listedCount,
      avgPricePerUnit: r.medianUnitPrice,
    })),
    dominantStack: dominant.stack,
    volumeAtBest,
    listedAtBest,
    supplyGap,
    listingEventsPerDay,
  };
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `npx vitest run src/features/compare/comparePaths.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/compare/comparePaths.ts src/features/compare/comparePaths.test.ts
git commit -m "feat(compare): engine types + buildStackProfile"
```

---

## Task 3: Engine — card builders + effort

**Files:**
- Modify: `src/features/compare/comparePaths.ts`
- Modify: `src/features/compare/comparePaths.test.ts`

- [ ] **Step 1: Write failing tests for the card builders**

Append to `src/features/compare/comparePaths.test.ts`:

```ts
import { makeMarketCard, makeVendorCard, craftEffort } from './comparePaths';
import type { MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';

const mkMarket = (partial: Partial<MarketItem>): MarketItem => ({
  minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
  recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
  worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null,
  ...partial,
});

describe('makeMarketCard', () => {
  it('computes taxed profit, throughput, and gil/day for a sell-raw path', () => {
    const market = mkMarket({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 5, velocity: 4, listingCount: 0 });
    const card = makeMarketCard({
      id: 'sell-raw', kind: 'sell-raw', itemId: 1, itemName: 'Thing',
      market, history: [], hq: false, matCost: 0, effort: 'none', now: 1_000,
    });
    // salePrice 1000, 5% MB tax → net 950, matCost 0 → profit 950.
    expect(card.salePrice).toBe(1000);
    expect(card.profitPerUnit).toBe(950);
    // effectiveUnitsPerDay(4, 0) = 4 → gilPerDay 950×4 = 3800.
    expect(card.unitsMovedPerDay).toBeCloseTo(4);
    expect(card.gilPerDay).toBeCloseTo(3800);
    expect(card.timeToSellHours).toBeCloseTo(6); // 24/4
  });

  it('subtracts material cost for a craft path', () => {
    const market = mkMarket({ minNQ: 2000, avgNQ: 2000, recentSalesNQ: 3, velocity: 2, listingCount: 1 });
    const card = makeMarketCard({
      id: 'craft-50', kind: 'craft-output', itemId: 50, itemName: 'Output',
      market, history: [], hq: false, matCost: 500, effort: 'craft', now: 1_000,
    });
    // taxed 1900 − 500 = 1400 profit. effectiveUnitsPerDay(2,1)=1 → gilPerDay 1400.
    expect(card.profitPerUnit).toBe(1400);
    expect(card.gilPerDay).toBeCloseTo(1400);
  });
});

describe('makeVendorCard', () => {
  it('is an instant zero-throughput path priced at the NPC buyback', () => {
    const card = makeVendorCard(1, 'Thing', 17);
    expect(card.kind).toBe('vendor');
    expect(card.salePrice).toBe(17);
    expect(card.profitPerUnit).toBe(17);
    expect(card.gilPerDay).toBe(0);
    expect(card.timeToSellHours).toBe(0);
    expect(card.stack).toBeNull();
    expect(card.effort).toBe('none');
  });
});

const recipe = (ingredients: { itemId: number; amount: number }[]): Recipe =>
  ({ itemResultId: 99, classJob: 'CRP', recipeLevel: 1, ingredients, amountResult: 1 });

describe('craftEffort', () => {
  it('is "craft" when every ingredient has an MB price', () => {
    const market = { '1': mkMarket({ minNQ: 10 }), '2': mkMarket({ minHQ: 20 }) };
    expect(craftEffort(recipe([{ itemId: 1, amount: 1 }, { itemId: 2, amount: 1 }]), market)).toBe('craft');
  });

  it('is "gather-craft" when an ingredient has no MB price', () => {
    const market = { '1': mkMarket({ minNQ: 10 }), '2': mkMarket({}) };
    expect(craftEffort(recipe([{ itemId: 1, amount: 1 }, { itemId: 2, amount: 1 }]), market)).toBe('gather-craft');
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `npx vitest run src/features/compare/comparePaths.test.ts`
Expected: FAIL with "makeMarketCard is not a function".

- [ ] **Step 3: Implement the card builders + effort**

Append to `src/features/compare/comparePaths.ts`:

```ts
import { applyTax, confidence, effectiveUnitsPerDay, riskLabel, robustSellPrice } from '../items/verdict/pricing';
import type { Recipe } from '../../lib/recipes';

function bestSalePrice(market: MarketItem, hq: boolean): number {
  const robust = robustSellPrice(market, hq ? 'HQ' : 'NQ');
  if (robust != null) return robust;
  const median = hq ? market.medianHQ : market.medianNQ;
  const min = hq ? market.minHQ : market.minNQ;
  return median ?? min ?? 0;
}

export function makeMarketCard(args: {
  id: string;
  kind: Exclude<PathKind, 'vendor'>;
  itemId: number;
  itemName: string;
  market: MarketItem;
  history: HistoryEntry[];
  hq: boolean;
  matCost: number;
  effort: Effort;
  now: number;
}): PathCard {
  const { id, kind, itemId, itemName, market, history, hq, matCost, effort, now } = args;
  const quality = hq ? 'HQ' : 'NQ';
  const salePrice = bestSalePrice(market, hq);
  const profitPerUnit = applyTax(salePrice) - matCost;
  const velocity = market.velocity;
  const unitsMovedPerDay = effectiveUnitsPerDay(velocity, market.listingCount);
  const gilPerDay = profitPerUnit * unitsMovedPerDay;
  const timeToSellHours = velocity > 0 ? 24 / velocity : Infinity;
  const stack = buildStackProfile(history, market.worldListings, hq, unitsMovedPerDay);
  const risk = riskLabel(confidence(market, quality, now), velocity);
  const label = kind === 'sell-raw' ? 'Sell raw (MB)'
    : kind === 'craft-intermediate' ? 'Craft intermediate'
    : `Craft → ${itemName}`;
  return {
    id, kind, label, itemId, itemName,
    salePrice, matCost, profitPerUnit, velocity,
    unitsMovedPerDay, gilPerDay, timeToSellHours, stack, risk, effort,
  };
}

export function makeVendorCard(itemId: number, itemName: string, priceLow: number): PathCard {
  return {
    id: 'vendor', kind: 'vendor', label: 'Vendor', itemId, itemName,
    salePrice: priceLow, matCost: 0, profitPerUnit: priceLow, velocity: 0,
    unitsMovedPerDay: 0, gilPerDay: 0, timeToSellHours: 0, stack: null,
    risk: 'Instant — vendor', effort: 'none',
  };
}

/** Craft effort: "craft" if every ingredient is buyable on the MB, else "gather-craft". */
export function craftEffort(
  recipe: Recipe,
  homeMarket: Record<string, MarketItem | undefined>,
): Effort {
  for (const ing of recipe.ingredients) {
    const m = homeMarket[String(ing.itemId)];
    const hasPrice = (m?.minNQ ?? m?.minHQ ?? 0) > 0;
    if (!hasPrice) return 'gather-craft';
  }
  return 'craft';
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `npx vitest run src/features/compare/comparePaths.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/compare/comparePaths.ts src/features/compare/comparePaths.test.ts
git commit -m "feat(compare): market/vendor card builders + craft effort"
```

---

## Task 4: Engine — winner, days-to-clear, warnings, summary

**Files:**
- Modify: `src/features/compare/comparePaths.ts`
- Modify: `src/features/compare/comparePaths.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/features/compare/comparePaths.test.ts`:

```ts
import { daysToClear, pickWinner, quantityWarnings, buildSummaryLine } from './comparePaths';
import type { PathCard } from './comparePaths';

const card = (over: Partial<PathCard>): PathCard => ({
  id: 'x', kind: 'sell-raw', label: 'L', itemId: 1, itemName: 'N',
  salePrice: 0, matCost: 0, profitPerUnit: 0, velocity: 0,
  unitsMovedPerDay: 0, gilPerDay: 0, timeToSellHours: 0, stack: null,
  risk: '', effort: 'none', ...over,
});

describe('daysToClear', () => {
  it('is qty / throughput for a market path', () => {
    expect(daysToClear(card({ unitsMovedPerDay: 4 }), 20)).toBe(5);
  });
  it('is 0 (instant) for vendor', () => {
    expect(daysToClear(card({ kind: 'vendor' }), 20)).toBe(0);
  });
  it('is Infinity when a market path has no throughput', () => {
    expect(daysToClear(card({ kind: 'sell-raw', unitsMovedPerDay: 0 }), 20)).toBe(Infinity);
  });
});

describe('pickWinner', () => {
  it('picks the highest gil/day', () => {
    const a = card({ id: 'a', gilPerDay: 100 });
    const b = card({ id: 'b', gilPerDay: 300 });
    expect(pickWinner([a, b], 1)).toBe('b');
  });
  it('falls back to vendor when all market paths lose money', () => {
    const sell = card({ id: 'sell-raw', kind: 'sell-raw', gilPerDay: -50, unitsMovedPerDay: 0 });
    const vendor = card({ id: 'vendor', kind: 'vendor', gilPerDay: 0, profitPerUnit: 12 });
    // gilPerDay 0 > -50 → vendor wins.
    expect(pickWinner([sell, vendor], 1)).toBe('vendor');
  });
  it('tiebreaks equal gil/day by fewer days to clear', () => {
    const slow = card({ id: 'slow', gilPerDay: 100, unitsMovedPerDay: 1 });
    const fast = card({ id: 'fast', gilPerDay: 100, unitsMovedPerDay: 10 });
    expect(pickWinner([slow, fast], 50)).toBe('fast');
  });
});

describe('quantityWarnings', () => {
  it('flags overcrowding when clearing takes > 14 days', () => {
    const c = card({ kind: 'sell-raw', unitsMovedPerDay: 1, velocity: 1 });
    const w = quantityWarnings(c, 30);
    expect(w.overcrowding).toContain('30');
  });
  it('flags flood when qty exceeds a week of velocity', () => {
    const c = card({ kind: 'craft-output', velocity: 2, unitsMovedPerDay: 2 });
    const w = quantityWarnings(c, 100); // 100 > 2×7=14
    expect(w.flood).toBeTruthy();
  });
  it('no warnings at quantity 1', () => {
    expect(quantityWarnings(card({ unitsMovedPerDay: 0.01 }), 1)).toEqual({});
  });
});

describe('buildSummaryLine', () => {
  it('names the winning path', () => {
    const sell = card({ id: 'sell-raw', label: 'Sell raw (MB)', gilPerDay: 86_000, unitsMovedPerDay: 50 });
    const craft = card({ id: 'craft-50', label: 'Craft → Ingot', gilPerDay: 40_000, unitsMovedPerDay: 2 });
    const line = buildSummaryLine([sell, craft], 'sell-raw', 1);
    expect(line).toContain('Best play');
    expect(line).toContain('Sell raw (MB)');
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `npx vitest run src/features/compare/comparePaths.test.ts`
Expected: FAIL with "daysToClear is not a function".

- [ ] **Step 3: Implement winner / days / warnings / summary**

Append to `src/features/compare/comparePaths.ts`:

```ts
const EFFORT_RANK: Record<Effort, number> = { none: 0, craft: 1, 'gather-craft': 2 };

export function daysToClear(card: PathCard, qty: number): number {
  if (card.kind === 'vendor') return 0;
  return card.unitsMovedPerDay > 0 ? qty / card.unitsMovedPerDay : Infinity;
}

export function pickWinner(cards: PathCard[], qty: number): string | null {
  if (cards.length === 0) return null;
  const ranked = [...cards].sort((a, b) => {
    if (b.gilPerDay !== a.gilPerDay) return b.gilPerDay - a.gilPerDay;
    const da = daysToClear(a, qty);
    const db = daysToClear(b, qty);
    if (da !== db) return da - db;
    return EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort];
  });
  return ranked[0].id;
}

export interface QtyWarnings { overcrowding?: string; flood?: string }

export function quantityWarnings(card: PathCard, qty: number): QtyWarnings {
  if (qty <= 1) return {};
  const out: QtyWarnings = {};
  if (card.kind !== 'vendor') {
    const d = daysToClear(card, qty);
    if (Number.isFinite(d) && d > 14) {
      out.overcrowding = `At ${card.unitsMovedPerDay.toFixed(1)}/day, ${qty} units would take ~${d.toFixed(1)} days to sell. Consider splitting or choosing a faster path.`;
    }
    if (card.velocity > 0 && qty > card.velocity * 7) {
      out.flood = 'Crafting this many would likely flood the market.';
    }
  }
  return out;
}

function fmtK(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
}

function clearsPhrase(card: PathCard, qty: number): string {
  const d = daysToClear(card, qty);
  if (card.kind === 'vendor') return 'clears instantly';
  if (!Number.isFinite(d)) return 'no recent demand';
  if (d < 1) return 'clears in under a day';
  return `clears in ~${d.toFixed(1)} days`;
}

export function buildSummaryLine(cards: PathCard[], winnerId: string | null, qty: number): string {
  const winner = cards.find((c) => c.id === winnerId);
  if (!winner) return 'No viable path found.';
  let line = `Best play: ${winner.label} — ${fmtK(winner.gilPerDay)}/day, ${clearsPhrase(winner, qty)}.`;
  const runnerUp = cards
    .filter((c) => c.id !== winner.id && c.kind !== 'vendor')
    .sort((a, b) => b.profitPerUnit - a.profitPerUnit)[0];
  if (runnerUp && runnerUp.profitPerUnit > winner.profitPerUnit) {
    line += ` ${runnerUp.label} yields more per unit but ${clearsPhrase(runnerUp, qty)}.`;
  }
  return line;
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `npx vitest run src/features/compare/comparePaths.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/compare/comparePaths.ts src/features/compare/comparePaths.test.ts
git commit -m "feat(compare): winner logic, qty warnings, summary line"
```

---

## Task 5: Engine — `buildComparison` orchestrator

Assembles every applicable card from already-fetched data, picks the winner, builds the summary. Pure — the hook fetches and feeds it.

**Files:**
- Modify: `src/features/compare/comparePaths.ts`
- Modify: `src/features/compare/comparePaths.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/features/compare/comparePaths.test.ts`:

```ts
import { buildComparison } from './comparePaths';
import type { ComparisonInput } from './comparePaths';

describe('buildComparison', () => {
  it('always shows sell-raw, adds vendor when priceLow>0, and a craft-output card', () => {
    const sourceMarket = mkMarket({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 5, velocity: 4, listingCount: 0 });
    const outputMarket = mkMarket({ minNQ: 5000, avgNQ: 5000, recentSalesNQ: 3, velocity: 1, listingCount: 0 });
    const outRecipe = recipe([{ itemId: 1, amount: 3 }]);
    const input: ComparisonInput = {
      source: { itemId: 1, itemName: 'Ore', hq: false, market: sourceMarket, history: [], priceLow: 8, recipe: undefined },
      outputs: [{ itemId: 50, itemName: 'Ingot', hq: false, market: outputMarket, history: [], recipe: outRecipe }],
      matCostOf: () => 600,
      homeMarket: { '1': sourceMarket },
      quantity: 1,
      now: 1_000,
    };
    const result = buildComparison(input);
    const ids = result.cards.map((c) => c.id).sort();
    expect(ids).toEqual(['craft-50', 'sell-raw', 'vendor']);
    expect(result.winnerId).toBeTruthy();
    expect(result.summary).toContain('Best play');
  });

  it('omits vendor when priceLow is 0 and adds craft-intermediate when the source is craftable', () => {
    const sourceMarket = mkMarket({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 5, velocity: 4 });
    const input: ComparisonInput = {
      source: { itemId: 1, itemName: 'Ingot', hq: false, market: sourceMarket, history: [], priceLow: 0, recipe: recipe([{ itemId: 2, amount: 2 }]) },
      outputs: [],
      matCostOf: () => 300,
      homeMarket: { '2': mkMarket({ minNQ: 50 }) },
      quantity: 1,
      now: 1_000,
    };
    const ids = buildComparison(input).cards.map((c) => c.id).sort();
    expect(ids).toEqual(['craft-int', 'sell-raw']);
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `npx vitest run src/features/compare/comparePaths.test.ts`
Expected: FAIL with "buildComparison is not a function".

- [ ] **Step 3: Implement `buildComparison`**

Append to `src/features/compare/comparePaths.ts`:

```ts
export interface ComparisonSource {
  itemId: number;
  itemName: string;
  hq: boolean;
  market: MarketItem | undefined;
  history: HistoryEntry[];
  priceLow: number;
  recipe: Recipe | undefined;
}

export interface ComparisonOutput {
  itemId: number;
  itemName: string;
  hq: boolean;
  market: MarketItem | undefined;
  history: HistoryEntry[];
  recipe: Recipe;
}

export interface ComparisonInput {
  source: ComparisonSource;
  outputs: ComparisonOutput[];
  /** Resolves material cost for a recipe under the selected material source. */
  matCostOf: (recipe: Recipe) => number;
  /** Home-world market keyed by string id — for craft-effort classification. */
  homeMarket: Record<string, MarketItem | undefined>;
  quantity: number;
  now: number;
}

export interface Comparison {
  cards: PathCard[];
  winnerId: string | null;
  summary: string;
}

const EMPTY_MARKET: MarketItem = {
  minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
  recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
  worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null,
};

export function buildComparison(input: ComparisonInput): Comparison {
  const { source, outputs, matCostOf, homeMarket, quantity, now } = input;
  const cards: PathCard[] = [];

  // Sell raw — always.
  cards.push(makeMarketCard({
    id: 'sell-raw', kind: 'sell-raw', itemId: source.itemId, itemName: source.itemName,
    market: source.market ?? EMPTY_MARKET, history: source.history, hq: source.hq,
    matCost: 0, effort: 'none', now,
  }));

  // Vendor — only when an NPC buys it.
  if (source.priceLow > 0) {
    cards.push(makeVendorCard(source.itemId, source.itemName, source.priceLow));
  }

  // Craft intermediate — when the source itself is craftable.
  if (source.recipe) {
    cards.push(makeMarketCard({
      id: 'craft-int', kind: 'craft-intermediate', itemId: source.itemId, itemName: source.itemName,
      market: source.market ?? EMPTY_MARKET, history: source.history, hq: source.hq,
      matCost: matCostOf(source.recipe), effort: craftEffort(source.recipe, homeMarket), now,
    }));
  }

  // Craft → output for each provided output.
  for (const o of outputs) {
    cards.push(makeMarketCard({
      id: `craft-${o.itemId}`, kind: 'craft-output', itemId: o.itemId, itemName: o.itemName,
      market: o.market ?? EMPTY_MARKET, history: o.history, hq: o.hq,
      matCost: matCostOf(o.recipe), effort: craftEffort(o.recipe, homeMarket), now,
    }));
  }

  const winnerId = pickWinner(cards, quantity);
  const summary = buildSummaryLine(cards, winnerId, quantity);
  return { cards, winnerId, summary };
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `npx vitest run src/features/compare/comparePaths.test.ts`
Expected: PASS (all engine describe-blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/features/compare/comparePaths.ts src/features/compare/comparePaths.test.ts
git commit -m "feat(compare): buildComparison orchestrator"
```

---

## Task 6: Data hook `useComparePaths`

Fetches market + 90-day history (bounded to ≤6 items), resolves material cost per the selected source, and calls `buildComparison`. No unit test (React + network); correctness is covered by the engine tests.

**Files:**
- Create: `src/features/compare/useComparePaths.ts`

- [ ] **Step 1: Create the hook**

Create `src/features/compare/useComparePaths.ts`:

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useUsedInIndex } from '../items/useUsedInIndex';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { useSpecialShopSnapshot } from '../queries/useSpecialShopSnapshot';
import { useMarketData } from '../watchlist/useMarketData';
import { findItemCurrencyOffers } from '../items/currencyOffers';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import {
  recipeMaterialCostHome,
  findBestSingleStopFor,
  selfSourceCost,
  type CurrencyResolver,
} from '../items/materialCost';
import { buildComparison, type Comparison, type ComparisonOutput } from './comparePaths';
import { effectiveUnitsPerDay } from '../items/verdict/pricing';
import type { MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';

export type MaterialSource = 'home' | 'region' | 'self';

const NINETY_DAYS_SEC = 90 * 24 * 60 * 60;
/** Max craft→output cards before "show more"; bounds expensive 90d history fetches. */
export const DEFAULT_OUTPUT_CAP = 5;

export interface UseComparePathsResult {
  comparison: Comparison | null;
  loading: boolean;
  error: boolean;
}

export function useComparePaths(
  itemId: number | null,
  materialSource: MaterialSource,
  quantity: number,
): UseComparePathsResult {
  const valid = itemId != null && Number.isFinite(itemId) && itemId > 0;
  const { world, dc } = useSettingsStore();

  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot(valid);
  const usedInIdx = useUsedInIndex();
  const gathering = useGatheringCatalog();
  const shop = useSpecialShopSnapshot();

  const recipeMap = recipes.data;
  const sourceItem = useMemo(
    () => (valid && snapshot.data ? snapshot.data.items.find((i) => i.id === itemId) : undefined),
    [valid, snapshot.data, itemId],
  );
  const nameOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of snapshot.data?.items ?? []) m.set(i.id, i.name);
    return (id: number) => m.get(id) ?? `Item #${id}`;
  }, [snapshot.data?.items]);

  const sourceRecipe = valid && recipeMap ? recipeMap.get(itemId!) : undefined;
  const usedIn = valid ? (usedInIdx.data.get(itemId!) ?? []) : [];

  // Candidate output recipes (the item used as an ingredient → craftable results).
  const outputRecipes = useMemo(() => {
    if (!recipeMap) return [];
    const out: Recipe[] = [];
    for (const e of usedIn) {
      const r = recipeMap.get(e.resultId);
      if (r) out.push(r);
    }
    return out;
  }, [usedIn, recipeMap]);

  // All ids that need market prices: source + its recipe mats + each output + its recipe mats.
  const priceIds = useMemo(() => {
    if (!valid) return [];
    const ids = new Set<number>([itemId!]);
    if (sourceRecipe) for (const ing of sourceRecipe.ingredients) ids.add(ing.itemId);
    for (const r of outputRecipes) {
      ids.add(r.itemResultId);
      for (const ing of r.ingredients) ids.add(ing.itemId);
    }
    return [...ids];
  }, [valid, itemId, sourceRecipe, outputRecipes]);

  const market = useMarketData(priceIds, world, dc, 'Europe', { enabled: valid && priceIds.length > 0 });
  const phantom = market.data?.phantom;
  const regionMap = market.data?.region;

  const gatherableIds = useMemo(
    () => (gathering.data ? new Set(gathering.data.keys()) : new Set<number>()),
    [gathering.data],
  );
  const currencyOf: CurrencyResolver = useMemo(() => {
    const snap = shop.data?.snapshot;
    return (id: number) => {
      if (!snap) return null;
      const offers = findItemCurrencyOffers(id, snap);
      if (offers.length === 0) return null;
      return { label: offers[0].currency.shortLabel, cost: offers[0].costPerUnit };
    };
  }, [shop.data]);

  // Resolve material cost for a recipe under the selected source.
  const matCostOf = useMemo(() => {
    return (recipe: Recipe): number => {
      const home = recipeMaterialCostHome(recipe, phantom);
      if (materialSource === 'home') return home;
      if (materialSource === 'region') {
        if (!regionMap) return home;
        return findBestSingleStopFor(recipe.ingredients, regionMap, world, home).cost;
      }
      // self
      if (!recipeMap || !phantom) return home;
      return selfSourceCost(recipe, recipeMap, phantom, gatherableIds, currencyOf);
    };
  }, [materialSource, phantom, regionMap, recipeMap, world, gatherableIds, currencyOf]);

  // Rank outputs by provisional gil/day (no stack yet) and keep the top N.
  const topOutputs = useMemo(() => {
    if (!phantom) return [];
    const scored = outputRecipes.map((r) => {
      const m = phantom[String(r.itemResultId)];
      const sale = m?.avgNQ ?? m?.medianNQ ?? m?.minNQ ?? m?.minHQ ?? 0;
      const profit = sale - matCostOf(r);
      const provisional = profit * effectiveUnitsPerDay(m?.velocity ?? 0, m?.listingCount ?? 0);
      return { recipe: r, provisional };
    });
    scored.sort((a, b) => b.provisional - a.provisional);
    return scored.slice(0, DEFAULT_OUTPUT_CAP).map((s) => s.recipe);
  }, [outputRecipes, phantom, matCostOf]);

  const hq = sourceItem?.canHq ?? false;

  // Fetch 90d history for the source + top outputs only (≤6 ids).
  const historyIds = useMemo(() => {
    if (!valid) return [];
    return [...new Set<number>([itemId!, ...topOutputs.map((r) => r.itemResultId)])];
  }, [valid, itemId, topOutputs]);

  const historyQ = useQuery({
    queryKey: ['compare-history', world, historyIds],
    enabled: valid && historyIds.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: () => fetchHistoryWithin(world, historyIds, NINETY_DAYS_SEC),
  });

  const comparison = useMemo<Comparison | null>(() => {
    if (!valid || !sourceItem || !phantom) return null;
    const histMap = historyQ.data ?? new Map<number, HistoryEntry[]>();
    const sourceMarket = phantom[String(itemId!)] as MarketItem | undefined;

    const outputs: ComparisonOutput[] = topOutputs.map((r) => ({
      itemId: r.itemResultId,
      itemName: nameOf(r.itemResultId),
      hq: false,
      market: phantom[String(r.itemResultId)],
      history: histMap.get(r.itemResultId) ?? [],
      recipe: r,
    }));

    return buildComparison({
      source: {
        itemId: itemId!,
        itemName: nameOf(itemId!),
        hq,
        market: sourceMarket,
        history: histMap.get(itemId!) ?? [],
        priceLow: sourceItem.priceLow ?? 0,
        recipe: sourceRecipe ?? undefined,
      },
      outputs,
      matCostOf,
      homeMarket: phantom,
      quantity,
      now: Date.now(),
    });
  }, [valid, sourceItem, phantom, historyQ.data, topOutputs, nameOf, itemId, hq, sourceRecipe, matCostOf, quantity]);

  return {
    comparison,
    loading: snapshot.isLoading || recipes.isLoading || market.isLoading || historyQ.isLoading,
    error: market.isError,
  };
}
```

- [ ] **Step 2: Typecheck + lint the new hook**

Run: `npx tsc --noEmit`
Expected: no errors. (If `useRecipeSnapshot` is called elsewhere with no args, confirm it accepts the optional `enabled` boolean as in `Item.tsx:78` — it does.)

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/compare/useComparePaths.ts
git commit -m "feat(compare): useComparePaths data hook"
```

---

## Task 7: `PathCard` component

**Files:**
- Create: `src/features/compare/PathCard.tsx`
- Create: `src/features/compare/PathCard.test.tsx`

- [ ] **Step 1: Write the failing render test**

Create `src/features/compare/PathCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PathCardView } from './PathCard';
import type { PathCard } from './comparePaths';

const base: PathCard = {
  id: 'sell-raw', kind: 'sell-raw', label: 'Sell raw (MB)', itemId: 1, itemName: 'Ore',
  salePrice: 1000, matCost: 0, profitPerUnit: 950, velocity: 4,
  unitsMovedPerDay: 4, gilPerDay: 3800, timeToSellHours: 6, stack: null,
  risk: 'Steady', effort: 'none',
};

function renderCard(card: PathCard, opts: { isWinner?: boolean; quantity?: number } = {}) {
  return render(
    <MemoryRouter>
      <PathCardView card={card} isWinner={opts.isWinner ?? false} quantity={opts.quantity ?? 1} />
    </MemoryRouter>,
  );
}

describe('PathCardView', () => {
  it('renders the path label and a BEST badge for the winner', () => {
    renderCard(base, { isWinner: true });
    expect(screen.getByText('Sell raw (MB)')).toBeInTheDocument();
    expect(screen.getByText(/BEST/)).toBeInTheDocument();
  });

  it('shows a supply-gap star when the stack profile has a gap', () => {
    renderCard({
      ...base,
      stack: {
        stackSizes: [{ stackSize: 5, soldLast90d: 15, listedNow: 0, avgPricePerUnit: 90 }],
        dominantStack: 5, volumeAtBest: 15, listedAtBest: 0, supplyGap: true, listingEventsPerDay: 2,
      },
    });
    expect(screen.getByText(/★/)).toBeInTheDocument();
  });

  it('shows an overcrowding warning at high quantity', () => {
    renderCard({ ...base, unitsMovedPerDay: 1, velocity: 1 }, { quantity: 30 });
    expect(screen.getByText(/take ~30/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `npx vitest run src/features/compare/PathCard.test.tsx`
Expected: FAIL with "Failed to resolve import ./PathCard".

- [ ] **Step 3: Implement `PathCard.tsx`**

Create `src/features/compare/PathCard.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { Gil } from '../../components/Gil';
import { quantityWarnings, daysToClear, type PathCard } from './comparePaths';

const EFFORT_LABEL: Record<PathCard['effort'], string> = {
  none: 'None',
  craft: 'Craft only',
  'gather-craft': 'Gather + Craft',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-text-dim font-mono text-[10px] tracking-widest uppercase">{label}</span>
      <span className="font-mono text-sm text-text-cream">{children}</span>
    </div>
  );
}

function fmtHours(h: number): string {
  if (!Number.isFinite(h)) return '—';
  if (h < 24) return `~${Math.round(h)}h`;
  return `~${(h / 24).toFixed(1)}d`;
}

export function PathCardView({ card, isWinner, quantity }: {
  card: PathCard;
  isWinner: boolean;
  quantity: number;
}) {
  const warnings = quantityWarnings(card, quantity);
  const days = daysToClear(card, quantity);
  const border = isWinner ? 'border-l-[3px] border-l-aether' : 'border-l border-l-border-base';

  return (
    <div className={`flex-shrink-0 w-[260px] border border-border-base ${border} bg-bg-card p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] tracking-widest uppercase text-aether">{card.label}</span>
        {isWinner && (
          <span className="font-mono text-[9px] tracking-widest uppercase text-bg-deep bg-aether px-1.5 py-0.5">★ BEST</span>
        )}
      </div>
      <Link to={`/item/${card.itemId}`} className="block text-text-cream hover:text-aether truncate">
        {card.itemName}
      </Link>

      <div className="border-t border-border-base/50 pt-2 space-y-1.5">
        <Row label="Sale price"><Gil value={card.salePrice} />/u</Row>
        <Row label="Profit/unit">
          <span className={card.profitPerUnit >= 0 ? 'text-jade' : 'text-crimson'}>
            {card.profitPerUnit >= 0 ? '+' : ''}<Gil value={card.profitPerUnit} />
          </span>
        </Row>
        <Row label="Velocity">{card.velocity > 0 ? `${card.velocity.toFixed(1)}/day` : '—'}</Row>
        <Row label="Time to sell">{card.kind === 'vendor' ? 'instant' : fmtHours(card.timeToSellHours)}</Row>
        <Row label="Gil/day"><span className="text-gold">{card.kind === 'vendor' ? 'instant' : <Gil value={Math.round(card.gilPerDay)} />}</span></Row>
      </div>

      {card.stack && (
        <div className="border-t border-border-base/50 pt-2 space-y-1.5">
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Stack profile (90d)</div>
          <Row label="Dominant stack">
            {card.stack.dominantStack}s{card.stack.supplyGap && <span className="text-gold"> ★</span>}
          </Row>
          <Row label="Vol @ best">{card.stack.volumeAtBest}</Row>
          <Row label="Listed @ best">{card.stack.listedAtBest}</Row>
          {card.stack.dominantStack > 1 && (
            <Row label="Throughput">~{card.stack.listingEventsPerDay.toFixed(1)} lists/day</Row>
          )}
        </div>
      )}

      <div className="border-t border-border-base/50 pt-2 space-y-1.5">
        <Row label="Risk">{card.risk}</Row>
        <Row label="Effort">{EFFORT_LABEL[card.effort]}</Row>
        {quantity > 1 && card.kind !== 'vendor' && (
          <>
            <Row label="Total profit">
              <span className={card.profitPerUnit >= 0 ? 'text-jade' : 'text-crimson'}>
                <Gil value={Math.round(card.profitPerUnit * quantity)} />
              </span>
            </Row>
            <Row label="Days to clear">{Number.isFinite(days) ? days.toFixed(1) : '—'}</Row>
          </>
        )}
      </div>

      {warnings.overcrowding && (
        <div className="text-[10px] text-gold border border-gold/40 px-2 py-1">⚠ {warnings.overcrowding}</div>
      )}
      {warnings.flood && (
        <div className="text-[10px] text-crimson border border-crimson/40 px-2 py-1">⚠ {warnings.flood}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `npx vitest run src/features/compare/PathCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/compare/PathCard.tsx src/features/compare/PathCard.test.tsx
git commit -m "feat(compare): PathCard component"
```

---

## Task 8: `CompareControls` component

**Files:**
- Create: `src/features/compare/CompareControls.tsx`

- [ ] **Step 1: Implement the controls**

Create `src/features/compare/CompareControls.tsx`:

```tsx
import type { MaterialSource } from './useComparePaths';

const SOURCE_OPTS: { value: MaterialSource; label: string }[] = [
  { value: 'home', label: 'Home MB' },
  { value: 'region', label: 'Region' },
  { value: 'self', label: 'Self-sourced' },
];

export function CompareControls({
  quantity, onQuantity, materialSource, onMaterialSource,
}: {
  quantity: number;
  onQuantity: (n: number) => void;
  materialSource: MaterialSource;
  onMaterialSource: (s: MaterialSource) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 mb-4">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">How many do you have?</span>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => onQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          className="w-24 bg-bg-card border border-border-base text-text-cream font-mono text-sm px-3 py-2 focus:outline-none focus:border-aether"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">Materials from</span>
        <div className="flex">
          {SOURCE_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onMaterialSource(o.value)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border border-border-base -ml-px first:ml-0 transition-colors ${
                materialSource === o.value ? 'bg-aether text-bg-deep border-aether' : 'text-text-dim hover:text-aether'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/compare/CompareControls.tsx
git commit -m "feat(compare): CompareControls (quantity + material source)"
```

---

## Task 9: `ComparePathsSection` component

Shared by the item page and the standalone route.

**Files:**
- Create: `src/features/compare/ComparePathsSection.tsx`

- [ ] **Step 1: Implement the section**

Create `src/features/compare/ComparePathsSection.tsx`:

```tsx
import { forwardRef, useState } from 'react';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner } from '../../components/Spinner';
import { CompareControls } from './CompareControls';
import { PathCardView } from './PathCard';
import { useComparePaths, type MaterialSource } from './useComparePaths';

export const ComparePathsSection = forwardRef<HTMLDivElement, { itemId: number | null }>(
  function ComparePathsSection({ itemId }, ref) {
    const [quantity, setQuantity] = useState(1);
    const [materialSource, setMaterialSource] = useState<MaterialSource>('home');
    const { comparison, loading, error } = useComparePaths(itemId, materialSource, quantity);

    return (
      <section ref={ref} id="compare-paths">
        <SectionHeader label="Compare Paths" />
        <CompareControls
          quantity={quantity}
          onQuantity={setQuantity}
          materialSource={materialSource}
          onMaterialSource={setMaterialSource}
        />

        {itemId == null && (
          <div className="border border-border-base bg-bg-card p-4 text-text-low text-sm italic">
            Search for an item to compare its paths.
          </div>
        )}
        {itemId != null && loading && <div className="py-4"><Spinner label="Comparing paths…" /></div>}
        {itemId != null && error && (
          <div className="border border-border-base bg-bg-card p-4 text-crimson text-sm">Market fetch failed.</div>
        )}

        {comparison && comparison.cards.length > 0 && (
          <>
            <div className="border-l-[3px] border-l-aether bg-bg-card border border-border-base px-4 py-3 mb-4 text-sm text-text-cream">
              {comparison.summary}
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:flex-row flex-col">
              {comparison.cards.map((card) => (
                <PathCardView
                  key={card.id}
                  card={card}
                  isWinner={card.id === comparison.winnerId}
                  quantity={quantity}
                />
              ))}
            </div>
          </>
        )}
      </section>
    );
  },
);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirm `src/components/Spinner.tsx` exports `Spinner` with a `label` prop — it does; used in `Item.tsx:241`.)

- [ ] **Step 3: Commit**

```bash
git add src/features/compare/ComparePathsSection.tsx
git commit -m "feat(compare): ComparePathsSection shell"
```

---

## Task 10: Item page integration (button + section)

**Files:**
- Modify: `src/routes/Item.tsx`

- [ ] **Step 1: Add imports + a section ref**

In `src/routes/Item.tsx`:

1. Change the React import on line 1 to include `useRef`:

```ts
import { useMemo, useRef, useState } from 'react';
```

2. Add an import for the section near the other feature imports:

```ts
import { ComparePathsSection } from '../features/compare/ComparePathsSection';
```

3. Inside the `Item()` component, after `const valid = ...` (around line 74), add:

```ts
  const compareRef = useRef<HTMLDivElement>(null);
  const canCompare = !!recipe || usedIn.length > 0;
```

(Place this *after* `recipe` and `usedIn` are defined — i.e. after line 96 where `usedIn` is computed. Move the two lines there if needed so both are in scope.)

- [ ] **Step 2: Pass the compare props into `HeaderBlock`**

Update the `<HeaderBlock ... />` usage (around line 227) to add two props:

```tsx
      <HeaderBlock
        name={displayName}
        ilvl={displayIlvl}
        sc={displaySc}
        canHq={canHq}
        rarity={item?.rarity}
        itemId={itemId}
        recipe={recipe ?? null}
        world={world}
        dc={dc}
        updatedMs={phantomMarket?.lastUploadTime ?? null}
        canCompare={canCompare}
        onCompare={() => compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />
```

- [ ] **Step 3: Add the button to `HeaderBlock`**

Update the `HeaderBlock` function signature (line 398) to accept the new props:

```tsx
function HeaderBlock({ name, ilvl, sc, canHq, rarity, itemId, recipe, world, dc, updatedMs, canCompare, onCompare }: {
  name: string; ilvl: number; sc: number; canHq: boolean; rarity: number | undefined; itemId: number; recipe: Recipe | null;
  world: string; dc: string; updatedMs: number | null;
  canCompare: boolean; onCompare: () => void;
}) {
```

Then, inside the action button row (after `<AddToShoppingListButton itemId={itemId} />`, before `<PluginItemActions ... />` around line 431), add:

```tsx
          {canCompare && (
            <button
              type="button"
              onClick={onCompare}
              className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-3 py-2 hover:bg-aether hover:text-bg-deep transition-colors"
              title="Compare what to do with this item"
            >
              + Compare Paths
            </button>
          )}
```

- [ ] **Step 4: Render the section near the bottom of the page**

In the `Item()` return, add the section just before the closing `</div>` of the page container (after `<SourcesBlock ... />`, around line 379, and before the breakdown modal block):

```tsx
      {canCompare && <ComparePathsSection ref={compareRef} itemId={itemId} />}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Item.tsx
git commit -m "feat(compare): + Compare Paths button + section on item page"
```

---

## Task 11: `/compare` standalone route

**Files:**
- Create: `src/routes/Compare.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the standalone page**

Create `src/routes/Compare.tsx`. It reuses the bounded item-search idiom from `GlobalItemSearch` (snapshot lookup → select an item) and renders the section.

```tsx
import { useMemo, useState } from 'react';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { categoryLabel } from '../lib/itemSearchCategories';
import { ComparePathsSection } from '../features/compare/ComparePathsSection';

const MAX_RESULTS = 8;
const MIN_QUERY_LEN = 2;

export default function Compare() {
  const snapshot = useItemSnapshot();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < MIN_QUERY_LEN || !snapshot.data) return [];
    const out: typeof snapshot.data.items = [];
    for (const item of snapshot.data.items) {
      if (item.name.toLowerCase().includes(query)) {
        out.push(item);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [q, snapshot.data]);

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-6">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-text-cream mb-1">Compare Paths</h1>
        <p className="text-text-low text-sm">
          Look up an item to see whether to sell it raw, vendor it, or craft it — side by side.
        </p>
      </div>

      <div className="relative w-full sm:w-96">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search items…"
          aria-label="Search items to compare"
          className="w-full bg-bg-card border border-border-base text-text-cream font-mono text-sm px-3 py-2 focus:outline-none focus:border-aether"
        />
        {results.length > 0 && q.trim().length >= MIN_QUERY_LEN && (
          <ul className="absolute left-0 right-0 top-full mt-1 z-40 border border-border-hi bg-bg-card-hi shadow-lg max-h-80 overflow-y-auto">
            {results.map((r) => (
              <li
                key={r.id}
                onMouseDown={(e) => { e.preventDefault(); setSelected({ id: r.id, name: r.name }); setQ(r.name); }}
                className="px-3 py-2 cursor-pointer flex items-baseline gap-3 text-text-cream hover:bg-bg-card hover:text-gold"
              >
                {r.ilvl > 1 && <span className="font-mono text-[10px] tracking-widest text-gold tabular-nums shrink-0">i{r.ilvl}</span>}
                <span className="truncate flex-1">{r.name}</span>
                <span className="font-mono text-[10px] text-text-low shrink-0">{categoryLabel(r.sc)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ComparePathsSection itemId={selected?.id ?? null} />
    </div>
  );
}
```

- [ ] **Step 2: Register the route + title in `App.tsx`**

In `src/App.tsx`:

1. Add the import alongside the other route imports (near line 37):

```ts
import Compare from './routes/Compare';
```

2. Add to `PAGE_TITLES` (after the `'/craft-batch'` entry, around line 65):

```ts
  '/compare': 'Compare Paths',
```

3. Add the route inside the inner `<Routes>` (near the `/craft-batch` route, around line 140):

```tsx
                        <Route path="/compare" element={<Compare />} />
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Compare.tsx src/App.tsx
git commit -m "feat(compare): /compare standalone route"
```

---

## Task 12: Sidebar nav entry + final verification

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add the Compare nav item between Batch and Craft Helper**

In `src/components/layout/Sidebar.tsx`, update the Planning group `items` array (around lines 42–49) so it reads:

```ts
    items: [
      { label: 'Projects', path: '/projects' },
      { label: 'Watchlist', path: '/watchlist' },
      { label: 'Discover', path: '/discover' },
      { label: 'Batch', path: '/craft-batch' },
      { label: 'Compare', path: '/compare' },
      { label: 'Craft Helper', path: '/shopping-list' },
      { label: 'Leves', path: '/leves' },
    ],
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test -- --run`
Expected: PASS — all suites green, including the new `comparePaths`, `materialCost`, `PathCard` tests and the pre-existing `CraftSellMathCard` / `stackAnalysis` tests.

- [ ] **Step 3: Lint + typecheck + build**

Run: `npm run lint`
Expected: no errors/warnings.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (tsc + vite build).

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `npm run dev`, open an item that is both craftable and used as an ingredient (e.g. a common intermediate like an ingot), and verify:
- `+ Compare Paths` appears in the header and scrolls to the section.
- Cards render for sell-raw, vendor (if applicable), craft-intermediate, and craft→outputs.
- A ★ BEST badge shows on exactly one card; the summary line matches it.
- Changing quantity surfaces total profit, days-to-clear, and overcrowding/flood warnings.
- Switching the material-source toggle recomputes profit/Gil-day.
- `/compare` from the sidebar lets you search any item and shows the same section.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(compare): sidebar nav entry under Planning"
```

---

## Self-Review Notes

- **Spec coverage:** entry points (Task 10 button, Task 11 route, Task 12 nav) ✓; all four path types (Task 5) ✓; per-card fields incl. stack profile + supply gap (Tasks 3, 7) ✓; quantity input + overcrowding/flood (Tasks 4, 7, 8) ✓; winner logic + summary (Task 4) ✓; material-cost toggle (Tasks 6, 8) ✓; reuse of stack/throughput/risk/material-cost (Tasks 1–3) ✓; dark-terminal styling (Tasks 7–9) ✓; scope boundaries — sell-math card untouched, additive section (Task 10) ✓.
- **Decisions locked:** risk uses the app's `riskLabel` taxonomy; MB sales apply the 5% `applyTax` (consistent with the verdict engine); a held source item is valued at 0 on the sell-raw path (you already own it) and craft paths cost only the recipe's own materials; vendor is modeled as instant, zero-throughput so it wins only when all market paths are non-positive.
- **Type consistency:** `PathCard`/`StackProfile`/`Effort`/`ComparisonInput` defined in Task 2/3/5 are imported unchanged by Tasks 6–9; `MaterialSource` defined in Task 6 is consumed by Tasks 8–9.
