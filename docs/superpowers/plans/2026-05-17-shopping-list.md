# Shopping List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a persistent multi-craft shopping list at `/shopping-list` that aggregates ingredient demand across N items, runs one region-wide Universalis price scan, and presents per-world summary cards + a sortable detail table + a rollup of spend/revenue/profit.

**Architecture:** A Zustand+persist store (`shoppingListStore`) holds the user's list of items + per-item flags (qty, craftIntermediates). Two pure compute modules (`aggregateIngredients`, `planShopping`) take the list + recipe map + region price map and return a `ShoppingPlan`. The route (`ShoppingList`) orchestrates `useRecipes` + `useMarketData(..., 'Europe')` and renders a `ShoppingListPanel` (editable list) + `ShoppingListPlan` (rollup + by-world cards + detail table). A reusable `AddToShoppingListButton` lives next to `AddToWatchlistButton` on `/item/:id` and inside the per-item ⚙ flow on the watchlist.

**Tech Stack:** TypeScript, React, Zustand (`persist`), TanStack Query (`useMarketData`, `useRecipes`), React Router, Vitest + React Testing Library, Tailwind. No new dependencies.

**IMPORTANT GIT SAFETY RULE for implementers:** Do NOT run `git checkout`, `git reset`, `git stash`, `git clean`, `git rebase`, `git restore`, `git switch`. Only `git add`, `git commit`, `git log`, `git diff`, `git show`, `git status`, `git cat-file`, `git fsck` are allowed.

---

## Task 1: Shopping list store

**Files:**
- Create: `src/features/shoppingList/shoppingListStore.ts`
- Test: `src/features/shoppingList/shoppingListStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/shoppingList/shoppingListStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useShoppingListStore, defaultShoppingList } from './shoppingListStore';

beforeEach(() => {
  localStorage.clear();
  useShoppingListStore.setState(defaultShoppingList());
});

describe('shoppingList store', () => {
  it('starts empty', () => {
    expect(useShoppingListStore.getState().items).toEqual([]);
  });

  it('addItem appends with qty 1 and craftIntermediates false by default', () => {
    useShoppingListStore.getState().addItem(123);
    expect(useShoppingListStore.getState().items).toEqual([
      { id: 123, qty: 1, craftIntermediates: false },
    ]);
  });

  it('addItem dedupes by id and increments qty', () => {
    useShoppingListStore.getState().addItem(123);
    useShoppingListStore.getState().addItem(123, 2);
    expect(useShoppingListStore.getState().items).toEqual([
      { id: 123, qty: 3, craftIntermediates: false },
    ]);
  });

  it('addItem respects an explicit qty for first-time add', () => {
    useShoppingListStore.getState().addItem(7, 5);
    expect(useShoppingListStore.getState().items[0].qty).toBe(5);
  });

  it('removeItem drops by id', () => {
    useShoppingListStore.getState().addItem(1);
    useShoppingListStore.getState().addItem(2);
    useShoppingListStore.getState().removeItem(1);
    expect(useShoppingListStore.getState().items.map((i) => i.id)).toEqual([2]);
  });

  it('setQty updates qty in place', () => {
    useShoppingListStore.getState().addItem(42);
    useShoppingListStore.getState().setQty(42, 9);
    expect(useShoppingListStore.getState().items[0].qty).toBe(9);
  });

  it('setQty with 0 or negative removes the row', () => {
    useShoppingListStore.getState().addItem(42);
    useShoppingListStore.getState().setQty(42, 0);
    expect(useShoppingListStore.getState().items).toEqual([]);
  });

  it('setCraftIntermediates flips the per-item flag', () => {
    useShoppingListStore.getState().addItem(99);
    useShoppingListStore.getState().setCraftIntermediates(99, true);
    expect(useShoppingListStore.getState().items[0].craftIntermediates).toBe(true);
  });

  it('clear empties the list', () => {
    useShoppingListStore.getState().addItem(1);
    useShoppingListStore.getState().addItem(2);
    useShoppingListStore.getState().clear();
    expect(useShoppingListStore.getState().items).toEqual([]);
  });

  it('persists to localStorage under ffxiv-helper:shoppingList', () => {
    useShoppingListStore.getState().addItem(555, 3);
    const raw = localStorage.getItem('ffxiv-helper:shoppingList');
    expect(raw).toBeTruthy();
    expect(raw!).toContain('"id":555');
    expect(raw!).toContain('"qty":3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/shoppingListStore.test.ts`
Expected: FAIL — `Cannot find module './shoppingListStore'`.

- [ ] **Step 3: Implement the store**

```ts
// src/features/shoppingList/shoppingListStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ShoppingListItem {
  id: number;
  qty: number;
  craftIntermediates: boolean;
}

export interface ShoppingListState {
  _v: 1;
  items: ShoppingListItem[];
  addItem: (id: number, qty?: number) => void;
  removeItem: (id: number) => void;
  setQty: (id: number, qty: number) => void;
  setCraftIntermediates: (id: number, value: boolean) => void;
  clear: () => void;
}

export function defaultShoppingList(): Pick<ShoppingListState, '_v' | 'items'> {
  return { _v: 1, items: [] };
}

export const useShoppingListStore = create<ShoppingListState>()(
  persist(
    (set) => ({
      ...defaultShoppingList(),
      addItem: (id, qty = 1) => set((s) => {
        const existing = s.items.find((i) => i.id === id);
        if (existing) {
          return {
            items: s.items.map((i) =>
              i.id === id ? { ...i, qty: i.qty + qty } : i,
            ),
          };
        }
        return { items: [...s.items, { id, qty, craftIntermediates: false }] };
      }),
      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      setQty: (id, qty) => set((s) => {
        if (qty <= 0) return { items: s.items.filter((i) => i.id !== id) };
        return { items: s.items.map((i) => (i.id === id ? { ...i, qty } : i)) };
      }),
      setCraftIntermediates: (id, value) => set((s) => ({
        items: s.items.map((i) => (i.id === id ? { ...i, craftIntermediates: value } : i)),
      })),
      clear: () => set({ items: [] }),
    }),
    { name: 'ffxiv-helper:shoppingList' },
  ),
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/shoppingList/shoppingListStore.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/shoppingList/shoppingListStore.ts src/features/shoppingList/shoppingListStore.test.ts
git commit -m "feat(shoppingList): add Zustand+persist store"
```

---

## Task 2: Aggregate ingredients (pure)

**Files:**
- Create: `src/features/shoppingList/aggregateIngredients.ts`
- Test: `src/features/shoppingList/aggregateIngredients.test.ts`

Notes for the engineer:
- A `Recipe` (`src/lib/recipes.ts`) has `{ itemResultId, classJob, recipeLevel, ingredients: { itemId, amount }[] }`. There is **no `recipeYield` field** — recipes always produce one item per craft in this codebase, so we don't divide demand by yield.
- "Craft intermediates" means: when an ingredient itself has a recipe and the user flagged it, **recurse** into that recipe instead of buying the ingredient. Recursion is depth-1 only (matches the user's mental model — they don't want multi-level cascades).

- [ ] **Step 1: Write the failing test**

```ts
// src/features/shoppingList/aggregateIngredients.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateIngredients } from './aggregateIngredients';
import type { Recipe } from '../../lib/recipes';
import type { ShoppingListItem } from './shoppingListStore';

function mkRecipe(itemId: number, ingredients: { itemId: number; amount: number }[]): Recipe {
  return { itemResultId: itemId, classJob: 'CRP', recipeLevel: 1, ingredients };
}

describe('aggregateIngredients', () => {
  it('returns empty for empty list', () => {
    const result = aggregateIngredients([], new Map());
    expect(result.demand.size).toBe(0);
    expect(result.missingRecipes).toEqual([]);
  });

  it('sums one item × qty 1', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: false }];
    const recipes = new Map([[100, mkRecipe(100, [{ itemId: 5, amount: 3 }])]]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(5)).toBe(3);
  });

  it('multiplies ingredient amount by craft qty', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 4, craftIntermediates: false }];
    const recipes = new Map([[100, mkRecipe(100, [{ itemId: 5, amount: 3 }])]]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(5)).toBe(12);
  });

  it('sums overlapping ingredients across multiple items', () => {
    const items: ShoppingListItem[] = [
      { id: 100, qty: 1, craftIntermediates: false },
      { id: 200, qty: 2, craftIntermediates: false },
    ];
    const recipes = new Map([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
      [200, mkRecipe(200, [{ itemId: 5, amount: 4 }, { itemId: 6, amount: 1 }])],
    ]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(5)).toBe(3 + 4 * 2); // 11
    expect(result.demand.get(6)).toBe(2);
  });

  it('recurses into sub-recipe when craftIntermediates=true', () => {
    // 100 needs 2× of 50; 50 is itself craftable from 4× of 10.
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: true }];
    const recipes = new Map([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
    ]);
    const result = aggregateIngredients(items, recipes);
    // 50 should NOT appear in demand (we craft it from raws).
    expect(result.demand.has(50)).toBe(false);
    expect(result.demand.get(10)).toBe(2 * 4); // 8
  });

  it('falls back to buying sub-ingredient when it has no recipe', () => {
    // craftIntermediates=true but 50 has no recipe → just buy 50.
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: true }];
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, null],
    ]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(50)).toBe(2);
  });

  it('only recurses one level deep', () => {
    // 100 → 2× of 50 → 4× of 10 → 7× of 1.  With one-level recursion,
    // 10 should appear in demand (we DO NOT recurse further into 10's recipe).
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: true }];
    const recipes = new Map([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
      [10, mkRecipe(10, [{ itemId: 1, amount: 7 }])],
    ]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(10)).toBe(8);
    expect(result.demand.has(1)).toBe(false);
  });

  it('skips items with missing recipes and reports them', () => {
    const items: ShoppingListItem[] = [
      { id: 100, qty: 1, craftIntermediates: false },
      { id: 999, qty: 1, craftIntermediates: false },
    ];
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
      [999, null],
    ]);
    const result = aggregateIngredients(items, recipes);
    expect(result.demand.get(5)).toBe(3);
    expect(result.missingRecipes).toEqual([999]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/aggregateIngredients.test.ts`
Expected: FAIL — `Cannot find module './aggregateIngredients'`.

- [ ] **Step 3: Implement the function**

```ts
// src/features/shoppingList/aggregateIngredients.ts
import type { Recipe } from '../../lib/recipes';
import type { ShoppingListItem } from './shoppingListStore';

export interface AggregateResult {
  demand: Map<number, number>;       // ingredientId → total qty needed
  missingRecipes: number[];          // list-item ids whose recipe is null/missing
}

export function aggregateIngredients(
  items: ShoppingListItem[],
  recipeMap: Map<number, Recipe | null>,
): AggregateResult {
  const demand = new Map<number, number>();
  const missingRecipes: number[] = [];

  const add = (id: number, qty: number) => {
    demand.set(id, (demand.get(id) ?? 0) + qty);
  };

  for (const listItem of items) {
    const recipe = recipeMap.get(listItem.id);
    if (!recipe) {
      missingRecipes.push(listItem.id);
      continue;
    }
    for (const ing of recipe.ingredients) {
      const totalIngQty = ing.amount * listItem.qty;
      if (listItem.craftIntermediates) {
        const subRecipe = recipeMap.get(ing.itemId);
        if (subRecipe) {
          for (const sub of subRecipe.ingredients) {
            add(sub.itemId, sub.amount * totalIngQty);
          }
          continue;
        }
      }
      add(ing.itemId, totalIngQty);
    }
  }

  return { demand, missingRecipes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/shoppingList/aggregateIngredients.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/shoppingList/aggregateIngredients.ts src/features/shoppingList/aggregateIngredients.test.ts
git commit -m "feat(shoppingList): aggregate ingredient demand with one-level craft-intermediates"
```

---

## Task 3: Plan shopping (pure)

**Files:**
- Create: `src/features/shoppingList/planShopping.ts`
- Test: `src/features/shoppingList/planShopping.test.ts`

Notes for the engineer:
- `MarketItem.worldListings: { world, price, hq }[]` — NQ-only for ingredient pricing (matches `runMaterialFlip` convention; HQ flips are out of scope).
- Region scope is hard-coded to Europe; world filtering uses `EU_WORLDS`/`dcOf` from `src/lib/europeWorlds.ts`.
- Revenue per item = `min(item HQ price, item NQ price)` if `canHq`, else NQ. Use the item's home-world (`phantom`) price; fall back to region-min if home has no listings. If neither, revenue contribution is 0 (and the item is counted as a missing-revenue item — but for v1 we just contribute 0 silently to keep the rollup simple).
- We construct one summary card per world that contributes ≥1 ingredient. Card `total = Σ(price × qty)` for that world. If an ingredient is cheapest on multiple worlds (tie), pick the first encountered in `EU_WORLDS` iteration order — that's stable.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/shoppingList/planShopping.test.ts
import { describe, it, expect } from 'vitest';
import { planShopping } from './planShopping';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { ShoppingListItem } from './shoppingListStore';
import type { SnapshotItem } from '../../lib/itemSnapshot';

function mkMarketItem(listings: { world: string; price: number; hq?: boolean }[], minNQ?: number | null, minHQ?: number | null): MarketItem {
  return {
    minNQ: minNQ ?? null,
    minHQ: minHQ ?? null,
    avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0,
    velocity: 0,
    lastUploadTime: 0,
    listingCount: listings.length,
    worldListings: listings.map((l) => ({ world: l.world, price: l.price, hq: !!l.hq })),
    averagePriceNQ: null, averagePriceHQ: null,
  };
}

function mkSnapshotItem(id: number, name: string, canHq = true): SnapshotItem {
  return { id, name, sc: 1, ui: 1, ilvl: 1, canHq };
}

describe('planShopping', () => {
  it('returns empty plan for empty demand', () => {
    const plan = planShopping(new Map(), [], {}, []);
    expect(plan.perIngredient).toEqual([]);
    expect(plan.byWorldSummary).toEqual([]);
    expect(plan.rollup).toEqual({ spend: 0, revenue: 0, profit: 0, missingIngredients: 0 });
  });

  it('picks the cheapest world per ingredient (NQ only, ignores HQ listings)', () => {
    const demand = new Map([[5, 3]]);
    const prices: MarketData = {
      5: mkMarketItem([
        { world: 'Phantom', price: 100 },
        { world: 'Odin', price: 60 },
        { world: 'Odin', price: 30, hq: true }, // HQ — must be ignored
      ]),
    };
    const plan = planShopping(demand, [], prices, []);
    expect(plan.perIngredient).toEqual([
      { id: 5, qty: 3, bestWorld: 'Odin', bestPrice: 60, isLightDc: true, listingCount: 3 },
    ]);
  });

  it('flags Light DC stops', () => {
    const demand = new Map([[5, 1]]);
    const prices: MarketData = { 5: mkMarketItem([{ world: 'Twintania', price: 99 }]) };
    const plan = planShopping(demand, [], prices, []);
    expect(plan.perIngredient[0].isLightDc).toBe(true);
  });

  it('flags Chaos stops as not Light DC', () => {
    const demand = new Map([[5, 1]]);
    const prices: MarketData = { 5: mkMarketItem([{ world: 'Phantom', price: 99 }]) };
    const plan = planShopping(demand, [], prices, []);
    expect(plan.perIngredient[0].isLightDc).toBe(false);
  });

  it('marks ingredient as missing when there are no NQ listings on any EU world', () => {
    const demand = new Map([[5, 2]]);
    const prices: MarketData = { 5: mkMarketItem([{ world: 'Bahamut', price: 50 }]) }; // JP world
    const plan = planShopping(demand, [], prices, []);
    expect(plan.perIngredient).toEqual([
      { id: 5, qty: 2, bestWorld: null, bestPrice: null, isLightDc: false, listingCount: 0 },
    ]);
    expect(plan.rollup.missingIngredients).toBe(1);
    expect(plan.rollup.spend).toBe(0);
  });

  it('groups ingredients by world into summary cards sorted by total desc', () => {
    const demand = new Map([[5, 2], [6, 3], [7, 1]]);
    const prices: MarketData = {
      5: mkMarketItem([{ world: 'Phantom', price: 100 }]),    // 200
      6: mkMarketItem([{ world: 'Odin', price: 50 }]),         // 150
      7: mkMarketItem([{ world: 'Phantom', price: 30 }]),     // 30
    };
    const plan = planShopping(demand, [], prices, []);
    expect(plan.byWorldSummary).toHaveLength(2);
    expect(plan.byWorldSummary[0].world).toBe('Phantom');
    expect(plan.byWorldSummary[0].total).toBe(230);
    expect(plan.byWorldSummary[0].isLightDc).toBe(false);
    expect(plan.byWorldSummary[0].ingredients).toEqual([
      { id: 5, qty: 2, price: 100 },
      { id: 7, qty: 1, price: 30 },
    ]);
    expect(plan.byWorldSummary[1].world).toBe('Odin');
    expect(plan.byWorldSummary[1].total).toBe(150);
    expect(plan.byWorldSummary[1].isLightDc).toBe(true);
  });

  it('rolls up spend = Σ(qty × bestPrice) excluding missing ingredients', () => {
    const demand = new Map([[5, 2], [6, 3]]);
    const prices: MarketData = {
      5: mkMarketItem([{ world: 'Phantom', price: 100 }]),    // 200
      6: mkMarketItem([{ world: 'Bahamut', price: 999 }]),    // missing (not EU)
    };
    const plan = planShopping(demand, [], prices, []);
    expect(plan.rollup.spend).toBe(200);
    expect(plan.rollup.missingIngredients).toBe(1);
  });

  it('computes revenue from item HQ home price × craft qty (canHq=true)', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 2, craftIntermediates: false }];
    const snapshot: SnapshotItem[] = [mkSnapshotItem(100, 'Widget', true)];
    const prices: MarketData = {
      100: mkMarketItem([{ world: 'Phantom', price: 500, hq: true }], null, 500),
    };
    const plan = planShopping(new Map(), items, prices, snapshot);
    expect(plan.rollup.revenue).toBe(1000); // 500 × 2
  });

  it('uses NQ price when item is not HQ-capable', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 3, craftIntermediates: false }];
    const snapshot: SnapshotItem[] = [mkSnapshotItem(100, 'NQ Only', false)];
    const prices: MarketData = {
      100: mkMarketItem([{ world: 'Phantom', price: 200 }], 200, null),
    };
    const plan = planShopping(new Map(), items, prices, snapshot);
    expect(plan.rollup.revenue).toBe(600); // 200 × 3
  });

  it('contributes 0 revenue when item has no price anywhere in EU', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: false }];
    const snapshot: SnapshotItem[] = [mkSnapshotItem(100, 'No Market', true)];
    const prices: MarketData = { 100: mkMarketItem([], null, null) };
    const plan = planShopping(new Map(), items, prices, snapshot);
    expect(plan.rollup.revenue).toBe(0);
  });

  it('profit = revenue − spend', () => {
    const items: ShoppingListItem[] = [{ id: 100, qty: 1, craftIntermediates: false }];
    const snapshot: SnapshotItem[] = [mkSnapshotItem(100, 'X', true)];
    const demand = new Map([[5, 2]]);
    const prices: MarketData = {
      100: mkMarketItem([{ world: 'Phantom', price: 500, hq: true }], null, 500),
      5: mkMarketItem([{ world: 'Phantom', price: 100 }]),
    };
    const plan = planShopping(demand, items, prices, snapshot);
    expect(plan.rollup.spend).toBe(200);
    expect(plan.rollup.revenue).toBe(500);
    expect(plan.rollup.profit).toBe(300);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/planShopping.test.ts`
Expected: FAIL — `Cannot find module './planShopping'`.

- [ ] **Step 3: Implement the function**

```ts
// src/features/shoppingList/planShopping.ts
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { ShoppingListItem } from './shoppingListStore';
import { EU_WORLDS, dcOf } from '../../lib/europeWorlds';

export interface IngredientPlan {
  id: number;
  qty: number;
  bestWorld: string | null;
  bestPrice: number | null;
  isLightDc: boolean;
  listingCount: number;
}

export interface WorldSummary {
  world: string;
  isLightDc: boolean;
  ingredients: { id: number; qty: number; price: number }[];
  total: number;
}

export interface ShoppingPlan {
  perIngredient: IngredientPlan[];
  byWorldSummary: WorldSummary[];
  rollup: {
    spend: number;
    revenue: number;
    profit: number;
    missingIngredients: number;
  };
}

function cheapestEuNq(m: MarketItem | undefined): { world: string; price: number; count: number } | null {
  if (!m) return null;
  let best: { world: string; price: number } | null = null;
  let count = 0;
  for (const l of m.worldListings) {
    if (l.hq) continue;
    if (!EU_WORLDS.has(l.world)) continue;
    count++;
    if (!best || l.price < best.price) best = { world: l.world, price: l.price };
  }
  if (!best) return null;
  return { ...best, count };
}

function itemRevenueUnit(itemId: number, snapshot: SnapshotItem[], prices: MarketData): number {
  const item = snapshot.find((s) => s.id === itemId);
  if (!item) return 0;
  const m = prices[itemId];
  if (!m) return 0;
  if (item.canHq && m.minHQ != null) return m.minHQ;
  if (m.minNQ != null) return m.minNQ;
  return cheapestEuNq(m)?.price ?? 0;
}

export function planShopping(
  demand: Map<number, number>,
  items: ShoppingListItem[],
  prices: MarketData,
  snapshot: SnapshotItem[],
): ShoppingPlan {
  const perIngredient: IngredientPlan[] = [];
  let spend = 0;
  let missingIngredients = 0;

  const sortedIds = [...demand.keys()].sort((a, b) => a - b);
  for (const id of sortedIds) {
    const qty = demand.get(id)!;
    const cheapest = cheapestEuNq(prices[id]);
    if (!cheapest) {
      perIngredient.push({ id, qty, bestWorld: null, bestPrice: null, isLightDc: false, listingCount: 0 });
      missingIngredients++;
      continue;
    }
    perIngredient.push({
      id, qty,
      bestWorld: cheapest.world,
      bestPrice: cheapest.price,
      isLightDc: dcOf(cheapest.world) === 'Light',
      listingCount: cheapest.count,
    });
    spend += cheapest.price * qty;
  }

  // Group by world.
  const worldMap = new Map<string, WorldSummary>();
  for (const ing of perIngredient) {
    if (!ing.bestWorld || ing.bestPrice == null) continue;
    let summary = worldMap.get(ing.bestWorld);
    if (!summary) {
      summary = {
        world: ing.bestWorld,
        isLightDc: ing.isLightDc,
        ingredients: [],
        total: 0,
      };
      worldMap.set(ing.bestWorld, summary);
    }
    summary.ingredients.push({ id: ing.id, qty: ing.qty, price: ing.bestPrice });
    summary.total += ing.bestPrice * ing.qty;
  }
  const byWorldSummary = [...worldMap.values()].sort((a, b) => b.total - a.total);

  let revenue = 0;
  for (const it of items) {
    revenue += itemRevenueUnit(it.id, snapshot, prices) * it.qty;
  }

  return {
    perIngredient,
    byWorldSummary,
    rollup: {
      spend,
      revenue,
      profit: revenue - spend,
      missingIngredients,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/shoppingList/planShopping.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/shoppingList/planShopping.ts src/features/shoppingList/planShopping.test.ts
git commit -m "feat(shoppingList): planShopping pure compute (per-ingredient, by-world, rollup)"
```

---

## Task 4: AddToShoppingListButton component

**Files:**
- Create: `src/features/shoppingList/AddToShoppingListButton.tsx`
- Test: `src/features/shoppingList/AddToShoppingListButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/shoppingList/AddToShoppingListButton.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddToShoppingListButton } from './AddToShoppingListButton';
import { useShoppingListStore, defaultShoppingList } from './shoppingListStore';

beforeEach(() => {
  localStorage.clear();
  useShoppingListStore.setState(defaultShoppingList());
});

describe('AddToShoppingListButton', () => {
  it('renders disabled "Not craftable" when no recipe is provided', () => {
    render(<AddToShoppingListButton itemId={1} hasRecipe={false} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain('Not craftable');
  });

  it('renders "+ Shopping list" when item is craftable and not on list', () => {
    render(<AddToShoppingListButton itemId={1} hasRecipe={true} />);
    expect(screen.getByRole('button').textContent).toContain('+ Shopping list');
  });

  it('adds the item to the store on click', () => {
    render(<AddToShoppingListButton itemId={42} hasRecipe={true} />);
    fireEvent.click(screen.getByRole('button'));
    expect(useShoppingListStore.getState().items).toEqual([
      { id: 42, qty: 1, craftIntermediates: false },
    ]);
  });

  it('renders "✓ On list · Remove" when item is on the list', () => {
    useShoppingListStore.getState().addItem(42);
    render(<AddToShoppingListButton itemId={42} hasRecipe={true} />);
    expect(screen.getByRole('button').textContent).toContain('On list');
  });

  it('removes the item on click when already on the list', () => {
    useShoppingListStore.getState().addItem(42);
    render(<AddToShoppingListButton itemId={42} hasRecipe={true} />);
    fireEvent.click(screen.getByRole('button'));
    expect(useShoppingListStore.getState().items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/AddToShoppingListButton.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// src/features/shoppingList/AddToShoppingListButton.tsx
import { useShoppingListStore } from './shoppingListStore';

interface Props {
  itemId: number;
  hasRecipe: boolean;
}

export function AddToShoppingListButton({ itemId, hasRecipe }: Props) {
  const items = useShoppingListStore((s) => s.items);
  const addItem = useShoppingListStore((s) => s.addItem);
  const removeItem = useShoppingListStore((s) => s.removeItem);
  const onList = items.some((i) => i.id === itemId);

  if (!hasRecipe) {
    return (
      <button
        disabled
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 opacity-60 cursor-not-allowed"
      >
        Not craftable
      </button>
    );
  }

  if (onList) {
    return (
      <button
        onClick={() => removeItem(itemId)}
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-crimson hover:text-crimson transition-colors"
      >
        ✓ On list · Remove
      </button>
    );
  }

  return (
    <button
      onClick={() => addItem(itemId)}
      className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-3 py-2 hover:bg-aether hover:text-bg-deep transition-colors"
    >
      + Shopping list
    </button>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/shoppingList/AddToShoppingListButton.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/shoppingList/AddToShoppingListButton.tsx src/features/shoppingList/AddToShoppingListButton.test.tsx
git commit -m "feat(shoppingList): AddToShoppingListButton with three states"
```

---

## Task 5: Wire AddToShoppingListButton into Item.tsx

**Files:**
- Modify: `src/routes/Item.tsx`

This is a small integration step — render the button next to `AddToWatchlistButton` in the `HeaderBlock`.

- [ ] **Step 1: Edit Item.tsx**

In [src/routes/Item.tsx](src/routes/Item.tsx), add the import near the top:

```tsx
import { AddToShoppingListButton } from '../features/shoppingList/AddToShoppingListButton';
```

In the `HeaderBlock` component, modify the button row (currently containing `AddToWatchlistButton` + the Garland link) to also render the new button. Find the existing block:

```tsx
<div className="flex flex-wrap gap-2 self-start sm:self-end">
  <AddToWatchlistButton itemId={itemId} itemName={name} ilvl={ilvl} recipe={recipe} />
  <a
    href={garlandItemUrl(itemId)}
    ...
```

Change to:

```tsx
<div className="flex flex-wrap gap-2 self-start sm:self-end">
  <AddToWatchlistButton itemId={itemId} itemName={name} ilvl={ilvl} recipe={recipe} />
  <AddToShoppingListButton itemId={itemId} hasRecipe={recipe != null} />
  <a
    href={garlandItemUrl(itemId)}
    ...
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (existing item tests should still pass — no new test required because the AddToShoppingListButton has its own coverage and HeaderBlock is rendered correctly if it compiles + no existing test asserts its exact button list).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/Item.tsx
git commit -m "feat(item): add AddToShoppingListButton next to watchlist button"
```

---

## Task 6: ShoppingListPanel component (editable list)

**Files:**
- Create: `src/features/shoppingList/ShoppingListPanel.tsx`
- Test: `src/features/shoppingList/ShoppingListPanel.test.tsx`

Notes for the engineer:
- The panel takes a `nameById: (id: number) => string` lookup and an `onPlan: () => void` callback. It does not fetch or compute anything itself — purely a view over the store.
- The "Add" input is a simple text + qty form: type an item name → user can press Enter to find best name match from a passed-in `searchableItems: { id, name }[]`. To keep this task small, we do a substring match and pick the first hit; full autocomplete is overkill at this layout slot since `GlobalItemSearch` exists in the header.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/shoppingList/ShoppingListPanel.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShoppingListPanel } from './ShoppingListPanel';
import { useShoppingListStore, defaultShoppingList } from './shoppingListStore';

const sample = [
  { id: 1, name: 'Iron Ingot', hasRecipe: true },
  { id: 2, name: 'Bronze Ingot', hasRecipe: true },
  { id: 3, name: 'Fire Crystal', hasRecipe: false },
];

beforeEach(() => {
  localStorage.clear();
  useShoppingListStore.setState(defaultShoppingList());
});

describe('ShoppingListPanel', () => {
  it('renders empty state when list is empty', () => {
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    expect(screen.getByText(/add items from the watchlist/i)).toBeInTheDocument();
  });

  it('adds a craftable item via the search + Add button', () => {
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    fireEvent.change(screen.getByLabelText(/search item/i), { target: { value: 'iron' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(useShoppingListStore.getState().items[0]).toMatchObject({ id: 1, qty: 1 });
  });

  it('respects qty input on add', () => {
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    fireEvent.change(screen.getByLabelText(/search item/i), { target: { value: 'iron' } });
    fireEvent.change(screen.getByLabelText(/qty/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(useShoppingListStore.getState().items[0]).toMatchObject({ id: 1, qty: 5 });
  });

  it('blocks adding a non-craftable item and shows an inline error', () => {
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    fireEvent.change(screen.getByLabelText(/search item/i), { target: { value: 'fire' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(useShoppingListStore.getState().items).toEqual([]);
    expect(screen.getByText(/not craftable/i)).toBeInTheDocument();
  });

  it('shows no-match inline error when search has no hits', () => {
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    fireEvent.change(screen.getByLabelText(/search item/i), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(screen.getByText(/no match/i)).toBeInTheDocument();
  });

  it('renders rows for each item with editable qty and remove button', () => {
    useShoppingListStore.getState().addItem(1, 4);
    useShoppingListStore.getState().addItem(2, 1);
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    expect(screen.getByText('Iron Ingot')).toBeInTheDocument();
    expect(screen.getByText('Bronze Ingot')).toBeInTheDocument();

    // Edit qty on Iron Ingot
    const qtyInputs = screen.getAllByLabelText(/edit qty/i);
    fireEvent.change(qtyInputs[0], { target: { value: '7' } });
    expect(useShoppingListStore.getState().items.find((i) => i.id === 1)?.qty).toBe(7);

    // Remove Iron Ingot
    const removeButtons = screen.getAllByLabelText(/remove/i);
    fireEvent.click(removeButtons[0]);
    expect(useShoppingListStore.getState().items.map((i) => i.id)).toEqual([2]);
  });

  it('toggles craftIntermediates per item', () => {
    useShoppingListStore.getState().addItem(1);
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    const toggle = screen.getByLabelText(/craft sub-ingredients/i);
    fireEvent.click(toggle);
    expect(useShoppingListStore.getState().items[0].craftIntermediates).toBe(true);
  });

  it('clear button empties the store', () => {
    useShoppingListStore.getState().addItem(1);
    useShoppingListStore.getState().addItem(2);
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /clear list/i }));
    expect(useShoppingListStore.getState().items).toEqual([]);
  });

  it('calls onPlan when Plan shopping is clicked', () => {
    let called = 0;
    useShoppingListStore.getState().addItem(1);
    render(<ShoppingListPanel searchableItems={sample} onPlan={() => { called++; }} />);
    fireEvent.click(screen.getByRole('button', { name: /plan shopping/i }));
    expect(called).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/ShoppingListPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// src/features/shoppingList/ShoppingListPanel.tsx
import { useState } from 'react';
import { useShoppingListStore } from './shoppingListStore';

interface Searchable { id: number; name: string; hasRecipe: boolean }

interface Props {
  searchableItems: Searchable[];
  onPlan: () => void;
}

export function ShoppingListPanel({ searchableItems, onPlan }: Props) {
  const items = useShoppingListStore((s) => s.items);
  const addItem = useShoppingListStore((s) => s.addItem);
  const removeItem = useShoppingListStore((s) => s.removeItem);
  const setQty = useShoppingListStore((s) => s.setQty);
  const setCraftIntermediates = useShoppingListStore((s) => s.setCraftIntermediates);
  const clear = useShoppingListStore((s) => s.clear);

  const [query, setQuery] = useState('');
  const [qty, setQtyInput] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const nameById = new Map(searchableItems.map((s) => [s.id, s.name]));

  function handleAdd() {
    setError(null);
    const q = query.trim().toLowerCase();
    if (!q) return;
    const match = searchableItems.find((s) => s.name.toLowerCase().includes(q));
    if (!match) {
      setError('No match in catalog.');
      return;
    }
    if (!match.hasRecipe) {
      setError(`"${match.name}" is not craftable.`);
      return;
    }
    addItem(match.id, Math.max(1, qty));
    setQuery('');
    setQtyInput(1);
  }

  return (
    <section className="border border-border-base bg-bg-card">
      <div className="flex flex-wrap items-end gap-2 p-3 border-b border-border-base">
        <div className="flex flex-col gap-1 grow min-w-[200px]">
          <label htmlFor="sl-search" className="font-mono text-[10px] tracking-widest uppercase text-text-low">
            Search item
          </label>
          <input
            id="sl-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            placeholder="Type an item name…"
            className="bg-bg-card-lo border border-border-base text-text-cream font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-aether"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sl-qty" className="font-mono text-[10px] tracking-widest uppercase text-text-low">
            Qty
          </label>
          <input
            id="sl-qty"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQtyInput(Math.max(1, parseInt(e.target.value) || 1))}
            className="bg-bg-card-lo border border-border-base text-text-cream font-mono text-xs px-2 py-1.5 w-20"
          />
        </div>
        <button
          onClick={handleAdd}
          className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-3 py-2 hover:bg-aether hover:text-bg-deep transition-colors"
        >
          Add
        </button>
        {error && <div className="text-crimson font-mono text-[11px] basis-full">{error}</div>}
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-text-low font-mono text-xs italic">
          Add items from the watchlist, an item page, or the search box above.
        </div>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.id} className="border-t border-border-base px-3 py-2 flex items-center gap-3 flex-wrap">
              <span className="text-text-cream grow min-w-[150px]">
                {nameById.get(it.id) ?? `Item #${it.id}`}
              </span>
              <label className="flex items-center gap-1 font-mono text-[10px] uppercase text-text-low">
                <span>Qty</span>
                <input
                  aria-label={`Edit qty for ${nameById.get(it.id) ?? it.id}`}
                  type="number"
                  min={1}
                  value={it.qty}
                  onChange={(e) => setQty(it.id, Math.max(1, parseInt(e.target.value) || 1))}
                  className="bg-bg-card-lo border border-border-base text-text-cream font-mono text-xs px-2 py-1 w-16"
                />
              </label>
              <label className="flex items-center gap-1 font-mono text-[10px] uppercase text-text-low">
                <input
                  type="checkbox"
                  checked={it.craftIntermediates}
                  onChange={(e) => setCraftIntermediates(it.id, e.target.checked)}
                />
                <span>Craft sub-ingredients</span>
              </label>
              <button
                onClick={() => removeItem(it.id)}
                aria-label={`Remove ${nameById.get(it.id) ?? it.id}`}
                className="font-mono text-text-low hover:text-crimson px-2"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 p-3 border-t border-border-base">
        <span className="font-mono text-[11px] text-text-low">{items.length} items</span>
        <div className="flex gap-2">
          <button
            onClick={() => clear()}
            disabled={items.length === 0}
            className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-crimson hover:text-crimson disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Clear list
          </button>
          <button
            onClick={onPlan}
            disabled={items.length === 0}
            className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-3 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Plan shopping
          </button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/shoppingList/ShoppingListPanel.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/shoppingList/ShoppingListPanel.tsx src/features/shoppingList/ShoppingListPanel.test.tsx
git commit -m "feat(shoppingList): ShoppingListPanel with add/edit/remove/clear"
```

---

## Task 7: ShoppingListPlan component (rollup + by-world + detail table)

**Files:**
- Create: `src/features/shoppingList/ShoppingListPlan.tsx`
- Test: `src/features/shoppingList/ShoppingListPlan.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/shoppingList/ShoppingListPlan.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShoppingListPlan } from './ShoppingListPlan';
import type { ShoppingPlan } from './planShopping';

const samplePlan: ShoppingPlan = {
  perIngredient: [
    { id: 5, qty: 3, bestWorld: 'Phantom', bestPrice: 100, isLightDc: false, listingCount: 4 },
    { id: 6, qty: 2, bestWorld: 'Odin', bestPrice: 50, isLightDc: true, listingCount: 1 },
    { id: 7, qty: 1, bestWorld: null, bestPrice: null, isLightDc: false, listingCount: 0 },
  ],
  byWorldSummary: [
    { world: 'Phantom', isLightDc: false, ingredients: [{ id: 5, qty: 3, price: 100 }], total: 300 },
    { world: 'Odin', isLightDc: true, ingredients: [{ id: 6, qty: 2, price: 50 }], total: 100 },
  ],
  rollup: { spend: 400, revenue: 1500, profit: 1100, missingIngredients: 1 },
};

const names = new Map<number, string>([
  [5, 'Iron Ingot'],
  [6, 'Bronze Ingot'],
  [7, 'Ghost Crystal'],
]);

function renderWithRouter(plan: ShoppingPlan = samplePlan) {
  return render(
    <MemoryRouter>
      <ShoppingListPlan plan={plan} nameById={names} />
    </MemoryRouter>,
  );
}

describe('ShoppingListPlan', () => {
  it('renders the three rollup cards with correct totals', () => {
    renderWithRouter();
    expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('400');
    expect(screen.getByText(/est. revenue/i).parentElement?.textContent).toContain('1,500');
    expect(screen.getByText(/net profit/i).parentElement?.textContent).toContain('1,100');
  });

  it('warns about missing ingredients in the rollup', () => {
    renderWithRouter();
    expect(screen.getByText(/1 ingredients? have no listings/i)).toBeInTheDocument();
  });

  it('omits the missing-ingredients warning when there are none', () => {
    renderWithRouter({
      ...samplePlan,
      rollup: { ...samplePlan.rollup, missingIngredients: 0 },
    });
    expect(screen.queryByText(/have no listings/i)).not.toBeInTheDocument();
  });

  it('renders a card per world with ✈ for Light DC', () => {
    renderWithRouter();
    expect(screen.getByText('Phantom')).toBeInTheDocument();
    const odinCard = screen.getByText('Odin').closest('div');
    expect(odinCard?.textContent).toContain('✈');
    const phantomCard = screen.getByText('Phantom').closest('div');
    expect(phantomCard?.textContent).not.toContain('✈');
  });

  it('renders the detail table with every ingredient including missing rows', () => {
    renderWithRouter();
    expect(screen.getByText('Iron Ingot')).toBeInTheDocument();
    expect(screen.getByText('Bronze Ingot')).toBeInTheDocument();
    expect(screen.getByText('Ghost Crystal')).toBeInTheDocument();
    expect(screen.getByText(/no listings/i)).toBeInTheDocument();
  });

  it('renders nothing for empty plan', () => {
    const { container } = renderWithRouter({
      perIngredient: [],
      byWorldSummary: [],
      rollup: { spend: 0, revenue: 0, profit: 0, missingIngredients: 0 },
    });
    expect(container.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/ShoppingListPlan.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// src/features/shoppingList/ShoppingListPlan.tsx
import { Link } from 'react-router-dom';
import type { ShoppingPlan } from './planShopping';
import { fmtGil } from '../../lib/format';

interface Props {
  plan: ShoppingPlan;
  nameById: Map<number, string>;
}

export function ShoppingListPlan({ plan, nameById }: Props) {
  if (plan.perIngredient.length === 0 && plan.byWorldSummary.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Rollup rollup={plan.rollup} />
      <ByWorld summary={plan.byWorldSummary} nameById={nameById} />
      <DetailTable perIngredient={plan.perIngredient} nameById={nameById} />
    </div>
  );
}

function Rollup({ rollup }: { rollup: ShoppingPlan['rollup'] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <StatCard label="Total material cost" value={fmtGil(rollup.spend)} warning={
        rollup.missingIngredients > 0
          ? `⚠ ${rollup.missingIngredients} ingredient${rollup.missingIngredients === 1 ? '' : 's'} have no listings`
          : null
      } />
      <StatCard label="Est. revenue" value={fmtGil(rollup.revenue)} />
      <StatCard label="Net profit" value={fmtGil(rollup.profit)} valueClass={rollup.profit > 0 ? 'text-jade' : rollup.profit < 0 ? 'text-crimson' : 'text-text-cream'} />
    </div>
  );
}

function StatCard({ label, value, valueClass, warning }: { label: string; value: string; valueClass?: string; warning?: string | null }) {
  return (
    <div className="border border-border-base bg-bg-card p-4">
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">{label}</div>
      <div className={`font-mono text-lg ${valueClass ?? 'text-text-cream'}`}>{value}</div>
      {warning && <div className="font-mono text-[10px] text-crimson mt-1">{warning}</div>}
    </div>
  );
}

function ByWorld({ summary, nameById }: { summary: ShoppingPlan['byWorldSummary']; nameById: Map<number, string> }) {
  if (summary.length === 0) return null;
  return (
    <div>
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">Shopping by world</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {summary.map((card) => (
          <div key={card.world} className="border border-border-base bg-bg-card p-3">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-text-cream font-mono">
                {card.world}
                {card.isLightDc && <span className="text-gold ml-1" title="Requires DC travel">✈</span>}
              </div>
              <div className="font-mono text-gold">{fmtGil(card.total)}</div>
            </div>
            <ul className="space-y-0.5">
              {card.ingredients.map((ing) => (
                <li key={ing.id} className="font-mono text-[11px] text-text-low flex justify-between gap-2">
                  <span className="truncate">{ing.qty}× {nameById.get(ing.id) ?? `Item #${ing.id}`}</span>
                  <span className="tabular-nums">{fmtGil(ing.price * ing.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailTable({ perIngredient, nameById }: { perIngredient: ShoppingPlan['perIngredient']; nameById: Map<number, string> }) {
  if (perIngredient.length === 0) return null;
  return (
    <div>
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">All ingredients</div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">Ingredient</th>
              <th className="text-right px-3 py-2">Qty</th>
              <th className="text-left px-3 py-2">Best world</th>
              <th className="text-right px-3 py-2">Price</th>
              <th className="text-right px-3 py-2">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {perIngredient.map((row) => (
              <tr key={row.id} className="border-t border-border-base">
                <td className="px-3 py-2">
                  <Link to={`/item/${row.id}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                    {nameById.get(row.id) ?? `Item #${row.id}`}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right font-mono">{row.qty}</td>
                <td className="px-3 py-2">
                  {row.bestWorld ? (
                    <span>
                      {row.bestWorld}
                      {row.isLightDc && <span className="text-gold ml-1" title="Requires DC travel">✈</span>}
                    </span>
                  ) : (
                    <span className="text-text-low italic">No listings</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono">{row.bestPrice != null ? fmtGil(row.bestPrice) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{row.bestPrice != null ? fmtGil(row.bestPrice * row.qty) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/shoppingList/ShoppingListPlan.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/shoppingList/ShoppingListPlan.tsx src/features/shoppingList/ShoppingListPlan.test.tsx
git commit -m "feat(shoppingList): ShoppingListPlan with rollup + by-world cards + detail table"
```

---

## Task 8: ShoppingList route

**Files:**
- Create: `src/routes/ShoppingList.tsx`
- Test: `src/routes/ShoppingList.test.tsx`

Notes for the engineer:
- The route orchestrates: read store → call `useRecipes` for the listed item ids → `aggregateIngredients` → call `useMarketData` for `[...item ids, ...ingredient ids]` with `region='Europe'` → `planShopping` from the region map.
- Trigger compute on "Plan shopping" via a local `useState<boolean>` (`planRequested`). Reset to false when the list changes (use `useEffect` keyed on item count).
- Tests stub `useRecipes` + `useMarketData` via direct `vi.mock` of the module paths — same pattern used in `LevePlan.test.tsx` / `Watchlist.test.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/routes/ShoppingList.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useShoppingListStore, defaultShoppingList } from '../features/shoppingList/shoppingListStore';

// Mock data hooks before importing the component.
vi.mock('../features/queries/useItemSnapshot', () => ({
  useItemSnapshot: () => ({
    data: {
      items: [
        { id: 100, name: 'Widget', sc: 1, ui: 1, ilvl: 1, canHq: true },
        { id: 5, name: 'Iron Ingot', sc: 1, ui: 1, ilvl: 1, canHq: false },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('../features/profit/useRecipes', () => ({
  useRecipes: (ids: number[]) => ({
    data: new Map(ids.map((id) => [
      id,
      id === 100 ? { itemResultId: 100, classJob: 'CRP', recipeLevel: 1, ingredients: [{ itemId: 5, amount: 2 }] } : null,
    ])),
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('../features/watchlist/useMarketData', () => ({
  useMarketData: () => ({
    data: {
      phantom: {},
      dc: {},
      region: {
        100: {
          minNQ: null, minHQ: 500,
          worldListings: [{ world: 'Phantom', price: 500, hq: true }],
          velocity: 0, lastUploadTime: 0, listingCount: 1,
          averagePriceNQ: null, averagePriceHQ: null,
          avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
          recentSalesNQ: 0, recentSalesHQ: 0,
        },
        5: {
          minNQ: 100, minHQ: null,
          worldListings: [{ world: 'Phantom', price: 100, hq: false }],
          velocity: 0, lastUploadTime: 0, listingCount: 1,
          averagePriceNQ: null, averagePriceHQ: null,
          avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
          recentSalesNQ: 0, recentSalesHQ: 0,
        },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('../features/settings/store', () => ({
  useSettingsStore: () => ({ world: 'Phantom', dc: 'Chaos' }),
}));

import ShoppingList from './ShoppingList';

beforeEach(() => {
  localStorage.clear();
  useShoppingListStore.setState(defaultShoppingList());
});

function renderRoute() {
  return render(<MemoryRouter><ShoppingList /></MemoryRouter>);
}

describe('ShoppingList route', () => {
  it('renders empty state when no items', () => {
    renderRoute();
    expect(screen.getByText(/add items from the watchlist/i)).toBeInTheDocument();
  });

  it('renders the plan after the user adds an item and clicks Plan shopping', () => {
    useShoppingListStore.getState().addItem(100, 1);
    renderRoute();
    fireEvent.click(screen.getByRole('button', { name: /plan shopping/i }));
    expect(screen.getByText(/total material cost/i)).toBeInTheDocument();
    expect(screen.getByText(/est. revenue/i)).toBeInTheDocument();
    // Spend = 100 × 2 = 200; revenue = 500 × 1 = 500; profit = 300
    expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('200');
    expect(screen.getByText(/est. revenue/i).parentElement?.textContent).toContain('500');
    expect(screen.getByText(/net profit/i).parentElement?.textContent).toContain('300');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/ShoppingList.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```tsx
// src/routes/ShoppingList.tsx
import { useEffect, useMemo, useState } from 'react';
import { useShoppingListStore } from '../features/shoppingList/shoppingListStore';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useRecipes } from '../features/profit/useRecipes';
import { useMarketData } from '../features/watchlist/useMarketData';
import { useSettingsStore } from '../features/settings/store';
import { aggregateIngredients } from '../features/shoppingList/aggregateIngredients';
import { planShopping } from '../features/shoppingList/planShopping';
import { ShoppingListPanel } from '../features/shoppingList/ShoppingListPanel';
import { ShoppingListPlan } from '../features/shoppingList/ShoppingListPlan';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

export default function ShoppingList() {
  const items = useShoppingListStore((s) => s.items);
  const { world, dc } = useSettingsStore();
  const snapshot = useItemSnapshot();

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const recipes = useRecipes(itemIds);

  const aggregate = useMemo(() => {
    if (!recipes.data) return null;
    return aggregateIngredients(items, recipes.data);
  }, [items, recipes.data]);

  const priceIds = useMemo(() => {
    const ids = new Set<number>(itemIds);
    if (aggregate) for (const id of aggregate.demand.keys()) ids.add(id);
    return [...ids];
  }, [itemIds, aggregate]);

  const market = useMarketData(priceIds, world, dc, 'Europe');

  const [planRequested, setPlanRequested] = useState(false);
  // Re-arm when the list changes — user must click Plan again.
  useEffect(() => { setPlanRequested(false); }, [itemIds.length]);

  const plan = useMemo(() => {
    if (!planRequested || !aggregate || !market.data || !snapshot.data) return null;
    return planShopping(aggregate.demand, items, market.data.region, snapshot.data.items);
  }, [planRequested, aggregate, market.data, snapshot.data, items, recipes.data]);

  const searchableItems = useMemo(() => {
    if (!snapshot.data || !recipes.data) {
      return (snapshot.data?.items ?? []).map((s) => ({ id: s.id, name: s.name, hasRecipe: false }));
    }
    // Note: `hasRecipe` resolves only for items the recipe snapshot has been queried for.
    // For unqueried items we conservatively treat as craftable=false; the Item page Add button
    // gives a reliable per-item check. This panel's add field is a quick fallback.
    return snapshot.data.items.map((s) => ({
      id: s.id,
      name: s.name,
      hasRecipe: !!recipes.data?.get(s.id),
    }));
  }, [snapshot.data, recipes.data]);

  const nameById = useMemo(() => {
    const m = new Map<number, string>();
    if (snapshot.data) for (const it of snapshot.data.items) m.set(it.id, it.name);
    return m;
  }, [snapshot.data]);

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Shopping List</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Plan a crafting session across multiple items — aggregates ingredients region-wide and finds the cheapest source per material.
        </p>
      </div>

      <ShoppingListPanel
        searchableItems={searchableItems}
        onPlan={() => setPlanRequested(true)}
      />

      {planRequested && (market.isLoading || recipes.isLoading) && (
        <Spinner label="Fetching prices + recipes…" />
      )}
      {planRequested && market.isError && (
        <StatusBanner kind="error">Universalis fetch failed: {(market.error as Error).message}</StatusBanner>
      )}
      {planRequested && recipes.isError && (
        <StatusBanner kind="error">Recipe fetch failed: {(recipes.error as Error).message}</StatusBanner>
      )}
      {plan && <ShoppingListPlan plan={plan} nameById={nameById} />}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/ShoppingList.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/ShoppingList.tsx src/routes/ShoppingList.test.tsx
git commit -m "feat(shoppingList): ShoppingList route orchestrating list + plan"
```

---

## Task 9: Wire route + nav

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Add route to App.tsx**

In [src/App.tsx](src/App.tsx), add the import and route. Add the import near the other route imports:

```tsx
import ShoppingList from './routes/ShoppingList';
```

And add the route inside `<Routes>` after the `/gc-seals` route:

```tsx
<Route path="/shopping-list" element={<ShoppingList />} />
```

- [ ] **Step 2: Add NavLink to Header.tsx**

In [src/components/layout/Header.tsx](src/components/layout/Header.tsx), add a NavLink between `<NavLink to="/leves">` and `<NavLink to="/gc-seals">`:

```tsx
<NavLink to="/shopping-list" className={navClass}>Shopping</NavLink>
```

- [ ] **Step 3: Run typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/Header.tsx
git commit -m "feat(nav): register /shopping-list route + NavLink"
```

---

## Task 10: Wire AddToShoppingListButton into RecipeModal (watchlist entry point)

**Files:**
- Modify: `src/features/profit/RecipeModal.tsx`

The watchlist row's ⚙ button opens `RecipeModal`; per spec, that modal gains a shopping-list add action alongside the existing per-item settings.

- [ ] **Step 1: Edit RecipeModal.tsx**

In [src/features/profit/RecipeModal.tsx](src/features/profit/RecipeModal.tsx), add the import near the top:

```tsx
import { AddToShoppingListButton } from '../shoppingList/AddToShoppingListButton';
```

Find the header block (around line 56-69) that contains the title + close button:

```tsx
<div className="flex justify-between items-start mb-4">
  <div>
    <div className="font-mono text-[10px] tracking-widest text-aether uppercase">
      {recipe.classJob} · lvl {recipe.recipeLevel}
    </div>
    <h3 className="font-display text-xl text-gold">{item.name}</h3>
  </div>
  <button
    onClick={onClose}
    className="text-text-dim hover:text-aether font-mono text-sm"
  >
    ✕ Close
  </button>
</div>
```

Change to:

```tsx
<div className="flex justify-between items-start mb-4 gap-3">
  <div>
    <div className="font-mono text-[10px] tracking-widest text-aether uppercase">
      {recipe.classJob} · lvl {recipe.recipeLevel}
    </div>
    <h3 className="font-display text-xl text-gold">{item.name}</h3>
  </div>
  <div className="flex items-start gap-2">
    <AddToShoppingListButton itemId={item.id} hasRecipe={true} />
    <button
      onClick={onClose}
      className="text-text-dim hover:text-aether font-mono text-sm"
    >
      ✕ Close
    </button>
  </div>
</div>
```

- [ ] **Step 2: Run typecheck + relevant tests**

Run: `npx tsc --noEmit && npx vitest run src/features/profit src/features/shoppingList`
Expected: tsc clean; all existing RecipeModal tests still pass (the button addition doesn't change any asserted behavior).

- [ ] **Step 3: Commit**

```bash
git add src/features/profit/RecipeModal.tsx
git commit -m "feat(watchlist): add shopping-list button to RecipeModal header"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ALL tests pass. Note the total count vs. before this branch (was ~429 after P2-2; this plan adds ~41 new tests).

- [ ] **Step 3: Smoke test in the browser**

Run: `npm run dev`

In the browser:
1. Visit `/shopping-list` — empty state renders.
2. Visit `/item/5057` (Iron Ingot — or any craftable item) — verify "+ Shopping list" button appears next to "+ Watchlist". Click it. Confirm it flips to "✓ On list · Remove".
3. Return to `/shopping-list` — item appears in the list. Adjust qty. Click "Plan shopping" — three rollup cards appear, by-world cards render, detail table populates.
4. Add a second item from `/item/<another id>`, return to list, click Plan again — rollups update, by-world summary regroups.
5. Click "Clear list" — list empties; the plan area disappears.

No commit needed for smoke testing — only commit if any bugs are found and fixed.
