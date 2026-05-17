# Shopping List "Source" Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/shopping-list` so each ingredient compares MB / NPC vendor / special-currency sources, auto-picks the cheapest gil source, and lets the user override MB↔NPC per ingredient. Currency availability shows as a non-interactive info-line.

**Architecture:** Two new pure-compute modules — `surveyIngredients` (gathers all three sources per ingredient) and `applyShoppingOverrides` (resolves chosen sources into a `ShoppingPlan`). The existing `planShopping` becomes a thin wrapper around both. `ShoppingListPlan` accepts the survey, holds session-only override state, and rerenders on toggle.

**Tech Stack:** TypeScript, React, TanStack Query (existing snapshot hooks), Zustand (existing store; no changes), Vitest + React Testing Library, Tailwind.

**IMPORTANT GIT SAFETY RULE for implementers:** Do NOT run `git checkout`, `git reset`, `git stash`, `git clean`, `git rebase`, `git restore`, `git switch`. Only `git add`, `git commit`, `git log`, `git diff`, `git show`, `git status`, `git cat-file`, `git fsck` are allowed. The repo has many unrelated modified files from prior session work — only stage the files each task touches.

**Commit trailer (every commit):**
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## File Structure

**Create:**
- `src/features/shoppingList/shoppingListSurvey.ts` — `surveyIngredients` pure function + `IngredientSurvey` type
- `src/features/shoppingList/shoppingListSurvey.test.ts` — 10 tests
- `src/features/shoppingList/applyShoppingOverrides.ts` — `applyShoppingOverrides` pure function + `ChosenSource` type
- `src/features/shoppingList/applyShoppingOverrides.test.ts` — 8 tests

**Modify:**
- `src/features/shoppingList/planShopping.ts` — reimplement as a thin wrapper around the two new functions; public `ShoppingPlan` shape unchanged so existing planShopping tests pass without edits
- `src/features/shoppingList/ShoppingListPlan.tsx` — accept `survey` prop instead of `plan`; hold `overrides` state; add Source-column toggle + currency info-line + NPC card styling
- `src/features/shoppingList/ShoppingListPlan.test.tsx` — adapt existing 6 tests to construct survey inputs (assertions unchanged) + add 4 new tests for toggle + info-line
- `src/routes/ShoppingList.tsx` — wire `useVendorShopSnapshot()` + `useSpecialShopSnapshot()`; compute survey via `useMemo`; pass survey to `ShoppingListPlan`

No changes to `aggregateIngredients`, `shoppingListStore`, `AddToShoppingListButton`, `ShoppingListPanel`, or any types/hooks outside the shopping-list feature.

---

## Task 1: surveyIngredients pure compute

**Files:**
- Create: `src/features/shoppingList/shoppingListSurvey.ts`
- Create: `src/features/shoppingList/shoppingListSurvey.test.ts`

Reference patterns:
- `cheapestEuNq` exists in `src/features/shoppingList/planShopping.ts` lines 33-43 — copy its logic into the survey module (don't re-export from planShopping to keep the survey module self-contained; we'll remove the duplicate when planShopping shrinks in Task 3).
- `SpecialShopSnapshot.byCurrency` is `Map<CurrencyId, ShopEntry[]>` per `src/lib/specialShopSnapshot.ts`. `ShopEntry = { itemId, receiveQty, costPerUnit, isHq }`.
- `currencyByItemId` from `src/lib/currencies.ts` is NOT what we need here — we need a reverse lookup: for a given item id, find which currency buckets contain it. Iterate `shopSnapshot.byCurrency.entries()` per ingredient.

- [ ] **Step 1: Write the failing test** at `src/features/shoppingList/shoppingListSurvey.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { surveyIngredients, type IngredientSurvey } from './shoppingListSurvey';
import type { MarketData } from '../../lib/universalis';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import type { CurrencyId } from '../../lib/currencies';

function mkMarket(worldListings: Array<{ world: string; price: number; hq?: boolean }>, listingCount?: number) {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0,
    lastUploadTime: 0,
    listingCount: listingCount ?? worldListings.length,
    worldListings: worldListings.map((l) => ({ world: l.world, price: l.price, hq: l.hq ?? false, quantity: 1, retainerName: 'r' })),
    averagePriceNQ: null, averagePriceHQ: null,
  };
}

function mkShop(entries: Partial<Record<CurrencyId, Array<{ itemId: number; costPerUnit: number; receiveQty?: number; isHq?: boolean }>>>): SpecialShopSnapshot {
  const byCurrency = new Map();
  for (const [cur, list] of Object.entries(entries)) {
    byCurrency.set(cur, list!.map((e) => ({
      itemId: e.itemId, receiveQty: e.receiveQty ?? 1, costPerUnit: e.costPerUnit, isHq: e.isHq ?? false,
    })));
  }
  return { byCurrency };
}

describe('surveyIngredients', () => {
  it('returns [] for empty demand', () => {
    const out = surveyIngredients(new Map(), {}, new Map(), { byCurrency: new Map() });
    expect(out).toEqual([]);
  });

  it('MB-only ingredient → mb populated, autoSource mb', () => {
    const prices: MarketData = { 100: mkMarket([{ world: 'Phantom', price: 1000 }]) };
    const out = surveyIngredients(new Map([[100, 3]]), prices, new Map(), { byCurrency: new Map() });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 100, qty: 3, npc: null, currency: null, autoSource: 'mb',
      mb: { world: 'Phantom', price: 1000, isLightDc: false, count: 1 },
    });
  });

  it('NPC-only ingredient → autoSource npc', () => {
    const out = surveyIngredients(new Map([[100, 2]]), {}, new Map([[100, 500]]), { byCurrency: new Map() });
    expect(out[0]).toMatchObject({
      id: 100, qty: 2, mb: null, currency: null, autoSource: 'npc',
      npc: { price: 500 },
    });
  });

  it('currency-only ingredient → autoSource null, currency populated', () => {
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const out = surveyIngredients(new Map([[100, 1]]), {}, new Map(), shop);
    expect(out[0]).toMatchObject({
      id: 100, qty: 1, mb: null, npc: null, autoSource: null,
      currency: { id: 'poetics', label: 'Allagan Tomestone of Poetics', shortLabel: 'Poetics', costPerUnit: 10 },
    });
  });

  it('all three sources, MB cheaper → autoSource mb', () => {
    const prices: MarketData = { 100: mkMarket([{ world: 'Phantom', price: 400 }]) };
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 5 }] });
    const out = surveyIngredients(new Map([[100, 1]]), prices, new Map([[100, 500]]), shop);
    expect(out[0].autoSource).toBe('mb');
    expect(out[0].mb?.price).toBe(400);
    expect(out[0].npc?.price).toBe(500);
    expect(out[0].currency?.costPerUnit).toBe(5);
  });

  it('all three sources, NPC cheaper by 1 gil → autoSource npc', () => {
    const prices: MarketData = { 100: mkMarket([{ world: 'Phantom', price: 501 }]) };
    const out = surveyIngredients(new Map([[100, 1]]), prices, new Map([[100, 500]]), { byCurrency: new Map() });
    expect(out[0].autoSource).toBe('npc');
  });

  it('MB === NPC price → autoSource mb (MB wins ties)', () => {
    const prices: MarketData = { 100: mkMarket([{ world: 'Phantom', price: 500 }]) };
    const out = surveyIngredients(new Map([[100, 1]]), prices, new Map([[100, 500]]), { byCurrency: new Map() });
    expect(out[0].autoSource).toBe('mb');
  });

  it('currency item with multiple deals in one bucket → picks lowest costPerUnit', () => {
    const shop = mkShop({ poetics: [
      { itemId: 100, costPerUnit: 50 },
      { itemId: 100, costPerUnit: 10 },
      { itemId: 100, costPerUnit: 25 },
    ]});
    const out = surveyIngredients(new Map([[100, 1]]), {}, new Map(), shop);
    expect(out[0].currency?.costPerUnit).toBe(10);
  });

  it('item in multiple currency buckets → picks cheapest costPerUnit; tiebreaks by lexical currency id', () => {
    const shop = mkShop({
      poetics: [{ itemId: 100, costPerUnit: 50 }],
      mgp: [{ itemId: 100, costPerUnit: 50 }],  // tie
      whiteCrafter: [{ itemId: 100, costPerUnit: 5 }],  // cheapest
    });
    const out = surveyIngredients(new Map([[100, 1]]), {}, new Map(), shop);
    expect(out[0].currency?.id).toBe('whiteCrafter');
    // Tie case:
    const shop2 = mkShop({
      poetics: [{ itemId: 200, costPerUnit: 10 }],
      mgp: [{ itemId: 200, costPerUnit: 10 }],
    });
    const out2 = surveyIngredients(new Map([[200, 1]]), {}, new Map(), shop2);
    expect(out2[0].currency?.id).toBe('mgp');  // 'mgp' < 'poetics' lexically
  });

  it('isLightDc bubbles up from cheapestEuNq', () => {
    const prices: MarketData = { 100: mkMarket([{ world: 'Lich', price: 100 }]) };  // Lich is Light DC
    const out = surveyIngredients(new Map([[100, 1]]), prices, new Map(), { byCurrency: new Map() });
    expect(out[0].mb?.isLightDc).toBe(true);
  });

  it('sorts output by ascending id', () => {
    const prices: MarketData = {
      300: mkMarket([{ world: 'Phantom', price: 100 }]),
      100: mkMarket([{ world: 'Phantom', price: 100 }]),
      200: mkMarket([{ world: 'Phantom', price: 100 }]),
    };
    const out = surveyIngredients(new Map([[300, 1], [100, 1], [200, 1]]), prices, new Map(), { byCurrency: new Map() });
    expect(out.map((s) => s.id)).toEqual([100, 200, 300]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/shoppingListSurvey.test.ts`
Expected: FAIL — `Cannot find module './shoppingListSurvey'`.

- [ ] **Step 3: Implement at `src/features/shoppingList/shoppingListSurvey.ts`**

```ts
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import { CURRENCIES, getCurrencyById, type CurrencyId } from '../../lib/currencies';
import { EU_WORLDS, dcOf } from '../../lib/europeWorlds';

export interface IngredientSurvey {
  id: number;
  qty: number;
  mb: { world: string; price: number; count: number; isLightDc: boolean } | null;
  npc: { price: number } | null;
  currency: { id: CurrencyId; label: string; shortLabel: string; costPerUnit: number } | null;
  autoSource: 'mb' | 'npc' | null;
}

function cheapestEuNq(m: MarketItem | undefined): { world: string; price: number; count: number; isLightDc: boolean } | null {
  if (!m) return null;
  let best: { world: string; price: number } | null = null;
  for (const l of m.worldListings) {
    if (l.hq) continue;
    if (!EU_WORLDS.has(l.world)) continue;
    if (!best || l.price < best.price) best = { world: l.world, price: l.price };
  }
  if (!best) return null;
  return { ...best, count: m.listingCount, isLightDc: dcOf(best.world) === 'Light' };
}

function findCheapestCurrency(itemId: number, shopSnapshot: SpecialShopSnapshot): IngredientSurvey['currency'] {
  let best: { id: CurrencyId; costPerUnit: number } | null = null;
  // Iterate the global CURRENCIES catalog in declaration order so lookups are deterministic
  // when costs tie. We later resolve ties via lexical id sort.
  for (const [currencyId, entries] of shopSnapshot.byCurrency.entries()) {
    for (const entry of entries) {
      if (entry.itemId !== itemId) continue;
      if (!best || entry.costPerUnit < best.costPerUnit ||
          (entry.costPerUnit === best.costPerUnit && currencyId < best.id)) {
        best = { id: currencyId, costPerUnit: entry.costPerUnit };
      }
    }
  }
  if (!best) return null;
  const def = getCurrencyById(best.id);
  if (!def) return null;
  return { id: best.id, label: def.label, shortLabel: def.shortLabel, costPerUnit: best.costPerUnit };
}

export function surveyIngredients(
  demand: Map<number, number>,
  prices: MarketData,
  vendorMap: Map<number, number>,
  shopSnapshot: SpecialShopSnapshot,
): IngredientSurvey[] {
  // Silence unused import lint — CURRENCIES is referenced indirectly via getCurrencyById.
  void CURRENCIES;
  const out: IngredientSurvey[] = [];
  const sortedIds = [...demand.keys()].sort((a, b) => a - b);
  for (const id of sortedIds) {
    const qty = demand.get(id)!;
    const mb = cheapestEuNq(prices[id]);
    const npcPrice = vendorMap.get(id);
    const npc = npcPrice != null ? { price: npcPrice } : null;
    const currency = findCheapestCurrency(id, shopSnapshot);

    let autoSource: 'mb' | 'npc' | null = null;
    if (mb && npc) autoSource = mb.price <= npc.price ? 'mb' : 'npc';
    else if (mb) autoSource = 'mb';
    else if (npc) autoSource = 'npc';

    out.push({ id, qty, mb, npc, currency, autoSource });
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features/shoppingList/shoppingListSurvey.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/shoppingList/shoppingListSurvey.ts src/features/shoppingList/shoppingListSurvey.test.ts
git commit -m "feat(shopping-list): surveyIngredients pure source survey

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: applyShoppingOverrides pure compute

**Files:**
- Create: `src/features/shoppingList/applyShoppingOverrides.ts`
- Create: `src/features/shoppingList/applyShoppingOverrides.test.ts`

Reference: The existing `planShopping` function in `src/features/shoppingList/planShopping.ts` lines 55-118 contains the rollup + by-world aggregation logic. We're extracting and generalizing it: instead of always picking MB, it picks based on `effectiveSource`. The `'NPC vendor'` string is the sentinel world name for NPC purchases.

- [ ] **Step 1: Write the failing test** at `src/features/shoppingList/applyShoppingOverrides.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { applyShoppingOverrides, type ChosenSource } from './applyShoppingOverrides';
import type { IngredientSurvey } from './shoppingListSurvey';
import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { ShoppingListItem } from './shoppingListStore';

function mkSurvey(overrides: Partial<IngredientSurvey> & Pick<IngredientSurvey, 'id' | 'qty'>): IngredientSurvey {
  return {
    mb: null, npc: null, currency: null, autoSource: null,
    ...overrides,
  };
}

function mkSnap(id: number, name = `Item${id}`, canHq = false): SnapshotItem {
  return { id, name, sc: 1, ui: 1, ilvl: 1, canHq };
}

function mkMarket(minNQ: number) {
  return {
    minNQ, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: minNQ, medianHQ: null,
    recentSalesNQ: 10, recentSalesHQ: 0, velocity: 1,
    lastUploadTime: 0, listingCount: 1,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
  };
}

describe('applyShoppingOverrides', () => {
  it('returns empty plan for empty survey', () => {
    const plan = applyShoppingOverrides([], [], [], {}, new Map());
    expect(plan.perIngredient).toEqual([]);
    expect(plan.byWorldSummary).toEqual([]);
    expect(plan.rollup).toEqual({ spend: 0, revenue: 0, profit: 0, missingIngredients: 0 });
  });

  it('with no overrides, behaves like the old planShopping (MB-only case)', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 3, mb: { world: 'Phantom', price: 100, count: 4, isLightDc: false }, autoSource: 'mb' }),
      mkSurvey({ id: 6, qty: 2, mb: { world: 'Odin', price: 50, count: 1, isLightDc: true }, autoSource: 'mb' }),
    ];
    const plan = applyShoppingOverrides(survey, [], [], {}, new Map());
    expect(plan.perIngredient).toEqual([
      { id: 5, qty: 3, bestWorld: 'Phantom', bestPrice: 100, isLightDc: false, listingCount: 4 },
      { id: 6, qty: 2, bestWorld: 'Odin', bestPrice: 50, isLightDc: true, listingCount: 1 },
    ]);
    expect(plan.rollup.spend).toBe(400);  // 100*3 + 50*2
    expect(plan.byWorldSummary).toHaveLength(2);
  });

  it('override flips MB→NPC for one ingredient → spend updates, NPC card appears', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 3,
        mb: { world: 'Phantom', price: 100, count: 4, isLightDc: false },
        npc: { price: 80 },
        autoSource: 'mb' }),  // user picks MB despite NPC being cheaper; we explicitly override to NPC
    ];
    const overrides = new Map<number, ChosenSource>([[5, 'npc']]);
    const plan = applyShoppingOverrides(survey, [], [], {}, overrides);
    expect(plan.perIngredient[0]).toEqual({
      id: 5, qty: 3, bestWorld: 'NPC vendor', bestPrice: 80, isLightDc: false, listingCount: 0,
    });
    expect(plan.rollup.spend).toBe(240);  // 80*3
    expect(plan.byWorldSummary).toHaveLength(1);
    expect(plan.byWorldSummary[0].world).toBe('NPC vendor');
    expect(plan.byWorldSummary[0].total).toBe(240);
  });

  it('override targets npc when survey has no npc → falls back to autoSource (mb)', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 1,
        mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false },
        autoSource: 'mb' }),
    ];
    const overrides = new Map<number, ChosenSource>([[5, 'npc']]);
    const plan = applyShoppingOverrides(survey, [], [], {}, overrides);
    expect(plan.perIngredient[0].bestWorld).toBe('Phantom');
    expect(plan.perIngredient[0].bestPrice).toBe(100);
  });

  it('override targets mb when survey has no mb → falls back to npc', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 1, npc: { price: 80 }, autoSource: 'npc' }),
    ];
    const overrides = new Map<number, ChosenSource>([[5, 'mb']]);
    const plan = applyShoppingOverrides(survey, [], [], {}, overrides);
    expect(plan.perIngredient[0].bestWorld).toBe('NPC vendor');
    expect(plan.perIngredient[0].bestPrice).toBe(80);
  });

  it('rollup.spend sums both MB and NPC totals', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 2, mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false }, autoSource: 'mb' }),
      mkSurvey({ id: 6, qty: 3, npc: { price: 80 }, autoSource: 'npc' }),
    ];
    const plan = applyShoppingOverrides(survey, [], [], {}, new Map());
    expect(plan.rollup.spend).toBe(200 + 240);
    expect(plan.byWorldSummary.map((c) => c.world).sort()).toEqual(['NPC vendor', 'Phantom']);
  });

  it('byWorldSummary places NPC vendor card alongside real worlds, sorted by total desc', () => {
    const survey: IngredientSurvey[] = [
      mkSurvey({ id: 5, qty: 1, mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false }, autoSource: 'mb' }),
      mkSurvey({ id: 6, qty: 10, npc: { price: 50 }, autoSource: 'npc' }),  // NPC total 500
      mkSurvey({ id: 7, qty: 2, mb: { world: 'Odin', price: 50, count: 1, isLightDc: true }, autoSource: 'mb' }),  // Odin total 100
    ];
    const plan = applyShoppingOverrides(survey, [], [], {}, new Map());
    expect(plan.byWorldSummary.map((c) => c.world)).toEqual(['NPC vendor', 'Phantom', 'Odin']);
  });

  it('revenue computation uses itemRevenueUnit (HQ-min-price preference)', () => {
    const items: ShoppingListItem[] = [{ id: 99, qty: 2, craftIntermediates: false }];
    const snapshot: SnapshotItem[] = [mkSnap(99, 'Gizmo', true)];
    const prices: MarketData = {
      99: { ...mkMarket(500), minHQ: 2000, medianHQ: 2000 },
    };
    const plan = applyShoppingOverrides([], items, snapshot, prices, new Map());
    expect(plan.rollup.revenue).toBe(4000);  // 2000 (HQ min) * 2
  });

  it('ingredient with no sources → missingIngredients++, bestWorld null', () => {
    const survey: IngredientSurvey[] = [mkSurvey({ id: 5, qty: 1 })];
    const plan = applyShoppingOverrides(survey, [], [], {}, new Map());
    expect(plan.perIngredient[0]).toEqual({
      id: 5, qty: 1, bestWorld: null, bestPrice: null, isLightDc: false, listingCount: 0,
    });
    expect(plan.rollup.missingIngredients).toBe(1);
    expect(plan.rollup.spend).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/applyShoppingOverrides.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement at `src/features/shoppingList/applyShoppingOverrides.ts`**

```ts
import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { ShoppingListItem } from './shoppingListStore';
import type { IngredientSurvey } from './shoppingListSurvey';
import type { IngredientPlan, ShoppingPlan, WorldSummary } from './planShopping';

export type ChosenSource = 'mb' | 'npc';
export const NPC_VENDOR_WORLD = 'NPC vendor';

function resolveSource(survey: IngredientSurvey, overrides: Map<number, ChosenSource>): ChosenSource | null {
  const requested = overrides.get(survey.id);
  if (requested === 'mb' && survey.mb) return 'mb';
  if (requested === 'npc' && survey.npc) return 'npc';
  // Override missing or targeted source unavailable — fall back to autoSource.
  return survey.autoSource;
}

function itemRevenueUnit(itemId: number, snapshot: SnapshotItem[], prices: MarketData): number {
  const item = snapshot.find((s) => s.id === itemId);
  if (!item) return 0;
  const m = prices[itemId];
  if (!m) return 0;
  if (item.canHq && m.minHQ != null) return m.minHQ;
  if (m.minNQ != null) return m.minNQ;
  return 0;
}

export function applyShoppingOverrides(
  survey: IngredientSurvey[],
  shoppingItems: ShoppingListItem[],
  snapshot: SnapshotItem[],
  prices: MarketData,
  overrides: Map<number, ChosenSource>,
): ShoppingPlan {
  const perIngredient: IngredientPlan[] = [];
  let spend = 0;
  let missingIngredients = 0;

  for (const row of survey) {
    const source = resolveSource(row, overrides);
    if (source === 'mb' && row.mb) {
      perIngredient.push({
        id: row.id, qty: row.qty,
        bestWorld: row.mb.world, bestPrice: row.mb.price,
        isLightDc: row.mb.isLightDc, listingCount: row.mb.count,
      });
      spend += row.mb.price * row.qty;
    } else if (source === 'npc' && row.npc) {
      perIngredient.push({
        id: row.id, qty: row.qty,
        bestWorld: NPC_VENDOR_WORLD, bestPrice: row.npc.price,
        isLightDc: false, listingCount: 0,
      });
      spend += row.npc.price * row.qty;
    } else {
      perIngredient.push({
        id: row.id, qty: row.qty,
        bestWorld: null, bestPrice: null, isLightDc: false, listingCount: 0,
      });
      missingIngredients++;
    }
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
  for (const it of shoppingItems) {
    revenue += itemRevenueUnit(it.id, snapshot, prices) * it.qty;
  }

  return {
    perIngredient,
    byWorldSummary,
    rollup: { spend, revenue, profit: revenue - spend, missingIngredients },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features/shoppingList/applyShoppingOverrides.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/shoppingList/applyShoppingOverrides.ts src/features/shoppingList/applyShoppingOverrides.test.ts
git commit -m "feat(shopping-list): applyShoppingOverrides resolves chosen sources into ShoppingPlan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Re-implement planShopping as thin wrapper

**Files:**
- Modify: `src/features/shoppingList/planShopping.ts`

Goal: shrink `planShopping` to a 3-line wrapper around the two new functions so existing call sites (`src/routes/ShoppingList.tsx`) keep working without changes until Task 5. The existing 6 `planShopping.test.ts` tests must continue passing untouched.

- [ ] **Step 1: Replace `planShopping.ts` body** with this exact content (preserves the `ShoppingPlan`, `IngredientPlan`, `WorldSummary` exports that `applyShoppingOverrides.ts` imports):

```ts
import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { ShoppingListItem } from './shoppingListStore';
import { surveyIngredients } from './shoppingListSurvey';
import { applyShoppingOverrides } from './applyShoppingOverrides';

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

export function planShopping(
  demand: Map<number, number>,
  items: ShoppingListItem[],
  prices: MarketData,
  snapshot: SnapshotItem[],
): ShoppingPlan {
  const survey = surveyIngredients(demand, prices, new Map(), { byCurrency: new Map() });
  return applyShoppingOverrides(survey, items, snapshot, prices, new Map());
}
```

- [ ] **Step 2: Run existing planShopping tests to confirm green**

Run: `npx vitest run src/features/shoppingList/planShopping.test.ts`
Expected: all 6 existing tests PASS unchanged.

- [ ] **Step 3: Run survey + apply tests to confirm no regression**

Run: `npx vitest run src/features/shoppingList/shoppingListSurvey.test.ts src/features/shoppingList/applyShoppingOverrides.test.ts`
Expected: 10 + 9 PASS.

- [ ] **Step 4: Run full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/shoppingList/planShopping.ts
git commit -m "refactor(shopping-list): planShopping is now a thin wrapper over survey+apply

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: ShoppingListPlan accepts survey + adds Source toggle + currency info-line

**Files:**
- Modify: `src/features/shoppingList/ShoppingListPlan.tsx`
- Modify: `src/features/shoppingList/ShoppingListPlan.test.tsx`

This task changes the component's prop API: it now takes `survey: IngredientSurvey[]` (plus the args needed for `applyShoppingOverrides`: `shoppingItems`, `snapshot`, `prices`). The route in Task 5 will be updated to pass these. Existing tests need their setup adapted to construct surveys; assertions stay.

- [ ] **Step 1: Rewrite the test file** to use survey inputs

```tsx
// src/features/shoppingList/ShoppingListPlan.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShoppingListPlan } from './ShoppingListPlan';
import type { IngredientSurvey } from './shoppingListSurvey';
import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';

const sampleSurvey: IngredientSurvey[] = [
  { id: 5, qty: 3, mb: { world: 'Phantom', price: 100, count: 4, isLightDc: false }, npc: null, currency: null, autoSource: 'mb' },
  { id: 6, qty: 2, mb: { world: 'Odin', price: 50, count: 1, isLightDc: true }, npc: null, currency: null, autoSource: 'mb' },
  { id: 7, qty: 1, mb: null, npc: null, currency: null, autoSource: null },
];

const sampleItems = [{ id: 99, qty: 1, craftIntermediates: false }];
const sampleSnapshot: SnapshotItem[] = [
  { id: 99, name: 'Output', sc: 1, ui: 1, ilvl: 1, canHq: false },
];
const samplePrices: MarketData = {
  99: {
    minNQ: 1500, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: 1500, medianHQ: null,
    recentSalesNQ: 10, recentSalesHQ: 0, velocity: 1,
    lastUploadTime: 0, listingCount: 1,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
  },
};

const names = new Map<number, string>([
  [5, 'Iron Ingot'],
  [6, 'Bronze Ingot'],
  [7, 'Ghost Crystal'],
  [99, 'Output'],
]);

function renderWithRouter(survey: IngredientSurvey[] = sampleSurvey, items = sampleItems, snapshot = sampleSnapshot, prices = samplePrices) {
  return render(
    <MemoryRouter>
      <ShoppingListPlan survey={survey} shoppingItems={items} snapshot={snapshot} prices={prices} nameById={names} />
    </MemoryRouter>,
  );
}

describe('ShoppingListPlan', () => {
  it('renders the three rollup cards with correct totals', () => {
    renderWithRouter();
    // spend = 100*3 + 50*2 = 400 → "400"; revenue = 1500*1 = "1.5k"; profit = 1100 → "1.1k"
    expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('400');
    expect(screen.getByText(/est. revenue/i).parentElement?.textContent).toContain('1.5k');
    expect(screen.getByText(/net profit/i).parentElement?.textContent).toContain('1.1k');
  });

  it('warns about missing ingredients in the rollup', () => {
    renderWithRouter();
    expect(screen.getByText(/1 ingredients? have no listings/i)).toBeInTheDocument();
  });

  it('omits the missing-ingredients warning when there are none', () => {
    const survey: IngredientSurvey[] = [
      { id: 5, qty: 3, mb: { world: 'Phantom', price: 100, count: 4, isLightDc: false }, npc: null, currency: null, autoSource: 'mb' },
    ];
    renderWithRouter(survey, [], [], {});
    expect(screen.queryByText(/have no listings/i)).not.toBeInTheDocument();
  });

  it('renders a card per world with ✈ for Light DC', () => {
    renderWithRouter();
    expect(screen.getAllByText('Phantom').length).toBeGreaterThan(0);
    const odinElements = screen.getAllByText('Odin');
    const odinCard = odinElements[0].closest('div');
    expect(odinCard?.textContent).toContain('✈');
    const phantomElements = screen.getAllByText('Phantom');
    const phantomCard = phantomElements[0].closest('div');
    expect(phantomCard?.textContent).not.toContain('✈');
  });

  it('renders the detail table with every ingredient including missing rows', () => {
    renderWithRouter();
    expect(screen.getByText('Iron Ingot')).toBeInTheDocument();
    expect(screen.getByText('Bronze Ingot')).toBeInTheDocument();
    expect(screen.getByText('Ghost Crystal')).toBeInTheDocument();
    expect(screen.getByText('No listings')).toBeInTheDocument();
  });

  it('renders nothing when survey is empty', () => {
    const { container } = renderWithRouter([], [], [], {});
    expect(container.textContent).toBe('');
  });

  // ---- New tests for Source column ----

  it('renders Source toggle when both MB + NPC exist on a row', () => {
    const survey: IngredientSurvey[] = [
      { id: 5, qty: 1,
        mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false },
        npc: { price: 80 }, currency: null, autoSource: 'mb' },
    ];
    renderWithRouter(survey, [], [], {});
    expect(screen.getByRole('button', { name: /^MB$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^NPC$/i })).toBeInTheDocument();
  });

  it('renders no toggle when only one gil source exists', () => {
    renderWithRouter();  // sample survey has MB-only rows
    expect(screen.queryByRole('button', { name: /^MB$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^NPC$/i })).not.toBeInTheDocument();
  });

  it('clicking NPC button updates the displayed plan (price + world)', () => {
    const survey: IngredientSurvey[] = [
      { id: 5, qty: 2,
        mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false },
        npc: { price: 80 }, currency: null, autoSource: 'mb' },
    ];
    renderWithRouter(survey, [], [], {});
    // Before: spend = 100*2 = 200, MB world shown
    expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('200');
    // Click NPC
    fireEvent.click(screen.getByRole('button', { name: /^NPC$/i }));
    // After: spend = 80*2 = 160, NPC vendor world shown
    expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('160');
    expect(screen.getAllByText(/NPC vendor/i).length).toBeGreaterThan(0);
  });

  it('renders currency info-line when survey row has currency', () => {
    const survey: IngredientSurvey[] = [
      { id: 5, qty: 1,
        mb: { world: 'Phantom', price: 100, count: 1, isLightDc: false },
        npc: null,
        currency: { id: 'poetics', label: 'Allagan Tomestone of Poetics', shortLabel: 'Poetics', costPerUnit: 10 },
        autoSource: 'mb' },
    ];
    renderWithRouter(survey, [], [], {});
    expect(screen.getByText(/10\s*Poetics\s*avail\./i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/ShoppingListPlan.test.tsx`
Expected: FAIL — props mismatch on the component.

- [ ] **Step 3: Rewrite `src/features/shoppingList/ShoppingListPlan.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ShoppingPlan } from './planShopping';
import type { IngredientSurvey } from './shoppingListSurvey';
import type { MarketData } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { ShoppingListItem } from './shoppingListStore';
import { applyShoppingOverrides, NPC_VENDOR_WORLD, type ChosenSource } from './applyShoppingOverrides';
import { fmtGil } from '../../lib/format';

interface Props {
  survey: IngredientSurvey[];
  shoppingItems: ShoppingListItem[];
  snapshot: SnapshotItem[];
  prices: MarketData;
  nameById: Map<number, string>;
}

export function ShoppingListPlan({ survey, shoppingItems, snapshot, prices, nameById }: Props) {
  const [overrides, setOverrides] = useState<Map<number, ChosenSource>>(new Map());

  const plan = useMemo(
    () => applyShoppingOverrides(survey, shoppingItems, snapshot, prices, overrides),
    [survey, shoppingItems, snapshot, prices, overrides],
  );

  if (plan.perIngredient.length === 0 && plan.byWorldSummary.length === 0) {
    return null;
  }

  function setSource(id: number, source: ChosenSource) {
    setOverrides((prev) => { const next = new Map(prev); next.set(id, source); return next; });
  }

  const surveyById = useMemo(() => {
    const m = new Map<number, IngredientSurvey>();
    for (const s of survey) m.set(s.id, s);
    return m;
  }, [survey]);

  return (
    <div className="space-y-4">
      <Rollup rollup={plan.rollup} />
      <ByWorld summary={plan.byWorldSummary} nameById={nameById} />
      <DetailTable perIngredient={plan.perIngredient} surveyById={surveyById} overrides={overrides} setSource={setSource} nameById={nameById} />
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
        {summary.map((card) => {
          const isNpc = card.world === NPC_VENDOR_WORLD;
          return (
            <div key={card.world} className={`border bg-bg-card p-3 ${isNpc ? 'border-aether' : 'border-border-base'}`}>
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-text-cream font-mono">
                  {card.world}
                  {!isNpc && card.isLightDc && <span className="text-gold ml-1" title="Requires DC travel">✈</span>}
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
          );
        })}
      </div>
    </div>
  );
}

function DetailTable({
  perIngredient, surveyById, overrides, setSource, nameById,
}: {
  perIngredient: ShoppingPlan['perIngredient'];
  surveyById: Map<number, IngredientSurvey>;
  overrides: Map<number, ChosenSource>;
  setSource: (id: number, src: ChosenSource) => void;
  nameById: Map<number, string>;
}) {
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
              <th className="text-left px-3 py-2">Source</th>
              <th className="text-right px-3 py-2">Price</th>
              <th className="text-right px-3 py-2">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {perIngredient.map((row) => {
              const survey = surveyById.get(row.id);
              return (
                <tr key={row.id} className="border-t border-border-base align-top">
                  <td className="px-3 py-2">
                    <Link to={`/item/${row.id}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                      {nameById.get(row.id) ?? `Item #${row.id}`}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{row.qty}</td>
                  <td className="px-3 py-2">
                    <SourceCell row={row} survey={survey} overrides={overrides} setSource={setSource} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{row.bestPrice != null ? fmtGil(row.bestPrice) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{row.bestPrice != null ? fmtGil(row.bestPrice * row.qty) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceCell({
  row, survey, overrides, setSource,
}: {
  row: ShoppingPlan['perIngredient'][number];
  survey: IngredientSurvey | undefined;
  overrides: Map<number, ChosenSource>;
  setSource: (id: number, src: ChosenSource) => void;
}) {
  if (!survey) {
    return row.bestWorld ? <span>{row.bestWorld}</span> : <span className="text-text-low italic">No listings</span>;
  }
  const hasBoth = !!survey.mb && !!survey.npc;
  // Determine the effective source for active styling
  const overridden = overrides.get(row.id);
  const effective: ChosenSource | null =
    overridden === 'mb' && survey.mb ? 'mb' :
    overridden === 'npc' && survey.npc ? 'npc' :
    survey.autoSource;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        {row.bestWorld ? (
          <span>
            {row.bestWorld}
            {row.bestWorld !== NPC_VENDOR_WORLD && row.isLightDc && (
              <span className="text-gold ml-1" title="Requires DC travel">✈</span>
            )}
          </span>
        ) : (
          <span className="text-text-low italic">No listings</span>
        )}
        {hasBoth && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setSource(row.id, 'mb')}
              className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 border ${
                effective === 'mb' ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
              }`}
            >
              MB
            </button>
            <button
              type="button"
              onClick={() => setSource(row.id, 'npc')}
              className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 border ${
                effective === 'npc' ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
              }`}
            >
              NPC
            </button>
          </div>
        )}
      </div>
      {survey.currency && (
        <div className="font-mono text-[10px] text-text-low">
          └─ {survey.currency.costPerUnit < 10 ? survey.currency.costPerUnit.toFixed(2) : Math.round(survey.currency.costPerUnit)} {survey.currency.shortLabel} avail.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the component test**

Run: `npx vitest run src/features/shoppingList/ShoppingListPlan.test.tsx`
Expected: PASS (10 tests — 6 adapted + 4 new).

- [ ] **Step 5: Full suite + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: full suite green; tsc clean.

Note: this task changes the prop API of `ShoppingListPlan`. `src/routes/ShoppingList.tsx` still passes `plan={plan}` and will be broken AT RUNTIME (the route renders `null` because `plan` prop is undefined → component checks survey length → returns null gracefully). TypeScript will catch the mismatch though, so tsc may fail on the route until Task 5. If tsc fails on `src/routes/ShoppingList.tsx`, that's expected and fixed in Task 5 — confirm the failure is ONLY about the prop mismatch on this single line, then proceed.

If you want to keep tsc green between tasks, you can temporarily delete the route's `<ShoppingListPlan plan={plan} ...>` invocation OR add `// @ts-expect-error wired up in next task` — but cleaner to just proceed to Task 5 immediately.

- [ ] **Step 6: Commit**

```bash
git add src/features/shoppingList/ShoppingListPlan.tsx src/features/shoppingList/ShoppingListPlan.test.tsx
git commit -m "feat(shopping-list): Source column + per-ingredient MB/NPC toggle + currency info-line

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire snapshot hooks + survey in the route

**Files:**
- Modify: `src/routes/ShoppingList.tsx`

- [ ] **Step 1: Update the route**

Read current file at `src/routes/ShoppingList.tsx`. Apply these edits:

(a) Add imports near the existing snapshot/hook imports:
```tsx
import { useVendorShopSnapshot } from '../features/queries/useVendorShopSnapshot';
import { useSpecialShopSnapshot } from '../features/queries/useSpecialShopSnapshot';
import { surveyIngredients } from '../features/shoppingList/shoppingListSurvey';
```

(b) Remove the old `planShopping` import:
```tsx
// DELETE this line:
import { planShopping } from '../features/shoppingList/planShopping';
```

(c) Inside `ShoppingList()`, add the two snapshot hook calls right after `const snapshot = useItemSnapshot();`:
```tsx
const vendor = useVendorShopSnapshot();
const shop = useSpecialShopSnapshot();
```

(d) Replace the existing `plan` memo block with a `survey` memo:

Old code (currently around lines 35-42 — the `const [planRequested, setPlanRequested] = useState(false);` block and the `const plan = useMemo(...)` block):

```tsx
const [planRequested, setPlanRequested] = useState(false);
// Re-arm when the list changes — user must click Plan again.
useEffect(() => { setPlanRequested(false); }, [itemIds.length]);

const plan = useMemo(() => {
  if (!planRequested || !aggregate || !market.data || !snapshot.data) return null;
  return planShopping(aggregate.demand, items, market.data.region, snapshot.data.items);
}, [planRequested, aggregate, market.data, snapshot.data, items]);
```

Replace with:

```tsx
const [planRequested, setPlanRequested] = useState(false);
useEffect(() => { setPlanRequested(false); }, [itemIds.length]);

const survey = useMemo(() => {
  if (!planRequested || !aggregate || !market.data || !snapshot.data) return null;
  const vendorMap = vendor.data?.vendors ?? new Map<number, number>();
  const shopSnapshot = shop.data?.snapshot ?? { byCurrency: new Map() };
  return surveyIngredients(aggregate.demand, market.data.region, vendorMap, shopSnapshot);
}, [planRequested, aggregate, market.data, snapshot.data, vendor.data, shop.data]);
```

(e) Replace the render line at the bottom:

Old:
```tsx
{plan && <ShoppingListPlan plan={plan} nameById={nameById} />}
```

New:
```tsx
{survey && snapshot.data && market.data && (
  <ShoppingListPlan
    survey={survey}
    shoppingItems={items}
    snapshot={snapshot.data.items}
    prices={market.data.region}
    nameById={nameById}
  />
)}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Run full suite**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/ShoppingList.tsx
git commit -m "feat(shopping-list): route wires vendor+special-shop snapshots into survey

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Final verification

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: ALL tests pass. Baseline before this branch was 577; this plan adds 23 new tests (Task 1: 10, Task 2: 9, Task 4: 4 net new). Total expected ≈ 600.

- [ ] **Step 3: Browser smoke test**

Run: `npm run dev`

In the browser at `/shopping-list`:
1. Add a multi-ingredient craft (e.g., from the watchlist or a known recipe). Click "Plan".
2. **Vendor + special-shop catalogs may need a one-time fetch** — if `/vendor-flip` and `/currency-flip` were never visited in this browser profile, those snapshots fetch on first render. They might take 5-30s each. The shopping list view should still show MB-only sources during that load; once they resolve, NPC sources and currency info-lines appear.
3. Verify per the spec:
   - Detail table has a "Source" column.
   - Ingredients available from NPC vendor cheaper than MB auto-pick to NPC; spend reflects NPC price.
   - Toggle clicking flips MB↔NPC for that row; rollup + world cards update live.
   - Currency-available ingredients show `<cost> <shortLabel> avail.` under the source label.
   - A "NPC vendor" world card appears in the by-world summary, with `border-aether` styling, no ✈, sorted alongside real worlds by total.
   - The Rollup "Total material cost" includes NPC purchases.
   - Items in NEITHER MB nor NPC nor currency still show "No listings" italic, still counted in the missing-ingredients warning.

- [ ] **Step 4: Commit (verification doc — none)**

No commit needed; this task is verification only. If issues are found, file follow-ups in your tracker and amend the plan.

---

## Scope clarification: no CSV export in this plan

The design spec mentions a CSV `Source` column ("Adds a `Source` column with values `mb` | `npc` | `none`"). Audit of the current `ShoppingListPlan.tsx` shows **no CSV export exists yet** on the shopping list page — the spec was assuming one. Adding CSV export to the shopping list is a separate UX feature out of scope here. If the user wants CSV later, they can ship it as a follow-up using the existing `src/components/ExportCsvButton.tsx` + `src/lib/csv.ts` pattern already used by `WatchlistTable`, `CraftFlipResults`, `RepostResults`, `MaterialFlipResults`, `VendorFlipResults`, `CurrencyFlipResults`. The Source-column data will naturally be available since the plan already lives in component state.

## Notes for the implementer

- **Pre-existing failure in `src/routes/Item.test.tsx`** has been observed earlier in this branch but resolved by Task 6 of the prior P4 work. If it reappears, it's unrelated to this plan.
- **`worldListings` shape:** `MarketItem.worldListings` items have `world: string, price: number, hq: boolean, quantity: number, retainerName: string`. The survey test factory `mkMarket` builds this shape — copy it if you need new fixtures.
- **`vendor.data?.vendors` not `vendor.data`:** `useVendorShopSnapshot` returns `{ vendors: Map<number, number>; updatedAt }`. The map is at `.vendors`, not directly on `.data`.
- **`shop.data?.snapshot` not `shop.data`:** Similarly, `useSpecialShopSnapshot` returns `{ snapshot, updatedAt }`. Pull the snapshot before passing it.
- **`EU_WORLDS` / `dcOf` live in** `src/lib/europeWorlds.ts`. Lich is on the Light DC; Phantom is on Chaos. These are useful for survey tests.
