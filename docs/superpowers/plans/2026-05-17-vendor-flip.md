# NPC Vendor Flip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone `/vendor-flip` route that scans gil-shop NPC items and ranks them by home-world MB profit, plus a small "Vendor source" card on `/item/:id` that reuses the same vendor snapshot.

**Architecture:** A new XIVAPI v2 `GilShopItem` snapshot cached in IDB v8 (`gilShop` store) feeds two consumers: a pure `runVendorFlip` compute (snapshot + Universalis home-world prices → ranked rows) consumed by `VendorFlipView`, and a `VendorSourceCard` on `/item/:id` that renders the vendor price + comparison to the current trusted home-world sale tier. Profit math mirrors `runCraftFlip`'s `pickTrustedSaleTier` (with `hq: 'either'` picking max of NQ/HQ).

**Tech Stack:** TypeScript, React, TanStack Query (snapshot hook + mutation for scan), Zustand (`useSettingsStore` for home world), Vitest + React Testing Library, Tailwind, IDB via `idb` lib.

**IMPORTANT GIT SAFETY RULE for implementers:** Do NOT run `git checkout`, `git reset`, `git stash`, `git clean`, `git rebase`, `git restore`, `git switch`. Only `git add`, `git commit`, `git log`, `git diff`, `git show`, `git status`, `git cat-file`, `git fsck` are allowed.

---

## Task 1: IDB v8 + gilShop store + cache helpers

**Files:**
- Modify: `src/lib/recipeCache.ts`
- Test: `src/lib/recipeCache.gilShop.test.ts`

Note for the implementer:
- The existing pattern (see `LEVE_STORE` block around lines 16 / 45 / 180-201 of `recipeCache.ts`) is: a dedicated object store gets the serialized snapshot under a single key, and the timestamp lives in `META_STORE`. Follow that pattern exactly.
- Bump `DB_VERSION` from 7 → 8 and add the new `gilShop` store inside `upgrade()`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/recipeCache.gilShop.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedVendorSnapshot,
  putCachedVendorSnapshot,
  clearVendorSnapshotCache,
  getVendorSnapshotUpdatedAt,
} from './recipeCache';

beforeEach(async () => {
  // Reset between tests: clear our store so we start empty.
  await clearVendorSnapshotCache();
});

describe('recipeCache gilShop store', () => {
  it('returns undefined when no snapshot cached', async () => {
    expect(await getCachedVendorSnapshot()).toBeUndefined();
    expect(await getVendorSnapshotUpdatedAt()).toBeUndefined();
  });

  it('round-trips a Map<itemId, price>', async () => {
    const m = new Map<number, number>([[5, 9], [4594, 108]]);
    await putCachedVendorSnapshot(m);
    const out = await getCachedVendorSnapshot();
    expect(out).toBeInstanceOf(Map);
    expect(out!.get(5)).toBe(9);
    expect(out!.get(4594)).toBe(108);
    expect(out!.size).toBe(2);
  });

  it('sets updatedAt timestamp on put', async () => {
    const before = Date.now();
    await putCachedVendorSnapshot(new Map([[1, 1]]));
    const ts = await getVendorSnapshotUpdatedAt();
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it('clear empties the store + drops the timestamp', async () => {
    await putCachedVendorSnapshot(new Map([[1, 1]]));
    await clearVendorSnapshotCache();
    expect(await getCachedVendorSnapshot()).toBeUndefined();
    expect(await getVendorSnapshotUpdatedAt()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/recipeCache.gilShop.test.ts`
Expected: FAIL — the cache helpers (`getCachedVendorSnapshot`, etc.) don't exist yet.

- [ ] **Step 3: Bump DB version + add store + add helpers**

Edit `src/lib/recipeCache.ts`. Make the following four changes:

(a) Bump `DB_VERSION` (around line 8) from `7` to `8`:

```ts
const DB_VERSION = 8;
```

(b) Add the store constant near the other `*_STORE` declarations (around line 16):

```ts
const GILSHOP_STORE = 'gilShop';
```

(c) Inside `upgrade()` (around line 45), add a block alongside the existing store-creation guards:

```ts
if (!database.objectStoreNames.contains(GILSHOP_STORE)) {
  database.createObjectStore(GILSHOP_STORE);
}
```

(d) At the end of the file (after the existing Leve cache helpers around line 201), add:

```ts
const GILSHOP_SNAPSHOT_KEY = 'snapshot';
const GILSHOP_SNAPSHOT_TS_KEY = 'vendorSnapshotUpdatedAt';

export async function getCachedVendorSnapshot(): Promise<Map<number, number> | undefined> {
  const raw = await (await db()).get(GILSHOP_STORE, GILSHOP_SNAPSHOT_KEY) as Array<[number, number]> | undefined;
  if (!raw) return undefined;
  return new Map(raw);
}

export async function putCachedVendorSnapshot(snapshot: Map<number, number>): Promise<void> {
  const handle = await db();
  await handle.put(GILSHOP_STORE, [...snapshot.entries()], GILSHOP_SNAPSHOT_KEY);
  await handle.put(META_STORE, Date.now(), GILSHOP_SNAPSHOT_TS_KEY);
}

export async function clearVendorSnapshotCache(): Promise<void> {
  const handle = await db();
  await handle.clear(GILSHOP_STORE);
  await handle.delete(META_STORE, GILSHOP_SNAPSHOT_TS_KEY);
}

export async function getVendorSnapshotUpdatedAt(): Promise<number | undefined> {
  return (await db()).get(META_STORE, GILSHOP_SNAPSHOT_TS_KEY);
}
```

Note: serialization uses `[...map.entries()]` (a `[number, number][]` array) because `structuredClone` of a `Map` works in IDB but converting to a plain array is the existing pattern's lowest-friction path. The `getCachedVendorSnapshot` reconstructs the Map on read.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/recipeCache.gilShop.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite to confirm no regression from the DB version bump**

Run: `npx vitest run`
Expected: all tests pass (baseline 490 + 4 new = 494).

- [ ] **Step 6: Commit**

```bash
git add src/lib/recipeCache.ts src/lib/recipeCache.gilShop.test.ts
git commit -m "feat(cache): IDB v8 with gilShop store + vendor snapshot helpers"
```

---

## Task 2: vendorShopSnapshot fetcher + parser

**Files:**
- Create: `src/lib/vendorShopSnapshot.ts`
- Test: `src/lib/vendorShopSnapshot.test.ts`

Notes for the implementer:
- XIVAPI v2 endpoint shape (verified): `GET https://v2.xivapi.com/api/sheet/GilShopItem?fields=Item.PriceMid&limit=500&after=<lastRowId>`
- Each `row` has `{ row_id, subrow_id, fields: { Item: { value, fields: { PriceMid } } } }`. We only care about `value` (the itemId) and `PriceMid` (the gil cost).
- Pagination uses `row_id` cursor (mirrors `fetchItemSnapshot` in `src/lib/itemSnapshot.ts` and `fetchLeveSnapshot` in `src/lib/leveSnapshot.ts`). Stop when the page returns an empty `rows` array.
- Drop entries where `price <= 0` or `itemId <= 0` at parse time.
- Multiple gil shops can sell the same item (one row per shop); the price is identical across rows for a given itemId, so we dedupe by itemId using a `Map` (last write wins, all writes equal).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/vendorShopSnapshot.test.ts
import { describe, it, expect } from 'vitest';
import { parseGilShopPage, type RawGilShopPage } from './vendorShopSnapshot';

function page(rows: Array<{ row_id: number; itemId: number; price: number }>): RawGilShopPage {
  return {
    rows: rows.map((r, i) => ({
      row_id: r.row_id,
      subrow_id: i,
      fields: {
        Item: { value: r.itemId, fields: { PriceMid: r.price } },
      },
    })),
  };
}

describe('parseGilShopPage', () => {
  it('returns [] for an empty page', () => {
    expect(parseGilShopPage({ rows: [] })).toEqual([]);
    expect(parseGilShopPage({})).toEqual([]);
  });

  it('extracts { itemId, price } entries', () => {
    const raw = page([
      { row_id: 262144, itemId: 4594, price: 108 },
      { row_id: 262145, itemId: 4595, price: 108 },
    ]);
    expect(parseGilShopPage(raw)).toEqual([
      { itemId: 4594, price: 108 },
      { itemId: 4595, price: 108 },
    ]);
  });

  it('drops rows where price <= 0', () => {
    const raw = page([
      { row_id: 1, itemId: 100, price: 0 },
      { row_id: 2, itemId: 101, price: -5 },
      { row_id: 3, itemId: 102, price: 50 },
    ]);
    expect(parseGilShopPage(raw)).toEqual([{ itemId: 102, price: 50 }]);
  });

  it('drops rows where itemId <= 0', () => {
    const raw = page([
      { row_id: 1, itemId: 0, price: 100 },
      { row_id: 2, itemId: -1, price: 200 },
      { row_id: 3, itemId: 5, price: 9 },
    ]);
    expect(parseGilShopPage(raw)).toEqual([{ itemId: 5, price: 9 }]);
  });

  it('handles missing Item field gracefully', () => {
    const raw: RawGilShopPage = { rows: [
      { row_id: 1, subrow_id: 0, fields: {} },
    ] };
    expect(parseGilShopPage(raw)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/vendorShopSnapshot.test.ts`
Expected: FAIL — `Cannot find module './vendorShopSnapshot'`.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/vendorShopSnapshot.ts
const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const FIELDS = 'Item.PriceMid';

export interface VendorSnapshotEntry {
  itemId: number;
  price: number;
}

interface RawGilShopItemField {
  value?: number;
  fields?: { PriceMid?: number };
}
interface RawGilShopRow {
  row_id: number;
  subrow_id?: number;
  fields: { Item?: RawGilShopItemField };
}
export interface RawGilShopPage { rows?: RawGilShopRow[] }

export function parseGilShopPage(raw: RawGilShopPage): VendorSnapshotEntry[] {
  const out: VendorSnapshotEntry[] = [];
  for (const r of raw.rows ?? []) {
    const itemId = r.fields.Item?.value ?? 0;
    const price = r.fields.Item?.fields?.PriceMid ?? 0;
    if (itemId <= 0) continue;
    if (price <= 0) continue;
    out.push({ itemId, price });
  }
  return out;
}

export interface FetchVendorSnapshotOpts {
  pageSize?: number;
  onProgress?: (totalCollectedSoFar: number) => void;
}

function buildPageUrl(after: number, pageSize: number): string {
  const params = new URLSearchParams({ fields: FIELDS, limit: String(pageSize) });
  if (after > 0) params.set('after', String(after));
  return `${BASE.replace(/\/$/, '')}/api/sheet/GilShopItem?${params.toString()}`;
}

export async function fetchVendorSnapshot(opts: FetchVendorSnapshotOpts = {}): Promise<Map<number, number>> {
  const pageSize = opts.pageSize ?? 500;
  const out = new Map<number, number>();
  let cursor = 0;
  while (true) {
    const res = await fetch(buildPageUrl(cursor, pageSize));
    if (!res.ok) throw new Error(`XIVAPI GilShopItem ${res.status}`);
    const raw = (await res.json()) as RawGilShopPage;
    const rows = raw.rows ?? [];
    if (rows.length === 0) break;
    for (const entry of parseGilShopPage(raw)) {
      out.set(entry.itemId, entry.price); // dedupe — all writes for same id are equal
    }
    opts.onProgress?.(out.size);
    cursor = rows[rows.length - 1].row_id;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/vendorShopSnapshot.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vendorShopSnapshot.ts src/lib/vendorShopSnapshot.test.ts
git commit -m "feat(vendor): GilShopItem snapshot fetcher + parser"
```

---

## Task 3: useVendorShopSnapshot hook

**Files:**
- Create: `src/features/queries/useVendorShopSnapshot.ts`

Note for the implementer:
- Mirrors `src/features/queries/useLeveSnapshot.ts` structure exactly: IDB-first read, fetch on cache miss, persist on success, `staleTime: Infinity` (vendor catalog is patch-stable).
- No test file — this hook is a thin wrapper. Coverage comes from the route + view tests via mocked hook.

- [ ] **Step 1: Implement the hook**

```ts
// src/features/queries/useVendorShopSnapshot.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getCachedVendorSnapshot,
  putCachedVendorSnapshot,
  clearVendorSnapshotCache,
  getVendorSnapshotUpdatedAt,
} from '../../lib/recipeCache';
import { fetchVendorSnapshot } from '../../lib/vendorShopSnapshot';

const QUERY_KEY = ['vendorSnapshot'] as const;

export function useVendorShopSnapshot() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  const query = useQuery<{ vendors: Map<number, number>; updatedAt: number | null }>({
    queryKey: QUERY_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const cached = await getCachedVendorSnapshot();
      const ts = await getVendorSnapshotUpdatedAt();
      if (cached) return { vendors: cached, updatedAt: ts ?? null };
      const fresh = await fetchVendorSnapshot({ onProgress: (n) => progressRef.current(n) });
      await putCachedVendorSnapshot(fresh);
      return { vendors: fresh, updatedAt: Date.now() };
    },
  });

  return { ...query, progress };
}

export function useRefreshVendorShopSnapshot() {
  const qc = useQueryClient();
  return async () => {
    await clearVendorSnapshotCache();
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/useVendorShopSnapshot.ts
git commit -m "feat(vendor): useVendorShopSnapshot hook (IDB-first)"
```

---

## Task 4: VendorFlip types + default filter

**Files:**
- Modify: `src/features/queries/types.ts`
- Test: `src/features/queries/vendorFlipTypes.test.ts`

Note for the implementer:
- Add new exports alongside the existing `MaterialFlipFilter` block (around lines 86-130 of `types.ts`). Reuse the existing `HqMode` type.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/queries/vendorFlipTypes.test.ts
import { describe, it, expect } from 'vitest';
import { defaultVendorFlipFilter, type VendorFlipFilter, type VendorFlipSort } from './types';

describe('defaultVendorFlipFilter', () => {
  it('returns the documented defaults', () => {
    const f: VendorFlipFilter = defaultVendorFlipFilter();
    expect(f.searchCategories).toEqual([]);
    expect(f.minProfit).toBe(500);
    expect(f.minMarkup).toBe(2.0);
    expect(f.minVelocity).toBe(0.5);
    expect(f.maxListings).toBeNull();
    expect(f.hq).toBe('either');
    expect(f.sort).toBe<VendorFlipSort>('profitPerDay');
    expect(f.limit).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/queries/vendorFlipTypes.test.ts`
Expected: FAIL — `defaultVendorFlipFilter` not exported.

- [ ] **Step 3: Add the new types + factory to types.ts**

Append the following block at the end of `src/features/queries/types.ts`:

```ts
export type VendorFlipSort =
  | 'profitPerDay'
  | 'markup'
  | 'profitPerUnit'
  | 'salePrice'
  | 'velocity';

export interface VendorFlipFilter {
  searchCategories: number[];
  minProfit: number;        // gil/unit
  minMarkup: number;        // multiplier (e.g. 2.0 = 2× vendor price)
  minVelocity: number;      // sales/day
  maxListings: number | null;
  hq: HqMode;
  sort: VendorFlipSort;
  limit: number;
}

export interface VendorFlipRow {
  id: number;
  name: string;
  sc: number;
  vendorPrice: number;
  salePrice: number;
  hq: boolean;
  profitPerUnit: number;
  markup: number;           // tier.unit / vendorPrice
  profitPerDay: number;     // profitPerUnit × velocity
  velocity: number;
  listingCount: number;
}

export function defaultVendorFlipFilter(): VendorFlipFilter {
  return {
    searchCategories: [],
    minProfit: 500,
    minMarkup: 2.0,
    minVelocity: 0.5,
    maxListings: null,
    hq: 'either',
    sort: 'profitPerDay',
    limit: 200,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/queries/vendorFlipTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/types.ts src/features/queries/vendorFlipTypes.test.ts
git commit -m "feat(vendor): add VendorFlipFilter/Row/Sort types + default factory"
```

---

## Task 5: runVendorFlip pure compute

**Files:**
- Create: `src/features/queries/runVendorFlip.ts`
- Test: `src/features/queries/runVendorFlip.test.ts`

Notes for the implementer:
- The `pickTrustedSaleTier` helper exists in `src/features/queries/runMaterialFlip.ts` (lines 8-26). For v1, **inline-copy** it into the new module rather than refactoring it out — extraction is on the deferred-cleanup list and would balloon this task's blast radius.
- `MIN_RECENT_SALES` and `MAX_LISTING_RATIO` are exported from `src/lib/priceTrust.ts` — import directly.
- The full `MarketItem` type lives in `src/lib/universalis.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/queries/runVendorFlip.test.ts
import { describe, it, expect } from 'vitest';
import { runVendorFlip } from './runVendorFlip';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { defaultVendorFlipFilter } from './types';

function mkSnap(id: number, name: string, canHq = true, sc = 1): SnapshotItem {
  return { id, name, sc, ui: 1, ilvl: 1, canHq };
}

function mkMarket(opts: {
  minNQ?: number | null; minHQ?: number | null;
  medianNQ?: number | null; medianHQ?: number | null;
  recentNQ?: number; recentHQ?: number;
  velocity?: number; listingCount?: number;
}): MarketItem {
  return {
    minNQ: opts.minNQ ?? null,
    minHQ: opts.minHQ ?? null,
    avgNQ: null, avgHQ: null,
    medianNQ: opts.medianNQ ?? opts.minNQ ?? null,
    medianHQ: opts.medianHQ ?? opts.minHQ ?? null,
    recentSalesNQ: opts.recentNQ ?? 10,
    recentSalesHQ: opts.recentHQ ?? 10,
    velocity: opts.velocity ?? 5,
    lastUploadTime: 0,
    listingCount: opts.listingCount ?? 5,
    worldListings: [],
    averagePriceNQ: null, averagePriceHQ: null,
  };
}

describe('runVendorFlip', () => {
  it('returns [] for empty snapshot', () => {
    const rows = runVendorFlip([], new Map(), {}, defaultVendorFlipFilter());
    expect(rows).toEqual([]);
  });

  it('excludes items not in the vendor map', () => {
    const snap = [mkSnap(100, 'X')];
    const prices: MarketData = { 100: mkMarket({ minNQ: 5000 }) };
    const rows = runVendorFlip(snap, new Map(), prices, defaultVendorFlipFilter());
    expect(rows).toEqual([]);
  });

  it('excludes items with no trusted sale tier', () => {
    const snap = [mkSnap(100, 'X')];
    const vendors = new Map([[100, 100]]);
    // No minNQ/minHQ → pickTrustedSaleTier returns null
    const prices: MarketData = { 100: mkMarket({}) };
    const rows = runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter());
    expect(rows).toEqual([]);
  });

  it('includes a profitable NQ flip and computes derived fields', () => {
    const snap = [mkSnap(100, 'Widget', false)];   // canHq=false so HQ tier never considered
    const vendors = new Map([[100, 100]]);          // vendor sells for 100 gil
    const prices: MarketData = { 100: mkMarket({ minNQ: 1000, medianNQ: 1000, recentNQ: 20, velocity: 2 }) };
    const rows = runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter());
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.id).toBe(100);
    expect(r.vendorPrice).toBe(100);
    expect(r.salePrice).toBe(1000);
    expect(r.hq).toBe(false);
    expect(r.profitPerUnit).toBe(900);
    expect(r.markup).toBeCloseTo(10);
    expect(r.profitPerDay).toBeCloseTo(1800);     // 900 × 2
    expect(r.velocity).toBe(2);
  });

  it('hq:"either" picks the higher trusted tier (HQ when item.canHq && minHQ is higher)', () => {
    const snap = [mkSnap(100, 'Widget', true)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({
      minNQ: 800, medianNQ: 800,
      minHQ: 2000, medianHQ: 2000,
    }) };
    const rows = runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter());
    expect(rows).toHaveLength(1);
    expect(rows[0].hq).toBe(true);
    expect(rows[0].salePrice).toBe(2000);
  });

  it('hq:"either" falls back to NQ when item is not HQ-capable', () => {
    const snap = [mkSnap(100, 'Widget', false)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({
      minNQ: 800, medianNQ: 800,
      minHQ: 2000, medianHQ: 2000,   // present but item is not canHq → ignored
    }) };
    const rows = runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter());
    expect(rows[0].hq).toBe(false);
    expect(rows[0].salePrice).toBe(800);
  });

  it('hq:"hq" requires item.canHq and an HQ tier — excludes NQ-only items', () => {
    const snap = [mkSnap(100, 'NQ Only', false)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({ minNQ: 1000, medianNQ: 1000 }) };
    const filter = { ...defaultVendorFlipFilter(), hq: 'hq' as const };
    expect(runVendorFlip(snap, vendors, prices, filter)).toEqual([]);
  });

  it('excludes rows below minProfit', () => {
    const snap = [mkSnap(100, 'X', false)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({ minNQ: 300, medianNQ: 300, velocity: 5 }) };
    // profitPerUnit = 200, minProfit default = 500 → excluded
    expect(runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter())).toEqual([]);
    // Loosen minProfit → included
    const loose = { ...defaultVendorFlipFilter(), minProfit: 100 };
    expect(runVendorFlip(snap, vendors, prices, loose)).toHaveLength(1);
  });

  it('excludes rows below minMarkup', () => {
    const snap = [mkSnap(100, 'X', false)];
    const vendors = new Map([[100, 1000]]);
    const prices: MarketData = { 100: mkMarket({ minNQ: 1800, medianNQ: 1800, velocity: 5 }) };
    // markup = 1.8×, default minMarkup = 2.0 → excluded
    expect(runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter())).toEqual([]);
    const loose = { ...defaultVendorFlipFilter(), minMarkup: 1.5 };
    expect(runVendorFlip(snap, vendors, prices, loose)).toHaveLength(1);
  });

  it('excludes rows below minVelocity', () => {
    const snap = [mkSnap(100, 'X', false)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 0.2 }) };
    expect(runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter())).toEqual([]);
  });

  it('excludes rows above maxListings when set', () => {
    const snap = [mkSnap(100, 'X', false)];
    const vendors = new Map([[100, 100]]);
    const prices: MarketData = { 100: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 5, listingCount: 100 }) };
    const tight = { ...defaultVendorFlipFilter(), maxListings: 50 };
    expect(runVendorFlip(snap, vendors, prices, tight)).toEqual([]);
    expect(runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter())).toHaveLength(1);
  });

  it('applies searchCategories filter when non-empty', () => {
    const snap = [mkSnap(100, 'A', false, 5), mkSnap(200, 'B', false, 7)];
    const vendors = new Map([[100, 50], [200, 50]]);
    const prices: MarketData = {
      100: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 5 }),
      200: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 5 }),
    };
    const filter = { ...defaultVendorFlipFilter(), searchCategories: [7] };
    const rows = runVendorFlip(snap, vendors, prices, filter);
    expect(rows.map((r) => r.id)).toEqual([200]);
  });

  it('sorts by profitPerDay desc by default with stable id tie-break', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false), mkSnap(3, 'C', false)];
    const vendors = new Map([[1, 100], [2, 100], [3, 100]]);
    const prices: MarketData = {
      1: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 1 }),  // profitPerDay 900
      2: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 5 }),  // profitPerDay 4500
      3: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 1 }),  // profitPerDay 900 — ties with 1, id 1 wins
    };
    const rows = runVendorFlip(snap, vendors, prices, defaultVendorFlipFilter());
    expect(rows.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('honors each sort mode', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false)];
    const vendors = new Map([[1, 100], [2, 500]]);
    const prices: MarketData = {
      1: mkMarket({ minNQ: 600, medianNQ: 600, velocity: 5 }),   // markup 6, profitPerUnit 500, profitPerDay 2500
      2: mkMarket({ minNQ: 2000, medianNQ: 2000, velocity: 1 }), // markup 4, profitPerUnit 1500, profitPerDay 1500
    };
    const base = { ...defaultVendorFlipFilter(), minProfit: 0, minMarkup: 1 };
    expect(runVendorFlip(snap, vendors, prices, { ...base, sort: 'profitPerDay' }).map((r) => r.id)).toEqual([1, 2]);
    expect(runVendorFlip(snap, vendors, prices, { ...base, sort: 'profitPerUnit' }).map((r) => r.id)).toEqual([2, 1]);
    expect(runVendorFlip(snap, vendors, prices, { ...base, sort: 'markup' }).map((r) => r.id)).toEqual([1, 2]);
    expect(runVendorFlip(snap, vendors, prices, { ...base, sort: 'salePrice' }).map((r) => r.id)).toEqual([2, 1]);
    expect(runVendorFlip(snap, vendors, prices, { ...base, sort: 'velocity' }).map((r) => r.id)).toEqual([1, 2]);
  });

  it('applies limit slice after sort', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false), mkSnap(3, 'C', false)];
    const vendors = new Map([[1, 100], [2, 100], [3, 100]]);
    const prices: MarketData = {
      1: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 1 }),
      2: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 5 }),
      3: mkMarket({ minNQ: 1000, medianNQ: 1000, velocity: 3 }),
    };
    const filter = { ...defaultVendorFlipFilter(), limit: 2 };
    const rows = runVendorFlip(snap, vendors, prices, filter);
    expect(rows.map((r) => r.id)).toEqual([2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/queries/runVendorFlip.test.ts`
Expected: FAIL — `Cannot find module './runVendorFlip'`.

- [ ] **Step 3: Implement the runner**

```ts
// src/features/queries/runVendorFlip.ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
import type { HqMode, VendorFlipFilter, VendorFlipRow, VendorFlipSort } from './types';

interface SaleTier { unit: number; isHq: boolean }

function pickTrustedSaleTier(m: MarketItem, hq: HqMode, canHq: boolean): SaleTier | null {
  const candidates: Array<{ rawMin: number | null; median: number | null; recent: number; isHq: boolean }> = [];
  if ((hq === 'hq' || hq === 'either') && canHq) {
    candidates.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  }
  if (hq === 'nq' || hq === 'either') {
    candidates.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  }
  // For 'either', score each candidate and pick the higher trusted price.
  let best: SaleTier | null = null;
  for (const c of candidates) {
    if (c.rawMin == null) continue;
    if (c.recent < MIN_RECENT_SALES) continue;
    if (c.median == null) continue;
    if (c.rawMin > c.median * MAX_LISTING_RATIO) continue;
    const unit = Math.min(c.rawMin, c.median);
    if (!best || unit > best.unit) best = { unit, isHq: c.isHq };
  }
  return best;
}

function compareRows(a: VendorFlipRow, b: VendorFlipRow, sort: VendorFlipSort): number {
  switch (sort) {
    case 'profitPerDay':  return b.profitPerDay - a.profitPerDay;
    case 'markup':        return b.markup - a.markup;
    case 'profitPerUnit': return b.profitPerUnit - a.profitPerUnit;
    case 'salePrice':     return b.salePrice - a.salePrice;
    case 'velocity':      return b.velocity - a.velocity;
  }
}

export function runVendorFlip(
  snapshot: SnapshotItem[],
  vendorMap: Map<number, number>,
  saleMap: MarketData,
  filter: VendorFlipFilter,
): VendorFlipRow[] {
  const out: VendorFlipRow[] = [];
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;

  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    const vendorPrice = vendorMap.get(item.id);
    if (vendorPrice == null) continue;

    const market = saleMap[item.id];
    if (!market) continue;
    if (market.velocity < filter.minVelocity) continue;
    if (filter.maxListings != null && market.listingCount > filter.maxListings) continue;

    const tier = pickTrustedSaleTier(market, filter.hq, item.canHq);
    if (!tier) continue;

    const profitPerUnit = tier.unit - vendorPrice;
    if (profitPerUnit < filter.minProfit) continue;
    const markup = tier.unit / vendorPrice;
    if (markup < filter.minMarkup) continue;

    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      vendorPrice,
      salePrice: tier.unit,
      hq: tier.isHq,
      profitPerUnit,
      markup,
      profitPerDay: profitPerUnit * market.velocity,
      velocity: market.velocity,
      listingCount: market.listingCount,
    });
  }

  out.sort((a, b) => {
    const cmp = compareRows(a, b, filter.sort);
    return cmp !== 0 ? cmp : a.id - b.id;  // stable tie-break by id asc
  });
  return out.slice(0, filter.limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/queries/runVendorFlip.test.ts`
Expected: PASS (all 13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/runVendorFlip.ts src/features/queries/runVendorFlip.test.ts
git commit -m "feat(vendor): runVendorFlip pure compute (filter + rank)"
```

---

## Task 6: VendorFlipResults sortable table component

**Files:**
- Create: `src/features/queries/VendorFlipResults.tsx`
- Test: `src/features/queries/VendorFlipResults.test.tsx`

Notes for the implementer:
- Mirror `src/features/queries/MaterialFlipResults.tsx` structure: uses `ResultTableScaffold`, `EmptyResults`, `SortableHeader`, CSV columns, `useUiStore`/`rowPadClass`. The same `SortableHeader` pattern is acceptable as an inline helper (matches MaterialFlipResults — extracted scaffold can wait).
- Columns (per spec): `#` | `Item` | `Vendor cost` | `Sale (HQ★)` | `Profit/u` | `Markup ×` | `Sales/day` | `Profit/day`. Items are clickable via `ItemNameLinks`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/queries/VendorFlipResults.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VendorFlipResults } from './VendorFlipResults';
import type { VendorFlipRow, VendorFlipSort } from './types';

const rows: VendorFlipRow[] = [
  { id: 100, name: 'Widget', sc: 1, vendorPrice: 100, salePrice: 1000, hq: false,
    profitPerUnit: 900, markup: 10, profitPerDay: 1800, velocity: 2, listingCount: 4 },
  { id: 200, name: 'Gizmo HQ', sc: 1, vendorPrice: 500, salePrice: 4000, hq: true,
    profitPerUnit: 3500, markup: 8, profitPerDay: 7000, velocity: 2, listingCount: 6 },
];

function renderResults(sort: VendorFlipSort = 'profitPerDay', onSortChange = vi.fn()) {
  return render(
    <MemoryRouter>
      <VendorFlipResults
        rows={rows}
        totalCandidates={50}
        skippedChunks={0}
        sort={sort}
        onSortChange={onSortChange}
      />
    </MemoryRouter>,
  );
}

describe('VendorFlipResults', () => {
  it('renders one row per VendorFlipRow with item name', () => {
    renderResults();
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('Gizmo HQ')).toBeInTheDocument();
  });

  it('renders an HQ glyph on HQ rows but not NQ rows', () => {
    renderResults();
    const widgetRow = screen.getByText('Widget').closest('tr')!;
    const gizmoRow = screen.getByText('Gizmo HQ').closest('tr')!;
    expect(within(gizmoRow).queryByText('HQ', { exact: false }) ?? within(gizmoRow).queryByLabelText(/HQ/i)).not.toBeNull();
    // Widget (NQ) should not show HQ marker
    expect(within(widgetRow).queryByLabelText(/HQ/i)).toBeNull();
  });

  it('shows empty state copy when rows is empty', () => {
    render(
      <MemoryRouter>
        <VendorFlipResults rows={[]} totalCandidates={0} skippedChunks={0} sort="profitPerDay" onSortChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no vendor flips/i)).toBeInTheDocument();
  });

  it('clicking a sortable header calls onSortChange with that sort key', () => {
    const onSortChange = vi.fn();
    renderResults('profitPerDay', onSortChange);
    fireEvent.click(screen.getByText(/markup/i));
    expect(onSortChange).toHaveBeenCalledWith('markup');
  });

  it('marks the active sort header with the gold style + arrow', () => {
    renderResults('markup');
    const header = screen.getByText(/markup/i).closest('th')!;
    expect(header.className).toMatch(/text-gold/);
    expect(header.textContent).toContain('▼');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/queries/VendorFlipResults.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// src/features/queries/VendorFlipResults.tsx
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { VendorFlipRow, VendorFlipSort } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: VendorFlipRow[];
  totalCandidates: number;
  skippedChunks: number;
  sort: VendorFlipSort;
  onSortChange: (next: VendorFlipSort) => void;
}

const CSV_COLUMNS: CsvColumn<VendorFlipRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'vendorPrice', label: 'Vendor Cost' },
  { key: 'salePrice', label: 'Sale Price' },
  { key: 'hq', label: 'HQ' },
  { key: 'profitPerUnit', label: 'Profit/unit' },
  { key: 'markup', label: 'Markup', value: (r) => Number(r.markup.toFixed(2)) },
  { key: 'profitPerDay', label: 'Profit/day' },
  { key: 'velocity', label: 'Velocity (sales/day)' },
  { key: 'listingCount', label: 'Listings' },
];

function SortableHeader({
  active, onClick, children, align = 'right', hideOnMobile = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  hideOnMobile?: boolean;
}) {
  const tail = active ? ' ▼' : '';
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none text-${align} ${
        hideOnMobile ? 'hidden md:table-cell' : ''
      } ${active ? 'text-gold' : 'text-text-dim hover:text-aether'}`}
      onClick={onClick}
    >
      {children}{tail}
    </th>
  );
}

export function VendorFlipResults({ rows, totalCandidates, skippedChunks, sort, onSortChange }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={
        <EmptyResults>
          No vendor flips match these filters. Try lowering Min profit, lowering Min markup, or loosening velocity.
        </EmptyResults>
      }
      csvColumns={CSV_COLUMNS}
      csvFilename={`vendor-flip-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2 text-text-dim">#</th>
              <th className="text-left px-3 py-2 text-text-dim">Item</th>
              <th className="text-right px-3 py-2 text-text-dim">Vendor cost</th>
              <SortableHeader active={sort === 'salePrice'} onClick={() => onSortChange('salePrice')}>Sale</SortableHeader>
              <SortableHeader active={sort === 'profitPerUnit'} onClick={() => onSortChange('profitPerUnit')}>Profit/u</SortableHeader>
              <SortableHeader active={sort === 'markup'} onClick={() => onSortChange('markup')}>Markup ×</SortableHeader>
              <SortableHeader active={sort === 'velocity'} onClick={() => onSortChange('velocity')} hideOnMobile>Sales/day</SortableHeader>
              <SortableHeader active={sort === 'profitPerDay'} onClick={() => onSortChange('profitPerDay')}>Profit/day</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks id={r.id} name={r.name} />
                </td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{fmtGil(r.vendorPrice)}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>
                  {fmtGil(r.salePrice)}
                  {r.hq && <span aria-label="HQ" className="text-gold ml-1 inline-flex items-baseline"><HqStar /></span>}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right text-jade`}>{fmtGil(r.profitPerUnit)}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{r.markup.toFixed(2)}×</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} font-mono text-right text-jade`}>{fmtGil(Math.round(r.profitPerDay))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
```

(Note: "Vendor cost" is rendered as a plain `<th>` — not sortable — because vendor prices are fixed game-wide and sorting by them adds no value.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/queries/VendorFlipResults.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/VendorFlipResults.tsx src/features/queries/VendorFlipResults.test.tsx
git commit -m "feat(vendor): VendorFlipResults sortable table"
```

---

## Task 7: VendorFlipView orchestration + filter strip

**Files:**
- Create: `src/features/insights/VendorFlipView.tsx`
- Test: `src/features/insights/VendorFlipView.test.tsx`

Notes for the implementer:
- This view is significantly simpler than `MaterialFlipView` because there's only one Universalis fetch (home-world prices for the vendor-item set) — no ingredient pass.
- The candidate-id set comes from intersecting the item snapshot with the vendor map, after applying `searchCategories` and `hq` filters.
- Use the same `useMutation` pattern + `fetchInBatches` from `src/lib/universalisBulk.ts`.
- Filter strip: re-implement the FilterBar inline (small component). Five inputs: Min profit, Min markup, Min sales/day, Max listings, HQ mode (radio: NQ/HQ/Either), Sort dropdown, Run scan button.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/insights/VendorFlipView.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../queries/useItemSnapshot', () => ({
  useItemSnapshot: () => ({
    data: {
      items: [
        { id: 100, name: 'Widget', sc: 1, ui: 1, ilvl: 1, canHq: false },
        { id: 200, name: 'Gizmo', sc: 1, ui: 1, ilvl: 1, canHq: false },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('../queries/useVendorShopSnapshot', () => ({
  useVendorShopSnapshot: () => ({
    data: { vendors: new Map([[100, 100], [200, 100]]), updatedAt: 1700000000000 },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useRefreshVendorShopSnapshot: () => async () => {},
}));

vi.mock('../settings/store', () => ({
  useSettingsStore: () => ({ world: 'Phantom' }),
}));

const fetchMarketDataMock = vi.fn(async (_scope: string, ids: number[]) => {
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    out[String(id)] = {
      minNQ: 1000, minHQ: null,
      avgNQ: null, avgHQ: null,
      medianNQ: 1000, medianHQ: null,
      recentSalesNQ: 20, recentSalesHQ: 0,
      velocity: 2, lastUploadTime: 0, listingCount: 5,
      worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    };
  }
  return out;
});

vi.mock('../../lib/universalis', () => ({
  fetchMarketData: (...args: unknown[]) => fetchMarketDataMock(args[0] as string, args[1] as number[]),
}));

import { VendorFlipView } from './VendorFlipView';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VendorFlipView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMarketDataMock.mockClear();
});

describe('VendorFlipView', () => {
  it('renders the filter strip + initial idle state with candidate count', () => {
    renderView();
    expect(screen.getByRole('button', { name: /run scan/i })).toBeInTheDocument();
    expect(screen.getByText(/2 candidate items/i)).toBeInTheDocument();
  });

  it('runs the scan, fetches home-world prices, and renders rows', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /run scan/i }));
    await waitFor(() => {
      expect(screen.getByText('Widget')).toBeInTheDocument();
      expect(screen.getByText('Gizmo')).toBeInTheDocument();
    });
    expect(fetchMarketDataMock).toHaveBeenCalledWith('Phantom', expect.arrayContaining([100, 200]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/insights/VendorFlipView.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the view**

```tsx
// src/features/insights/VendorFlipView.tsx
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useVendorShopSnapshot, useRefreshVendorShopSnapshot } from '../queries/useVendorShopSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runVendorFlip } from '../queries/runVendorFlip';
import { VendorFlipResults } from '../queries/VendorFlipResults';
import { defaultVendorFlipFilter, type VendorFlipFilter, type VendorFlipSort, type HqMode } from '../queries/types';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

interface RunResult {
  saleMap: MarketData;
  skipped: number;
  filterAtRun: VendorFlipFilter;
}

export function VendorFlipView() {
  const { world } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const vendors = useVendorShopSnapshot();
  const refreshVendors = useRefreshVendorShopSnapshot();
  const [filter, setFilter] = useState<VendorFlipFilter>(defaultVendorFlipFilter());

  const candidateIds = useMemo(() => {
    if (!snapshot.data || !vendors.data) return [];
    const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
    const out: number[] = [];
    for (const item of snapshot.data.items) {
      if (!vendors.data.vendors.has(item.id)) continue;
      if (catSet && !catSet.has(item.sc)) continue;
      if (filter.hq === 'hq' && !item.canHq) continue;
      out.push(item.id);
    }
    return out;
  }, [snapshot.data, vendors.data, filter.searchCategories, filter.hq]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data || !vendors.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: sale.data, skipped: sale.errors.length, filterAtRun: filter };
    },
  });

  const rows = useMemo(() => {
    if (!snapshot.data || !vendors.data || !run.data) return [];
    return runVendorFlip(snapshot.data.items, vendors.data.vendors, run.data.saleMap, run.data.filterAtRun);
  }, [snapshot.data, vendors.data, run.data]);

  function onSortChange(next: VendorFlipSort) {
    setFilter({ ...filter, sort: next });
  }

  return (
    <div className="space-y-4">
      <FilterBar
        value={filter}
        onChange={setFilter}
        onRun={() => { run.reset(); run.mutate(); }}
        onRefreshVendors={async () => { await refreshVendors(); }}
        busy={run.isPending}
      />

      <div className="font-mono text-[10px] text-text-low">
        {vendors.isLoading
          ? 'Loading vendor catalog…'
          : `${candidateIds.length.toLocaleString()} candidate items`}
        {run.data && <> · {rows.length.toLocaleString()} results</>}
      </div>

      {vendors.isError && (
        <StatusBanner kind="error">Vendor catalog fetch failed: {(vendors.error as Error).message}</StatusBanner>
      )}
      {run.isPending && <Spinner label={`Fetching ${world} prices for ${candidateIds.length} items…`} />}
      {run.isError && <StatusBanner kind="error">Universalis fetch failed: {(run.error as Error).message}</StatusBanner>}
      {run.data && run.data.skipped > 0 && (
        <StatusBanner kind="error">{run.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {run.data && (
        <VendorFlipResults
          rows={rows}
          totalCandidates={candidateIds.length}
          skippedChunks={run.data.skipped}
          sort={run.data.filterAtRun.sort}
          onSortChange={onSortChange}
        />
      )}
    </div>
  );
}

function FilterBar({ value, onChange, onRun, onRefreshVendors, busy }: {
  value: VendorFlipFilter;
  onChange: (f: VendorFlipFilter) => void;
  onRun: () => void;
  onRefreshVendors: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min profit (gil/u)</span>
        <input
          type="number" min={0} step={100} value={value.minProfit}
          onChange={(e) => onChange({ ...value, minProfit: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min markup (×)</span>
        <input
          type="number" min={1} step={0.5} value={value.minMarkup}
          onChange={(e) => onChange({ ...value, minMarkup: Math.max(1, Number(e.target.value) || 1) })}
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min sales/day</span>
        <input
          type="number" min={0} step={0.1} value={value.minVelocity}
          onChange={(e) => onChange({ ...value, minVelocity: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Max listings</span>
        <input
          type="number" min={0} step={1} value={value.maxListings ?? ''}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ ...value, maxListings: Number.isFinite(n) && n > 0 ? n : null });
          }}
          placeholder="∞"
          className="mt-1 block w-28 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">HQ mode</span>
        <div className="flex gap-2">
          {(['nq', 'hq', 'either'] as HqMode[]).map((mode) => (
            <button
              key={mode} type="button"
              onClick={() => onChange({ ...value, hq: mode })}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
                value.hq === mode ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
              }`}
            >
              {mode === 'either' ? 'Either' : mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Sort</span>
        <select
          value={value.sort}
          onChange={(e) => onChange({ ...value, sort: e.target.value as VendorFlipSort })}
          className="mt-1 block bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        >
          <option value="profitPerDay">Profit/day</option>
          <option value="markup">Markup</option>
          <option value="profitPerUnit">Profit/unit</option>
          <option value="salePrice">Sale price</option>
          <option value="velocity">Velocity</option>
        </select>
      </label>
      <button
        type="button"
        onClick={onRun} disabled={busy}
        className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50"
      >
        {busy ? 'Running…' : 'Run scan'}
      </button>
      <button
        type="button"
        onClick={() => { void onRefreshVendors(); }}
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-aether hover:text-aether"
        title="Re-fetch the gil-shop catalog"
      >
        ⟳ Vendors
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/insights/VendorFlipView.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/VendorFlipView.tsx src/features/insights/VendorFlipView.test.tsx
git commit -m "feat(vendor): VendorFlipView orchestration + filter strip"
```

---

## Task 8: VendorSourceCard component

**Files:**
- Create: `src/features/items/VendorSourceCard.tsx`
- Test: `src/features/items/VendorSourceCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/items/VendorSourceCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VendorSourceCard } from './VendorSourceCard';
import type { MarketItem } from '../../lib/universalis';

function mkMarket(opts: { minNQ?: number | null; minHQ?: number | null; medianNQ?: number | null; medianHQ?: number | null; recentNQ?: number; recentHQ?: number }): MarketItem {
  return {
    minNQ: opts.minNQ ?? null,
    minHQ: opts.minHQ ?? null,
    avgNQ: null, avgHQ: null,
    medianNQ: opts.medianNQ ?? opts.minNQ ?? null,
    medianHQ: opts.medianHQ ?? opts.minHQ ?? null,
    recentSalesNQ: opts.recentNQ ?? 10,
    recentSalesHQ: opts.recentHQ ?? 10,
    velocity: 1, lastUploadTime: 0, listingCount: 5,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
  };
}

describe('VendorSourceCard', () => {
  it('renders the vendor price line', () => {
    render(<VendorSourceCard vendorPrice={108} homeMarket={undefined} canHq={true} worldLabel="Phantom" />);
    expect(screen.getByText(/Sold by NPC/i)).toBeInTheDocument();
    expect(screen.getByText(/108/)).toBeInTheDocument();
  });

  it('omits the profit comparison line when no trusted home tier exists', () => {
    render(<VendorSourceCard vendorPrice={108} homeMarket={undefined} canHq={true} worldLabel="Phantom" />);
    expect(screen.queryByText(/profit/i)).not.toBeInTheDocument();
  });

  it('shows the profit comparison line when a trusted HQ tier exists (canHq=true)', () => {
    const market = mkMarket({ minNQ: 500, minHQ: 4200, recentNQ: 20, recentHQ: 20 });
    render(<VendorSourceCard vendorPrice={108} homeMarket={market} canHq={true} worldLabel="Phantom" />);
    expect(screen.getByText(/Phantom HQ/i)).toBeInTheDocument();
    expect(screen.getByText(/4,200/)).toBeInTheDocument();
    expect(screen.getByText(/profit/i)).toBeInTheDocument();
    expect(screen.getByText(/4,092/)).toBeInTheDocument();
  });

  it('falls back to NQ tier when canHq=false', () => {
    const market = mkMarket({ minNQ: 600, recentNQ: 20 });
    render(<VendorSourceCard vendorPrice={100} homeMarket={market} canHq={false} worldLabel="Phantom" />);
    expect(screen.getByText(/Phantom NQ/i)).toBeInTheDocument();
    expect(screen.getByText(/600/)).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();   // profit
  });

  it('omits the profit line when sale tier is below trust threshold (e.g. zero recent sales)', () => {
    const market = mkMarket({ minNQ: 600, recentNQ: 0 });
    render(<VendorSourceCard vendorPrice={100} homeMarket={market} canHq={false} worldLabel="Phantom" />);
    expect(screen.queryByText(/profit/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/items/VendorSourceCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// src/features/items/VendorSourceCard.tsx
import type { MarketItem } from '../../lib/universalis';
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
import { fmtGil } from '../../lib/format';
import { SectionHeader } from '../../components/SectionHeader';

interface Props {
  vendorPrice: number;
  homeMarket: MarketItem | undefined;
  canHq: boolean;
  worldLabel: string;
}

function pickHigherTrustedTier(m: MarketItem, canHq: boolean): { unit: number; isHq: boolean } | null {
  const candidates: Array<{ rawMin: number | null; median: number | null; recent: number; isHq: boolean }> = [];
  if (canHq) candidates.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  candidates.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  let best: { unit: number; isHq: boolean } | null = null;
  for (const c of candidates) {
    if (c.rawMin == null) continue;
    if (c.recent < MIN_RECENT_SALES) continue;
    if (c.median == null) continue;
    if (c.rawMin > c.median * MAX_LISTING_RATIO) continue;
    const unit = Math.min(c.rawMin, c.median);
    if (!best || unit > best.unit) best = { unit, isHq: c.isHq };
  }
  return best;
}

export function VendorSourceCard({ vendorPrice, homeMarket, canHq, worldLabel }: Props) {
  const tier = homeMarket ? pickHigherTrustedTier(homeMarket, canHq) : null;
  const profit = tier ? tier.unit - vendorPrice : null;
  const profitClass = profit == null ? 'text-text-low'
    : profit > 0 ? 'text-jade'
    : profit < 0 ? 'text-crimson'
    : 'text-text-cream';

  return (
    <section>
      <SectionHeader label="Vendor source" compact />
      <div className="border border-border-base bg-bg-card p-4">
        <div className="text-sm">Sold by NPC: <span className="font-mono text-gold">{fmtGil(vendorPrice)}</span></div>
        {tier && profit != null && (
          <div className="text-xs text-text-low mt-1">
            (vs. {worldLabel} {tier.isHq ? 'HQ' : 'NQ'} <span className="font-mono">{fmtGil(tier.unit)}</span>
            {' · '}
            <span className={profitClass}>profit <span className="font-mono">{fmtGil(profit)}</span>/unit</span>)
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/items/VendorSourceCard.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/items/VendorSourceCard.tsx src/features/items/VendorSourceCard.test.tsx
git commit -m "feat(vendor): VendorSourceCard for /item/:id"
```

---

## Task 9: Wire VendorSourceCard into Item.tsx

**Files:**
- Modify: `src/routes/Item.tsx`

- [ ] **Step 1: Edit Item.tsx**

In [src/routes/Item.tsx](src/routes/Item.tsx), add imports near the top (alongside other feature imports):

```tsx
import { useVendorShopSnapshot } from '../features/queries/useVendorShopSnapshot';
import { VendorSourceCard } from '../features/items/VendorSourceCard';
```

In the `Item` component body, add a vendor lookup near the other hook calls (after the existing `market` line around line 61):

```tsx
const vendors = useVendorShopSnapshot();
const vendorPrice = valid && vendors.data?.vendors.get(itemId);
```

Render the card between `PricesBlock` and `SaleHistoryBlock` (around line 108-110). Find:

```tsx
      <PricesBlock
        worldLabel={world}
        dcLabel={dc}
        loading={market.isLoading}
        phantom={phantomMarket}
        dc={dcMarket}
      />

      <SaleHistoryBlock itemId={itemId} scope={dc} canHq={canHq} />
```

Insert between them:

```tsx
      {vendorPrice ? (
        <VendorSourceCard
          vendorPrice={vendorPrice}
          homeMarket={phantomMarket}
          canHq={canHq}
          worldLabel={world}
        />
      ) : null}
```

- [ ] **Step 2: Run the full test suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/routes/Item.tsx
git commit -m "feat(item): show VendorSourceCard when item is in gil-shop snapshot"
```

---

## Task 10: VendorFlip route + nav wiring

**Files:**
- Create: `src/routes/VendorFlip.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Create the route**

Create `src/routes/VendorFlip.tsx`:

```tsx
import { VendorFlipView } from '../features/insights/VendorFlipView';

export default function VendorFlip() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Vendor Flip</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Flip NPC gil-shop items on your home MB. Compare fixed vendor prices against your home-world sale tier and rank by profit/day.
        </p>
      </div>
      <VendorFlipView />
    </div>
  );
}
```

- [ ] **Step 2: Register the route in App.tsx**

In [src/App.tsx](src/App.tsx), add the import near the other route imports:

```tsx
import VendorFlip from './routes/VendorFlip';
```

And add the route inside `<Routes>` after the `/shopping-list` route:

```tsx
<Route path="/vendor-flip" element={<VendorFlip />} />
```

- [ ] **Step 3: Add NavLink to Header.tsx**

In [src/components/layout/Header.tsx](src/components/layout/Header.tsx), add a NavLink between the existing Shopping link (`/shopping-list`) and the GC Seals link (`/gc-seals`):

```tsx
<NavLink to="/vendor-flip" className={navClass}>Vendor flip</NavLink>
```

- [ ] **Step 4: Run typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/VendorFlip.tsx src/App.tsx src/components/layout/Header.tsx
git commit -m "feat(nav): register /vendor-flip route + NavLink"
```

---

## Task 11: Final verification

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: ALL tests pass. Baseline before this branch was 490; this plan adds ~32 new tests (Task 1: 4, Task 2: 5, Task 4: 1, Task 5: 13, Task 6: 5, Task 7: 2, Task 8: 5). Expected total ≈ 525.

- [ ] **Step 3: Browser smoke test**

Run: `npm run dev`

In the browser:
1. Visit `/vendor-flip` — vendor catalog spinner appears on first load. Wait for it to resolve. Filter strip + "Run scan" button appear.
2. Click "Run scan" — spinner appears, then results table populates with rows sorted by Profit/day desc. Verify HQ glyph appears on HQ rows. Click sortable headers — table reorders.
3. Loosen filters (Min profit to 0, Min markup to 1) — re-run; row count should grow.
4. Visit `/item/:id` for a known vendor item (e.g. Potion of Strength, item id 4594) — verify the "Vendor source" card appears between Prices and Sale history. Verify the profit comparison line is sensible (or absent if home market has no trusted tier).
5. Visit `/item/:id` for a non-vendor item (e.g. any craftable gear) — verify the card does NOT appear.
6. Visit the nav — verify "Vendor flip" NavLink between "Shopping" and (next gil-making nav item).

No commit needed for smoke testing unless bugs are found and fixed.
