# Craft-for-Gil Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe `/queries` → `/crafts` (craft presets only), hide flip tools under new `/trading` tab, absorb Marketshare into Watchlist's gil/day sort, delete `/insights` route. IA-only pivot — no pipeline math changes other than one `buildRows` branch.

**Architecture:** Tag each preset with `category: 'craft' | 'trading'`. Extract Queries.tsx body into reusable `QueriesView` component accepting category prop. Both `/crafts` and the new `/trading` route's Queries tab render `QueriesView` with their category. Header demotes Trading via separator + dim color. `/insights` and `/queries` paths redirect to their new homes. `MarketshareView` deleted; Watchlist's existing `gilDay` sort gains coverage for sale-only items via a one-branch change in `buildRows`.

**Tech Stack:** React + TypeScript + Vite + Vitest, React Router v6, Tailwind, TanStack Query (unchanged).

Spec: `docs/superpowers/specs/2026-05-11-craft-pivot-design.md`

---

## Task 1: Tag presets with `category`

**Files:**
- Modify: `src/features/queries/types.ts`
- Modify: `src/features/queries/presets.ts`
- Modify: `src/features/queries/presets.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/features/queries/presets.test.ts` inside the `describe('PRESETS', ...)` block:

```ts
it('every preset has a category (craft or trading)', () => {
  for (const p of PRESETS) {
    expect(['craft', 'trading']).toContain(p.category);
  }
});

it('categorizes craft presets correctly', () => {
  const craftIds = PRESETS.filter((p) => p.category === 'craft').map((p) => p.id).sort();
  expect(craftIds).toEqual(['craft-flip', 'undersupply']);
});

it('categorizes trading presets correctly', () => {
  const tradingIds = PRESETS.filter((p) => p.category === 'trading').map((p) => p.id).sort();
  expect(tradingIds).toEqual(['fast-sellers-hq', 'food-potions', 'furnishings', 'mega-value-hq', 'reposts']);
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/features/queries/presets.test.ts
```

Expected: TypeScript error `Property 'category' does not exist on type 'QueryPreset'` and 3 failing assertions.

- [ ] **Step 3: Add `PresetCategory` to types**

Edit `src/features/queries/types.ts`. Insert after line 4 (`export type QueryMode = ...`):

```ts
export type PresetCategory = 'craft' | 'trading';
```

Replace `QueryPreset` interface (currently lines 21-26) with:

```ts
export interface QueryPreset {
  id: string;
  label: string;
  desc: string;
  category: PresetCategory;
  filter: QueryFilter;
}
```

- [ ] **Step 4: Tag every preset in `presets.ts`**

Edit `src/features/queries/presets.ts`. Add `category: 'trading'` or `category: 'craft'` to each preset object. Final file content:

```ts
import { categoriesByGroup } from '../../lib/itemSearchCategories';
import type { QueryPreset } from './types';

export const PRESETS: QueryPreset[] = [
  {
    id: 'mega-value-hq', label: 'Mega Value HQ', category: 'trading',
    desc: 'HQ items priced ≥1M gil currently discounted ≥30%.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 30, minVelocity: 0,
              minPrice: 1_000_000, maxPrice: null, sort: 'unitPrice', limit: 100,
              scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
  },
  {
    id: 'fast-sellers-hq', label: 'Fast Sellers HQ', category: 'trading',
    desc: 'HQ items with ≥3 sales/day and ≥15% discount, sorted by gil/day.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 15, minVelocity: 3,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
  },
  {
    id: 'food-potions', label: 'Food & Potions', category: 'trading',
    desc: 'Meals + medicine at ≥20% discount.',
    // Categories: 43 (Medicine), 45 (Meals) — see itemSearchCategories.ts
    filter: { searchCategories: [43, 45], hq: 'either', minDealPct: 20, minVelocity: 0,
              minPrice: null, maxPrice: null, sort: 'discount', limit: 100,
              scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
  },
  {
    id: 'furnishings', label: 'Furnishings discount', category: 'trading',
    desc: 'Housing items at ≥30% discount.',
    filter: { searchCategories: categoriesByGroup('Housing'), hq: 'nq',
              minDealPct: 30, minVelocity: 0, minPrice: null, maxPrice: null,
              sort: 'discount', limit: 100,
              scope: 'dc', maxListings: null, mode: 'standard', minGap: null },
  },
  {
    id: 'undersupply', label: 'Undersupply (craft + list)', category: 'craft',
    desc: 'Items selling ≥1/day on your home world with ≤2 home-world listings. Craft and list to fill the gap.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: 2, mode: 'craft', minGap: null },
  },
  {
    id: 'craft-flip', label: 'Craft-flip Phantom', category: 'craft',
    desc: 'Craftable items ranked by home-world (sale − material cost) × velocity.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: null, mode: 'craft', minGap: null },
  },
  {
    id: 'reposts', label: 'Reposts (camp)', category: 'trading',
    desc: 'Home-world items where the cheapest listing is ≥10k below the next price (gap ≥30%). Buy + relist for instant gil.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 30, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: null, mode: 'repost', minGap: 10_000 },
  },
];

export function getPreset(id: string): QueryPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
```

- [ ] **Step 5: Run all tests**

```
npm test -- --run
```

Expected: 201 passing (3 new presets.test.ts assertions added, existing 198 still pass).

- [ ] **Step 6: Commit**

```bash
git add src/features/queries/types.ts src/features/queries/presets.ts src/features/queries/presets.test.ts
git commit -m "feat(queries): tag presets with category (craft | trading)"
```

---

## Task 2: `buildRows` sale-only `gilPerDay`

**Files:**
- Modify: `src/features/watchlist/buildRows.ts:75`
- Modify: `src/features/watchlist/buildRows.test.ts`

- [ ] **Step 1: Update existing sale-only test + add new tests**

Edit `src/features/watchlist/buildRows.test.ts`. Replace the existing test "marks rows as sale-only when recipeMap returns null" (currently lines 88-103). The fixture stays but the `gilPerDay` assertion changes from `.toBeNull()` to a numeric value, and add a new test for sale-only with no price.

Replace lines 88-103 with:

```ts
  it('marks rows as sale-only when recipeMap returns null and computes gilPerDay from unit × velocity', () => {
    const items: TrackedItem[] = [{ id: 1, name: 'Materia XII', crafter: 'ANY', lvl: 100, cat: 'Materia' }];
    const phantom: MarketData = {
      '1': { minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, velocity: 0, lastUploadTime: Date.now(), listingCount: 0, ...extra },
    };
    const dc: MarketData = {
      '1': { minNQ: 50_000, minHQ: null, avgNQ: null, avgHQ: null, velocity: 2, lastUploadTime: Date.now(), listingCount: 1, ...extra },
    };
    const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };
    const recipeMap = new Map<number, Recipe | null>([[1, null]]);
    const rows = buildRows(items, phantom, dc, levels, recipeMap, {}, Date.now());
    expect(rows[0].craftable).toBe(false);
    expect(rows[0].profit).toBeNull();
    expect(rows[0].materialCost).toBeNull();
    // 50_000 × 2 = 100_000
    expect(rows[0].gilPerDay).toBe(100_000);
  });

  it('sale-only with zero velocity or no price keeps gilPerDay null', () => {
    const items: TrackedItem[] = [
      { id: 1, name: 'No velocity', crafter: 'ANY', lvl: 100, cat: 'Materia' },
      { id: 2, name: 'No price', crafter: 'ANY', lvl: 100, cat: 'Materia' },
    ];
    const phantom: MarketData = {};
    const dc: MarketData = {
      '1': { minNQ: 50_000, minHQ: null, avgNQ: null, avgHQ: null, velocity: 0, lastUploadTime: Date.now(), listingCount: 1, ...extra },
      '2': { minNQ: null,   minHQ: null, avgNQ: null, avgHQ: null, velocity: 3, lastUploadTime: Date.now(), listingCount: 0, ...extra },
    };
    const levels = { CRP: 100, BSM: 100, ARM: 100, GSM: 100, LTW: 100, WVR: 100, ALC: 100, CUL: 100 };
    const recipeMap = new Map<number, Recipe | null>([[1, null], [2, null]]);
    const rows = buildRows(items, phantom, dc, levels, recipeMap, {}, Date.now());
    expect(rows[0].gilPerDay).toBeNull();
    expect(rows[1].gilPerDay).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify failure**

```
npx vitest run src/features/watchlist/buildRows.test.ts
```

Expected: existing test now fails (`gilPerDay` is null but expected 100_000). New "zero velocity" test passes already (gilPerDay null path unchanged for craftable-unknown).

- [ ] **Step 3: Update `buildRows.ts`**

Edit `src/features/watchlist/buildRows.ts`. Replace line 75:

```ts
      gilPerDay: profitResult ? profitResult.profit * velocity : null,
```

With:

```ts
      gilPerDay: profitResult
        ? profitResult.profit * velocity
        : recipeEntry === null
          ? (d?.minHQ ?? d?.minNQ ?? 0) * velocity || null
          : null,
```

The `|| null` collapses `0 * anything` and `null * anything` (NaN coerces falsy) back to null, keeping junk rows out of the sort.

- [ ] **Step 4: Run tests**

```
npm test -- --run
```

Expected: all 201+ tests pass (1 existing test rewritten + 1 new test added).

- [ ] **Step 5: Commit**

```bash
git add src/features/watchlist/buildRows.ts src/features/watchlist/buildRows.test.ts
git commit -m "feat(watchlist): sale-only rows get gilPerDay = unit × velocity"
```

---

## Task 3: Extract `QueriesView` component

**Files:**
- Create: `src/features/queries/QueriesView.tsx`
- Modify: `src/routes/Queries.tsx`
- Modify: `src/routes/Queries.test.tsx`

- [ ] **Step 1: Create `QueriesView.tsx`**

Create `src/features/queries/QueriesView.tsx` with this content (this is the body of the current `Queries.tsx` adapted to accept a `category` prop and filter presets):

```tsx
import { useMemo, useState } from 'react';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from './useItemSnapshot';
import { useMutation } from '@tanstack/react-query';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { PRESETS, getPreset } from './presets';
import { runQuery } from './runQuery';
import { runCraftFlip, narrowForCraftFlip } from './runCraftFlip';
import { runRepost } from './runRepost';
import { useRecipes } from '../profit/useRecipes';
import { QueryBuilder } from './QueryBuilder';
import { QueryResults } from './QueryResults';
import { CraftFlipResults } from './CraftFlipResults';
import { RepostResults } from './RepostResults';
import type { QueryFilter, QueryResultRow, CraftFlipRow, RepostRow, PresetCategory } from './types';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

interface PriceFetchResult {
  priceMap: MarketData;
  candidateIds: number[];
  narrowedIds: number[];
  skipped: number;
  filterAtRun: QueryFilter;
}

interface Props {
  category: PresetCategory;
  heading?: string;
}

export function QueriesView({ category, heading }: Props) {
  const { world, dc } = useSettingsStore();
  const snapshot = useItemSnapshot();

  const presets = useMemo(() => PRESETS.filter((p) => p.category === category), [category]);
  const [filter, setFilter] = useState<QueryFilter>(presets[0].filter);
  const [activePresetId, setActivePresetId] = useState<string | null>(presets[0].id);

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
      const narrowedIds = filter.mode === 'craft'
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

  const derived = useMemo(() => {
    if (!run.data || !snapshot.data) return null;
    const f = run.data.filterAtRun;
    switch (f.mode) {
      case 'craft': {
        if (run.data.narrowedIds.length === 0) {
          return { kind: 'craft' as const, rows: [] as CraftFlipRow[] };
        }
        if (!recipes.data) return null;
        const rows = runCraftFlip(snapshot.data.items, run.data.priceMap, recipes.data, f);
        return { kind: 'craft' as const, rows };
      }
      case 'repost': {
        const rows: RepostRow[] = runRepost(snapshot.data.items, run.data.priceMap, f);
        return { kind: 'repost' as const, rows };
      }
      case 'standard':
      default: {
        const rows: QueryResultRow[] = runQuery(snapshot.data.items, run.data.priceMap, f);
        return { kind: 'query' as const, rows };
      }
    }
  }, [run.data, recipes.data, snapshot.data]);

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      {heading && <h2 className="font-display text-lg text-gold tracking-wide">{heading}</h2>}

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
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
            busy={run.isPending || (filter.mode === 'craft' && recipes.isLoading)}
          />
          <div className="font-mono text-[10px] text-text-low">
            {candidateIds.length.toLocaleString()} items in scope
            {run.data?.filterAtRun.mode === 'craft' && (
              <> · {run.data.narrowedIds.length.toLocaleString()} narrowed for recipe lookup</>
            )}
          </div>

          {run.isPending && <Spinner label={`Fetching prices for ${candidateIds.length} items…`} />}
          {run.isError && <StatusBanner kind="error">Query failed: {(run.error as Error).message}</StatusBanner>}
          {run.data?.filterAtRun.mode === 'craft' && recipes.isLoading && (
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
          {derived?.kind === 'repost' && (
            <RepostResults
              rows={derived.rows}
              totalCandidates={candidateIds.length}
              skippedChunks={run.data?.skipped ?? 0}
            />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Slim down `Queries.tsx` to delegate**

Replace the entire contents of `src/routes/Queries.tsx` with:

```tsx
import { QueriesView } from '../features/queries/QueriesView';

export default function Queries() {
  return <QueriesView category="craft" heading="Crafts" />;
}
```

- [ ] **Step 3: Update `Queries.test.tsx` assertions for craft-only**

Replace the entire contents of `src/routes/Queries.test.tsx` with (drops the trading-preset assertions; keeps Undersupply smoke; Reposts smoke moves to Trading.test.tsx in Task 5; "renders all four preset chips" becomes "renders craft preset chips"):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import Queries from './Queries';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { clearItemCache, putCachedItems } from '../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  await clearItemCache();
  vi.restoreAllMocks();
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Queries route (craft category)', () => {
  it('renders only craft preset chips', async () => {
    await putCachedItems([]);
    render(withProviders(<Queries />));
    expect(await screen.findByRole('button', { name: /undersupply/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /craft-flip phantom/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mega value hq/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /fast sellers hq/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /food & potions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /furnishings discount/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reposts \(camp\)/i })).toBeNull();
  });

  it('renders the Crafts heading', async () => {
    await putCachedItems([]);
    render(withProviders(<Queries />));
    expect(await screen.findByRole('heading', { name: /^crafts$/i })).toBeInTheDocument();
  });

  it('Undersupply preset: home-world fetch + lazy recipes + maxListings filter', async () => {
    await putCachedItems([
      { id: 200, name: 'Scarce Craft', sc: 56, ui: 65, ilvl: 90, canHq: true },
      { id: 201, name: 'Oversupplied', sc: 56, ui: 65, ilvl: 90, canHq: true },
      { id: 299, name: 'Ingredient',   sc: 47, ui: 0,  ilvl: 1,  canHq: false },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
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
      if (url.includes('xivapi.com')) {
        return { ok: true, json: async () => ({ results: [] }) };
      }
      return { ok: false, status: 404 };
    }));

    render(withProviders(<Queries />));
    fireEvent.click(await screen.findByRole('button', { name: /undersupply/i }));
    fireEvent.click(screen.getByRole('button', { name: /run query/i }));

    await waitFor(
      () => expect(screen.getByText(/Scarce Craft/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByText(/Oversupplied/)).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests**

```
npm test -- --run
```

Expected: all tests pass. (`Queries.test.tsx` now has 3 tests instead of 4; the "runs a preset against a mocked snapshot" Food & Potions test is dropped along with the Reposts smoke. Both are recovered in Task 5's Trading.test.tsx.)

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/QueriesView.tsx src/routes/Queries.tsx src/routes/Queries.test.tsx
git commit -m "refactor(queries): extract QueriesView with category prop"
```

---

## Task 4: Rename `Queries` route → `Crafts`

**Files:**
- Rename: `src/routes/Queries.tsx` → `src/routes/Crafts.tsx`
- Rename: `src/routes/Queries.test.tsx` → `src/routes/Crafts.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Git-rename the route files**

```bash
git mv src/routes/Queries.tsx src/routes/Crafts.tsx
git mv src/routes/Queries.test.tsx src/routes/Crafts.test.tsx
```

- [ ] **Step 2: Rename the component inside `Crafts.tsx`**

Edit `src/routes/Crafts.tsx`. Replace contents with:

```tsx
import { QueriesView } from '../features/queries/QueriesView';

export default function Crafts() {
  return <QueriesView category="craft" heading="Crafts" />;
}
```

- [ ] **Step 3: Update `Crafts.test.tsx` import + describe label**

Edit `src/routes/Crafts.test.tsx`. Change the import and describe block:

```ts
// Was: import Queries from './Queries';
import Crafts from './Crafts';
```

Change every `render(withProviders(<Queries />));` to `render(withProviders(<Crafts />));`.

Change the `describe` block name:

```ts
// Was: describe('Queries route (craft category)', () => {
describe('Crafts route', () => {
```

- [ ] **Step 4: Update `App.tsx`**

Edit `src/App.tsx`. Replace its contents with:

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/layout/Header';
import Home from './routes/Home';
import Watchlist from './routes/Watchlist';
import Insights from './routes/Insights';
import Crafts from './routes/Crafts';
import Settings from './routes/Settings';

export default function App() {
  return (
    <div className="min-h-screen pt-8 pb-20">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/crafts" element={<Crafts />} />
        <Route path="/queries" element={<Navigate to="/crafts" replace />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
```

(`/insights` and `Insights` import are still present — they go away in Task 6 when the Trading route is wired and the redirect can flip.)

- [ ] **Step 5: Update `Header.tsx`**

Edit `src/components/layout/Header.tsx`. Replace the Queries NavLink with a Crafts NavLink. Final file:

```tsx
import { NavLink } from 'react-router-dom';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 font-mono text-xs tracking-widest uppercase transition-colors ${
    isActive ? 'text-gold' : 'text-text-dim hover:text-aether'
  }`;

export function Header() {
  return (
    <header className="border-b border-border-base mb-7 pb-5">
      <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] tracking-widest text-aether uppercase mb-1">
            Final Fantasy XIV · Crafting Helper
          </div>
          <h1 className="font-display font-semibold text-3xl tracking-wide leading-tight">
            Phantom <span className="text-gold italic">Crafting</span> Ledger
          </h1>
        </div>
        <nav className="flex gap-1">
          <NavLink to="/" end className={navClass}>Home</NavLink>
          <NavLink to="/watchlist" className={navClass}>Watchlist</NavLink>
          <NavLink to="/insights" className={navClass}>Insights</NavLink>
          <NavLink to="/crafts" className={navClass}>Crafts</NavLink>
          <NavLink to="/settings" className={navClass}>Settings</NavLink>
        </nav>
      </div>
    </header>
  );
}
```

(Insights link stays for now — it disappears in Task 6 once Trading is the real home.)

- [ ] **Step 6: Run tests**

```
npm test -- --run
```

Expected: all pass. `Crafts.test.tsx` runs with the new component name; the redirect lives only at routing time so it doesn't affect unit tests that render the component directly.

- [ ] **Step 7: Commit**

```bash
git add src/routes/Crafts.tsx src/routes/Crafts.test.tsx src/App.tsx src/components/layout/Header.tsx
git commit -m "refactor(routes): rename /queries -> /crafts (+ redirect)"
```

---

## Task 5: New `/trading` route

**Files:**
- Create: `src/routes/Trading.tsx`
- Create: `src/routes/Trading.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Create `Trading.tsx`**

Create `src/routes/Trading.tsx`:

```tsx
import { useState } from 'react';
import { ArbitrageView } from '../features/insights/ArbitrageView';
import { BestDealsView } from '../features/insights/BestDealsView';
import { QueriesView } from '../features/queries/QueriesView';

type Tab = 'arbitrage' | 'deals' | 'queries';

const TABS: { id: Tab; label: string }[] = [
  { id: 'arbitrage', label: 'Arbitrage' },
  { id: 'deals',     label: 'Best deals' },
  { id: 'queries',   label: 'Queries' },
];

export default function Trading() {
  const [tab, setTab] = useState<Tab>('arbitrage');
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <h2 className="font-display text-lg text-gold tracking-wide">Trading</h2>
      <nav className="flex border-b border-border-base">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`font-mono text-[11px] tracking-widest uppercase px-4 py-3 border-b-2 transition-colors -mb-[1px] ${
              tab === t.id ? 'border-gold text-gold' : 'border-transparent text-text-dim hover:text-aether'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'arbitrage' && <ArbitrageView />}
      {tab === 'deals' && <BestDealsView />}
      {tab === 'queries' && <QueriesView category="trading" />}
    </div>
  );
}
```

- [ ] **Step 2: Create `Trading.test.tsx`**

Create `src/routes/Trading.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import Trading from './Trading';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { useWatchlistStore, defaultWatchlist } from '../features/items/watchlistStore';
import { clearItemCache, clearRecipeCache, putCachedItems } from '../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useWatchlistStore.setState(defaultWatchlist());
  await clearItemCache();
  await clearRecipeCache();
  vi.restoreAllMocks();
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Trading route', () => {
  it('renders three tabs with Arbitrage active by default', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));
    render(withProviders(<Trading />));
    expect(screen.getByRole('button', { name: /arbitrage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /best deals/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /queries/i })).toBeInTheDocument();
  });

  it('switches to Best deals when its tab is clicked', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));
    render(withProviders(<Trading />));
    fireEvent.click(screen.getByRole('button', { name: /best deals/i }));
    expect(screen.getByText(/Min discount/i)).toBeInTheDocument();
  });

  it('Queries tab renders only trading preset chips', async () => {
    await putCachedItems([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));
    render(withProviders(<Trading />));
    fireEvent.click(screen.getByRole('button', { name: /^queries$/i }));
    expect(await screen.findByRole('button', { name: /mega value hq/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fast sellers hq/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /food & potions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /furnishings discount/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reposts \(camp\)/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undersupply/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /craft-flip phantom/i })).toBeNull();
  });

  it('Reposts preset: surfaces wall-gap opportunities, drops tied-sellers', async () => {
    await putCachedItems([
      { id: 300, name: 'Pixie Cotton',  sc: 50, ui: 30, ilvl: 90, canHq: true },
      { id: 301, name: 'Tied Sellers',  sc: 50, ui: 30, ilvl: 90, canHq: true },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: {
          '300': {
            listings: [
              { hq: false, pricePerUnit: 80_000,  worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
            ],
            recentHistory: [],
            regularSaleVelocity: 1.5,
            lastUploadTime: Date.now(),
            averagePriceNQ: 130_000,
            averagePriceHQ: null,
          },
          '301': {
            listings: [
              { hq: false, pricePerUnit: 100_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 100_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 100_000, worldName: 'Phantom' },
            ],
            recentHistory: [],
            regularSaleVelocity: 5,
            lastUploadTime: Date.now(),
            averagePriceNQ: 100_000,
            averagePriceHQ: null,
          },
        },
      }),
    }));

    render(withProviders(<Trading />));
    fireEvent.click(screen.getByRole('button', { name: /^queries$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /reposts \(camp\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /run query/i }));

    await waitFor(
      () => expect(screen.getByText(/Pixie Cotton/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByText(/Tied Sellers/)).toBeNull();
  });
});
```

- [ ] **Step 3: Mount `/trading` in `App.tsx`**

Edit `src/App.tsx`. Add `Trading` import + route. New full file:

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/layout/Header';
import Home from './routes/Home';
import Watchlist from './routes/Watchlist';
import Insights from './routes/Insights';
import Crafts from './routes/Crafts';
import Trading from './routes/Trading';
import Settings from './routes/Settings';

export default function App() {
  return (
    <div className="min-h-screen pt-8 pb-20">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/crafts" element={<Crafts />} />
        <Route path="/trading" element={<Trading />} />
        <Route path="/queries" element={<Navigate to="/crafts" replace />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
```

- [ ] **Step 4: Add Trading link to `Header.tsx` with dim style + separator**

Edit `src/components/layout/Header.tsx`. Replace full file with:

```tsx
import { NavLink } from 'react-router-dom';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 font-mono text-xs tracking-widest uppercase transition-colors ${
    isActive ? 'text-gold' : 'text-text-dim hover:text-aether'
  }`;

const navClassDim = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 font-mono text-xs tracking-widest uppercase transition-colors ${
    isActive ? 'text-gold' : 'text-text-low hover:text-aether'
  }`;

export function Header() {
  return (
    <header className="border-b border-border-base mb-7 pb-5">
      <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] tracking-widest text-aether uppercase mb-1">
            Final Fantasy XIV · Crafting Helper
          </div>
          <h1 className="font-display font-semibold text-3xl tracking-wide leading-tight">
            Phantom <span className="text-gold italic">Crafting</span> Ledger
          </h1>
        </div>
        <nav className="flex gap-1 items-center">
          <NavLink to="/" end className={navClass}>Home</NavLink>
          <NavLink to="/watchlist" className={navClass}>Watchlist</NavLink>
          <NavLink to="/insights" className={navClass}>Insights</NavLink>
          <NavLink to="/crafts" className={navClass}>Crafts</NavLink>
          <NavLink to="/settings" className={navClass}>Settings</NavLink>
          <span className="border-l border-border-base h-5 mx-2" aria-hidden />
          <NavLink to="/trading" className={navClassDim}>Trading</NavLink>
        </nav>
      </div>
    </header>
  );
}
```

(Insights link stays this task too; it goes away in Task 6.)

- [ ] **Step 5: Run tests**

```
npm test -- --run
```

Expected: all pass including 4 new Trading.test.tsx tests.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Trading.tsx src/routes/Trading.test.tsx src/App.tsx src/components/layout/Header.tsx
git commit -m "feat(trading): /trading route with Arbitrage, Best deals, Queries tabs"
```

---

## Task 6: Delete `/insights` route + Marketshare code, finalize redirects

**Files:**
- Delete: `src/routes/Insights.tsx`
- Delete: `src/routes/Insights.test.tsx`
- Delete: `src/features/insights/MarketshareView.tsx`
- Delete: `src/features/insights/marketshare.ts`
- Delete: `src/features/insights/marketshare.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Delete the five files**

```bash
git rm src/routes/Insights.tsx src/routes/Insights.test.tsx \
  src/features/insights/MarketshareView.tsx \
  src/features/insights/marketshare.ts \
  src/features/insights/marketshare.test.ts
```

- [ ] **Step 2: Flip `/insights` to redirect in `App.tsx`**

Edit `src/App.tsx`. Drop the `Insights` import and switch the route to a Navigate. Final file:

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/layout/Header';
import Home from './routes/Home';
import Watchlist from './routes/Watchlist';
import Crafts from './routes/Crafts';
import Trading from './routes/Trading';
import Settings from './routes/Settings';

export default function App() {
  return (
    <div className="min-h-screen pt-8 pb-20">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/crafts" element={<Crafts />} />
        <Route path="/trading" element={<Trading />} />
        <Route path="/queries" element={<Navigate to="/crafts" replace />} />
        <Route path="/insights" element={<Navigate to="/trading" replace />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
```

- [ ] **Step 3: Remove `/insights` link from `Header.tsx`**

Edit `src/components/layout/Header.tsx`. Drop the Insights NavLink. Final nav block:

```tsx
        <nav className="flex gap-1 items-center">
          <NavLink to="/" end className={navClass}>Home</NavLink>
          <NavLink to="/watchlist" className={navClass}>Watchlist</NavLink>
          <NavLink to="/crafts" className={navClass}>Crafts</NavLink>
          <NavLink to="/settings" className={navClass}>Settings</NavLink>
          <span className="border-l border-border-base h-5 mx-2" aria-hidden />
          <NavLink to="/trading" className={navClassDim}>Trading</NavLink>
        </nav>
```

(Rest of `Header.tsx` unchanged.)

- [ ] **Step 4: Run tests**

```
npm test -- --run
```

Expected: all pass. 5 test files / ~5 tests removed (Insights.test.tsx + marketshare.test.ts). No other test depends on the deleted modules — `ArbitrageView`, `BestDealsView`, `arbitrage.ts`, `bestDeals.ts` and their tests stay put under `features/insights/`.

- [ ] **Step 5: Build check**

```
npm run build
```

Expected: clean build. No dangling import.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/layout/Header.tsx
git commit -m "refactor: delete /insights route + Marketshare (absorbed by Watchlist sort)"
```

---

## Task 7: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite the IA section in README**

Edit `README.md`. Replace the "## Insights" and "## Best Deals Queries" sections (currently lines 75-104) with one consolidated section:

```markdown
## Routes

The app is structured around the craft-for-gil flow. Trading tools (price flips, arbitrage) are preserved but visually demoted.

- **Home** — Session planner (existing).
- **Watchlist** — Tracked items with market data. Default sort is gil/day; sale-only items (Materia, dyes) now contribute to the ranking via `unit price × velocity`.
- **Crafts** — `/crafts`. Saddlebag-style preset queries focused on crafting:
  - *Undersupply (craft + list)* — items selling on your home world with ≤2 listings.
  - *Craft-flip Phantom* — craftable items ranked by `(sale − material cost) × velocity` on your home world.
  - Builder defaults to **Craft-flip** mode, but the Mode select still exposes Standard / Craft-flip / Reposts.
- **Settings** — Recipe cache + backup/restore (existing).
- **Trading** — `/trading` (rendered dim in the nav). Three tabs:
  - *Arbitrage* — cross-world price gaps inside your DC.
  - *Best deals* — DC-min prices below Universalis average.
  - *Queries* — preset queries focused on flipping: Mega Value HQ, Fast Sellers HQ, Food & Potions, Furnishings discount, Reposts (camp).

Bookmarks survive: `/queries` redirects to `/crafts`, `/insights` redirects to `/trading`.

### Item DB & bulk fetch

Whole-game presets (under both Crafts and Trading) share a one-time XIVAPI item snapshot (~80k items, ~30s, cached forever in IndexedDB; refresh from Settings after a game patch). Universalis prices are fetched in chunks of 100 IDs with concurrency 4 — a whole-market scan takes ~10–40s.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README reflects /crafts + /trading IA"
```

---

## Done when

- `npm test -- --run` green.
- `npm run build` clean.
- Top nav shows: `Home · Watchlist · Crafts · Settings   |   Trading` (Trading rendered in `text-text-low`).
- `/` Home unchanged.
- `/watchlist` opens sorted by gil/day; sale-only items now display values.
- `/crafts` shows 2 craft preset chips (Undersupply, Craft-flip Phantom); builder defaults to Craft-flip when no preset active.
- `/trading` shows 3 tabs (Arbitrage / Best deals / Queries); Queries tab shows 5 trading presets including Reposts (camp).
- `/insights` → React Router redirect to `/trading`. `/queries` → `/crafts`.
- All three query modes (Standard / Craft-flip / Reposts) still selectable in the builder.
- No regressions: SessionPlanner, RecipeModal, Settings unchanged.
