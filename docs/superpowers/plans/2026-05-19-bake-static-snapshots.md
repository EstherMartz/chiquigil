# Bake Static Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-bake the six static XIVAPI snapshots (items, recipes, leves, vendorShop, specialShop, gatheringCatalog) at build time into shipped JSON, so first-load goes from 30s+ pagination to a single static fetch — with the existing live-fetch path kept as a fallback.

**Architecture:** A Node script (`scripts/bake-snapshots.ts`, run via `tsx`) imports the same `fetch*Snapshot` functions the runtime uses, hits XIVAPI once, and writes results to `public/data/snapshots/*.json` + a `manifest.json` with `bakedAt` timestamps. Each `use*Snapshot` hook gains a middle step: IDB cache → **static bundle** → live XIVAPI fetch. Static bundles are loaded once, written into IDB with their `bakedAt` timestamp (not `Date.now()`) so the Settings cache UI shows when the data was actually frozen.

**Tech Stack:** TypeScript + Vite + React + tanstack-query + idb. New devDep: `tsx` for Node-side TS execution.

---

## File Structure

**New files:**
- `scripts/bake-snapshots.ts` — Node entrypoint; calls each `fetch*Snapshot` and writes JSON. Single file, ~150 lines.
- `src/lib/staticSnapshots.ts` — Browser-side loader. One typed function per snapshot, each returning `{ data, bakedAt } | null`. Single file.
- `src/lib/staticSnapshots.test.ts` — Tests for loader behavior (404 = null, valid JSON parses, map reconstitution).
- `public/data/snapshots/items.json` (and 5 siblings + `manifest.json`) — Generated artifacts. Committed.

**Modified files:**
- `package.json` — Add `tsx` devDep + `"snapshots": "tsx scripts/bake-snapshots.ts"` script.
- `src/lib/recipeCache.ts` — Each `putCachedX` gains optional `ts?: number` param defaulting to `Date.now()`, used to stamp meta with the bake time.
- `src/features/queries/useItemSnapshot.ts` — Insert static-fallback step between cache lookup and live fetch.
- `src/features/queries/useRecipeSnapshot.ts` — Same pattern.
- `src/features/queries/useLeveSnapshot.ts` — Same pattern.
- `src/features/queries/useVendorShopSnapshot.ts` — Same pattern.
- `src/features/queries/useSpecialShopSnapshot.ts` — Same pattern.
- `src/features/queries/useGatheringCatalog.ts` — Same pattern.

**Responsibility split:** The bake script imports existing `fetch*Snapshot` functions verbatim — they already work in Node (`fetch` is global; `import.meta.env?.VITE_XIVAPI_BASE` optional-chains to undefined and falls back to the literal URL). The loader is the only browser-side glue. The hooks each get a ~10-line insertion. No existing logic is removed.

---

## Phase A — Infrastructure

### Task 1: Add `tsx` runner and `snapshots` script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install `tsx` as a devDep**

Run: `npm install --save-dev tsx`
Expected: `tsx` appears in `devDependencies` in package.json; no other deps change.

- [ ] **Step 2: Add the `snapshots` npm script**

Edit `package.json` `scripts` section:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview",
    "test": "vitest",
    "snapshots": "tsx scripts/bake-snapshots.ts"
  }
}
```

- [ ] **Step 3: Verify script wiring**

Run: `npm run snapshots -- --help` (will fail with module-not-found until Task 2 creates the file; we just want to confirm `tsx` resolves)
Expected: tsx error like `Cannot find module 'scripts/bake-snapshots.ts'` — NOT a "tsx: command not found" error.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add tsx runner and snapshots npm script"
```

---

### Task 2: Extend `recipeCache` put functions with optional bake timestamp

**Files:**
- Modify: `src/lib/recipeCache.ts`

These edits make every `putCachedX` accept an optional `ts` parameter so the static loader can record the bake time instead of "now".

- [ ] **Step 1: Modify `putCachedItems`**

Replace the existing function in `src/lib/recipeCache.ts` (around line 95):

```typescript
export async function putCachedItems(items: SnapshotItem[], ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(ITEM_STORE, items, ITEM_SNAPSHOT_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), ITEM_SNAPSHOT_TS_KEY);
}
```

- [ ] **Step 2: Modify `putCachedGatheringCatalog`**

Replace (around line 118):

```typescript
export async function putCachedGatheringCatalog(entries: Array<[number, GatheringInfo]>, ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(GATHER_STORE, entries, GATHER_CATALOG_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), GATHER_CATALOG_TS_KEY);
}
```

- [ ] **Step 3: Modify `putCachedRecipeSnapshot`**

Replace (around line 141):

```typescript
export async function putCachedRecipeSnapshot(entries: Array<[number, Recipe]>, ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(RECIPE_SNAPSHOT_STORE, entries, RECIPE_SNAPSHOT_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), RECIPE_SNAPSHOT_TS_KEY);
}
```

- [ ] **Step 4: Modify `putCachedLeves`**

Replace (around line 197):

```typescript
export async function putCachedLeves(leves: SnapshotLeve[], ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(LEVE_STORE, leves, LEVE_SNAPSHOT_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), LEVE_SNAPSHOT_TS_KEY);
}
```

- [ ] **Step 5: Modify `putCachedVendorSnapshot`**

Replace (around line 222):

```typescript
export async function putCachedVendorSnapshot(snapshot: Map<number, number>, ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(GILSHOP_STORE, [...snapshot.entries()], GILSHOP_SNAPSHOT_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), GILSHOP_SNAPSHOT_TS_KEY);
}
```

- [ ] **Step 6: Modify `putCachedSpecialShop`**

Replace (around line 247):

```typescript
export async function putCachedSpecialShop(snapshot: SpecialShopSnapshot, ts?: number): Promise<void> {
  const handle = await db();
  await handle.put(SPECIALSHOP_STORE, { byCurrency: [...snapshot.byCurrency.entries()] }, SPECIALSHOP_SNAPSHOT_KEY);
  await handle.put(META_STORE, ts ?? Date.now(), SPECIALSHOP_SNAPSHOT_TS_KEY);
}
```

- [ ] **Step 7: Verify all existing call sites still compile**

Run: `npx tsc --noEmit`
Expected: zero errors. The new `ts?` param is optional, so every existing call (which passes no `ts`) is still valid.

- [ ] **Step 8: Commit**

```bash
git add src/lib/recipeCache.ts
git commit -m "feat(cache): accept explicit timestamp in putCached* helpers

Enables hydration from build-time static snapshots that need to stamp
the meta store with the bake time, not Date.now()."
```

---

### Task 3: Create the static snapshot loader module

**Files:**
- Create: `src/lib/staticSnapshots.ts`
- Create: `src/lib/staticSnapshots.test.ts`

This module is the browser-side counterpart to the bake script. It fetches `/data/snapshots/<name>.json`, returns `{ data, bakedAt } | null` (null on 404 or parse error), and reconstitutes Maps where needed.

- [ ] **Step 1: Write the failing test for `loadStaticItemsSnapshot`**

Create `src/lib/staticSnapshots.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  loadStaticItemsSnapshot,
  loadStaticRecipesSnapshot,
  loadStaticVendorSnapshot,
  loadStaticSpecialShopSnapshot,
  loadStaticGatheringCatalog,
  loadStaticLevesSnapshot,
} from './staticSnapshots';

const origFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = origFetch; });

function mockFetch(map: Record<string, { status: number; body?: unknown }>) {
  globalThis.fetch = vi.fn(async (url: string | URL) => {
    const key = typeof url === 'string' ? url : url.toString();
    const hit = map[key] ?? { status: 404 };
    return new Response(hit.body == null ? '' : JSON.stringify(hit.body), { status: hit.status });
  }) as unknown as typeof fetch;
}

describe('loadStaticItemsSnapshot', () => {
  it('returns null on 404', async () => {
    mockFetch({});
    expect(await loadStaticItemsSnapshot()).toBeNull();
  });

  it('returns data and bakedAt on 200', async () => {
    const items = [{ id: 1, name: 'X', sc: 1, ui: 1, ilvl: 1, canHq: false }];
    mockFetch({
      '/data/snapshots/items.json': { status: 200, body: { bakedAt: 1700000000000, items } },
    });
    const got = await loadStaticItemsSnapshot();
    expect(got).toEqual({ bakedAt: 1700000000000, data: items });
  });
});

describe('loadStaticRecipesSnapshot', () => {
  it('reconstitutes Map from entries array', async () => {
    const entries: Array<[number, { itemResultId: number }]> = [[1, { itemResultId: 1 } as never]];
    mockFetch({
      '/data/snapshots/recipes.json': { status: 200, body: { bakedAt: 1, entries } },
    });
    const got = await loadStaticRecipesSnapshot();
    expect(got).not.toBeNull();
    expect(got!.data.get(1)).toEqual({ itemResultId: 1 });
    expect(got!.bakedAt).toBe(1);
  });
});

describe('loadStaticVendorSnapshot', () => {
  it('reconstitutes Map<number,number>', async () => {
    mockFetch({
      '/data/snapshots/vendorShop.json': { status: 200, body: { bakedAt: 2, entries: [[10, 99]] } },
    });
    const got = await loadStaticVendorSnapshot();
    expect(got!.data.get(10)).toBe(99);
  });
});

describe('loadStaticSpecialShopSnapshot', () => {
  it('reconstitutes the byCurrency Map', async () => {
    mockFetch({
      '/data/snapshots/specialShop.json': {
        status: 200,
        body: { bakedAt: 3, byCurrency: [['poetics', [{ itemId: 5, receiveQty: 1, costPerUnit: 100, isHq: false }]]] },
      },
    });
    const got = await loadStaticSpecialShopSnapshot();
    expect(got!.data.byCurrency.get('poetics' as never)).toHaveLength(1);
  });
});

describe('loadStaticGatheringCatalog', () => {
  it('reconstitutes Map<number,GatheringInfo>', async () => {
    mockFetch({
      '/data/snapshots/gathering.json': {
        status: 200,
        body: { bakedAt: 4, entries: [[1, { level: 50, timed: false, hidden: false }]] },
      },
    });
    const got = await loadStaticGatheringCatalog();
    expect(got!.data.get(1)?.level).toBe(50);
  });
});

describe('loadStaticLevesSnapshot', () => {
  it('returns array verbatim', async () => {
    mockFetch({
      '/data/snapshots/leves.json': { status: 200, body: { bakedAt: 5, leves: [{ id: 1 }] } },
    });
    const got = await loadStaticLevesSnapshot();
    expect(got!.data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail with "module not found"**

Run: `npx vitest run src/lib/staticSnapshots.test.ts`
Expected: FAIL with errors like `Cannot find module './staticSnapshots'`.

- [ ] **Step 3: Implement the loader module**

Create `src/lib/staticSnapshots.ts`:

```typescript
import type { SnapshotItem } from './itemSnapshot';
import type { SnapshotLeve } from './leveSnapshot';
import type { Recipe } from './recipes';
import type { GatheringInfo } from './gatheringCatalog';
import type { ShopEntry, SpecialShopSnapshot } from './specialShopSnapshot';
import type { CurrencyId } from './currencies';

const BASE = '/data/snapshots';

export interface StaticBundle<T> {
  data: T;
  bakedAt: number;
}

async function load<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function loadStaticItemsSnapshot(): Promise<StaticBundle<SnapshotItem[]> | null> {
  const raw = await load<{ bakedAt: number; items: SnapshotItem[] }>(`${BASE}/items.json`);
  return raw ? { bakedAt: raw.bakedAt, data: raw.items } : null;
}

export async function loadStaticLevesSnapshot(): Promise<StaticBundle<SnapshotLeve[]> | null> {
  const raw = await load<{ bakedAt: number; leves: SnapshotLeve[] }>(`${BASE}/leves.json`);
  return raw ? { bakedAt: raw.bakedAt, data: raw.leves } : null;
}

export async function loadStaticRecipesSnapshot(): Promise<StaticBundle<Map<number, Recipe>> | null> {
  const raw = await load<{ bakedAt: number; entries: Array<[number, Recipe]> }>(`${BASE}/recipes.json`);
  return raw ? { bakedAt: raw.bakedAt, data: new Map(raw.entries) } : null;
}

export async function loadStaticVendorSnapshot(): Promise<StaticBundle<Map<number, number>> | null> {
  const raw = await load<{ bakedAt: number; entries: Array<[number, number]> }>(`${BASE}/vendorShop.json`);
  return raw ? { bakedAt: raw.bakedAt, data: new Map(raw.entries) } : null;
}

export async function loadStaticSpecialShopSnapshot(): Promise<StaticBundle<SpecialShopSnapshot> | null> {
  const raw = await load<{ bakedAt: number; byCurrency: Array<[CurrencyId, ShopEntry[]]> }>(`${BASE}/specialShop.json`);
  return raw ? { bakedAt: raw.bakedAt, data: { byCurrency: new Map(raw.byCurrency) } } : null;
}

export async function loadStaticGatheringCatalog(): Promise<StaticBundle<Map<number, GatheringInfo>> | null> {
  const raw = await load<{ bakedAt: number; entries: Array<[number, GatheringInfo]> }>(`${BASE}/gathering.json`);
  return raw ? { bakedAt: raw.bakedAt, data: new Map(raw.entries) } : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/staticSnapshots.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/staticSnapshots.ts src/lib/staticSnapshots.test.ts
git commit -m "feat(snapshots): add static bundle loader

Browser-side loader for build-time-baked /data/snapshots/*.json files.
Returns null on 404 so hooks can fall through to the existing live
fetch path. Reconstitutes Maps for snapshots that use them."
```

---

### Task 4: Create the bake script

**Files:**
- Create: `scripts/bake-snapshots.ts`
- Create: `public/data/snapshots/.gitkeep`

The script runs once per FFXIV patch (or whenever the user wants to refresh data). It calls every `fetch*Snapshot` function the runtime uses, then writes the results to `public/data/snapshots/*.json` plus a `manifest.json`.

- [ ] **Step 1: Create the snapshots directory with a `.gitkeep`**

```bash
mkdir -p public/data/snapshots
```

Create empty file `public/data/snapshots/.gitkeep`.

- [ ] **Step 2: Write the bake script**

Create `scripts/bake-snapshots.ts`:

```typescript
/**
 * Bake static XIVAPI snapshots into public/data/snapshots/*.json.
 *
 * Run via `npm run snapshots`. Output is committed to the repo so users
 * download a single static bundle per dataset on first visit instead of
 * paginating 30+ XIVAPI requests.
 *
 * The runtime hooks fall back to live fetch if a bundle is missing, so
 * partial bakes are safe.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { fetchItemSnapshot } from '../src/lib/itemSnapshot';
import { fetchRecipeSnapshot } from '../src/lib/recipeSnapshot';
import { fetchLeveSnapshot } from '../src/lib/leveSnapshot';
import { fetchVendorSnapshot } from '../src/lib/vendorShopSnapshot';
import { fetchSpecialShopSnapshot } from '../src/lib/specialShopSnapshot';
import { buildGatheringCatalog } from '../src/lib/gatheringCatalog';
import { currencyByItemId } from '../src/lib/currencies';

const OUT_DIR = join(process.cwd(), 'public', 'data', 'snapshots');

function log(label: string, msg: string) {
  process.stdout.write(`[${label}] ${msg}\n`);
}

async function bakeItems(bakedAt: number) {
  log('items', 'fetching XIVAPI Item sheet…');
  const items = await fetchItemSnapshot({
    onProgress: (n) => process.stdout.write(`\r[items] ${n} rows…`),
  });
  process.stdout.write('\n');
  await writeFile(join(OUT_DIR, 'items.json'), JSON.stringify({ bakedAt, items }));
  log('items', `wrote ${items.length} items`);
  return items.length;
}

async function bakeRecipes(bakedAt: number) {
  log('recipes', 'fetching XIVAPI Recipe sheet…');
  const map = await fetchRecipeSnapshot({
    onProgress: (n) => process.stdout.write(`\r[recipes] ${n} recipes…`),
  });
  process.stdout.write('\n');
  await writeFile(join(OUT_DIR, 'recipes.json'), JSON.stringify({ bakedAt, entries: [...map.entries()] }));
  log('recipes', `wrote ${map.size} recipes`);
  return map.size;
}

async function bakeLeves(bakedAt: number) {
  log('leves', 'fetching XIVAPI Leve + CraftLeve sheets…');
  const leves = await fetchLeveSnapshot({
    onProgress: (n) => process.stdout.write(`\r[leves] ${n} leves…`),
  });
  process.stdout.write('\n');
  await writeFile(join(OUT_DIR, 'leves.json'), JSON.stringify({ bakedAt, leves }));
  log('leves', `wrote ${leves.length} leves`);
  return leves.length;
}

async function bakeVendor(bakedAt: number) {
  log('vendorShop', 'fetching XIVAPI GilShopItem sheet…');
  const map = await fetchVendorSnapshot({
    onProgress: (n) => process.stdout.write(`\r[vendorShop] ${n} entries…`),
  });
  process.stdout.write('\n');
  await writeFile(join(OUT_DIR, 'vendorShop.json'), JSON.stringify({ bakedAt, entries: [...map.entries()] }));
  log('vendorShop', `wrote ${map.size} vendor entries`);
  return map.size;
}

async function bakeSpecialShop(bakedAt: number) {
  log('specialShop', 'fetching XIVAPI SpecialShop sheet…');
  const snap = await fetchSpecialShopSnapshot(currencyByItemId, {
    onProgress: (n) => process.stdout.write(`\r[specialShop] ${n} entries…`),
  });
  process.stdout.write('\n');
  await writeFile(
    join(OUT_DIR, 'specialShop.json'),
    JSON.stringify({ bakedAt, byCurrency: [...snap.byCurrency.entries()] }),
  );
  const total = [...snap.byCurrency.values()].reduce((a, v) => a + v.length, 0);
  log('specialShop', `wrote ${total} entries across ${snap.byCurrency.size} currencies`);
  return total;
}

async function bakeGathering(bakedAt: number) {
  log('gathering', 'building gathering catalog (4-sheet join)…');
  const map = await buildGatheringCatalog({ onProgress: (msg) => log('gathering', msg) });
  await writeFile(join(OUT_DIR, 'gathering.json'), JSON.stringify({ bakedAt, entries: [...map.entries()] }));
  log('gathering', `wrote ${map.size} gathering items`);
  return map.size;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const bakedAt = Date.now();
  const bakedAtIso = new Date(bakedAt).toISOString();

  const [items, recipes, leves, vendor, special, gathering] = [
    await bakeItems(bakedAt),
    await bakeRecipes(bakedAt),
    await bakeLeves(bakedAt),
    await bakeVendor(bakedAt),
    await bakeSpecialShop(bakedAt),
    await bakeGathering(bakedAt),
  ];

  const manifest = {
    bakedAt,
    bakedAtIso,
    counts: { items, recipes, leves, vendorShop: vendor, specialShop: special, gathering },
  };
  await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log('manifest', `bake complete at ${bakedAtIso}`);
}

main().catch((err) => {
  process.stderr.write(`\nbake failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
```

- [ ] **Step 3: Smoke-run the script**

Run: `npm run snapshots`
Expected:
- Six log lines, one per snapshot, each reporting non-zero counts.
- `public/data/snapshots/` contains: `items.json`, `recipes.json`, `leves.json`, `vendorShop.json`, `specialShop.json`, `gathering.json`, `manifest.json`.
- `manifest.json` parses and shows roughly: items ~16k, recipes ~9k, leves ~3k, vendor ~5k, special ~hundreds, gathering ~2k.
- Total run time: 1–3 minutes (paginated XIVAPI fetches).

If the run fails partway through, the partial JSON files are still safe — the runtime falls back to live fetch for any missing bundle.

- [ ] **Step 4: Commit the script and the first bake output**

```bash
git add scripts/bake-snapshots.ts public/data/snapshots
git commit -m "feat(snapshots): add bake-snapshots script and initial bundle

Run via 'npm run snapshots'. Imports the existing fetch*Snapshot
functions and writes JSON to public/data/snapshots/. Refresh by
re-running the script after a game patch and committing the diff."
```

---

## Phase B — Wire one snapshot end-to-end (items)

### Task 5: Add static fallback to `useItemSnapshot`

**Files:**
- Modify: `src/features/queries/useItemSnapshot.ts`
- Create: `src/features/queries/useItemSnapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/queries/useItemSnapshot.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useItemSnapshot } from './useItemSnapshot';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/itemSnapshot';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const sampleItems = [{ id: 1, name: 'A', sc: 1, ui: 1, ilvl: 1, canHq: false }];

afterEach(() => { vi.restoreAllMocks(); });

describe('useItemSnapshot', () => {
  it('prefers IDB cache when populated', async () => {
    vi.spyOn(cache, 'getAllCachedItems').mockResolvedValue(sampleItems);
    vi.spyOn(cache, 'getItemSnapshotUpdatedAt').mockResolvedValue(123);
    const live$ = vi.spyOn(live, 'fetchItemSnapshot').mockResolvedValue([]);
    const static$ = vi.spyOn(staticLoader, 'loadStaticItemsSnapshot').mockResolvedValue(null);

    const { result } = renderHook(() => useItemSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.items).toEqual(sampleItems);
    expect(live$).not.toHaveBeenCalled();
    expect(static$).not.toHaveBeenCalled();
  });

  it('falls back to static bundle when cache empty', async () => {
    vi.spyOn(cache, 'getAllCachedItems').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedItems').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticItemsSnapshot').mockResolvedValue({ bakedAt: 999, data: sampleItems });
    const live$ = vi.spyOn(live, 'fetchItemSnapshot').mockResolvedValue([]);

    const { result } = renderHook(() => useItemSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.items).toEqual(sampleItems);
    expect(result.current.data!.updatedAt).toBe(999);
    expect(put).toHaveBeenCalledWith(sampleItems, 999);
    expect(live$).not.toHaveBeenCalled();
  });

  it('falls back to live fetch when no cache or static bundle', async () => {
    vi.spyOn(cache, 'getAllCachedItems').mockResolvedValue(undefined);
    vi.spyOn(cache, 'putCachedItems').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticItemsSnapshot').mockResolvedValue(null);
    const live$ = vi.spyOn(live, 'fetchItemSnapshot').mockResolvedValue(sampleItems);

    const { result } = renderHook(() => useItemSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.items).toEqual(sampleItems);
    expect(live$).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/queries/useItemSnapshot.test.ts`
Expected: FAIL on the "falls back to static bundle" case — the hook doesn't consult `loadStaticItemsSnapshot` yet.

- [ ] **Step 3: Modify the hook**

Replace the contents of `src/features/queries/useItemSnapshot.ts`:

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getAllCachedItems,
  putCachedItems,
  clearItemCache,
  getItemSnapshotUpdatedAt,
} from '../../lib/recipeCache';
import { fetchItemSnapshot, type SnapshotItem } from '../../lib/itemSnapshot';
import { loadStaticItemsSnapshot } from '../../lib/staticSnapshots';

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

      const bundled = await loadStaticItemsSnapshot();
      if (bundled) {
        await putCachedItems(bundled.data, bundled.bakedAt);
        return { items: bundled.data, updatedAt: bundled.bakedAt };
      }

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/queries/useItemSnapshot.test.ts`
Expected: PASS — all 3 cases.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`
- Open app in incognito (no IDB).
- DevTools → Network → confirm a single GET to `/data/snapshots/items.json` happens, and NO calls to `v2.xivapi.com/api/sheet/Item`.
- The Settings page "Item catalog" row should show a timestamp equal to the manifest bake time, not "now".

- [ ] **Step 6: Commit**

```bash
git add src/features/queries/useItemSnapshot.ts src/features/queries/useItemSnapshot.test.ts
git commit -m "feat(items): consult static bundle before live XIVAPI fetch

First-load now resolves from /data/snapshots/items.json in one request
instead of paginating 32+ XIVAPI pages. IDB cache and live-fetch
fallback paths are unchanged."
```

---

## Phase C — Wire the remaining five snapshots

Each of Tasks 6–10 follows the same pattern as Task 5. The repeated code below is intentional — these tasks are designed to be dispatched to parallel subagents and may be read out of order.

### Task 6: Add static fallback to `useRecipeSnapshot`

**Files:**
- Modify: `src/features/queries/useRecipeSnapshot.ts`
- Create: `src/features/queries/useRecipeSnapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/queries/useRecipeSnapshot.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useRecipeSnapshot } from './useRecipeSnapshot';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/recipeSnapshot';
import type { Recipe } from '../../lib/recipes';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const sample: Array<[number, Recipe]> = [[1, { itemResultId: 1 } as Recipe]];

afterEach(() => { vi.restoreAllMocks(); });

describe('useRecipeSnapshot', () => {
  it('falls back to static bundle when IDB cache empty', async () => {
    vi.spyOn(cache, 'getCachedRecipeSnapshot').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedRecipeSnapshot').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticRecipesSnapshot').mockResolvedValue({ bakedAt: 555, data: new Map(sample) });
    const live$ = vi.spyOn(live, 'fetchRecipeSnapshot').mockResolvedValue(new Map());

    const { result } = renderHook(() => useRecipeSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect([...result.current.data!.entries()]).toEqual(sample);
    expect(put).toHaveBeenCalledWith(sample, 555);
    expect(live$).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run src/features/queries/useRecipeSnapshot.test.ts`
Expected: FAIL — `loadStaticRecipesSnapshot` not consulted.

- [ ] **Step 3: Modify the hook**

Replace the contents of `src/features/queries/useRecipeSnapshot.ts`:

```typescript
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRecipeSnapshot, type RecipeMap } from '../../lib/recipeSnapshot';
import { getCachedRecipeSnapshot, putCachedRecipeSnapshot } from '../../lib/recipeCache';
import { loadStaticRecipesSnapshot } from '../../lib/staticSnapshots';

async function resolve(setProgress: (n: number) => void): Promise<RecipeMap> {
  const cached = await getCachedRecipeSnapshot();
  if (cached) return new Map(cached);

  const bundled = await loadStaticRecipesSnapshot();
  if (bundled) {
    await putCachedRecipeSnapshot([...bundled.data.entries()], bundled.bakedAt);
    return bundled.data;
  }

  const fresh = await fetchRecipeSnapshot({ onProgress: setProgress });
  await putCachedRecipeSnapshot([...fresh.entries()]);
  return fresh;
}

export function useRecipeSnapshot(enabled = true) {
  const [progress, setProgress] = useState(0);
  const query = useQuery<RecipeMap>({
    queryKey: ['recipe-snapshot'],
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: () => resolve(setProgress),
  });
  useEffect(() => { if (query.data) setProgress(0); }, [query.data]);
  return { ...query, progress };
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run src/features/queries/useRecipeSnapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/useRecipeSnapshot.ts src/features/queries/useRecipeSnapshot.test.ts
git commit -m "feat(recipes): consult static bundle before live XIVAPI fetch"
```

---

### Task 7: Add static fallback to `useLeveSnapshot`

**Files:**
- Modify: `src/features/queries/useLeveSnapshot.ts`
- Create: `src/features/queries/useLeveSnapshot.test.ts`

- [ ] **Step 1: Read the current hook to confirm shape**

Run: read `src/features/queries/useLeveSnapshot.ts` and note the exact `useQuery<{leves: ...; updatedAt: ...}>` shape and the IDB helpers used (`getCachedLeves`, `putCachedLeves`, `clearLeveCache`, `getLeveSnapshotUpdatedAt`). The structure mirrors `useItemSnapshot`.

- [ ] **Step 2: Write the failing test**

Create `src/features/queries/useLeveSnapshot.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useLeveSnapshot } from './useLeveSnapshot';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/leveSnapshot';
import type { SnapshotLeve } from '../../lib/leveSnapshot';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const sample: SnapshotLeve[] = [
  { id: 1, name: 'X', level: 50, type: 'doh', classJob: 8, city: 'Y', baseGil: 1, baseExp: 1, hqGilMultiplier: 2, targetItemId: null, targetItemQty: null },
];

afterEach(() => { vi.restoreAllMocks(); });

describe('useLeveSnapshot', () => {
  it('falls back to static bundle', async () => {
    vi.spyOn(cache, 'getCachedLeves').mockResolvedValue(undefined);
    vi.spyOn(cache, 'getLeveSnapshotUpdatedAt').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedLeves').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticLevesSnapshot').mockResolvedValue({ bakedAt: 777, data: sample });
    const live$ = vi.spyOn(live, 'fetchLeveSnapshot').mockResolvedValue([]);

    const { result } = renderHook(() => useLeveSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.leves).toEqual(sample);
    expect(result.current.data!.updatedAt).toBe(777);
    expect(put).toHaveBeenCalledWith(sample, 777);
    expect(live$).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test, verify failure**

Run: `npx vitest run src/features/queries/useLeveSnapshot.test.ts`
Expected: FAIL.

- [ ] **Step 4: Modify the hook**

Edit `src/features/queries/useLeveSnapshot.ts`. Insert the static-fallback block between the IDB cache check and the live `fetchLeveSnapshot` call. The new `queryFn` body should look like (preserving the existing shape and imports — only add `loadStaticLevesSnapshot` import and the middle block):

```typescript
queryFn: async () => {
  const cached = await getCachedLeves();
  const ts = await getLeveSnapshotUpdatedAt();
  if (cached) return { leves: cached, updatedAt: ts ?? null };

  const bundled = await loadStaticLevesSnapshot();
  if (bundled) {
    await putCachedLeves(bundled.data, bundled.bakedAt);
    return { leves: bundled.data, updatedAt: bundled.bakedAt };
  }

  const fresh = await fetchLeveSnapshot({ onProgress: (n) => progressRef.current(n) });
  await putCachedLeves(fresh);
  return { leves: fresh, updatedAt: Date.now() };
},
```

Add at top of file: `import { loadStaticLevesSnapshot } from '../../lib/staticSnapshots';`

- [ ] **Step 5: Run test, verify pass**

Run: `npx vitest run src/features/queries/useLeveSnapshot.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/queries/useLeveSnapshot.ts src/features/queries/useLeveSnapshot.test.ts
git commit -m "feat(leves): consult static bundle before live XIVAPI fetch"
```

---

### Task 8: Add static fallback to `useVendorShopSnapshot`

**Files:**
- Modify: `src/features/queries/useVendorShopSnapshot.ts`
- Create: `src/features/queries/useVendorShopSnapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/queries/useVendorShopSnapshot.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useVendorShopSnapshot } from './useVendorShopSnapshot';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/vendorShopSnapshot';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('useVendorShopSnapshot', () => {
  it('falls back to static bundle', async () => {
    const map = new Map([[10, 99]]);
    vi.spyOn(cache, 'getCachedVendorSnapshot').mockResolvedValue(undefined);
    vi.spyOn(cache, 'getVendorSnapshotUpdatedAt').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedVendorSnapshot').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticVendorSnapshot').mockResolvedValue({ bakedAt: 888, data: map });
    const live$ = vi.spyOn(live, 'fetchVendorSnapshot').mockResolvedValue(new Map());

    const { result } = renderHook(() => useVendorShopSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.snapshot.get(10)).toBe(99);
    expect(result.current.data!.updatedAt).toBe(888);
    expect(put).toHaveBeenCalledWith(map, 888);
    expect(live$).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run src/features/queries/useVendorShopSnapshot.test.ts`
Expected: FAIL.

- [ ] **Step 3: Modify the hook**

Edit `src/features/queries/useVendorShopSnapshot.ts`. Add import:

```typescript
import { loadStaticVendorSnapshot } from '../../lib/staticSnapshots';
```

Replace the `queryFn` body (preserving the surrounding `useQuery` config):

```typescript
queryFn: async () => {
  const cached = await getCachedVendorSnapshot();
  const ts = await getVendorSnapshotUpdatedAt();
  if (cached) return { snapshot: cached, updatedAt: ts ?? null };

  const bundled = await loadStaticVendorSnapshot();
  if (bundled) {
    await putCachedVendorSnapshot(bundled.data, bundled.bakedAt);
    return { snapshot: bundled.data, updatedAt: bundled.bakedAt };
  }

  const fresh = await fetchVendorSnapshot({ onProgress: (n) => progressRef.current(n) });
  await putCachedVendorSnapshot(fresh);
  return { snapshot: fresh, updatedAt: Date.now() };
},
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run src/features/queries/useVendorShopSnapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/useVendorShopSnapshot.ts src/features/queries/useVendorShopSnapshot.test.ts
git commit -m "feat(vendorShop): consult static bundle before live XIVAPI fetch"
```

---

### Task 9: Add static fallback to `useSpecialShopSnapshot`

**Files:**
- Modify: `src/features/queries/useSpecialShopSnapshot.ts`
- Create: `src/features/queries/useSpecialShopSnapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/queries/useSpecialShopSnapshot.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useSpecialShopSnapshot } from './useSpecialShopSnapshot';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/specialShopSnapshot';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('useSpecialShopSnapshot', () => {
  it('falls back to static bundle', async () => {
    const snap: SpecialShopSnapshot = {
      byCurrency: new Map([['poetics' as never, [{ itemId: 5, receiveQty: 1, costPerUnit: 100, isHq: false }]]]),
    };
    vi.spyOn(cache, 'getCachedSpecialShop').mockResolvedValue(undefined);
    vi.spyOn(cache, 'getSpecialShopUpdatedAt').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedSpecialShop').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticSpecialShopSnapshot').mockResolvedValue({ bakedAt: 444, data: snap });
    const live$ = vi.spyOn(live, 'fetchSpecialShopSnapshot').mockResolvedValue({ byCurrency: new Map() });

    const { result } = renderHook(() => useSpecialShopSnapshot(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.snapshot.byCurrency.size).toBe(1);
    expect(result.current.data!.updatedAt).toBe(444);
    expect(put).toHaveBeenCalledWith(snap, 444);
    expect(live$).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run src/features/queries/useSpecialShopSnapshot.test.ts`
Expected: FAIL.

- [ ] **Step 3: Modify the hook**

Edit `src/features/queries/useSpecialShopSnapshot.ts`. Add import:

```typescript
import { loadStaticSpecialShopSnapshot } from '../../lib/staticSnapshots';
```

Replace the `queryFn` body:

```typescript
queryFn: async () => {
  const cached = await getCachedSpecialShop();
  const ts = await getSpecialShopUpdatedAt();
  if (cached) return { snapshot: cached, updatedAt: ts ?? null };

  const bundled = await loadStaticSpecialShopSnapshot();
  if (bundled) {
    await putCachedSpecialShop(bundled.data, bundled.bakedAt);
    return { snapshot: bundled.data, updatedAt: bundled.bakedAt };
  }

  const fresh = await fetchSpecialShopSnapshot(currencyByItemId, { onProgress: (n) => progressRef.current(n) });
  await putCachedSpecialShop(fresh);
  return { snapshot: fresh, updatedAt: Date.now() };
},
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run src/features/queries/useSpecialShopSnapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/useSpecialShopSnapshot.ts src/features/queries/useSpecialShopSnapshot.test.ts
git commit -m "feat(specialShop): consult static bundle before live XIVAPI fetch"
```

---

### Task 10: Add static fallback to `useGatheringCatalog`

**Files:**
- Modify: `src/features/queries/useGatheringCatalog.ts`
- Create: `src/features/queries/useGatheringCatalog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/queries/useGatheringCatalog.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'fake-indexeddb/auto';
import React from 'react';

import { useGatheringCatalog } from './useGatheringCatalog';
import * as cache from '../../lib/recipeCache';
import * as staticLoader from '../../lib/staticSnapshots';
import * as live from '../../lib/gatheringCatalog';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('useGatheringCatalog', () => {
  it('falls back to static bundle', async () => {
    const map = new Map([[1, { level: 50, timed: false, hidden: false }]]);
    vi.spyOn(cache, 'getCachedGatheringCatalog').mockResolvedValue(undefined);
    const put = vi.spyOn(cache, 'putCachedGatheringCatalog').mockResolvedValue();
    vi.spyOn(staticLoader, 'loadStaticGatheringCatalog').mockResolvedValue({ bakedAt: 222, data: map });
    const live$ = vi.spyOn(live, 'buildGatheringCatalog').mockResolvedValue(new Map());

    const { result } = renderHook(() => useGatheringCatalog(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.get(1)?.level).toBe(50);
    expect(put).toHaveBeenCalledWith([[1, { level: 50, timed: false, hidden: false }]], 222);
    expect(live$).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run src/features/queries/useGatheringCatalog.test.ts`
Expected: FAIL.

- [ ] **Step 3: Read the current hook to confirm structure**

Read `src/features/queries/useGatheringCatalog.ts`. The pattern mirrors `useRecipeSnapshot` (Map-returning, queryKey `['gathering-catalog']`).

- [ ] **Step 4: Modify the hook**

Edit `src/features/queries/useGatheringCatalog.ts`. Add import:

```typescript
import { loadStaticGatheringCatalog } from '../../lib/staticSnapshots';
```

Modify the `resolve` function (or the equivalent in this hook — the structure mirrors `useRecipeSnapshot`):

```typescript
async function resolve(setProgress: (msg: string) => void): Promise<GatheringCatalog> {
  const cached = await getCachedGatheringCatalog();
  if (cached) return new Map(cached);

  const bundled = await loadStaticGatheringCatalog();
  if (bundled) {
    await putCachedGatheringCatalog([...bundled.data.entries()], bundled.bakedAt);
    return bundled.data;
  }

  const fresh = await buildGatheringCatalog({ onProgress: setProgress });
  await putCachedGatheringCatalog([...fresh.entries()]);
  return fresh;
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `npx vitest run src/features/queries/useGatheringCatalog.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/queries/useGatheringCatalog.ts src/features/queries/useGatheringCatalog.test.ts
git commit -m "feat(gathering): consult static bundle before live XIVAPI fetch"
```

---

## Phase D — Final verification

### Task 11: Full smoke test + lint + typecheck

**Files:** none modified — this is a verification pass.

- [ ] **Step 1: Run all tests**

Run: `npm test -- --run`
Expected: All tests pass — full suite is green.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: zero warnings or errors.

- [ ] **Step 4: Cold-start browser smoke test**

Run: `npm run dev`
- Open the app in an incognito window (clears IDB).
- DevTools → Network filter `xivapi.com`:
  - Should see ZERO requests on first page load for items/recipes/leves/vendorShop/specialShop/gathering — only `/data/snapshots/*.json`.
  - Universalis market data requests are unchanged (still live).
- Settings page → Data caches table: each row's "Last fetched" should show the bake time (`manifest.json bakedAt`), not the current time.
- Click "Refresh" on the Item catalog row → confirm it now hits XIVAPI (network tab shows v2.xivapi.com requests) and rewrites IDB.

- [ ] **Step 5: Verify build artifact**

Run: `npm run build`
Expected: `dist/data/snapshots/items.json` (and siblings) exist in the build output.

- [ ] **Step 6: Commit any nits found during smoke test**

If the smoke test surfaced issues, fix them as separate commits. If everything is clean, no commit needed for this task.

---

## Refresh workflow (for the user, post-merge)

When FFXIV gets a new patch:

```bash
npm run snapshots          # re-fetches all six datasets, ~1-3 min
git diff public/data/snapshots/manifest.json   # sanity-check counts
git add public/data/snapshots
git commit -m "data: refresh snapshots for patch X.Y"
```

That's the whole refresh loop. No CI, no servers, no schedule.
