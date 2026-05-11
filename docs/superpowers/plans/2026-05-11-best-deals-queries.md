# Best Deals Queries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/queries` route with four Saddlebag-style presets plus a generic builder. Each query scans the entire DC market (filtered by item category and HQ-capability), fetches Universalis prices in chunked parallel batches, and ranks items by discount/gilFlow/velocity/unitPrice.

**Architecture:** One-time item-snapshot fetch from XIVAPI (~80k marketable items, IndexedDB-cached forever, refreshable). Universalis bulk fetcher chunks IDs into batches of 100 with concurrency=4. Pure `runQuery()` does all filtering + ranking. UI is a preset chip strip + a builder form bound to the same `QueryFilter` shape + a results table.

**Tech Stack:** Same as today. New deps: none. New API endpoints: none beyond XIVAPI v2 and Universalis (both already used).

**Approval:** Design approved in conversation. Spec: `docs/superpowers/specs/2026-05-11-best-deals-queries-design.md`.

---

## Conventions

- TDD for every pure helper.
- One commit per task.
- `npm test -- --run` + `npm run build` stay green at each commit.
- Run from `c:/Users/esthe/Documents/Dev/ffxiv-helper`.
- Mirror existing repo patterns: `src/lib/*` for pure infra, `src/features/<name>/*` for vertical slices, `src/routes/*` for pages.

---

## Task 1: Pin ItemSearchCategory IDs

**Files:**
- Create: `src/lib/itemSearchCategories.ts`

We need `ItemSearchCategory` IDs for the preset filters and the builder's category multi-select. Probe XIVAPI v2 once, hand-copy the IDs into a constants file, ship it.

- [ ] **Step 1: Probe XIVAPI**

Run:
```bash
curl -s "https://v2.xivapi.com/api/sheet/ItemSearchCategory?fields=Name,Category&limit=200" | jq '.rows[] | {id: .row_id, name: .fields.Name, group: .fields.Category}' | head -150
```

Expected: a list of ~80 rows like `{ "id": 43, "name": "Medicine", "group": ... }`.

If the `Category` field isn't available, drop it from `fields=` and just collect `Name`.

- [ ] **Step 2: Create the constants file**

Write `src/lib/itemSearchCategories.ts`:
```ts
export interface ItemSearchCategoryEntry {
  id: number;
  name: string;
  group: 'Weapons' | 'Tools' | 'Armor' | 'Accessories' | 'Medicines & Meals' | 'Materials' | 'Other' | 'Housing';
}

// Pinned from XIVAPI on 2026-05-11. Run the probe in Task 1 if you suspect drift.
export const ITEM_SEARCH_CATEGORIES: ItemSearchCategoryEntry[] = [
  // Paste rows here from the probe. Use the `group` column to assign group, or default to 'Other'.
];

export function categoriesByGroup(group: ItemSearchCategoryEntry['group']): number[] {
  return ITEM_SEARCH_CATEGORIES.filter((c) => c.group === group).map((c) => c.id);
}

export function categoryLabel(id: number): string {
  return ITEM_SEARCH_CATEGORIES.find((c) => c.id === id)?.name ?? `SC ${id}`;
}
```

Paste the probe output rows into `ITEM_SEARCH_CATEGORIES`. If the probe didn't include `Category`, set `group: 'Other'` for now and adjust later — presets use raw IDs, not groups.

- [ ] **Step 3: Commit**

```bash
git add src/lib/itemSearchCategories.ts
git commit -m "feat(queries): pin ItemSearchCategory IDs from XIVAPI probe"
```

---

## Task 2: Item snapshot parser (pure)

**Files:**
- Create: `src/lib/itemSnapshot.ts`
- Create: `src/lib/itemSnapshot.test.ts`

The XIVAPI v2 sheet response wraps each row in a `fields` object with nested references. We need a pure parser that turns one page of rows into our `SnapshotItem[]`, dropping non-marketable items.

- [ ] **Step 1: Write the failing test**

Write `src/lib/itemSnapshot.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseItemSheetPage } from './itemSnapshot';

describe('parseItemSheetPage', () => {
  it('extracts SnapshotItem for marketable rows', () => {
    const raw = {
      rows: [
        {
          row_id: 1234,
          fields: {
            Name: 'Faerie Round Table',
            ItemSearchCategory: { value: 56 },
            ItemUICategory: { value: 65 },
            LevelItem: { value: 90 },
            CanBeHq: false,
          },
        },
      ],
    };
    const out = parseItemSheetPage(raw);
    expect(out).toEqual([
      { id: 1234, name: 'Faerie Round Table', sc: 56, ui: 65, ilvl: 90, canHq: false },
    ]);
  });

  it('drops rows with ItemSearchCategory.value === 0', () => {
    const raw = {
      rows: [
        { row_id: 0, fields: { Name: '', ItemSearchCategory: { value: 0 }, ItemUICategory: { value: 0 }, LevelItem: { value: 0 }, CanBeHq: false } },
        { row_id: 1, fields: { Name: 'Gil', ItemSearchCategory: { value: 0 }, ItemUICategory: { value: 0 }, LevelItem: { value: 0 }, CanBeHq: false } },
      ],
    };
    expect(parseItemSheetPage(raw)).toEqual([]);
  });

  it('drops rows with no Name', () => {
    const raw = {
      rows: [
        { row_id: 7, fields: { Name: '', ItemSearchCategory: { value: 56 }, ItemUICategory: { value: 65 }, LevelItem: { value: 0 }, CanBeHq: false } },
      ],
    };
    expect(parseItemSheetPage(raw)).toEqual([]);
  });

  it('treats missing CanBeHq as false', () => {
    const raw = {
      rows: [
        { row_id: 9, fields: { Name: 'A', ItemSearchCategory: { value: 56 }, ItemUICategory: { value: 65 }, LevelItem: { value: 1 } } },
      ],
    };
    expect(parseItemSheetPage(raw)[0].canHq).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest --run src/lib/itemSnapshot.test.ts
```

Expected: FAIL — `parseItemSheetPage` not defined.

- [ ] **Step 3: Implement the parser**

Write `src/lib/itemSnapshot.ts`:
```ts
export interface SnapshotItem {
  id: number;
  name: string;
  sc: number;
  ui: number;
  ilvl: number;
  canHq: boolean;
}

interface RawSheetField<T> { value: T }
interface RawSheetRow {
  row_id: number;
  fields: {
    Name?: string;
    ItemSearchCategory?: RawSheetField<number>;
    ItemUICategory?: RawSheetField<number>;
    LevelItem?: RawSheetField<number>;
    CanBeHq?: boolean;
  };
}
interface RawSheetPage { rows?: RawSheetRow[] }

export function parseItemSheetPage(raw: RawSheetPage): SnapshotItem[] {
  const rows = raw.rows ?? [];
  const out: SnapshotItem[] = [];
  for (const r of rows) {
    const sc = r.fields.ItemSearchCategory?.value ?? 0;
    const name = r.fields.Name ?? '';
    if (sc === 0 || name === '') continue;
    out.push({
      id: r.row_id,
      name,
      sc,
      ui: r.fields.ItemUICategory?.value ?? 0,
      ilvl: r.fields.LevelItem?.value ?? 0,
      canHq: r.fields.CanBeHq === true,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest --run src/lib/itemSnapshot.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itemSnapshot.ts src/lib/itemSnapshot.test.ts
git commit -m "feat(queries): pure XIVAPI Item-sheet page parser"
```

---

## Task 3: IndexedDB store for items

**Files:**
- Modify: `src/lib/recipeCache.ts`

Bump the DB version and add an `items` store. Expose `getAllCachedItems()`, `putCachedItems()`, `clearItemCache()`, and a small metadata helper for snapshot timestamps.

- [ ] **Step 1: Bump the DB version + add the store**

Edit `src/lib/recipeCache.ts`. Change:
```ts
const DB_VERSION = 2;
```
to:
```ts
const DB_VERSION = 3;
const ITEM_STORE = 'items';
const META_STORE = 'meta';
```

Add the new stores inside `upgrade`:
```ts
upgrade(database) {
  if (!database.objectStoreNames.contains(RECIPE_STORE)) {
    database.createObjectStore(RECIPE_STORE);
  }
  if (!database.objectStoreNames.contains(NAME_STORE)) {
    database.createObjectStore(NAME_STORE);
  }
  if (!database.objectStoreNames.contains(ITEM_STORE)) {
    database.createObjectStore(ITEM_STORE);
  }
  if (!database.objectStoreNames.contains(META_STORE)) {
    database.createObjectStore(META_STORE);
  }
},
```

- [ ] **Step 2: Add the item-store helpers**

Append to `src/lib/recipeCache.ts`:
```ts
import type { SnapshotItem } from './itemSnapshot';

const ITEM_SNAPSHOT_KEY = 'snapshot';
const ITEM_SNAPSHOT_TS_KEY = 'snapshotUpdatedAt';

export async function getAllCachedItems(): Promise<SnapshotItem[] | undefined> {
  return (await db()).get(ITEM_STORE, ITEM_SNAPSHOT_KEY);
}

export async function putCachedItems(items: SnapshotItem[]): Promise<void> {
  const handle = await db();
  await handle.put(ITEM_STORE, items, ITEM_SNAPSHOT_KEY);
  await handle.put(META_STORE, Date.now(), ITEM_SNAPSHOT_TS_KEY);
}

export async function clearItemCache(): Promise<void> {
  const handle = await db();
  await handle.clear(ITEM_STORE);
  await handle.delete(META_STORE, ITEM_SNAPSHOT_TS_KEY);
}

export async function getItemSnapshotUpdatedAt(): Promise<number | undefined> {
  return (await db()).get(META_STORE, ITEM_SNAPSHOT_TS_KEY);
}
```

- [ ] **Step 3: Build to verify TypeScript compiles**

```bash
npm run build
```

Expected: clean build (no DB call happens during build).

- [ ] **Step 4: Commit**

```bash
git add src/lib/recipeCache.ts
git commit -m "feat(queries): IndexedDB items + meta stores"
```

---

## Task 4: Item snapshot fetcher (paginated)

**Files:**
- Modify: `src/lib/itemSnapshot.ts`
- Modify: `src/lib/itemSnapshot.test.ts`

Add `fetchItemSnapshot()` that pages through XIVAPI v2 using `?after={cursor}` until the response is empty. Optional progress callback fires after each page. Pure with respect to the cache — caching is the caller's responsibility (Task 5).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/itemSnapshot.test.ts`:
```ts
import { fetchItemSnapshot } from './itemSnapshot';
import { vi } from 'vitest';

describe('fetchItemSnapshot', () => {
  it('pages until an empty page comes back, merging results', async () => {
    const pages = [
      { rows: [{ row_id: 1, fields: { Name: 'A', ItemSearchCategory: { value: 56 }, ItemUICategory: { value: 65 }, LevelItem: { value: 1 }, CanBeHq: false } }] },
      { rows: [{ row_id: 2, fields: { Name: 'B', ItemSearchCategory: { value: 56 }, ItemUICategory: { value: 65 }, LevelItem: { value: 2 }, CanBeHq: true } }] },
      { rows: [] },
    ];
    const fetchSpy = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => pages.shift() }));
    vi.stubGlobal('fetch', fetchSpy);

    const out = await fetchItemSnapshot();
    expect(out.map((i) => i.id)).toEqual([1, 2]);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('invokes progress callback after each non-empty page', async () => {
    const pages = [
      { rows: [{ row_id: 1, fields: { Name: 'A', ItemSearchCategory: { value: 1 }, ItemUICategory: { value: 1 }, LevelItem: { value: 1 } } }] },
      { rows: [{ row_id: 2, fields: { Name: 'B', ItemSearchCategory: { value: 1 }, ItemUICategory: { value: 1 }, LevelItem: { value: 1 } } }] },
      { rows: [] },
    ];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: true, json: async () => pages.shift() })));

    const progress: number[] = [];
    await fetchItemSnapshot({ onProgress: (n) => progress.push(n) });
    expect(progress).toEqual([1, 2]);
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchItemSnapshot()).rejects.toThrow(/XIVAPI 503/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest --run src/lib/itemSnapshot.test.ts
```

Expected: 3 new failures — `fetchItemSnapshot` not defined.

- [ ] **Step 3: Implement the fetcher**

Append to `src/lib/itemSnapshot.ts`:
```ts
export interface FetchItemSnapshotOpts {
  pageSize?: number;
  onProgress?: (totalCollectedSoFar: number) => void;
}

const SHEET_FIELDS = 'Name,ItemSearchCategory.Name,ItemUICategory.Name,LevelItem,CanBeHq';

function buildPageUrl(after: number, pageSize: number): string {
  const params = new URLSearchParams({
    fields: SHEET_FIELDS,
    limit: String(pageSize),
  });
  if (after > 0) params.set('after', String(after));
  return `https://v2.xivapi.com/api/sheet/Item?${params.toString()}`;
}

export async function fetchItemSnapshot(opts: FetchItemSnapshotOpts = {}): Promise<SnapshotItem[]> {
  const pageSize = opts.pageSize ?? 500;
  const out: SnapshotItem[] = [];
  let cursor = 0;
  while (true) {
    const res = await fetch(buildPageUrl(cursor, pageSize));
    if (!res.ok) throw new Error(`XIVAPI ${res.status}`);
    const raw = (await res.json()) as RawSheetPage;
    const rows = raw.rows ?? [];
    if (rows.length === 0) break;
    out.push(...parseItemSheetPage(raw));
    opts.onProgress?.(out.length);
    cursor = rows[rows.length - 1].row_id;
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest --run src/lib/itemSnapshot.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itemSnapshot.ts src/lib/itemSnapshot.test.ts
git commit -m "feat(queries): paginated XIVAPI item snapshot fetcher"
```

---

## Task 5: `useItemSnapshot` hook

**Files:**
- Create: `src/features/queries/useItemSnapshot.ts`

A TanStack Query hook that returns the cached snapshot if present, otherwise fetches + caches + returns. Also exposes a progress callback via a Zustand-free `useState` ref.

- [ ] **Step 1: Implement the hook**

Write `src/features/queries/useItemSnapshot.ts`:
```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getAllCachedItems,
  putCachedItems,
  clearItemCache,
  getItemSnapshotUpdatedAt,
} from '../../lib/recipeCache';
import { fetchItemSnapshot, type SnapshotItem } from '../../lib/itemSnapshot';

const QUERY_KEY = ['itemSnapshot'] as const;

export function useItemSnapshot() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  const query = useQuery<{ items: SnapshotItem[]; updatedAt: number | null }>({
    queryKey: QUERY_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const cached = await getAllCachedItems();
      const ts = await getItemSnapshotUpdatedAt();
      if (cached) return { items: cached, updatedAt: ts ?? null };
      const fresh = await fetchItemSnapshot({ onProgress: (n) => progressRef.current(n) });
      await putCachedItems(fresh);
      return { items: fresh, updatedAt: Date.now() };
    },
  });

  return { ...query, progress };
}

export function useRefreshItemSnapshot() {
  const qc = useQueryClient();
  return async () => {
    await clearItemCache();
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
}
```

- [ ] **Step 2: Build to verify TypeScript compiles**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/useItemSnapshot.ts
git commit -m "feat(queries): useItemSnapshot hook with progress + refresh"
```

---

## Task 6: Universalis bulk fetcher

**Files:**
- Create: `src/lib/universalisBulk.ts`
- Create: `src/lib/universalisBulk.test.ts`

Two pure helpers: `chunkIds(ids, size)` and `fetchInBatches(ids, fetchOne, concurrency)`.

- [ ] **Step 1: Write the failing tests**

Write `src/lib/universalisBulk.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { chunkIds, fetchInBatches } from './universalisBulk';

describe('chunkIds', () => {
  it('splits into even-sized chunks', () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns [] for empty input', () => {
    expect(chunkIds([], 10)).toEqual([]);
  });

  it('returns one chunk when size >= length', () => {
    expect(chunkIds([1, 2], 10)).toEqual([[1, 2]]);
  });
});

describe('fetchInBatches', () => {
  it('runs no more than `concurrency` requests in flight at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchOne = vi.fn().mockImplementation(async (chunk: number[]) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return Object.fromEntries(chunk.map((id) => [id, { price: id * 10 }]));
    });
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = await fetchInBatches(ids, fetchOne, { chunkSize: 2, concurrency: 3 });
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(Object.keys(out.data)).toHaveLength(10);
    expect(out.errors).toEqual([]);
  });

  it('records errored chunks and continues', async () => {
    const fetchOne = vi.fn().mockImplementation(async (chunk: number[]) => {
      if (chunk.includes(3)) throw new Error('boom');
      return Object.fromEntries(chunk.map((id) => [id, { price: id }]));
    });
    const out = await fetchInBatches([1, 2, 3, 4, 5], fetchOne, { chunkSize: 2, concurrency: 2 });
    expect(out.errors).toEqual([[3, 4]]);
    expect(Object.keys(out.data).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 5]);
  });

  it('reports progress per completed chunk', async () => {
    const fetchOne = vi.fn().mockResolvedValue({});
    const seen: number[] = [];
    await fetchInBatches([1, 2, 3, 4], fetchOne, { chunkSize: 2, concurrency: 2, onProgress: (n) => seen.push(n) });
    expect(seen.sort()).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest --run src/lib/universalisBulk.test.ts
```

Expected: FAIL — module not defined.

- [ ] **Step 3: Implement**

Write `src/lib/universalisBulk.ts`:
```ts
export function chunkIds<T>(ids: T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunkIds: size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

export interface FetchInBatchesOpts {
  chunkSize: number;
  concurrency: number;
  onProgress?: (chunksDone: number) => void;
}

export interface FetchInBatchesResult<V> {
  data: Record<string, V>;
  errors: number[][];
}

export async function fetchInBatches<V>(
  ids: number[],
  fetchOne: (chunk: number[]) => Promise<Record<string, V>>,
  opts: FetchInBatchesOpts,
): Promise<FetchInBatchesResult<V>> {
  const chunks = chunkIds(ids, opts.chunkSize);
  const data: Record<string, V> = {};
  const errors: number[][] = [];
  let nextChunkIdx = 0;
  let chunksDone = 0;

  async function worker() {
    while (true) {
      const idx = nextChunkIdx++;
      if (idx >= chunks.length) return;
      const chunk = chunks[idx];
      try {
        const result = await fetchOne(chunk);
        Object.assign(data, result);
      } catch {
        errors.push(chunk);
      }
      chunksDone++;
      opts.onProgress?.(chunksDone);
    }
  }

  const workers = Array.from({ length: Math.max(1, opts.concurrency) }, () => worker());
  await Promise.all(workers);
  return { data, errors };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest --run src/lib/universalisBulk.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/universalisBulk.ts src/lib/universalisBulk.test.ts
git commit -m "feat(queries): chunked Universalis fetcher with concurrency limit"
```

---

## Task 7: Query types + filter hash

**Files:**
- Create: `src/features/queries/types.ts`

- [ ] **Step 1: Define the types**

Write `src/features/queries/types.ts`:
```ts
export type HqMode = 'hq' | 'nq' | 'either';
export type QuerySort = 'discount' | 'gilFlow' | 'velocity' | 'unitPrice';

export interface QueryFilter {
  searchCategories: number[];
  hq: HqMode;
  minDealPct: number;
  minVelocity: number;
  minPrice: number | null;
  maxPrice: number | null;
  sort: QuerySort;
  limit: number;
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

export function filterHash(f: QueryFilter): string {
  return JSON.stringify({
    sc: [...f.searchCategories].sort((a, b) => a - b),
    hq: f.hq,
    d: f.minDealPct,
    v: f.minVelocity,
    p: [f.minPrice, f.maxPrice],
    s: f.sort,
    l: f.limit,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/queries/types.ts
git commit -m "feat(queries): query filter, preset, and result types"
```

---

## Task 8: `runQuery` (pure)

**Files:**
- Create: `src/features/queries/runQuery.ts`
- Create: `src/features/queries/runQuery.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `src/features/queries/runQuery.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runQuery } from './runQuery';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { QueryFilter } from './types';

const snapshot: SnapshotItem[] = [
  { id: 1, name: 'A', sc: 56, ui: 65, ilvl: 90, canHq: true },   // furniture, HQ-able
  { id: 2, name: 'B', sc: 56, ui: 65, ilvl: 90, canHq: false },  // furniture, NQ-only
  { id: 3, name: 'C', sc: 44, ui: 30, ilvl: 1,  canHq: true },   // meal, HQ-able
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
  minPrice: null, maxPrice: null, sort: 'discount', limit: 100,
};

describe('runQuery', () => {
  it('returns [] if priceMap has no matching items', () => {
    expect(runQuery(snapshot, {}, baseFilter)).toEqual([]);
  });

  it('filters by searchCategories when non-empty', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minNQ: 50, averagePriceNQ: 100 }),
      3: mkPrice({ minNQ: 50, averagePriceNQ: 100 }),
    };
    const out = runQuery(snapshot, priceMap, { ...baseFilter, searchCategories: [44] });
    expect(out.map((r) => r.id)).toEqual([3]);
  });

  it('drops non-HQ-capable items when hq mode is "hq"', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 50, averagePriceHQ: 100 }),
      2: mkPrice({ minNQ: 50, averagePriceNQ: 100 }), // canHq=false
    };
    const out = runQuery(snapshot, priceMap, { ...baseFilter, hq: 'hq' });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('applies minDealPct threshold', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minNQ: 90, averagePriceNQ: 100 }),  // 10% off
      2: mkPrice({ minNQ: 50, averagePriceNQ: 100 }),  // 50% off
    };
    const out = runQuery(snapshot, priceMap, { ...baseFilter, hq: 'nq', minDealPct: 30 });
    expect(out.map((r) => r.id)).toEqual([2]);
  });

  it('applies minVelocity, minPrice, maxPrice', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minNQ: 100, averagePriceNQ: 200, velocity: 1 }),
      2: mkPrice({ minNQ: 100, averagePriceNQ: 200, velocity: 5 }),
      3: mkPrice({ minNQ: 999_999, averagePriceNQ: 2_000_000, velocity: 5 }),
    };
    const f: QueryFilter = { ...baseFilter, hq: 'nq', minVelocity: 3, minPrice: 50, maxPrice: 500_000 };
    const out = runQuery(snapshot, priceMap, f);
    expect(out.map((r) => r.id)).toEqual([2]);
  });

  it('sorts by each mode and slices to limit', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minNQ: 80, averagePriceNQ: 100, velocity: 1 }),  // disc 20, flow 80, vel 1
      2: mkPrice({ minNQ: 50, averagePriceNQ: 100, velocity: 4 }),  // disc 50, flow 200, vel 4
      3: mkPrice({ minNQ: 70, averagePriceNQ: 100, velocity: 2 }),  // disc 30, flow 140, vel 2
    };
    const f = (sort: QueryFilter['sort']): QueryFilter => ({ ...baseFilter, hq: 'nq', sort, limit: 2 });
    expect(runQuery(snapshot, priceMap, f('discount')).map((r) => r.id)).toEqual([2, 3]);
    expect(runQuery(snapshot, priceMap, f('gilFlow')).map((r) => r.id)).toEqual([2, 3]);
    expect(runQuery(snapshot, priceMap, f('velocity')).map((r) => r.id)).toEqual([2, 3]);
    expect(runQuery(snapshot, priceMap, f('unitPrice')).map((r) => r.id)).toEqual([1, 3]);
  });

  it('hq=either uses whichever tier has the lower current min, and tags hq accordingly', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minNQ: 80, averagePriceNQ: 100, minHQ: 60, averagePriceHQ: 200, velocity: 1 }),
    };
    const out = runQuery(snapshot, priceMap, { ...baseFilter, hq: 'either' });
    expect(out[0].hq).toBe(true);
    expect(out[0].unitPrice).toBe(60);
    expect(out[0].averagePrice).toBe(200);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest --run src/features/queries/runQuery.test.ts
```

Expected: FAIL — `runQuery` not defined.

- [ ] **Step 3: Implement**

Write `src/features/queries/runQuery.ts`:
```ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { HqMode, QueryFilter, QueryResultRow, QuerySort } from './types';

function pickTier(m: MarketItem, hq: HqMode): { unit: number; avg: number; isHq: boolean } | null {
  const hqUnit = m.minHQ, hqAvg = m.averagePriceHQ;
  const nqUnit = m.minNQ, nqAvg = m.averagePriceNQ;
  if (hq === 'hq') {
    if (hqUnit == null || hqAvg == null || hqAvg <= 0) return null;
    return { unit: hqUnit, avg: hqAvg, isHq: true };
  }
  if (hq === 'nq') {
    if (nqUnit == null || nqAvg == null || nqAvg <= 0) return null;
    return { unit: nqUnit, avg: nqAvg, isHq: false };
  }
  const candidates: { unit: number; avg: number; isHq: boolean }[] = [];
  if (hqUnit != null && hqAvg != null && hqAvg > 0) candidates.push({ unit: hqUnit, avg: hqAvg, isHq: true });
  if (nqUnit != null && nqAvg != null && nqAvg > 0) candidates.push({ unit: nqUnit, avg: nqAvg, isHq: false });
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.unit <= b.unit ? a : b));
}

function compare(a: QueryResultRow, b: QueryResultRow, sort: QuerySort): number {
  switch (sort) {
    case 'discount':  return b.dealPct - a.dealPct;
    case 'gilFlow':   return b.gilFlow - a.gilFlow;
    case 'velocity':  return b.velocity - a.velocity;
    case 'unitPrice': return b.unitPrice - a.unitPrice;
  }
}

export function runQuery(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  filter: QueryFilter,
): QueryResultRow[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: QueryResultRow[] = [];

  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.hq === 'hq' && !item.canHq) continue;
    const m = priceMap[item.id];
    if (!m) continue;
    const tier = pickTier(m, filter.hq);
    if (!tier) continue;

    const dealPct = Math.round(((tier.avg - tier.unit) / tier.avg) * 100);
    const gilFlow = tier.unit * m.velocity;

    if (dealPct < filter.minDealPct) continue;
    if (m.velocity < filter.minVelocity) continue;
    if (filter.minPrice != null && tier.unit < filter.minPrice) continue;
    if (filter.maxPrice != null && tier.unit > filter.maxPrice) continue;

    out.push({
      id: item.id, name: item.name, sc: item.sc,
      unitPrice: tier.unit, averagePrice: tier.avg,
      dealPct, velocity: m.velocity, gilFlow, hq: tier.isHq,
    });
  }

  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest --run src/features/queries/runQuery.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/runQuery.ts src/features/queries/runQuery.test.ts
git commit -m "feat(queries): pure runQuery filter + ranker"
```

---

## Task 9: Presets

**Files:**
- Create: `src/features/queries/presets.ts`
- Create: `src/features/queries/presets.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `src/features/queries/presets.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PRESETS, getPreset } from './presets';

describe('PRESETS', () => {
  it('every preset has a unique id', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(PRESETS.length);
  });

  it('every preset has a non-empty label and desc', () => {
    for (const p of PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.desc.length).toBeGreaterThan(0);
    }
  });

  it('every preset filter has a legal sort mode and limit > 0', () => {
    for (const p of PRESETS) {
      expect(['discount', 'gilFlow', 'velocity', 'unitPrice']).toContain(p.filter.sort);
      expect(p.filter.limit).toBeGreaterThan(0);
    }
  });

  it('food-potions targets ItemSearchCategory 43 and 44', () => {
    const p = getPreset('food-potions')!;
    expect(p.filter.searchCategories.sort()).toEqual([43, 44]);
  });

  it('getPreset returns undefined for unknown id', () => {
    expect(getPreset('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest --run src/features/queries/presets.test.ts
```

Expected: FAIL — `PRESETS` not defined.

- [ ] **Step 3: Implement**

Write `src/features/queries/presets.ts`:
```ts
import type { QueryPreset } from './types';

export const PRESETS: QueryPreset[] = [
  {
    id: 'mega-value-hq', label: 'Mega Value HQ',
    desc: 'HQ items priced ≥1M gil currently discounted ≥30%.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 30, minVelocity: 0,
              minPrice: 1_000_000, maxPrice: null, sort: 'unitPrice', limit: 100 },
  },
  {
    id: 'fast-sellers-hq', label: 'Fast Sellers HQ',
    desc: 'HQ items with ≥3 sales/day and ≥15% discount, sorted by gil/day.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 15, minVelocity: 3,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100 },
  },
  {
    id: 'food-potions', label: 'Food & Potions',
    desc: 'Meals + medicine at ≥20% discount.',
    filter: { searchCategories: [43, 44], hq: 'either', minDealPct: 20, minVelocity: 0,
              minPrice: null, maxPrice: null, sort: 'discount', limit: 100 },
  },
  {
    id: 'furnishings', label: 'Furnishings discount',
    desc: 'Housing items at ≥30% discount.',
    filter: { searchCategories: [56, 57, 65, 66, 67, 68, 69, 70, 71, 72], hq: 'nq',
              minDealPct: 30, minVelocity: 0, minPrice: null, maxPrice: null,
              sort: 'discount', limit: 100 },
  },
];

export function getPreset(id: string): QueryPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
```

After Task 1 lands the real category constants, return here and tighten the `searchCategories` arrays for `furnishings` against the pinned IDs (replace the placeholder list `[56, 57, 65, …, 72]` with the actual Furnishing-group IDs from `categoriesByGroup('Housing')`). The test for `food-potions` (43, 44) should match XIVAPI's Medicine + Meals IDs in standard FFXIV data; if Task 1 reveals different IDs, update both the preset and the test together.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest --run src/features/queries/presets.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/presets.ts src/features/queries/presets.test.ts
git commit -m "feat(queries): four v1 presets + getPreset helper"
```

---

## Task 10: QueryBuilder component

**Files:**
- Create: `src/features/queries/QueryBuilder.tsx`

A controlled form bound to a `QueryFilter`. Parent owns the state and the "Run query" button calls `onRun(filter)`.

- [ ] **Step 1: Implement**

Write `src/features/queries/QueryBuilder.tsx`:
```tsx
import type { ChangeEvent } from 'react';
import { ITEM_SEARCH_CATEGORIES, categoryLabel } from '../../lib/itemSearchCategories';
import type { HqMode, QueryFilter, QuerySort } from './types';

interface Props {
  value: QueryFilter;
  onChange: (next: QueryFilter) => void;
  onRun: () => void;
  busy?: boolean;
}

const SORTS: { id: QuerySort; label: string }[] = [
  { id: 'discount',  label: 'Discount %' },
  { id: 'gilFlow',   label: 'Gil / day' },
  { id: 'velocity',  label: 'Velocity' },
  { id: 'unitPrice', label: 'Unit price' },
];

export function QueryBuilder({ value, onChange, onRun, busy }: Props) {
  function patch(p: Partial<QueryFilter>) { onChange({ ...value, ...p }); }

  function toggleCat(id: number) {
    const set = new Set(value.searchCategories);
    set.has(id) ? set.delete(id) : set.add(id);
    patch({ searchCategories: [...set] });
  }

  function intInput(e: ChangeEvent<HTMLInputElement>): number {
    return Math.max(0, Number(e.target.value) || 0);
  }
  function nullableIntInput(e: ChangeEvent<HTMLInputElement>): number | null {
    const v = e.target.value.trim();
    return v === '' ? null : Math.max(0, Number(v) || 0);
  }

  return (
    <div className="border border-border-base bg-bg-card p-4 space-y-4">
      <div>
        <label className="font-mono text-[10px] tracking-widest text-text-low uppercase block mb-2">
          Categories ({value.searchCategories.length || 'all'})
        </label>
        <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
          {ITEM_SEARCH_CATEGORIES.map((c) => {
            const on = value.searchCategories.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCat(c.id)}
                className={`font-mono text-[10px] px-2 py-1 border ${
                  on ? 'border-gold text-gold' : 'border-border-base text-text-low hover:text-aether'
                }`}
              >
                {categoryLabel(c.id)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">HQ</span>
          <select
            value={value.hq}
            onChange={(e) => patch({ hq: e.target.value as HqMode })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          >
            <option value="hq">HQ</option>
            <option value="nq">NQ</option>
            <option value="either">Either</option>
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min discount %</span>
          <input
            type="number" min={0} max={99} value={value.minDealPct}
            onChange={(e) => patch({ minDealPct: Math.min(99, intInput(e)) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min velocity / day</span>
          <input
            type="number" min={0} step={0.5} value={value.minVelocity}
            onChange={(e) => patch({ minVelocity: intInput(e) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Sort by</span>
          <select
            value={value.sort}
            onChange={(e) => patch({ sort: e.target.value as QuerySort })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          >
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min price (gil)</span>
          <input
            type="number" min={0} step={1000}
            value={value.minPrice ?? ''}
            onChange={(e) => patch({ minPrice: nullableIntInput(e) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Max price (gil)</span>
          <input
            type="number" min={0} step={1000}
            value={value.maxPrice ?? ''}
            onChange={(e) => patch({ maxPrice: nullableIntInput(e) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Limit</span>
          <input
            type="number" min={1} max={1000} value={value.limit}
            onChange={(e) => patch({ limit: Math.max(1, Math.min(1000, intInput(e) || 100)) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>

        <div className="flex items-end">
          <button
            onClick={onRun}
            disabled={busy}
            className="w-full font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50"
          >
            {busy ? 'Running…' : 'Run query'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify TypeScript compiles**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/QueryBuilder.tsx
git commit -m "feat(queries): QueryBuilder controlled form"
```

---

## Task 11: QueryResults component

**Files:**
- Create: `src/features/queries/QueryResults.tsx`

- [ ] **Step 1: Implement**

Write `src/features/queries/QueryResults.tsx`:
```tsx
import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import type { QueryResultRow } from './types';

interface Props {
  rows: QueryResultRow[];
  totalCandidates: number;
  skippedChunks: number;
}

export function QueryResults({ rows, totalCandidates, skippedChunks }: Props) {
  if (rows.length === 0) {
    return (
      <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
        No items match this filter. Try lowering the discount threshold or widening the price range.
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
              <th className="text-right px-3 py-2">Current</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Average</th>
              <th className="text-right px-3 py-2">Disc.</th>
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
                <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">{fmtGil(r.averagePrice)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-jade">-{r.dealPct}%</td>
                <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">{r.velocity.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gold-hi">{fmtGil(Math.round(r.gilFlow))}</td>
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
git add src/features/queries/QueryResults.tsx
git commit -m "feat(queries): QueryResults table"
```

---

## Task 12: Queries route page

**Files:**
- Create: `src/routes/Queries.tsx`

Wires everything together: preset chips → builder state → manual "Run query" → Universalis bulk fetch (gated by snapshot availability) → runQuery → results.

- [ ] **Step 1: Implement**

Write `src/routes/Queries.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { useSettingsStore } from '../features/settings/store';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useMutation } from '@tanstack/react-query';
import { fetchInBatches } from '../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../lib/universalis';
import { PRESETS, getPreset } from '../features/queries/presets';
import { runQuery } from '../features/queries/runQuery';
import { QueryBuilder } from '../features/queries/QueryBuilder';
import { QueryResults } from '../features/queries/QueryResults';
import type { QueryFilter, QueryResultRow } from '../features/queries/types';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

const DEFAULT_FILTER: QueryFilter = PRESETS[0].filter;

export default function Queries() {
  const { dc } = useSettingsStore();
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

  const run = useMutation<{ rows: QueryResultRow[]; skipped: number }>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      const result = await fetchInBatches<MarketData[string]>(
        candidateIds,
        async (chunk) => fetchMarketData(dc, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      const rows = runQuery(snapshot.data.items, result.data, filter);
      return { rows, skipped: result.errors.length };
    },
  });

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
            busy={run.isPending}
          />
          <div className="font-mono text-[10px] text-text-low">
            {candidateIds.length.toLocaleString()} items in scope
          </div>

          {run.isPending && <Spinner label={`Fetching prices for ${candidateIds.length} items…`} />}
          {run.isError && <StatusBanner kind="error">Query failed: {(run.error as Error).message}</StatusBanner>}
          {run.data && (
            <QueryResults
              rows={run.data.rows}
              totalCandidates={candidateIds.length}
              skippedChunks={run.data.skipped}
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

Expected: clean build. (TS will catch type errors here.)

- [ ] **Step 3: Commit**

```bash
git add src/routes/Queries.tsx
git commit -m "feat(queries): Queries route wiring presets + builder + results"
```

---

## Task 13: Header nav + App route registration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Add the route**

Edit `src/App.tsx`. Add the import and route:
```tsx
import Queries from './routes/Queries';
```
Inside the `<Routes>` block, after `/insights`:
```tsx
<Route path="/queries" element={<Queries />} />
```

- [ ] **Step 2: Add the nav link**

Edit `src/components/layout/Header.tsx`. Inside the `<nav>` block, after the Insights link:
```tsx
<NavLink to="/queries" className={navClass}>Queries</NavLink>
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/Header.tsx
git commit -m "feat(queries): wire /queries route + nav link"
```

---

## Task 14: Settings: Item DB section

**Files:**
- Modify: `src/routes/Settings.tsx`

A new card showing snapshot size + last-refreshed timestamp + refresh button.

- [ ] **Step 1: Add the section**

Edit `src/routes/Settings.tsx`. At the top, add imports:
```tsx
import { useItemSnapshot, useRefreshItemSnapshot } from '../features/queries/useItemSnapshot';
```

Inside `Settings()`, before `return`:
```tsx
const itemDb = useItemSnapshot();
const refreshItemDb = useRefreshItemSnapshot();

function fmtDate(ts: number | null | undefined) {
  if (!ts) return 'never';
  return new Date(ts).toLocaleString();
}
```

Add a new `<section>` between "Recipe cache" and "Backup & restore":
```tsx
<section>
  <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Item DB</h2>
  <p className="text-text-low text-sm mb-3">
    Used by Best Deals Queries to scan the whole DC market. Fetched once from XIVAPI and cached
    indefinitely. Refresh after a game patch.
  </p>
  <div className="font-mono text-xs text-text-low mb-3">
    {itemDb.data
      ? <>Cached: <span className="text-text-cream">{itemDb.data.items.length.toLocaleString()}</span> items · last refreshed <span className="text-text-cream">{fmtDate(itemDb.data.updatedAt)}</span></>
      : <>Not yet fetched.</>}
  </div>
  <button
    onClick={refreshItemDb}
    className="font-mono text-[10px] tracking-widest uppercase border border-crimson text-crimson px-4 py-2 hover:bg-crimson hover:text-bg-deep"
  >
    Refresh item DB
  </button>
</section>
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Settings.tsx
git commit -m "feat(queries): Settings card for item DB status + refresh"
```

---

## Task 15: Smoke tests

**Files:**
- Create: `src/routes/Queries.test.tsx`

- [ ] **Step 1: Write the smoke test**

Write `src/routes/Queries.test.tsx`:
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

describe('Queries route', () => {
  it('renders all four preset chips', async () => {
    await putCachedItems([]);
    render(withProviders(<Queries />));
    expect(await screen.findByRole('button', { name: /mega value hq/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fast sellers hq/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /food & potions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /furnishings discount/i })).toBeInTheDocument();
  });

  it('runs a preset against a mocked snapshot + mocked Universalis', async () => {
    await putCachedItems([
      { id: 100, name: 'Cheap Meal', sc: 44, ui: 30, ilvl: 1, canHq: true },
      { id: 101, name: 'Expensive Meal', sc: 44, ui: 30, ilvl: 1, canHq: true },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: {
          '100': {
            listings: [{ hq: false, pricePerUnit: 40, worldName: 'Phantom' }, { hq: true, pricePerUnit: 50, worldName: 'Phantom' }],
            recentHistory: [],
            regularSaleVelocity: 1,
            lastUploadTime: Date.now(),
            averagePriceNQ: 100,
            averagePriceHQ: 100,
          },
          '101': {
            listings: [{ hq: false, pricePerUnit: 95, worldName: 'Phantom' }],
            recentHistory: [],
            regularSaleVelocity: 1,
            lastUploadTime: Date.now(),
            averagePriceNQ: 100,
            averagePriceHQ: null,
          },
        },
      }),
    }));

    render(withProviders(<Queries />));
    fireEvent.click(await screen.findByRole('button', { name: /food & potions/i }));
    fireEvent.click(screen.getByRole('button', { name: /run query/i }));

    await waitFor(() => expect(screen.getByText(/Cheap Meal/)).toBeInTheDocument());
    expect(screen.queryByText(/Expensive Meal/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npx vitest --run src/routes/Queries.test.tsx
```

Expected: 2 passed. If the second test flakes on timing, increase the timeout via `await waitFor(..., { timeout: 5_000 })`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Queries.test.tsx
git commit -m "test(queries): smoke test for /queries route"
```

---

## Task 16: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append docs**

Edit `README.md`. Add a new section between "Insights" and "Legacy":
```markdown

## Best Deals Queries

A new `/queries` route inspired by Saddlebag Exchange. Scans the entire Chaos DC market
(not just your tracked watchlist) and ranks items by discount, gil/day, velocity, or
unit price.

- **Item DB:** one-time fetch of ~80k marketable items from XIVAPI, cached in IndexedDB
  forever. Refresh from Settings after a game patch.
- **Bulk fetcher:** chunks IDs into 100-per-batch Universalis calls with concurrency 4.
  A whole-market scan takes ~10–40s depending on filters.
- **Presets:** Mega Value HQ, Fast Sellers HQ, Food & Potions, Furnishings discount.
- **Builder:** every filter (category multi-select, HQ/NQ, min discount, min velocity,
  price range, sort, limit) is editable for ad-hoc queries.
```

- [ ] **Step 2: Final test + build run**

```bash
npm test -- --run
npm run build
```

Expected: all tests green (≈170 total), clean build.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: Best Deals Queries section in README"
```

---

## Done when

- `npm test -- --run` green.
- `npm run build` clean.
- `/queries` route accessible from header nav.
- First visit (or after Settings refresh) triggers item snapshot fetch with a visible progress count.
- Each of the four presets runs end-to-end against live data and renders a results table.
- Builder lets the user override any preset and re-run.
- Settings page shows item DB size + refresh button.
