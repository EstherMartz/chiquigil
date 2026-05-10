# FFXIV Helper Phase 2 Implementation Plan — Recipe Trees + True Profit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the price×velocity proxy score with true profit per craft. Fetch recipes from XIVAPI, cache them in IndexedDB, sum material costs from Universalis, surface profit and gil/day in the watchlist, and add a clickable detail modal that shows the recipe tree with market-priced ingredients.

**Architecture:** New `lib/recipes.ts` (XIVAPI Recipe fetch + types) + `lib/recipeCache.ts` (IndexedDB via `idb`). New pure module `features/profit/computeProfit.ts` that takes (item, recipe, marketPrices, toggles) → `{materialCost, profit, gilPerDay}`. `useRecipeData` TanStack Query hook with infinite stale time. Watchlist row builder gets `materialCost`, `profit`, `gilPerDay`, `craftable` fields. Items without recipes are flagged `sale-only`. Per-item `craftIntermediates` toggle lives in the watchlist store.

**Tech Stack:** Adds `idb` (IndexedDB wrapper). Reuses Phase 1's TanStack Query, Zustand, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-10-ffxiv-helper-rebuild-design.md` — Phase 2 appendix.

**Decisions baked in (from brainstorming):**
- Items without recipes are shown as **sale-only** (no profit number, no recipe tree, no craft self toggle).
- Intermediates default to **buy from market**; per-item toggle flips to **craft self** which recurses one more level.
- HQ output handling stays Phase 3+ (Phase 2 always computes NQ-output profit using cheapest NQ ingredient prices).

---

## Conventions

- Strict TDD: pure functions get failing tests first.
- One file per task except where the plan explicitly batches tightly coupled changes.
- Commits use `feat(profit):`, `feat(recipes):`, `refactor(watchlist):`, etc.
- Run commands from `c:/Users/esthe/Documents/Dev/ffxiv-helper`.
- After each task: `npm test -- --run` must remain green; build (`npm run build`) clean before commit.

---

## Task 1: Install `idb` and add recipe cache types

**Files:**
- Modify: `package.json`
- Create: `src/lib/recipeCache.ts`
- Create: `src/lib/recipeCache.test.ts`

The IndexedDB wrapper. Cache key = item id; value = recipe object (or `null` if explicitly known-uncraftable). Forever stale. Manual bust clears the store.

- [ ] **Step 1: Install**

```
npm install idb
```

- [ ] **Step 2: Write failing test `src/lib/recipeCache.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getCachedRecipe, putCachedRecipe, clearRecipeCache } from './recipeCache';
import type { Recipe } from './recipes';

const sampleRecipe: Recipe = {
  itemResultId: 49281,
  classJob: 'LTW',
  recipeLevel: 770,
  ingredients: [{ itemId: 1, amount: 2 }],
};

beforeEach(async () => { await clearRecipeCache(); });
afterEach(async () => { await clearRecipeCache(); });

describe('recipeCache', () => {
  it('returns undefined when nothing cached', async () => {
    expect(await getCachedRecipe(49281)).toBeUndefined();
  });

  it('round-trips a recipe', async () => {
    await putCachedRecipe(49281, sampleRecipe);
    expect(await getCachedRecipe(49281)).toEqual(sampleRecipe);
  });

  it('round-trips an explicit null (item known to have no recipe)', async () => {
    await putCachedRecipe(41771, null);
    expect(await getCachedRecipe(41771)).toBeNull();
  });

  it('clearRecipeCache wipes all entries', async () => {
    await putCachedRecipe(49281, sampleRecipe);
    await putCachedRecipe(41771, null);
    await clearRecipeCache();
    expect(await getCachedRecipe(49281)).toBeUndefined();
    expect(await getCachedRecipe(41771)).toBeUndefined();
  });
});
```

The test uses `fake-indexeddb/auto` to provide an in-memory IndexedDB during Vitest. Add it now:

```
npm install -D fake-indexeddb
```

- [ ] **Step 3: Run `npm test -- recipeCache --run` — confirm fails (modules not found)**

- [ ] **Step 4: Implement `src/lib/recipeCache.ts`**

```ts
import { openDB, type IDBPDatabase } from 'idb';
import type { Recipe } from './recipes';

const DB_NAME = 'ffxiv-helper';
const DB_VERSION = 1;
const STORE = 'recipes';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedRecipe(itemId: number): Promise<Recipe | null | undefined> {
  return (await db()).get(STORE, itemId);
}

export async function putCachedRecipe(itemId: number, recipe: Recipe | null): Promise<void> {
  await (await db()).put(STORE, recipe, itemId);
}

export async function clearRecipeCache(): Promise<void> {
  await (await db()).clear(STORE);
}
```

Note: this imports `Recipe` from a module that doesn't exist yet (`./recipes`). Task 2 creates it. To make Task 1's tests compile in isolation, define `Recipe` here as a stub interface and re-export, then in Task 2 move the canonical type and update the import. Simpler: do Tasks 1 + 2 in the same subagent (they share types). The plan calls them out separately for review clarity, but you can implement them together.

If implementing Task 1 first, define a placeholder `Recipe` type in `recipeCache.ts`:
```ts
// Placeholder; canonical definition moved to ./recipes in Task 2
export interface Recipe {
  itemResultId: number;
  classJob: string;
  recipeLevel: number;
  ingredients: Array<{ itemId: number; amount: number }>;
}
```
Task 2 will then `import type { Recipe } from './recipes'` here.

- [ ] **Step 5: Wire `fake-indexeddb/auto` into the test setup**

Edit `src/test/setup.ts` to add:
```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
```

That globally provides IndexedDB to every test, not just this one.

- [ ] **Step 6: Run `npm test -- recipeCache --run` — confirm pass.**

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "feat(cache): IndexedDB-backed recipe cache via idb"
```

---

## Task 2: XIVAPI recipe client + types

**Files:**
- Create: `src/lib/recipes.ts`
- Create: `src/lib/recipes.test.ts`
- Modify: `src/lib/recipeCache.ts` (replace placeholder `Recipe` type with import)

XIVAPI v2 recipe lookup. The `Recipe` sheet has columns `ItemResult`, `ItemIngredient0..9`, `AmountIngredient0..9`, `CraftType` (links to ClassJob), `RecipeLevelTable`. We query by `ItemResult={itemId}` and parse the first match.

- [ ] **Step 1: Failing test `src/lib/recipes.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRecipeQueryUrl, parseRecipeResponse, fetchRecipeForItem } from './recipes';

describe('buildRecipeQueryUrl', () => {
  it('builds an XIVAPI Recipe-sheet query filtering by ItemResult', () => {
    expect(buildRecipeQueryUrl(49281)).toBe(
      'https://v2.xivapi.com/api/search?sheets=Recipe&query=ItemResult%3D49281&fields=ItemResult,CraftType.Name,RecipeLevelTable.ClassJobLevel,Ingredient0,AmountIngredient0,Ingredient1,AmountIngredient1,Ingredient2,AmountIngredient2,Ingredient3,AmountIngredient3,Ingredient4,AmountIngredient4,Ingredient5,AmountIngredient5,Ingredient6,AmountIngredient6,Ingredient7,AmountIngredient7,Ingredient8,AmountIngredient8,Ingredient9,AmountIngredient9&limit=1'
    );
  });
});

describe('parseRecipeResponse', () => {
  it('returns null when no results', () => {
    expect(parseRecipeResponse(49281, { results: [] })).toBeNull();
  });

  it('returns null when results array is missing', () => {
    expect(parseRecipeResponse(49281, {})).toBeNull();
  });

  it('extracts ingredients with amount > 0', () => {
    const raw = {
      results: [{
        fields: {
          ItemResult: { value: 49281 },
          CraftType: { fields: { Name: 'Leatherworker' } },
          RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
          Ingredient0: { value: 100 },
          AmountIngredient0: 2,
          Ingredient1: { value: 200 },
          AmountIngredient1: 3,
          Ingredient2: { value: 0 },
          AmountIngredient2: 0,
        },
      }],
    };
    expect(parseRecipeResponse(49281, raw)).toEqual({
      itemResultId: 49281,
      classJob: 'LTW',
      recipeLevel: 100,
      ingredients: [
        { itemId: 100, amount: 2 },
        { itemId: 200, amount: 3 },
      ],
    });
  });

  it('maps full crafter names back to codes', () => {
    const make = (name: string) => ({
      results: [{
        fields: {
          ItemResult: { value: 1 },
          CraftType: { fields: { Name: name } },
          RecipeLevelTable: { fields: { ClassJobLevel: 1 } },
        },
      }],
    });
    expect(parseRecipeResponse(1, make('Carpenter'))?.classJob).toBe('CRP');
    expect(parseRecipeResponse(1, make('Weaver'))?.classJob).toBe('WVR');
    expect(parseRecipeResponse(1, make('Alchemist'))?.classJob).toBe('ALC');
    expect(parseRecipeResponse(1, make('Culinarian'))?.classJob).toBe('CUL');
    expect(parseRecipeResponse(1, make('Blacksmith'))?.classJob).toBe('BSM');
    expect(parseRecipeResponse(1, make('Armorer'))?.classJob).toBe('ARM');
    expect(parseRecipeResponse(1, make('Goldsmith'))?.classJob).toBe('GSM');
    expect(parseRecipeResponse(1, make('Leatherworker'))?.classJob).toBe('LTW');
  });
});

describe('fetchRecipeForItem', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns null on empty results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    }));
    expect(await fetchRecipeForItem(99999)).toBeNull();
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchRecipeForItem(1)).rejects.toThrow('XIVAPI 500');
  });
});
```

- [ ] **Step 2: Run `npm test -- lib/recipes --run` — fails (module not found).**

- [ ] **Step 3: Implement `src/lib/recipes.ts`**

```ts
import type { CrafterCode } from '../features/items/types';

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const FIELDS = [
  'ItemResult',
  'CraftType.Name',
  'RecipeLevelTable.ClassJobLevel',
  ...Array.from({ length: 10 }, (_, i) => [`Ingredient${i}`, `AmountIngredient${i}`]).flat(),
].join(',');

export interface Ingredient {
  itemId: number;
  amount: number;
}

export interface Recipe {
  itemResultId: number;
  classJob: CrafterCode;
  recipeLevel: number;
  ingredients: Ingredient[];
}

const NAME_TO_CODE: Record<string, CrafterCode> = {
  Carpenter: 'CRP',
  Blacksmith: 'BSM',
  Armorer: 'ARM',
  Goldsmith: 'GSM',
  Leatherworker: 'LTW',
  Weaver: 'WVR',
  Alchemist: 'ALC',
  Culinarian: 'CUL',
};

export function buildRecipeQueryUrl(itemId: number): string {
  const q = encodeURIComponent(`ItemResult=${itemId}`);
  return `${BASE.replace(/\/$/, '')}/api/search?sheets=Recipe&query=${q}&fields=${FIELDS}&limit=1`;
}

interface RawIngredient { value?: number }
interface RawResultFields {
  ItemResult?: { value?: number };
  CraftType?: { fields?: { Name?: string } };
  RecipeLevelTable?: { fields?: { ClassJobLevel?: number } };
  [k: string]: unknown;
}

export function parseRecipeResponse(itemId: number, raw: { results?: Array<{ fields?: RawResultFields }> }): Recipe | null {
  const first = raw.results?.[0]?.fields;
  if (!first) return null;
  const name = first.CraftType?.fields?.Name ?? '';
  const code = NAME_TO_CODE[name] ?? 'ANY';
  const recipeLevel = first.RecipeLevelTable?.fields?.ClassJobLevel ?? 0;
  const ingredients: Ingredient[] = [];
  for (let i = 0; i < 10; i++) {
    const ing = first[`Ingredient${i}`] as RawIngredient | undefined;
    const amt = first[`AmountIngredient${i}`] as number | undefined;
    if (ing?.value && amt && amt > 0) {
      ingredients.push({ itemId: ing.value, amount: amt });
    }
  }
  return { itemResultId: itemId, classJob: code, recipeLevel, ingredients };
}

export async function fetchRecipeForItem(itemId: number): Promise<Recipe | null> {
  const res = await fetch(buildRecipeQueryUrl(itemId));
  if (!res.ok) throw new Error(`XIVAPI ${res.status}`);
  return parseRecipeResponse(itemId, await res.json());
}
```

- [ ] **Step 4: Update `src/lib/recipeCache.ts` to remove the placeholder Recipe type and import it from recipes.ts.**

Open `src/lib/recipeCache.ts`, delete the local `export interface Recipe { ... }` block, and replace with:
```ts
import type { Recipe } from './recipes';
```

- [ ] **Step 5: Run `npm test -- --run` — confirm all tests pass (the recipeCache test now imports the real Recipe type via recipes.ts).**

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "feat(recipes): XIVAPI Recipe sheet client + types"
```

---

## Task 3: Recipe-with-cache fetcher + TanStack Query hook

**Files:**
- Create: `src/features/profit/useRecipes.ts`
- Create: `src/features/profit/useRecipes.test.tsx`

Wraps `fetchRecipeForItem` in cache-aware logic: check IndexedDB first, then network, then write back. The hook consumes a list of item ids and returns a `Map<itemId, Recipe | null>` once all are resolved.

- [ ] **Step 1: Failing test `src/features/profit/useRecipes.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRecipes } from './useRecipes';
import { clearRecipeCache } from '../../lib/recipeCache';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await clearRecipeCache();
});

describe('useRecipes', () => {
  it('returns a map keyed by item id with recipes from network on cache miss', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      calls++;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          results: [{
            fields: {
              ItemResult: { value: 49281 },
              CraftType: { fields: { Name: 'Leatherworker' } },
              RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
              Ingredient0: { value: 1 }, AmountIngredient0: 2,
            },
          }],
        }),
      });
    }));

    const { result } = renderHook(() => useRecipes([49281]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const recipe = result.current.data!.get(49281);
    expect(recipe?.itemResultId).toBe(49281);
    expect(recipe?.ingredients).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('skips network on cache hit', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // Pre-warm
    const { putCachedRecipe } = await import('../../lib/recipeCache');
    await putCachedRecipe(49281, {
      itemResultId: 49281, classJob: 'LTW', recipeLevel: 100, ingredients: [],
    });

    const { result } = renderHook(() => useRecipes([49281]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(49281)?.itemResultId).toBe(49281);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches null for items with no recipe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    }));

    const { result } = renderHook(() => useRecipes([99999]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(99999)).toBeNull();

    const { getCachedRecipe } = await import('../../lib/recipeCache');
    expect(await getCachedRecipe(99999)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement `src/features/profit/useRecipes.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchRecipeForItem, type Recipe } from '../../lib/recipes';
import { getCachedRecipe, putCachedRecipe } from '../../lib/recipeCache';

async function resolveRecipe(itemId: number): Promise<Recipe | null> {
  const cached = await getCachedRecipe(itemId);
  if (cached !== undefined) return cached;
  const fresh = await fetchRecipeForItem(itemId);
  await putCachedRecipe(itemId, fresh);
  return fresh;
}

export function useRecipes(itemIds: number[]) {
  const sorted = [...new Set(itemIds)].sort((a, b) => a - b);
  return useQuery<Map<number, Recipe | null>>({
    queryKey: ['recipes', sorted],
    enabled: sorted.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const entries = await Promise.all(
        sorted.map(async (id) => [id, await resolveRecipe(id)] as const),
      );
      return new Map(entries);
    },
  });
}
```

- [ ] **Step 4: Run, pass.**

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(profit): cache-aware useRecipes hook"
```

---

## Task 4: Profit math (pure)

**Files:**
- Create: `src/features/profit/computeProfit.ts`
- Create: `src/features/profit/computeProfit.test.ts`

Given a recipe + market data + per-item flags, return `{materialCost, profit, gilPerDay}`. No recursion in Phase 2 unless `craftIntermediates` is true and the intermediate has a recipe in the supplied recipe map; one level deep only.

`materialCost(recipe, recipeMap, market, flags) =`
- For each ingredient `(itemId, amount)`:
  - Let `unitMarket = cheapest_NQ_at_DC(itemId)`. Use Phantom NQ avg if DC has nothing, else 0.
  - If `flags[itemId]?.craftIntermediates` is true AND `recipeMap.get(itemId)` is a non-null recipe, recurse one more level only (no deeper).
  - Add `unitCost × amount` to total.

`profit = salePrice - materialCost`. `gilPerDay = profit × velocity`.

`salePrice` = DC HQ min, fallback DC NQ min, fallback Phantom HQ avg, fallback Phantom NQ avg, fallback 0 (sale-only items skip profit calc entirely; this fallback is for items with a recipe but no current listings).

- [ ] **Step 1: Failing test**

Write `src/features/profit/computeProfit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeMaterialCost, computeProfit } from './computeProfit';
import type { Recipe } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';

function mkMarket(prices: Record<number, { dcMin?: number; pAvgNQ?: number }>): MarketData {
  const out: MarketData = {};
  for (const [id, p] of Object.entries(prices)) {
    out[id] = {
      minNQ: p.dcMin ?? null,
      minHQ: null,
      avgNQ: p.pAvgNQ ?? null,
      avgHQ: null,
      velocity: 0,
      lastUploadTime: 0,
      listingCount: p.dcMin != null ? 1 : 0,
    };
  }
  return out;
}

const recipeA: Recipe = {
  itemResultId: 100,
  classJob: 'LTW',
  recipeLevel: 100,
  ingredients: [
    { itemId: 1, amount: 2 },
    { itemId: 2, amount: 3 },
  ],
};

describe('computeMaterialCost', () => {
  it('sums DC NQ min × amount per ingredient (default: buy intermediates)', () => {
    const market = mkMarket({ 1: { dcMin: 50 }, 2: { dcMin: 30 } });
    expect(computeMaterialCost(recipeA, new Map(), market, {})).toBe(50 * 2 + 30 * 3);
  });

  it('falls back to Phantom NQ avg when DC has no listing', () => {
    const market = mkMarket({ 1: { pAvgNQ: 60 }, 2: { dcMin: 30 } });
    expect(computeMaterialCost(recipeA, new Map(), market, {})).toBe(60 * 2 + 30 * 3);
  });

  it('returns 0 for an ingredient with no market data at all', () => {
    const market = mkMarket({ 2: { dcMin: 30 } }); // ingredient 1 has nothing
    expect(computeMaterialCost(recipeA, new Map(), market, {})).toBe(0 * 2 + 30 * 3);
  });

  it('recurses one level when craftIntermediates is set AND a recipe exists for the intermediate', () => {
    const recipeB: Recipe = {
      itemResultId: 1, classJob: 'LTW', recipeLevel: 50,
      ingredients: [{ itemId: 10, amount: 4 }, { itemId: 11, amount: 1 }],
    };
    const recipeMap = new Map<number, Recipe | null>([[1, recipeB]]);
    const market = mkMarket({
      // intermediate 1 has a market price of 100 — but we should ignore it and craft instead
      1: { dcMin: 100 },
      // 10 + 11 are leaves, used in recipe B
      10: { dcMin: 5 }, 11: { dcMin: 8 },
      // ingredient 2 (top-level direct buy)
      2: { dcMin: 30 },
    });
    const flags = { 1: { craftIntermediates: true } };
    // recipe A: 2 × (cost of crafting 1) + 3 × 30 = 2 × (4×5 + 1×8) + 90 = 2 × 28 + 90 = 146
    expect(computeMaterialCost(recipeA, recipeMap, market, flags)).toBe(146);
  });

  it('does NOT recurse beyond one level (Phase 2 cap)', () => {
    const recipeB: Recipe = {
      itemResultId: 1, classJob: 'LTW', recipeLevel: 50,
      ingredients: [{ itemId: 10, amount: 4 }],
    };
    // Even if recipe for 10 exists AND craftIntermediates is set for 10,
    // we don't recurse a second level when computing material cost for recipe A.
    const recipeC: Recipe = {
      itemResultId: 10, classJob: 'CRP', recipeLevel: 30,
      ingredients: [{ itemId: 100, amount: 1 }],
    };
    const recipeMap = new Map<number, Recipe | null>([[1, recipeB], [10, recipeC]]);
    const market = mkMarket({ 10: { dcMin: 5 }, 100: { dcMin: 1 }, 2: { dcMin: 30 } });
    const flags = { 1: { craftIntermediates: true }, 10: { craftIntermediates: true } };
    // recipe A: 2 × (4 × market(10) = 4×5 = 20) + 3 × 30 = 40 + 90 = 130
    // (Even though craftIntermediates is set for item 10, we use its market price because we only recurse 1 level total.)
    expect(computeMaterialCost(recipeA, recipeMap, market, flags)).toBe(130);
  });
});

describe('computeProfit', () => {
  it('returns null when no recipe', () => {
    const market = mkMarket({});
    expect(computeProfit({ id: 100 } as never, null, new Map(), market, market, {})).toBeNull();
  });

  it('returns profit = salePrice - materialCost', () => {
    const dcMarket = mkMarket({ 100: { dcMin: 500 }, 1: { dcMin: 50 }, 2: { dcMin: 30 } });
    const phantomMarket = mkMarket({});
    const result = computeProfit(
      { id: 100 } as never,
      recipeA,
      new Map(),
      phantomMarket,
      dcMarket,
      {},
    );
    // material = 50×2 + 30×3 = 190; sale = 500; profit = 310
    expect(result).toEqual({ materialCost: 190, salePrice: 500, profit: 310 });
  });
});
```

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement `src/features/profit/computeProfit.ts`**

```ts
import type { Recipe, Ingredient } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';

export interface PerItemFlags {
  craftIntermediates?: boolean;
}
export type FlagMap = Record<number, PerItemFlags | undefined>;

function unitCost(itemId: number, dc: MarketData, phantom: MarketData): number {
  const d = dc[itemId];
  if (d?.minNQ != null) return d.minNQ;
  const p = phantom[itemId];
  if (p?.avgNQ != null) return p.avgNQ;
  return 0;
}

export function computeMaterialCost(
  recipe: Recipe,
  recipeMap: Map<number, Recipe | null>,
  marketDc: MarketData,
  flags: FlagMap,
  phantom: MarketData = {},
  depth = 0,
): number {
  let total = 0;
  for (const ing of recipe.ingredients) {
    total += ingredientCost(ing, recipeMap, marketDc, flags, phantom, depth);
  }
  return total;
}

function ingredientCost(
  ing: Ingredient,
  recipeMap: Map<number, Recipe | null>,
  dc: MarketData,
  flags: FlagMap,
  phantom: MarketData,
  depth: number,
): number {
  const subRecipe = recipeMap.get(ing.itemId);
  const wantsCraft = flags[ing.itemId]?.craftIntermediates;
  if (wantsCraft && subRecipe && depth === 0) {
    return computeMaterialCost(subRecipe, recipeMap, dc, flags, phantom, depth + 1) * ing.amount;
  }
  return unitCost(ing.itemId, dc, phantom) * ing.amount;
}

export interface ProfitResult {
  materialCost: number;
  salePrice: number;
  profit: number;
}

function salePriceFor(itemId: number, phantom: MarketData, dc: MarketData): number {
  const d = dc[itemId];
  if (d?.minHQ != null) return d.minHQ;
  if (d?.minNQ != null) return d.minNQ;
  const p = phantom[itemId];
  if (p?.avgHQ != null) return p.avgHQ;
  if (p?.avgNQ != null) return p.avgNQ;
  return 0;
}

export function computeProfit(
  item: { id: number },
  recipe: Recipe | null,
  recipeMap: Map<number, Recipe | null>,
  phantom: MarketData,
  dc: MarketData,
  flags: FlagMap,
): ProfitResult | null {
  if (!recipe) return null;
  const materialCost = computeMaterialCost(recipe, recipeMap, dc, flags, phantom);
  const salePrice = salePriceFor(item.id, phantom, dc);
  return { materialCost, salePrice, profit: salePrice - materialCost };
}
```

- [ ] **Step 4: Run, pass.**

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(profit): pure material cost + profit calculator"
```

---

## Task 5: Watchlist row builder — extend with profit fields

**Files:**
- Modify: `src/features/watchlist/buildRows.ts`
- Modify: `src/features/watchlist/buildRows.test.ts`

Add `materialCost`, `salePrice`, `profit`, `gilPerDay`, `craftable` to `WatchlistRow`. Update existing tests minimally; add new tests covering profit path.

- [ ] **Step 1: Edit existing tests**

In `buildRows.test.ts`, change the `buildRows(items, phantom, dc, levels, Date.now())` calls to the new signature `buildRows(items, phantom, dc, levels, recipeMap, flags, Date.now())` where `recipeMap = new Map()` and `flags = {}` for existing test cases. Existing assertions still hold for items without recipes (`craftable: false`, `profit: null`, etc.).

Add a new describe block `describe('buildRows with recipes')`:
```ts
import type { Recipe } from '../../lib/recipes';

describe('buildRows with recipes', () => {
  const recipe1: Recipe = {
    itemResultId: 1, classJob: 'LTW', recipeLevel: 100,
    ingredients: [{ itemId: 99, amount: 2 }],
  };

  it('marks rows as craftable when a recipe is present and computes profit', () => {
    const items = [{ id: 1, name: 'Crafted', crafter: 'LTW' as const, lvl: 100, cat: 'Raid' as const }];
    const phantom = { '1': { minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, velocity: 0, lastUploadTime: Date.now(), listingCount: 0 } };
    const dc = {
      '1':  { minNQ: null, minHQ: 1000, avgNQ: null, avgHQ: null, velocity: 4, lastUploadTime: Date.now(), listingCount: 1 },
      '99': { minNQ: 100,  minHQ: null, avgNQ: null, avgHQ: null, velocity: 0, lastUploadTime: Date.now(), listingCount: 1 },
    };
    const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };
    const recipeMap = new Map([[1, recipe1]]);
    const rows = buildRows(items, phantom, dc, levels, recipeMap, {}, Date.now());
    // material = 100 × 2 = 200; sale = 1000 (HQ); profit = 800; gil/day = 800 × 4 = 3200
    expect(rows[0].craftable).toBe(true);
    expect(rows[0].materialCost).toBe(200);
    expect(rows[0].salePrice).toBe(1000);
    expect(rows[0].profit).toBe(800);
    expect(rows[0].gilPerDay).toBe(3200);
  });

  it('marks rows as sale-only when recipeMap returns null', () => {
    const items = [{ id: 1, name: 'Materia XII', crafter: 'ANY' as const, lvl: 100, cat: 'Materia' as const }];
    const phantom = { '1': { minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, velocity: 0, lastUploadTime: Date.now(), listingCount: 0 } };
    const dc = { '1': { minNQ: 50_000, minHQ: null, avgNQ: null, avgHQ: null, velocity: 2, lastUploadTime: Date.now(), listingCount: 1 } };
    const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };
    const recipeMap = new Map<number, Recipe | null>([[1, null]]);
    const rows = buildRows(items, phantom, dc, levels, recipeMap, {}, Date.now());
    expect(rows[0].craftable).toBe(false);
    expect(rows[0].profit).toBeNull();
    expect(rows[0].materialCost).toBeNull();
    expect(rows[0].gilPerDay).toBeNull();
  });

  it('treats unresolved recipe (not in map) as not-yet-known: craftable null, profit null', () => {
    const items = [{ id: 1, name: 'Unknown', crafter: 'LTW' as const, lvl: 100, cat: 'Raid' as const }];
    const phantom = {};
    const dc = { '1': { minNQ: 100, minHQ: null, avgNQ: null, avgHQ: null, velocity: 0, lastUploadTime: Date.now(), listingCount: 1 } };
    const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };
    const rows = buildRows(items, phantom, dc, levels, new Map(), {}, Date.now());
    expect(rows[0].craftable).toBeNull();
    expect(rows[0].profit).toBeNull();
  });
});
```

- [ ] **Step 2: Update `buildRows.ts`**

Add to imports:
```ts
import type { Recipe } from '../../lib/recipes';
import { computeProfit, type FlagMap } from '../profit/computeProfit';
```

Extend `WatchlistRow`:
```ts
export interface WatchlistRow extends TrackedItem {
  // ... existing fields ...
  craftable: boolean | null;     // null = recipe not yet looked up
  materialCost: number | null;
  salePrice: number | null;      // duplicate of refPrice when craftable; null otherwise
  profit: number | null;         // null when not craftable or recipe pending
  gilPerDay: number | null;      // profit × velocity, null when profit null
}
```

Change the function signature:
```ts
export function buildRows(
  items: TrackedItem[],
  phantom: MarketData,
  dc: MarketData,
  levels: CrafterLevels,
  recipeMap: Map<number, Recipe | null>,
  flags: FlagMap,
  now: number,
): WatchlistRow[] {
```

In the per-item map, after the existing `partial` row building, add:
```ts
const recipeEntry = recipeMap.has(item.id) ? recipeMap.get(item.id)! : undefined;
const craftable = recipeEntry === undefined ? null : recipeEntry !== null;
const profitResult = recipeEntry ? computeProfit(item, recipeEntry, recipeMap, phantom, dc, flags) : null;
const velocity = d?.velocity ?? p?.velocity ?? 0;
return {
  // existing fields
  craftable,
  materialCost: profitResult?.materialCost ?? null,
  salePrice: profitResult?.salePrice ?? null,
  profit: profitResult?.profit ?? null,
  gilPerDay: profitResult ? profitResult.profit * velocity : null,
};
```

Note: `velocity` was already computed earlier — reuse that variable; don't shadow.

- [ ] **Step 3: Run `npm test -- buildRows --run` — all old + new tests pass.**

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(watchlist): row builder includes profit + gilPerDay + craftable fields"
```

---

## Task 6: Update Watchlist route + table to use recipes/profit

**Files:**
- Modify: `src/routes/Watchlist.tsx`
- Modify: `src/features/watchlist/WatchlistTable.tsx`
- Modify: `src/features/ui/uiStore.ts` (add `gilPerDay`/`profit` to SortKey union)
- Modify: `src/features/watchlist/filterSort.ts` (handle new sort keys)
- Modify: `src/features/watchlist/filterSort.test.ts` (cover new sort keys)

The watchlist now fetches recipes alongside market data, passes them to `buildRows`, displays a "sale-only" badge for non-craftable items, and replaces or augments the Score column with a Profit column. Sorting by gilPerDay becomes the new default for craftable items.

- [ ] **Step 1: Extend SortKey + sortable values**

Edit `src/features/ui/uiStore.ts`:
```ts
export type SortKey = 'name' | 'crafter' | 'lvl' | 'phantom' | 'dc' | 'spd' | 'profit' | 'gilDay' | 'score';
```

Default sort changes to `gilDay` desc:
```ts
export function defaultUi(): Pick<UiState, '_v' | 'catFilter' | 'craftFilter' | 'search' | 'sortKey' | 'sortDir'> {
  return { _v: 1, catFilter: 'All', craftFilter: 'All', search: '', sortKey: 'gilDay', sortDir: 'desc' };
}
```

Bump version + reset persisted store. The persist middleware will overwrite stale state from a v1 user — to handle that cleanly, increment the persist version:
```ts
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({ /* ... */ }),
    {
      name: 'ffxiv-helper:ui',
      version: 2,
      migrate: (state, version) => {
        if (version < 2) return defaultUi();
        return state as UiState;
      },
    },
  ),
);
```

The existing test `useUiStore` may need a tiny update if it asserts on the default sortKey — change `score` → `gilDay`.

- [ ] **Step 2: Extend `filterAndSort` to handle new keys**

Edit `src/features/watchlist/filterSort.ts`. In `getSortValue`:
```ts
case 'profit': return r.profit ?? -Infinity;
case 'gilDay': return r.gilPerDay ?? -Infinity;
```

(Items without a profit number sort to the bottom on desc, which is what we want.)

Add tests in `filterSort.test.ts`:
```ts
it('sorts by gilDay desc with null gilPerDay last', () => {
  const rowsWithProfit: WatchlistRow[] = [
    { ...base, id: 1, gilPerDay: 100 },
    { ...base, id: 2, gilPerDay: null },
    { ...base, id: 3, gilPerDay: 500 },
  ];
  const out = filterAndSort(rowsWithProfit, { catFilter: 'All', craftFilter: 'All', search: '', sortKey: 'gilDay', sortDir: 'desc' });
  expect(out.map((r) => r.id)).toEqual([3, 1, 2]);
});
```

The base row fixture in `filterSort.test.ts` will need new fields (`craftable`, `materialCost`, `salePrice`, `profit`, `gilPerDay`) — set them to `null` in `base`.

- [ ] **Step 3: Update Watchlist route to pass recipes through**

Edit `src/routes/Watchlist.tsx`:

```tsx
import { useRecipes } from '../features/profit/useRecipes';
// ... existing imports

export default function Watchlist() {
  const { world, dc, retainerLevels } = useSettingsStore();
  const { starterPacks, customItems, perItemFlags } = useWatchlistStore();
  // perItemFlags is added in Task 7. Until Task 7 lands, default it to {}: const perItemFlags = {};
  const ui = useUiStore();

  const items = useMemo(/* unchanged */);
  const ids = useMemo(/* unchanged */);

  const market = useMarketData(ids, world, dc);
  const recipes = useRecipes(ids);

  const rows = useMemo(() => {
    if (!market.data || !recipes.data) return [];
    return buildRows(
      items, market.data.phantom, market.data.dc,
      retainerLevels, recipes.data, perItemFlags, Date.now(),
    );
  }, [items, market.data, recipes.data, retainerLevels, perItemFlags]);

  const filtered = useMemo(() => filterAndSort(rows, ui), [rows, ui]);

  // ... existing return JSX
  // Update loading condition: market.isLoading || recipes.isLoading
}
```

- [ ] **Step 4: Update WatchlistTable column set**

Edit `src/features/watchlist/WatchlistTable.tsx`. Replace the Score column with two new columns: Profit and Gil/day. Keep score as a tiebreaker for sale-only items.

```tsx
const COLS: { key: SortKey; label: string; align?: 'right'; hideOnMobile?: boolean }[] = [
  { key: 'name', label: 'Item' },
  { key: 'crafter', label: 'Craft' },
  { key: 'lvl', label: 'Lvl', align: 'right', hideOnMobile: true },
  { key: 'dc', label: 'Sale', align: 'right' },
  { key: 'profit', label: 'Profit', align: 'right' },
  { key: 'gilDay', label: 'Gil/day', align: 'right' },
  { key: 'spd', label: 'Velocity', align: 'right', hideOnMobile: true },
];
```

For each row, replace the Score `<td>` with Profit + Gil/day cells. Profit cell:

```tsx
<td className="px-3 py-2.5 font-mono text-right">
  {r.craftable === false
    ? <span className="text-text-low text-[10px] tracking-widest uppercase">sale-only</span>
    : r.craftable === null
      ? <span className="text-text-low">…</span>
      : r.profit != null
        ? <span className={r.profit > 0 ? 'text-jade' : 'text-crimson'}>{fmtGil(r.profit)}</span>
        : <span className="text-text-low">—</span>}
</td>
```

Gil/day cell:
```tsx
<td className="px-3 py-2.5 font-mono text-right">
  {r.gilPerDay != null ? fmtGil(Math.round(r.gilPerDay)) : <span className="text-text-low">—</span>}
</td>
```

Drop the Phantom column entirely (was a deep-dive proxy; `Sale` covers it via DC HQ→NQ→Phantom fallback chain in the row builder). Remove the `<th key="phantom">` and matching `<td>` blocks.

Also drop the `ScoreBar` import + usage — keep the file in case Phase 4 wants it back.

- [ ] **Step 5: Run `npm test -- --run`. Run `npm run build`. Both green.**

- [ ] **Step 6: Manual sanity check**

`npm run dev`. Visit `/watchlist`. With the default starter packs:
- Materia XII rows show "sale-only" (no recipe).
- Courtly Lover items show profit numbers (recipes resolve via XIVAPI).
- Sort defaults to Gil/day desc.

The first load may take longer than Phase 1 — XIVAPI recipe lookups take 200–500ms each, batched in parallel. Subsequent loads should be near-instant from IndexedDB cache.

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "feat(watchlist): replace score with profit + gil/day columns; sale-only badge"
```

---

## Task 7: Per-item `craftIntermediates` toggle in watchlist store

**Files:**
- Modify: `src/features/items/watchlistStore.ts`
- Modify: `src/features/items/watchlistStore.test.ts`

Add a `perItemFlags: Record<number, { craftIntermediates?: boolean }>` map. Setter to flip the flag for one item.

- [ ] **Step 1: Tests**

Append to `watchlistStore.test.ts`:
```ts
it('perItemFlags starts empty', () => {
  expect(useWatchlistStore.getState().perItemFlags).toEqual({});
});

it('setCraftIntermediates flips a single item flag', () => {
  useWatchlistStore.getState().setCraftIntermediates(123, true);
  expect(useWatchlistStore.getState().perItemFlags[123]?.craftIntermediates).toBe(true);
  useWatchlistStore.getState().setCraftIntermediates(123, false);
  expect(useWatchlistStore.getState().perItemFlags[123]?.craftIntermediates).toBe(false);
});
```

- [ ] **Step 2: Implement**

Edit `watchlistStore.ts`:
```ts
import type { FlagMap } from '../profit/computeProfit';

export interface WatchlistState {
  // ... existing
  perItemFlags: FlagMap;
  setCraftIntermediates: (itemId: number, value: boolean) => void;
}

export function defaultWatchlist() {
  return {
    _v: 1,
    starterPacks: defaultStarterToggles(),
    customItems: [],
    perItemFlags: {} as FlagMap,
  };
}
```

Add the setter:
```ts
setCraftIntermediates: (itemId, value) => set((s) => ({
  perItemFlags: { ...s.perItemFlags, [itemId]: { ...s.perItemFlags[itemId], craftIntermediates: value } },
})),
```

- [ ] **Step 3: Wire into Watchlist route — replace the temporary `const perItemFlags = {}` from Task 6 step 3 with `const { perItemFlags } = useWatchlistStore();`.**

- [ ] **Step 4: Run + pass + commit**

```
git add -A
git commit -m "feat(items): per-item craftIntermediates flag in watchlist store"
```

---

## Task 8: Recipe detail modal

**Files:**
- Create: `src/features/profit/RecipeModal.tsx`
- Modify: `src/features/watchlist/WatchlistTable.tsx` (clickable row name opens modal)
- Modify: `src/routes/Watchlist.tsx` (modal state)

Click an item name → modal opens. Shows the recipe ingredients with their unit market price, total per ingredient, total material cost, current sale price, profit, and the per-item `craftIntermediates` toggle.

- [ ] **Step 1: Modal component**

Write `src/features/profit/RecipeModal.tsx`:

```tsx
import type { Recipe } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';
import type { TrackedItem } from '../items/types';
import { fmtGil } from '../../lib/format';

interface Props {
  item: TrackedItem;
  recipe: Recipe;
  recipeMap: Map<number, Recipe | null>;
  phantom: MarketData;
  dc: MarketData;
  craftIntermediates: boolean;
  onToggleCraftIntermediates: (value: boolean) => void;
  onClose: () => void;
}

export function RecipeModal({ item, recipe, recipeMap, phantom, dc, craftIntermediates, onToggleCraftIntermediates, onClose }: Props) {
  const ingredientName = (id: number) => recipeMap.get(id) ? `(craftable) #${id}` : `#${id}`;

  return (
    <div
      className="fixed inset-0 bg-bg-deep/80 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border-hi max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="font-mono text-[10px] tracking-widest text-aether uppercase">{recipe.classJob} · lvl {recipe.recipeLevel}</div>
            <h3 className="font-display text-xl text-gold">{item.name}</h3>
          </div>
          <button onClick={onClose} className="text-text-dim hover:text-aether font-mono text-sm">✕ Close</button>
        </div>

        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase border-b border-border-base">
              <th className="text-left py-2">Ingredient</th>
              <th className="text-right py-2">Qty</th>
              <th className="text-right py-2">Unit price</th>
              <th className="text-right py-2">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.map((ing) => {
              const unit = dc[ing.itemId]?.minNQ ?? phantom[ing.itemId]?.avgNQ ?? 0;
              return (
                <tr key={ing.itemId} className="border-b border-border-base">
                  <td className="py-2">{ingredientName(ing.itemId)}</td>
                  <td className="py-2 text-right font-mono">{ing.amount}</td>
                  <td className="py-2 text-right font-mono">{fmtGil(unit)}</td>
                  <td className="py-2 text-right font-mono">{fmtGil(unit * ing.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <label className="flex items-center gap-2 text-sm mb-4">
          <input
            type="checkbox"
            checked={craftIntermediates}
            onChange={(e) => onToggleCraftIntermediates(e.target.checked)}
          />
          <span>Recurse: craft intermediates myself (one level deep)</span>
        </label>

        <div className="text-xs text-text-low font-mono">
          Note: Phase 2 looks up ingredient names by id only. Names land in Phase 4 via XIVAPI item-name cache.
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire opening + closing**

Edit `src/routes/Watchlist.tsx` to track `selectedItemId` state:
```tsx
import { useState } from 'react';
import { RecipeModal } from '../features/profit/RecipeModal';

// ... inside component
const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
const { setCraftIntermediates } = useWatchlistStore();

const selected = selectedItemId != null ? items.find((i) => i.id === selectedItemId) : undefined;
const selectedRecipe = selected && recipes.data?.get(selected.id);

// ... after the table:
{selected && selectedRecipe && market.data && (
  <RecipeModal
    item={selected}
    recipe={selectedRecipe}
    recipeMap={recipes.data}
    phantom={market.data.phantom}
    dc={market.data.dc}
    craftIntermediates={!!perItemFlags[selected.id]?.craftIntermediates}
    onToggleCraftIntermediates={(v) => setCraftIntermediates(selected.id, v)}
    onClose={() => setSelectedItemId(null)}
  />
)}
```

Edit `WatchlistTable.tsx` to accept an `onSelect` prop and call it from the item-name click:

```tsx
export function WatchlistTable({ rows, onSelect }: { rows: WatchlistRow[]; onSelect: (id: number) => void }) {
  // ...
  // Replace the existing <a href=...> for r.name with a button that calls onSelect:
  <button
    onClick={() => onSelect(r.id)}
    className="text-text-cream hover:text-aether text-left"
  >
    {r.name}
  </button>
```

(Drop the external Universalis link from the cell — keep it accessible via the modal in Phase 3, or add a small "↗" icon next to the name. For Phase 2, modal-only is fine.)

Pass the prop in `Watchlist.tsx`:
```tsx
<WatchlistTable rows={filtered} onSelect={setSelectedItemId} />
```

- [ ] **Step 3: Run `npm run build` clean. Test suite green.**

- [ ] **Step 4: Manual sanity check**

`npm run dev`. Click a Courtly Lover row. Confirm modal opens with ingredient list + sale price + checkbox. Toggle the checkbox; close the modal; reopen. The toggled state persists.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(profit): clickable row → recipe detail modal with craft-self toggle"
```

---

## Task 9: Settings — recipe cache bust button

**Files:**
- Modify: `src/routes/Settings.tsx`

A small button to clear the IndexedDB recipe cache. Useful when a game patch lands and recipes change.

- [ ] **Step 1: Add a "Recipe cache" section to Settings**

In `src/routes/Settings.tsx`, append before the closing `</div>`:

```tsx
import { clearRecipeCache } from '../lib/recipeCache';
import { useQueryClient } from '@tanstack/react-query';

// ... inside the component (above return):
const queryClient = useQueryClient();
async function bustCache() {
  await clearRecipeCache();
  queryClient.invalidateQueries({ queryKey: ['recipes'] });
}

// ... in JSX:
<section>
  <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Recipe cache</h2>
  <p className="text-text-low text-sm mb-3">
    Recipes are cached locally in your browser indefinitely. Bust the cache after a game patch
    or if recipe data looks wrong.
  </p>
  <button
    onClick={bustCache}
    className="font-mono text-[10px] tracking-widest uppercase border border-crimson text-crimson px-4 py-2 hover:bg-crimson hover:text-bg-deep"
  >
    Clear recipe cache
  </button>
</section>
```

- [ ] **Step 2: Run + build clean.**

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "feat(settings): recipe cache bust button"
```

---

## Task 10: Smoke test for Watchlist with recipes

**Files:**
- Modify: `src/routes/Watchlist.test.tsx`

Extend the existing smoke test so it also mocks an XIVAPI recipe response and asserts the row shows a profit number.

- [ ] **Step 1: Update fetch mock**

Replace the current `vi.stubGlobal('fetch', ...)` with one that branches on URL:

```ts
vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
  if (url.includes('universalis.app')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        items: {
          '49281': { listings: [{ hq: false, pricePerUnit: 250000 }], recentHistory: [], regularSaleVelocity: 2.5, lastUploadTime: Date.now() },
          // ingredient prices for the recipe we'll mock
          '7': { listings: [{ hq: false, pricePerUnit: 1000 }], recentHistory: [], regularSaleVelocity: 0, lastUploadTime: Date.now() },
        },
      }),
    });
  }
  // XIVAPI recipe lookup
  return Promise.resolve({
    ok: true,
    json: async () => ({
      results: [{
        fields: {
          ItemResult: { value: 49281 },
          CraftType: { fields: { Name: 'Leatherworker' } },
          RecipeLevelTable: { fields: { ClassJobLevel: 100 } },
          Ingredient0: { value: 7 }, AmountIngredient0: 5,
        },
      }],
    }),
  });
}));
```

Add an assertion that the profit number renders. Since the test fixture only feeds one item but the watchlist contains the entire raid pack (~26 items), the XIVAPI mock returns the same recipe for every item — that's fine for a smoke test.

- [ ] **Step 2: Make the existing assertion still pass**

The current `expect(screen.getByText(/Courtly Lover's Temple Chain of Striking/)).toBeInTheDocument()` — keep it. After it, add:

```ts
await waitFor(() => {
  expect(screen.getByText(/sale|gil/i, { exact: false })).toBeInTheDocument();
});
```

(The exact assertion depends on how cells render; this just ensures the table is rendered with profit-era content. If you want a sharper assertion, look for the specific profit number expected by the math: 250k sale - 5×1k = 245k profit.)

- [ ] **Step 3: Run `npm test -- routes/Watchlist --run` + `npm test -- --run`.**

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "test(watchlist): smoke test covers recipe + profit path"
```

---

## Task 11: README update

**Files:**
- Modify: `README.md`

Add a Phase 2 section noting what's new and any caveats.

- [ ] **Step 1: Append**

```markdown

## Phase 2 — Recipe trees + profit

The watchlist now shows true profit per craft (sale price − material cost from Universalis), not just price × velocity.

- Items without a recipe (Materia XII, dyes, etc.) are tagged `sale-only`.
- Click any row to open a recipe detail modal showing ingredient prices and total cost.
- The modal has a "craft intermediates myself" toggle — when on, the cost calc recurses one level (uses the intermediate's own recipe instead of its market price).
- Recipes are cached forever in your browser's IndexedDB; bust the cache from Settings after a game patch.

### Performance notes

First load on a fresh browser hits XIVAPI once per tracked item (~80 calls). Subsequent loads are near-instant from cache. If XIVAPI is slow, the watchlist still renders with market data only and shows ⋯ in the profit column until recipes resolve.
```

- [ ] **Step 2: Commit**

```
git add -A
git commit -m "docs: README Phase 2 section"
```

---

## Phase 2 ships when

- `npm test -- --run` green (count grows from 50 to ~70).
- `npm run build` clean.
- `npm run dev` shows: profit numbers on craftable items, "sale-only" on Materia, modal opens on row click with ingredient prices, "craft intermediates" checkbox toggles and persists, "Clear recipe cache" button works in Settings.
- IndexedDB cache survives page reload (recipes don't refetch second time around).

Phase 3 (the time-budgeted session recommender — the original feature ask) builds on Phase 2's profit math.
