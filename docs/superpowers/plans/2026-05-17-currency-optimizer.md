# Currency Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone `/currency-flip` route that ranks vendor items (sold by tomestone / scrip / MGP / Wolf Marks / Bicolor vendors) by home-world gil per currency-unit. Currency-agnostic from the start — single picker selects between 10 currencies.

**Architecture:** A new XIVAPI v2 `SpecialShop` snapshot cached in IDB v9 (`specialShop` store) feeds the pure `runCurrencyFlip` compute (snapshot + home-world prices + selected currency → ranked rows). View `CurrencyFlipView` at `/currency-flip` with currency picker + filter strip + sortable results table. Per-item drill on `/item/:id` is deferred follow-up.

**Tech Stack:** TypeScript, React, TanStack Query (snapshot hook + mutation for scan), Zustand (`useSettingsStore` for home world), Vitest + React Testing Library, Tailwind, IDB via `idb` lib.

**Verified at plan-writing time:** XIVAPI v2 `SpecialShop` schema confirmed via probe. Each row has an `Item[]` array of 60 deal slots; each slot has parallel arrays `Item[2]` (receive item ids — use `@as(raw)`), `ReceiveCount[2]`, `ReceiveHq[2]`, `ItemCost[3]` (cost item ids — use `@as(raw)`), `CurrencyCost[3]`. v1 only emits "pure" deals: exactly one non-zero receive slot + exactly one non-zero cost slot whose `ItemCost` matches a curated currency id. Hybrid (currency + gil) and multi-receive deals are dropped.

**IMPORTANT GIT SAFETY RULE for implementers:** Do NOT run `git checkout`, `git reset`, `git stash`, `git clean`, `git rebase`, `git restore`, `git switch`. Only `git add`, `git commit`, `git log`, `git diff`, `git show`, `git status`, `git cat-file`, `git fsck` are allowed.

---

## Task 1: IDB v9 + specialShop store + cache helpers

**Files:**
- Modify: `src/lib/recipeCache.ts`
- Test: `src/lib/recipeCache.specialShop.test.ts`

Pattern reference: the existing `LEVE_STORE` and `GILSHOP_STORE` blocks in `recipeCache.ts` (DB_VERSION bump → 9, dedicated store, single-key blob serialization, 4 helpers, timestamp in `META_STORE`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/recipeCache.specialShop.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedSpecialShop,
  putCachedSpecialShop,
  clearSpecialShopCache,
  getSpecialShopUpdatedAt,
} from './recipeCache';
import type { SpecialShopSnapshot } from './specialShopSnapshot';

beforeEach(async () => {
  await clearSpecialShopCache();
});

function mkSnapshot(): SpecialShopSnapshot {
  return {
    byCurrency: new Map([
      ['poetics', [
        { itemId: 4729, receiveQty: 1, costPerUnit: 1, isHq: false },
        { itemId: 4551, receiveQty: 99, costPerUnit: 1.5, isHq: false },
      ]],
      ['mgp', [
        { itemId: 9999, receiveQty: 1, costPerUnit: 50000, isHq: true },
      ]],
    ]),
  };
}

describe('recipeCache specialShop store', () => {
  it('returns undefined when no snapshot cached', async () => {
    expect(await getCachedSpecialShop()).toBeUndefined();
    expect(await getSpecialShopUpdatedAt()).toBeUndefined();
  });

  it('round-trips a SpecialShopSnapshot preserving Map semantics', async () => {
    await putCachedSpecialShop(mkSnapshot());
    const out = await getCachedSpecialShop();
    expect(out).toBeDefined();
    expect(out!.byCurrency).toBeInstanceOf(Map);
    expect(out!.byCurrency.get('poetics')).toHaveLength(2);
    expect(out!.byCurrency.get('poetics')![0]).toEqual({ itemId: 4729, receiveQty: 1, costPerUnit: 1, isHq: false });
    expect(out!.byCurrency.get('mgp')).toHaveLength(1);
    expect(out!.byCurrency.get('mgp')![0].isHq).toBe(true);
  });

  it('sets updatedAt timestamp on put', async () => {
    const before = Date.now();
    await putCachedSpecialShop(mkSnapshot());
    const ts = await getSpecialShopUpdatedAt();
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it('clear empties the store + drops the timestamp', async () => {
    await putCachedSpecialShop(mkSnapshot());
    await clearSpecialShopCache();
    expect(await getCachedSpecialShop()).toBeUndefined();
    expect(await getSpecialShopUpdatedAt()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/recipeCache.specialShop.test.ts`
Expected: FAIL — `Cannot find module './specialShopSnapshot'` (it doesn't exist yet) AND the cache helpers don't exist.

- [ ] **Step 3: Bump DB version + add store + add helpers**

Edit `src/lib/recipeCache.ts`. Make the following four changes:

(a) Bump `DB_VERSION` (around line 8) from `8` to `9`:

```ts
const DB_VERSION = 9;
```

(b) Add the store constant near the other `*_STORE` declarations (around line 17):

```ts
const SPECIALSHOP_STORE = 'specialShop';
```

(c) Inside `upgrade()` (around line 49), add a block alongside the existing store-creation guards:

```ts
if (!database.objectStoreNames.contains(SPECIALSHOP_STORE)) {
  database.createObjectStore(SPECIALSHOP_STORE);
}
```

(d) At the end of the file (after the existing gilShop helpers), add:

```ts
import type { SpecialShopSnapshot } from './specialShopSnapshot';

const SPECIALSHOP_SNAPSHOT_KEY = 'snapshot';
const SPECIALSHOP_SNAPSHOT_TS_KEY = 'specialShopUpdatedAt';

export async function getCachedSpecialShop(): Promise<SpecialShopSnapshot | undefined> {
  const raw = await (await db()).get(SPECIALSHOP_STORE, SPECIALSHOP_SNAPSHOT_KEY) as { byCurrency: Array<[string, unknown]> } | undefined;
  if (!raw) return undefined;
  return { byCurrency: new Map(raw.byCurrency as Array<[import('./currencies').CurrencyId, import('./specialShopSnapshot').ShopEntry[]]>) };
}

export async function putCachedSpecialShop(snapshot: SpecialShopSnapshot): Promise<void> {
  const handle = await db();
  await handle.put(SPECIALSHOP_STORE, { byCurrency: [...snapshot.byCurrency.entries()] }, SPECIALSHOP_SNAPSHOT_KEY);
  await handle.put(META_STORE, Date.now(), SPECIALSHOP_SNAPSHOT_TS_KEY);
}

export async function clearSpecialShopCache(): Promise<void> {
  const handle = await db();
  await handle.clear(SPECIALSHOP_STORE);
  await handle.delete(META_STORE, SPECIALSHOP_SNAPSHOT_TS_KEY);
}

export async function getSpecialShopUpdatedAt(): Promise<number | undefined> {
  return (await db()).get(META_STORE, SPECIALSHOP_SNAPSHOT_TS_KEY);
}
```

Note: The `import type { SpecialShopSnapshot }` belongs at the TOP of the file alongside other `import type` lines (e.g., after `import type { SnapshotLeve } from './leveSnapshot';`). The inline `import('./currencies').CurrencyId` is a TypeScript-only type reference that doesn't require a runtime import.

- [ ] **Step 4: Skip ahead — tests can't pass yet because Task 2 hasn't created `specialShopSnapshot.ts` or `currencies.ts`**

That's fine — proceed to commit the cache scaffolding. The test will become runnable after Task 2 + 3.

Actually, to keep Task 1 self-contained and verifiable, **temporarily inline a stub `SpecialShopSnapshot` type at the bottom of recipeCache.ts** so the file compiles. We'll delete the stub in Task 2 once the real module exists.

Add this stub above the new exports:

```ts
// TEMP STUB — replaced in Task 2 by import from './specialShopSnapshot'
type _StubShopEntry = { itemId: number; receiveQty: number; costPerUnit: number; isHq: boolean };
type _StubSpecialShopSnapshot = { byCurrency: Map<string, _StubShopEntry[]> };
```

And use the stub types in the helpers instead of the cross-module import:

```ts
export async function getCachedSpecialShop(): Promise<_StubSpecialShopSnapshot | undefined> { /* ... */ }
export async function putCachedSpecialShop(snapshot: _StubSpecialShopSnapshot): Promise<void> { /* ... */ }
```

The test mocks the snapshot shape directly, so it works against the stub types.

Wait — the test imports `SpecialShopSnapshot` from `./specialShopSnapshot`. To make Task 1 verifiable in isolation, **also create a minimal `src/lib/specialShopSnapshot.ts` in this task** with just the type exports:

```ts
// src/lib/specialShopSnapshot.ts (minimal in Task 1, expanded in Task 2)
export interface ShopEntry {
  itemId: number;
  receiveQty: number;
  costPerUnit: number;
  isHq: boolean;
}

export interface SpecialShopSnapshot {
  byCurrency: Map<string, ShopEntry[]>;  // string for now; tightened to CurrencyId in Task 3
}
```

This lets Task 1 stand on its own. Task 2 will expand `specialShopSnapshot.ts` with the parser + fetcher and Task 3 will tighten the type.

Then remove the temp stub from `recipeCache.ts` and use the real import:

```ts
import type { SpecialShopSnapshot } from './specialShopSnapshot';
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/recipeCache.specialShop.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Full suite check**

Run: `npx vitest run`
Expected: baseline + 4 new tests pass; tsc clean (run `npx tsc --noEmit` to confirm).

- [ ] **Step 7: Commit**

```bash
git add src/lib/recipeCache.ts src/lib/recipeCache.specialShop.test.ts src/lib/specialShopSnapshot.ts
git commit -m "feat(cache): IDB v9 with specialShop store + vendor snapshot helpers"
```

---

## Task 2: specialShopSnapshot fetcher + parser

**Files:**
- Modify: `src/lib/specialShopSnapshot.ts` (expand from the type-only stub created in Task 1)
- Test: `src/lib/specialShopSnapshot.test.ts`

Schema reference (verified at plan-writing time via XIVAPI v2 probe):
- Endpoint: `GET https://v2.xivapi.com/api/sheet/SpecialShop?fields=Item%5B%5D.Item%40as%28raw%29,Item%5B%5D.ItemCost%40as%28raw%29,Item%5B%5D.ReceiveCount,Item%5B%5D.CurrencyCost,Item%5B%5D.ReceiveHq&limit=50&after=<lastRowId>`
- Each row: `{ row_id, fields: { Item: DealSlot[] } }`, where `Item` has up to 60 deal slots.
- Each DealSlot: `{ "Item@as(raw)": number[2], ReceiveCount: number[2], ReceiveHq: boolean[2], "ItemCost@as(raw)": number[3], CurrencyCost: number[3] }`.
- v1 only emits **pure single-receive, single-currency** deals: receive slot 0 non-zero, slot 1 zero; cost slot 0 non-zero, slots 1 & 2 zero; the cost item id matches one of our curated currencies.

The parser needs a `currencyByItemId: Map<number, CurrencyId>` lookup, built from the `CURRENCIES` catalog (Task 3 creates the catalog — for Task 2, the test provides the lookup map directly).

The **page-size limit is 50** because of XIVAPI's 20k-row-fanout limit (verified — limit=500 returned a 400 error).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/specialShopSnapshot.test.ts
import { describe, it, expect } from 'vitest';
import { parseSpecialShopPage, type RawSpecialShopPage } from './specialShopSnapshot';

const CURRENCIES_BY_ID = new Map<number, string>([
  [28, 'poetics'],
  [29, 'mgp'],
  [25199, 'whiteCrafter'],
]);

function deal(opts: Partial<{
  recvIds: [number, number]; recvCounts: [number, number]; recvHq: [boolean, boolean];
  costIds: [number, number, number]; currencyCost: [number, number, number];
}>) {
  return {
    'Item@as(raw)': opts.recvIds ?? [0, 0],
    ReceiveCount: opts.recvCounts ?? [1, 1],
    ReceiveHq: opts.recvHq ?? [false, false],
    'ItemCost@as(raw)': opts.costIds ?? [0, 0, 0],
    CurrencyCost: opts.currencyCost ?? [0, 0, 0],
  };
}

function page(rows: Array<{ row_id: number; deals: ReturnType<typeof deal>[] }>): RawSpecialShopPage {
  return { rows: rows.map((r) => ({ row_id: r.row_id, fields: { Item: r.deals } })) };
}

describe('parseSpecialShopPage', () => {
  it('returns [] for an empty page', () => {
    expect(parseSpecialShopPage({ rows: [] }, CURRENCIES_BY_ID)).toEqual([]);
    expect(parseSpecialShopPage({}, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('emits a pure-currency single-receive deal', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], recvCounts: [1, 1], recvHq: [false, false], costIds: [28, 0, 0], currencyCost: [5, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([
      { currency: 'poetics', itemId: 4729, receiveQty: 1, costPerUnit: 5, isHq: false },
    ]);
  });

  it('normalizes per-unit cost for stack purchases', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4551, 0], recvCounts: [99, 1], costIds: [25199, 0, 0], currencyCost: [1500, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([
      { currency: 'whiteCrafter', itemId: 4551, receiveQty: 99, costPerUnit: 1500 / 99, isHq: false },
    ]);
  });

  it('captures isHq from the ReceiveHq flag', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [12345, 0], recvHq: [true, false], costIds: [29, 0, 0], currencyCost: [10000, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)[0].isHq).toBe(true);
  });

  it('drops deals with no receive item', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [0, 0], costIds: [28, 0, 0], currencyCost: [5, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops deals with no cost item', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], costIds: [0, 0, 0], currencyCost: [0, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops deals whose cost item is not a curated currency', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], costIds: [9999, 0, 0], currencyCost: [5, 0, 0] }),  // 9999 not in CURRENCIES_BY_ID
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops hybrid (multi-cost) deals — cost slots 1 or 2 also have items', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], costIds: [28, 1, 0], currencyCost: [5, 100, 0] }),  // poetics + 100 gil — hybrid
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops multi-receive deals — receive slot 1 also has an item', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 4730], recvCounts: [1, 1], costIds: [28, 0, 0], currencyCost: [5, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops deals with receiveCount = 0 (div-by-zero guard)', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], recvCounts: [0, 1], costIds: [28, 0, 0], currencyCost: [5, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('drops deals with currencyCost = 0', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], recvCounts: [1, 1], costIds: [28, 0, 0], currencyCost: [0, 0, 0] }),
    ]}]);
    expect(parseSpecialShopPage(raw, CURRENCIES_BY_ID)).toEqual([]);
  });

  it('emits multiple entries from a single row when multiple deal slots qualify', () => {
    const raw = page([{ row_id: 1, deals: [
      deal({ recvIds: [4729, 0], recvCounts: [1, 1], costIds: [28, 0, 0], currencyCost: [5, 0, 0] }),
      deal({ recvIds: [4730, 0], recvCounts: [1, 1], costIds: [28, 0, 0], currencyCost: [10, 0, 0] }),
      deal({ recvIds: [4731, 0], recvCounts: [1, 1], costIds: [29, 0, 0], currencyCost: [50000, 0, 0] }),
    ]}]);
    const out = parseSpecialShopPage(raw, CURRENCIES_BY_ID);
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.itemId)).toEqual([4729, 4730, 4731]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/specialShopSnapshot.test.ts`
Expected: FAIL — `parseSpecialShopPage` not exported.

- [ ] **Step 3: Implement the module**

Replace the contents of `src/lib/specialShopSnapshot.ts` (which had only the type stubs from Task 1) with:

```ts
// src/lib/specialShopSnapshot.ts
const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const FIELDS = 'Item[].Item@as(raw),Item[].ItemCost@as(raw),Item[].ReceiveCount,Item[].CurrencyCost,Item[].ReceiveHq';

export interface ShopEntry {
  itemId: number;
  receiveQty: number;
  costPerUnit: number;
  isHq: boolean;
}

export interface SpecialShopSnapshot {
  byCurrency: Map<string, ShopEntry[]>;  // CurrencyId string keys; runtime guarantees from currencyByItemId lookup
}

interface RawDealSlot {
  'Item@as(raw)'?: number[];
  ReceiveCount?: number[];
  ReceiveHq?: boolean[];
  'ItemCost@as(raw)'?: number[];
  CurrencyCost?: number[];
}
interface RawSpecialShopRow {
  row_id: number;
  fields: { Item?: RawDealSlot[] };
}
export interface RawSpecialShopPage { rows?: RawSpecialShopRow[] }

/** Per-page parser result: a flat list of `{ currency, itemId, receiveQty, costPerUnit, isHq }`. */
export interface ParsedShopEntry extends ShopEntry { currency: string }

export function parseSpecialShopPage(
  raw: RawSpecialShopPage,
  currencyByItemId: Map<number, string>,
): ParsedShopEntry[] {
  const out: ParsedShopEntry[] = [];
  for (const row of raw.rows ?? []) {
    for (const slot of row.fields.Item ?? []) {
      const recvIds = slot['Item@as(raw)'] ?? [];
      const costIds = slot['ItemCost@as(raw)'] ?? [];
      const recvCounts = slot.ReceiveCount ?? [];
      const recvHq = slot.ReceiveHq ?? [];
      const currencyCost = slot.CurrencyCost ?? [];

      // v1 only handles pure single-receive, single-currency deals.
      const recvId = recvIds[0] ?? 0;
      if (recvId <= 0) continue;
      if ((recvIds[1] ?? 0) > 0) continue; // multi-receive — drop

      const costId = costIds[0] ?? 0;
      if (costId <= 0) continue;
      if ((costIds[1] ?? 0) > 0) continue; // hybrid — drop
      if ((costIds[2] ?? 0) > 0) continue; // hybrid — drop

      const currency = currencyByItemId.get(costId);
      if (!currency) continue; // cost item is not one of our curated currencies

      const receiveQty = recvCounts[0] ?? 0;
      const cost = currencyCost[0] ?? 0;
      if (receiveQty <= 0 || cost <= 0) continue; // div-by-zero guard

      out.push({
        currency,
        itemId: recvId,
        receiveQty,
        costPerUnit: cost / receiveQty,
        isHq: recvHq[0] === true,
      });
    }
  }
  return out;
}

export interface FetchSpecialShopOpts {
  pageSize?: number;
  onProgress?: (totalEntriesSoFar: number) => void;
}

function buildPageUrl(after: number, pageSize: number): string {
  const params = new URLSearchParams({ fields: FIELDS, limit: String(pageSize) });
  if (after > 0) params.set('after', String(after));
  return `${BASE.replace(/\/$/, '')}/api/sheet/SpecialShop?${params.toString()}`;
}

export async function fetchSpecialShopSnapshot(
  currencyByItemId: Map<number, string>,
  opts: FetchSpecialShopOpts = {},
): Promise<SpecialShopSnapshot> {
  // pageSize=50 hard-cap: XIVAPI v2 enforces a 20k-row-fanout budget; larger pages 400.
  const pageSize = opts.pageSize ?? 50;
  const byCurrency = new Map<string, ShopEntry[]>();
  let cursor = 0;
  let totalEntries = 0;
  while (true) {
    const res = await fetch(buildPageUrl(cursor, pageSize));
    if (!res.ok) throw new Error(`XIVAPI SpecialShop ${res.status}`);
    const raw = (await res.json()) as RawSpecialShopPage;
    const rows = raw.rows ?? [];
    if (rows.length === 0) break;
    for (const entry of parseSpecialShopPage(raw, currencyByItemId)) {
      let bucket = byCurrency.get(entry.currency);
      if (!bucket) { bucket = []; byCurrency.set(entry.currency, bucket); }
      bucket.push({ itemId: entry.itemId, receiveQty: entry.receiveQty, costPerUnit: entry.costPerUnit, isHq: entry.isHq });
      totalEntries++;
    }
    opts.onProgress?.(totalEntries);
    cursor = rows[rows.length - 1].row_id;
  }
  return { byCurrency };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/specialShopSnapshot.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Re-run the cache test from Task 1 to confirm the type swap still works**

Run: `npx vitest run src/lib/recipeCache.specialShop.test.ts`
Expected: PASS (4 tests still pass — the real `SpecialShopSnapshot` type is structurally identical to the Task 1 stub).

- [ ] **Step 6: Commit**

```bash
git add src/lib/specialShopSnapshot.ts src/lib/specialShopSnapshot.test.ts
git commit -m "feat(currency): SpecialShop fetcher + parser (pure deals only)"
```

---

## Task 3: currencies catalog

**Files:**
- Create: `src/lib/currencies.ts`
- Test: `src/lib/currencies.test.ts`

Notes for the implementer:
- The `itemId` values below are **PLACEHOLDERS based on community references** and **MUST be verified against XIVAPI** before relying on them in production. The verification step (Step 4 of this task) does this via a network test.
- If a verification step fails (returned name doesn't match expected), update the placeholder to the correct itemId and re-run.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/currencies.test.ts
import { describe, it, expect } from 'vitest';
import { CURRENCIES, getCurrencyById, currencyByItemId, type CurrencyId } from './currencies';

describe('currencies catalog', () => {
  it('exports 10 currencies', () => {
    expect(CURRENCIES).toHaveLength(10);
  });

  it('all entries have unique ids', () => {
    const ids = new Set(CURRENCIES.map((c) => c.id));
    expect(ids.size).toBe(CURRENCIES.length);
  });

  it('all entries have unique itemIds', () => {
    const ids = new Set(CURRENCIES.map((c) => c.itemId));
    expect(ids.size).toBe(CURRENCIES.length);
  });

  it('all itemIds are positive integers', () => {
    for (const c of CURRENCIES) {
      expect(Number.isInteger(c.itemId)).toBe(true);
      expect(c.itemId).toBeGreaterThan(0);
    }
  });

  it('getCurrencyById returns the matching entry', () => {
    expect(getCurrencyById('poetics')?.label).toContain('Poetics');
    expect(getCurrencyById('mgp')?.shortLabel).toBe('MGP');
  });

  it('getCurrencyById returns undefined for unknown id', () => {
    expect(getCurrencyById('nonexistent' as CurrencyId)).toBeUndefined();
  });

  it('currencyByItemId exposes a Map<number, CurrencyId> for the parser', () => {
    expect(currencyByItemId).toBeInstanceOf(Map);
    expect(currencyByItemId.size).toBe(10);
    for (const c of CURRENCIES) {
      expect(currencyByItemId.get(c.itemId)).toBe(c.id);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/currencies.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the catalog**

```ts
// src/lib/currencies.ts
export type CurrencyId =
  | 'poetics' | 'mathematics' | 'causality'
  | 'whiteCrafter' | 'purpleCrafter'
  | 'whiteGatherer' | 'purpleGatherer'
  | 'mgp' | 'wolfMarks' | 'bicolor';

export interface CurrencyDef {
  id: CurrencyId;
  label: string;
  shortLabel: string;
  itemId: number;
}

// VERIFY itemIds against XIVAPI v2 Item sheet before relying on data.
// Use Step 4 of this task to confirm against https://v2.xivapi.com/api/sheet/Item.
export const CURRENCIES: readonly CurrencyDef[] = [
  { id: 'poetics',         label: 'Allagan Tomestone of Poetics',      shortLabel: 'Poetics',     itemId: 28 },
  { id: 'mathematics',     label: 'Allagan Tomestone of Mathematics',  shortLabel: 'Mathematics', itemId: 47 },
  { id: 'causality',       label: 'Allagan Tomestone of Causality',    shortLabel: 'Causality',   itemId: 48 },
  { id: 'whiteCrafter',    label: "White Crafters' Scrip",             shortLabel: 'W-Craft',     itemId: 25199 },
  { id: 'purpleCrafter',   label: "Purple Crafters' Scrip",            shortLabel: 'P-Craft',     itemId: 33913 },
  { id: 'whiteGatherer',   label: "White Gatherers' Scrip",            shortLabel: 'W-Gather',    itemId: 25200 },
  { id: 'purpleGatherer',  label: "Purple Gatherers' Scrip",           shortLabel: 'P-Gather',    itemId: 33914 },
  { id: 'mgp',             label: 'MGP',                               shortLabel: 'MGP',         itemId: 29 },
  { id: 'wolfMarks',       label: 'Wolf Marks',                        shortLabel: 'Wolf',        itemId: 25 },
  { id: 'bicolor',         label: 'Bicolor Gemstone',                  shortLabel: 'Bicolor',     itemId: 26807 },
];

export function getCurrencyById(id: CurrencyId): CurrencyDef | undefined {
  return CURRENCIES.find((c) => c.id === id);
}

export const currencyByItemId: Map<number, CurrencyId> = new Map(
  CURRENCIES.map((c) => [c.itemId, c.id]),
);
```

- [ ] **Step 4: Verify currency itemIds against live XIVAPI**

Manually probe each currency's itemId against the Item sheet to confirm the name matches. Run this once during implementation:

```bash
for id in 28 47 48 25199 33913 25200 33914 29 25 26807; do
  curl -s "https://v2.xivapi.com/api/sheet/Item/$id?fields=Name" | node -e "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{const d=JSON.parse(s); console.log('$id:', d.fields?.Name ?? '?')})"
done
```

Expected names (loosely — actual XIVAPI sheet may have updated names):
- `28` → contains "Poetics"
- `47` → contains "Mathematics"
- `48` → contains "Causality"
- `25199` → contains "White Crafter"
- `33913` → contains "Purple Crafter"
- `25200` → contains "White Gatherer"
- `33914` → contains "Purple Gatherer"
- `29` → contains "MGP"
- `25` → contains "Wolf Marks"
- `26807` → contains "Bicolor"

If any returns a wrong-looking name, **research the correct itemId on garlandtools.org or the FFXIV Wiki, update the `CURRENCIES` constant, then re-run the probe**. Do NOT proceed to Task 4 with verified-wrong IDs.

- [ ] **Step 5: Tighten the SpecialShopSnapshot type**

Edit `src/lib/specialShopSnapshot.ts` to import and use `CurrencyId`:

Change:
```ts
export interface SpecialShopSnapshot {
  byCurrency: Map<string, ShopEntry[]>;  // CurrencyId string keys; runtime guarantees from currencyByItemId lookup
}
```

To:
```ts
import type { CurrencyId } from './currencies';

export interface SpecialShopSnapshot {
  byCurrency: Map<CurrencyId, ShopEntry[]>;
}

export interface ParsedShopEntry extends ShopEntry { currency: CurrencyId }
```

And change the `parseSpecialShopPage` and `fetchSpecialShopSnapshot` signatures to use `Map<number, CurrencyId>` (not `Map<number, string>`).

Update `recipeCache.ts` similarly — replace the inline `import('./currencies').CurrencyId` usage with a real import.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib/currencies.test.ts src/lib/specialShopSnapshot.test.ts src/lib/recipeCache.specialShop.test.ts && npx tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/currencies.ts src/lib/currencies.test.ts src/lib/specialShopSnapshot.ts src/lib/recipeCache.ts
git commit -m "feat(currency): catalog of 10 currencies + tighten snapshot types"
```

---

## Task 4: useSpecialShopSnapshot hook

**Files:**
- Create: `src/features/queries/useSpecialShopSnapshot.ts`

Mirror `useVendorShopSnapshot` exactly: IDB-first read, fetch on miss, persist on success, `staleTime: Infinity`.

- [ ] **Step 1: Implement the hook**

```ts
// src/features/queries/useSpecialShopSnapshot.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getCachedSpecialShop,
  putCachedSpecialShop,
  clearSpecialShopCache,
  getSpecialShopUpdatedAt,
} from '../../lib/recipeCache';
import { fetchSpecialShopSnapshot, type SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import { currencyByItemId } from '../../lib/currencies';

const QUERY_KEY = ['specialShopSnapshot'] as const;

export function useSpecialShopSnapshot() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  const query = useQuery<{ snapshot: SpecialShopSnapshot; updatedAt: number | null }>({
    queryKey: QUERY_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const cached = await getCachedSpecialShop();
      const ts = await getSpecialShopUpdatedAt();
      if (cached) return { snapshot: cached, updatedAt: ts ?? null };
      const fresh = await fetchSpecialShopSnapshot(currencyByItemId, { onProgress: (n) => progressRef.current(n) });
      await putCachedSpecialShop(fresh);
      return { snapshot: fresh, updatedAt: Date.now() };
    },
  });

  return { ...query, progress };
}

export function useRefreshSpecialShopSnapshot() {
  const qc = useQueryClient();
  return async () => {
    await clearSpecialShopCache();
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/useSpecialShopSnapshot.ts
git commit -m "feat(currency): useSpecialShopSnapshot hook (IDB-first)"
```

---

## Task 5: CurrencyFlip types + default filter

**Files:**
- Modify: `src/features/queries/types.ts`
- Test: `src/features/queries/currencyFlipTypes.test.ts`

Append new types/factory at the end of `types.ts`. Reuse the existing `HqMode` type. Import `CurrencyId` from `../../lib/currencies`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/queries/currencyFlipTypes.test.ts
import { describe, it, expect } from 'vitest';
import { defaultCurrencyFlipFilter, type CurrencyFlipFilter, type CurrencyFlipSort } from './types';

describe('defaultCurrencyFlipFilter', () => {
  it('returns the documented defaults', () => {
    const f: CurrencyFlipFilter = defaultCurrencyFlipFilter();
    expect(f.currency).toBe('poetics');
    expect(f.minGilPerUnit).toBe(0);
    expect(f.minVelocity).toBe(0);
    expect(f.maxListings).toBeNull();
    expect(f.hq).toBe('either');
    expect(f.sort).toBe<CurrencyFlipSort>('gilPerUnit');
    expect(f.limit).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/queries/currencyFlipTypes.test.ts`
Expected: FAIL — `defaultCurrencyFlipFilter` not exported.

- [ ] **Step 3: Append types to types.ts**

Append to the end of `src/features/queries/types.ts`:

```ts
import type { CurrencyId } from '../../lib/currencies';

export type CurrencyFlipSort =
  | 'gilPerUnit'
  | 'salePrice'
  | 'velocity'
  | 'costPerUnit';

export interface CurrencyFlipFilter {
  currency: CurrencyId;
  minGilPerUnit: number;
  minVelocity: number;
  maxListings: number | null;
  hq: HqMode;
  sort: CurrencyFlipSort;
  limit: number;
}

export interface CurrencyFlipRow {
  id: number;
  name: string;
  sc: number;
  costPerUnit: number;
  salePrice: number;
  hq: boolean;
  gilPerUnit: number;
  velocity: number;
  listingCount: number;
}

export function defaultCurrencyFlipFilter(): CurrencyFlipFilter {
  return {
    currency: 'poetics',
    minGilPerUnit: 0,
    minVelocity: 0,
    maxListings: null,
    hq: 'either',
    sort: 'gilPerUnit',
    limit: 200,
  };
}
```

Note: The `import type { CurrencyId }` belongs near the top of the file alongside other type imports. If types.ts has no existing imports (currently it's pure exports), add the import as the first line.

- [ ] **Step 4: Run test**

Run: `npx vitest run src/features/queries/currencyFlipTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/types.ts src/features/queries/currencyFlipTypes.test.ts
git commit -m "feat(currency): add CurrencyFlipFilter/Row/Sort types + default factory"
```

---

## Task 6: runCurrencyFlip pure compute

**Files:**
- Create: `src/features/queries/runCurrencyFlip.ts`
- Test: `src/features/queries/runCurrencyFlip.test.ts`

Notes for the implementer:
- Inline-copy `pickTrustedSaleTier` from `src/features/queries/runVendorFlip.ts` (the "higher trusted tier wins for `either`" variant, NOT the first-match variant from `runMaterialFlip.ts`).
- HQ-delivery rule: if a shop entry has `isHq=true`, force the HQ-tier comparison regardless of `filter.hq`. (The vendor delivers HQ regardless of user filter; NQ sales aren't applicable.)
- Constants `MIN_RECENT_SALES`, `MAX_LISTING_RATIO` from `src/lib/priceTrust.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/queries/runCurrencyFlip.test.ts
import { describe, it, expect } from 'vitest';
import { runCurrencyFlip } from './runCurrencyFlip';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import { defaultCurrencyFlipFilter } from './types';

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

function mkShop(entries: Record<string, Array<{ itemId: number; receiveQty?: number; costPerUnit: number; isHq?: boolean }>>): SpecialShopSnapshot {
  const byCurrency = new Map();
  for (const [cur, list] of Object.entries(entries)) {
    byCurrency.set(cur, list.map((e) => ({ itemId: e.itemId, receiveQty: e.receiveQty ?? 1, costPerUnit: e.costPerUnit, isHq: e.isHq ?? false })));
  }
  return { byCurrency };
}

describe('runCurrencyFlip', () => {
  it('returns [] for empty snapshot', () => {
    const rows = runCurrencyFlip([], { byCurrency: new Map() }, {}, defaultCurrencyFlipFilter());
    expect(rows).toEqual([]);
  });

  it('returns [] when selected currency has no entries', () => {
    const snap = [mkSnap(100, 'X')];
    const shop = mkShop({ mgp: [{ itemId: 100, costPerUnit: 50000 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 5000 }) };
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toEqual([]);
  });

  it('excludes entries whose item is missing from item snapshot', () => {
    const snap: SnapshotItem[] = [];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 5 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 5000 }) };
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toEqual([]);
  });

  it('excludes entries with no market data', () => {
    const snap = [mkSnap(100, 'X')];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 5 }] });
    expect(runCurrencyFlip(snap, shop, {}, defaultCurrencyFlipFilter())).toEqual([]);
  });

  it('excludes entries with no trusted sale tier', () => {
    const snap = [mkSnap(100, 'X')];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 5 }] });
    const prices: MarketData = { 100: mkMarket({}) };  // no minNQ/minHQ
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toEqual([]);
  });

  it('computes a profitable NQ flip with derived fields', () => {
    const snap = [mkSnap(100, 'Widget', false)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 5000, medianNQ: 5000, recentNQ: 20, velocity: 2 }) };
    const rows = runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter());
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.id).toBe(100);
    expect(r.costPerUnit).toBe(10);
    expect(r.salePrice).toBe(5000);
    expect(r.hq).toBe(false);
    expect(r.gilPerUnit).toBe(500);  // 5000 / 10
    expect(r.velocity).toBe(2);
  });

  it('hq:"either" picks the higher trusted tier (HQ when canHq && minHQ is higher)', () => {
    const snap = [mkSnap(100, 'Widget', true)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const prices: MarketData = { 100: mkMarket({
      minNQ: 800, medianNQ: 800,
      minHQ: 2000, medianHQ: 2000,
    }) };
    const rows = runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter());
    expect(rows[0].hq).toBe(true);
    expect(rows[0].salePrice).toBe(2000);
  });

  it('HQ-delivery shop entry forces HQ-tier comparison even when filter.hq=nq', () => {
    const snap = [mkSnap(100, 'Widget', true)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10, isHq: true }] });
    const prices: MarketData = { 100: mkMarket({
      minNQ: 800, medianNQ: 800,
      minHQ: 2000, medianHQ: 2000,
    }) };
    const filter = { ...defaultCurrencyFlipFilter(), hq: 'nq' as const };
    const rows = runCurrencyFlip(snap, shop, prices, filter);
    expect(rows).toHaveLength(1);
    expect(rows[0].hq).toBe(true);
    expect(rows[0].salePrice).toBe(2000);
  });

  it('HQ-delivery on non-canHq item still excludes (no HQ tier exists)', () => {
    const snap = [mkSnap(100, 'NQ Only', false)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10, isHq: true }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 1000, medianNQ: 1000 }) };
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toEqual([]);
  });

  it('excludes rows below minGilPerUnit', () => {
    const snap = [mkSnap(100, 'X', false)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 100, medianNQ: 100, velocity: 5 }) };
    // gilPerUnit = 10, default minGilPerUnit = 0 → included
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toHaveLength(1);
    // Tighten minGilPerUnit → excluded
    const tight = { ...defaultCurrencyFlipFilter(), minGilPerUnit: 50 };
    expect(runCurrencyFlip(snap, shop, prices, tight)).toEqual([]);
  });

  it('excludes rows below minVelocity', () => {
    const snap = [mkSnap(100, 'X', false)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 500, medianNQ: 500, velocity: 0.2 }) };
    const tight = { ...defaultCurrencyFlipFilter(), minVelocity: 0.5 };
    expect(runCurrencyFlip(snap, shop, prices, tight)).toEqual([]);
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toHaveLength(1);
  });

  it('excludes rows above maxListings when set', () => {
    const snap = [mkSnap(100, 'X', false)];
    const shop = mkShop({ poetics: [{ itemId: 100, costPerUnit: 10 }] });
    const prices: MarketData = { 100: mkMarket({ minNQ: 500, medianNQ: 500, velocity: 5, listingCount: 100 }) };
    const tight = { ...defaultCurrencyFlipFilter(), maxListings: 50 };
    expect(runCurrencyFlip(snap, shop, prices, tight)).toEqual([]);
    expect(runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter())).toHaveLength(1);
  });

  it('sorts by gilPerUnit desc by default with stable id tie-break', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false), mkSnap(3, 'C', false)];
    const shop = mkShop({ poetics: [
      { itemId: 1, costPerUnit: 10 },
      { itemId: 2, costPerUnit: 10 },
      { itemId: 3, costPerUnit: 10 },
    ]});
    const prices: MarketData = {
      1: mkMarket({ minNQ: 500, medianNQ: 500 }),    // gilPerUnit 50
      2: mkMarket({ minNQ: 2000, medianNQ: 2000 }),  // gilPerUnit 200
      3: mkMarket({ minNQ: 500, medianNQ: 500 }),    // gilPerUnit 50 — ties with 1, id 1 wins
    };
    const rows = runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter());
    expect(rows.map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('honors each sort mode', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false)];
    const shop = mkShop({ poetics: [
      { itemId: 1, costPerUnit: 5 },
      { itemId: 2, costPerUnit: 50 },
    ]});
    const prices: MarketData = {
      1: mkMarket({ minNQ: 500, medianNQ: 500, velocity: 5 }),     // gilPerUnit 100, costPerUnit 5
      2: mkMarket({ minNQ: 2000, medianNQ: 2000, velocity: 1 }),   // gilPerUnit 40, costPerUnit 50
    };
    const base = defaultCurrencyFlipFilter();
    expect(runCurrencyFlip(snap, shop, prices, { ...base, sort: 'gilPerUnit' }).map((r) => r.id)).toEqual([1, 2]);
    expect(runCurrencyFlip(snap, shop, prices, { ...base, sort: 'salePrice' }).map((r) => r.id)).toEqual([2, 1]);
    expect(runCurrencyFlip(snap, shop, prices, { ...base, sort: 'velocity' }).map((r) => r.id)).toEqual([1, 2]);
    expect(runCurrencyFlip(snap, shop, prices, { ...base, sort: 'costPerUnit' }).map((r) => r.id)).toEqual([2, 1]);
  });

  it('applies limit slice after sort', () => {
    const snap = [mkSnap(1, 'A', false), mkSnap(2, 'B', false), mkSnap(3, 'C', false)];
    const shop = mkShop({ poetics: [
      { itemId: 1, costPerUnit: 10 },
      { itemId: 2, costPerUnit: 10 },
      { itemId: 3, costPerUnit: 10 },
    ]});
    const prices: MarketData = {
      1: mkMarket({ minNQ: 100, medianNQ: 100 }),
      2: mkMarket({ minNQ: 500, medianNQ: 500 }),
      3: mkMarket({ minNQ: 300, medianNQ: 300 }),
    };
    const filter = { ...defaultCurrencyFlipFilter(), limit: 2 };
    const rows = runCurrencyFlip(snap, shop, prices, filter);
    expect(rows.map((r) => r.id)).toEqual([2, 3]);
  });

  it('only includes entries from the selected currency', () => {
    const snap = [mkSnap(100, 'P', false), mkSnap(200, 'M', false)];
    const shop = mkShop({
      poetics: [{ itemId: 100, costPerUnit: 10 }],
      mgp: [{ itemId: 200, costPerUnit: 50000 }],
    });
    const prices: MarketData = {
      100: mkMarket({ minNQ: 1000, medianNQ: 1000 }),
      200: mkMarket({ minNQ: 1000000, medianNQ: 1000000 }),
    };
    const poeticsOnly = runCurrencyFlip(snap, shop, prices, defaultCurrencyFlipFilter());
    expect(poeticsOnly.map((r) => r.id)).toEqual([100]);
    const mgpOnly = runCurrencyFlip(snap, shop, prices, { ...defaultCurrencyFlipFilter(), currency: 'mgp' });
    expect(mgpOnly.map((r) => r.id)).toEqual([200]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/queries/runCurrencyFlip.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the runner**

```ts
// src/features/queries/runCurrencyFlip.ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { SpecialShopSnapshot, ShopEntry } from '../../lib/specialShopSnapshot';
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
import type { HqMode, CurrencyFlipFilter, CurrencyFlipRow, CurrencyFlipSort } from './types';

interface SaleTier { unit: number; isHq: boolean }

function pickTrustedSaleTier(m: MarketItem, hq: HqMode, canHq: boolean): SaleTier | null {
  const candidates: Array<{ rawMin: number | null; median: number | null; recent: number; isHq: boolean }> = [];
  if ((hq === 'hq' || hq === 'either') && canHq) {
    candidates.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  }
  if (hq === 'nq' || hq === 'either') {
    candidates.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  }
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

function compareRows(a: CurrencyFlipRow, b: CurrencyFlipRow, sort: CurrencyFlipSort): number {
  switch (sort) {
    case 'gilPerUnit':  return b.gilPerUnit - a.gilPerUnit;
    case 'salePrice':   return b.salePrice - a.salePrice;
    case 'velocity':    return b.velocity - a.velocity;
    case 'costPerUnit': return b.costPerUnit - a.costPerUnit;
  }
}

export function runCurrencyFlip(
  snapshot: SnapshotItem[],
  shopSnapshot: SpecialShopSnapshot,
  saleMap: MarketData,
  filter: CurrencyFlipFilter,
): CurrencyFlipRow[] {
  const entries: ShopEntry[] = shopSnapshot.byCurrency.get(filter.currency) ?? [];
  if (entries.length === 0) return [];

  // O(1) item lookup by id.
  const itemById = new Map<number, SnapshotItem>();
  for (const item of snapshot) itemById.set(item.id, item);

  const out: CurrencyFlipRow[] = [];
  for (const entry of entries) {
    const item = itemById.get(entry.itemId);
    if (!item) continue;
    const market = saleMap[entry.itemId];
    if (!market) continue;
    if (market.velocity < filter.minVelocity) continue;
    if (filter.maxListings != null && market.listingCount > filter.maxListings) continue;

    // HQ-delivery rows force HQ-tier comparison regardless of user filter.
    const effectiveHq: HqMode = entry.isHq ? 'hq' : filter.hq;
    const tier = pickTrustedSaleTier(market, effectiveHq, item.canHq);
    if (!tier) continue;

    const gilPerUnit = tier.unit / entry.costPerUnit;
    if (gilPerUnit < filter.minGilPerUnit) continue;

    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      costPerUnit: entry.costPerUnit,
      salePrice: tier.unit,
      hq: tier.isHq,
      gilPerUnit,
      velocity: market.velocity,
      listingCount: market.listingCount,
    });
  }

  out.sort((a, b) => {
    const cmp = compareRows(a, b, filter.sort);
    return cmp !== 0 ? cmp : a.id - b.id;
  });
  return out.slice(0, filter.limit);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features/queries/runCurrencyFlip.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/runCurrencyFlip.ts src/features/queries/runCurrencyFlip.test.ts
git commit -m "feat(currency): runCurrencyFlip pure compute (filter + rank)"
```

---

## Task 7: CurrencyFlipResults sortable table

**Files:**
- Create: `src/features/queries/CurrencyFlipResults.tsx`
- Test: `src/features/queries/CurrencyFlipResults.test.tsx`

Mirror `VendorFlipResults.tsx` structure: uses `ResultTableScaffold`, `EmptyResults`, inline `SortableHeader`, CSV columns. Pass `currency` as a prop so the Cost column can show `<costPerUnit> <shortLabel>`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/queries/CurrencyFlipResults.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CurrencyFlipResults } from './CurrencyFlipResults';
import type { CurrencyFlipRow, CurrencyFlipSort } from './types';
import { getCurrencyById } from '../../lib/currencies';

const rows: CurrencyFlipRow[] = [
  { id: 100, name: 'Widget', sc: 1, costPerUnit: 10, salePrice: 5000, hq: false,
    gilPerUnit: 500, velocity: 2, listingCount: 4 },
  { id: 200, name: 'Gizmo HQ', sc: 1, costPerUnit: 50, salePrice: 50000, hq: true,
    gilPerUnit: 1000, velocity: 1, listingCount: 6 },
];

function renderResults(sort: CurrencyFlipSort = 'gilPerUnit', onSortChange = vi.fn()) {
  return render(
    <MemoryRouter>
      <CurrencyFlipResults
        rows={rows}
        currency={getCurrencyById('poetics')!}
        totalCandidates={50}
        skippedChunks={0}
        sort={sort}
        onSortChange={onSortChange}
      />
    </MemoryRouter>,
  );
}

describe('CurrencyFlipResults', () => {
  it('renders one row per CurrencyFlipRow with item name', () => {
    renderResults();
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('Gizmo HQ')).toBeInTheDocument();
  });

  it('renders the cost column with the currency short label', () => {
    renderResults();
    // costPerUnit 10 with currency "Poetics" → "10 Poetics" (or similar)
    expect(screen.getByText(/10.*Poetics/i)).toBeInTheDocument();
    expect(screen.getByText(/50.*Poetics/i)).toBeInTheDocument();
  });

  it('renders HQ glyph on HQ rows but not NQ rows', () => {
    renderResults();
    const widgetRow = screen.getByText('Widget').closest('tr')!;
    const gizmoRow = screen.getByText('Gizmo HQ').closest('tr')!;
    expect(within(gizmoRow).queryByLabelText(/HQ/i)).not.toBeNull();
    expect(within(widgetRow).queryByLabelText(/HQ/i)).toBeNull();
  });

  it('shows empty state copy when rows is empty', () => {
    render(
      <MemoryRouter>
        <CurrencyFlipResults
          rows={[]}
          currency={getCurrencyById('poetics')!}
          totalCandidates={0}
          skippedChunks={0}
          sort="gilPerUnit"
          onSortChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no items match/i)).toBeInTheDocument();
    expect(screen.getByText(/poetics/i)).toBeInTheDocument();
  });

  it('clicking a sortable header calls onSortChange with that sort key', () => {
    const onSortChange = vi.fn();
    renderResults('gilPerUnit', onSortChange);
    fireEvent.click(screen.getByText(/sales\/day/i));
    expect(onSortChange).toHaveBeenCalledWith('velocity');
  });

  it('marks the active sort header with the gold style + arrow', () => {
    renderResults('salePrice');
    const header = screen.getByText(/^sale$/i).closest('th')!;
    expect(header.className).toMatch(/text-gold/);
    expect(header.textContent).toContain('▼');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/queries/CurrencyFlipResults.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// src/features/queries/CurrencyFlipResults.tsx
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { CurrencyFlipRow, CurrencyFlipSort } from './types';
import type { CurrencyDef } from '../../lib/currencies';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: CurrencyFlipRow[];
  currency: CurrencyDef;
  totalCandidates: number;
  skippedChunks: number;
  sort: CurrencyFlipSort;
  onSortChange: (next: CurrencyFlipSort) => void;
}

const CSV_COLUMNS: CsvColumn<CurrencyFlipRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'costPerUnit', label: 'Cost (currency/unit)', value: (r) => Number(r.costPerUnit.toFixed(2)) },
  { key: 'salePrice', label: 'Sale Price' },
  { key: 'hq', label: 'HQ' },
  { key: 'gilPerUnit', label: 'Gil/currency-unit', value: (r) => Number(r.gilPerUnit.toFixed(2)) },
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

export function CurrencyFlipResults({ rows, currency, totalCandidates, skippedChunks, sort, onSortChange }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={
        <EmptyResults>
          No items match these filters for {currency.label}. Try lowering the gil/unit floor or switching currencies.
        </EmptyResults>
      }
      csvColumns={CSV_COLUMNS}
      csvFilename={`currency-flip-${currency.id}-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2 text-text-dim">#</th>
              <th className="text-left px-3 py-2 text-text-dim">Item</th>
              <SortableHeader active={sort === 'costPerUnit'} onClick={() => onSortChange('costPerUnit')}>Cost</SortableHeader>
              <SortableHeader active={sort === 'salePrice'} onClick={() => onSortChange('salePrice')}>Sale</SortableHeader>
              <SortableHeader active={sort === 'gilPerUnit'} onClick={() => onSortChange('gilPerUnit')}>Gil/unit</SortableHeader>
              <SortableHeader active={sort === 'velocity'} onClick={() => onSortChange('velocity')} hideOnMobile>Sales/day</SortableHeader>
              <th className="text-right px-3 py-2 text-text-dim hidden md:table-cell">Listings</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks id={r.id} name={r.name} />
                </td>
                <td className={`px-3 ${rowY} font-mono text-right`}>
                  {r.costPerUnit.toFixed(r.costPerUnit < 10 ? 2 : 0)} {currency.shortLabel}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right`}>
                  {fmtGil(r.salePrice)}
                  {r.hq && <span aria-label="HQ" className="text-gold ml-1 inline-flex items-baseline"><HqStar /></span>}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right text-jade`}>{fmtGil(Math.round(r.gilPerUnit))}</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{r.listingCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features/queries/CurrencyFlipResults.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/CurrencyFlipResults.tsx src/features/queries/CurrencyFlipResults.test.tsx
git commit -m "feat(currency): CurrencyFlipResults sortable table"
```

---

## Task 8: CurrencyFlipView orchestration + filter strip + currency picker

**Files:**
- Create: `src/features/insights/CurrencyFlipView.tsx`
- Test: `src/features/insights/CurrencyFlipView.test.tsx`

Notes:
- Currency choice persists in `?currency=poetics` via `useSearchParams`.
- Mutation pattern + `fetchInBatches` for the home-world price scan.
- Filter strip mirrors `VendorFlipView`'s shape (Min gil/unit, Min sales/day, Max listings, HQ mode buttons, Sort dropdown, Run scan, Refresh catalog).

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/insights/CurrencyFlipView.test.tsx
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

vi.mock('../queries/useSpecialShopSnapshot', () => ({
  useSpecialShopSnapshot: () => ({
    data: {
      snapshot: {
        byCurrency: new Map([
          ['poetics', [
            { itemId: 100, receiveQty: 1, costPerUnit: 10, isHq: false },
            { itemId: 200, receiveQty: 1, costPerUnit: 50, isHq: false },
          ]],
        ]),
      },
      updatedAt: 1700000000000,
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useRefreshSpecialShopSnapshot: () => async () => {},
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

import { CurrencyFlipView } from './CurrencyFlipView';

function renderView(initial = '/?currency=poetics') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <CurrencyFlipView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMarketDataMock.mockClear();
});

describe('CurrencyFlipView', () => {
  it('renders the currency picker + Run button on initial load', () => {
    renderView();
    expect(screen.getByRole('combobox', { name: /currency/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run scan/i })).toBeInTheDocument();
  });

  it('shows candidate count for the selected currency', () => {
    renderView();
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

  it('falls back to default currency when URL has unknown ?currency= value', () => {
    renderView('/?currency=bogus');
    // Default = poetics → 2 candidates from the mocked snapshot
    expect(screen.getByText(/2 candidate items/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/insights/CurrencyFlipView.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the view**

```tsx
// src/features/insights/CurrencyFlipView.tsx
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useSpecialShopSnapshot, useRefreshSpecialShopSnapshot } from '../queries/useSpecialShopSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runCurrencyFlip } from '../queries/runCurrencyFlip';
import { CurrencyFlipResults } from '../queries/CurrencyFlipResults';
import { defaultCurrencyFlipFilter, type CurrencyFlipFilter, type CurrencyFlipSort, type HqMode } from '../queries/types';
import { CURRENCIES, getCurrencyById, type CurrencyId } from '../../lib/currencies';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

interface RunResult {
  saleMap: MarketData;
  skipped: number;
  filterAtRun: CurrencyFlipFilter;
}

function isCurrencyId(v: string | null): v is CurrencyId {
  return v != null && CURRENCIES.some((c) => c.id === v);
}

export function CurrencyFlipView() {
  const { world } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const shop = useSpecialShopSnapshot();
  const refreshShop = useRefreshSpecialShopSnapshot();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlCurrency = searchParams.get('currency');
  const initialCurrency: CurrencyId = isCurrencyId(urlCurrency) ? urlCurrency : 'poetics';
  const [filter, setFilter] = useState<CurrencyFlipFilter>({ ...defaultCurrencyFlipFilter(), currency: initialCurrency });

  const currency = getCurrencyById(filter.currency)!;

  function setCurrency(id: CurrencyId) {
    setFilter({ ...filter, currency: id });
    setSearchParams((p) => { p.set('currency', id); return p; });
  }

  const candidateIds = useMemo(() => {
    if (!snapshot.data || !shop.data) return [];
    const entries = shop.data.snapshot.byCurrency.get(filter.currency) ?? [];
    const itemIds = new Set(entries.map((e) => e.itemId));
    return [...itemIds].filter((id) => snapshot.data!.items.some((it) => it.id === id));
  }, [snapshot.data, shop.data, filter.currency]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data || !shop.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: sale.data, skipped: sale.errors.length, filterAtRun: filter };
    },
  });

  const rows = useMemo(() => {
    if (!snapshot.data || !shop.data || !run.data) return [];
    return runCurrencyFlip(snapshot.data.items, shop.data.snapshot, run.data.saleMap, run.data.filterAtRun);
  }, [snapshot.data, shop.data, run.data]);

  function onSortChange(next: CurrencyFlipSort) {
    setFilter({ ...filter, sort: next });
  }

  return (
    <div className="space-y-4">
      <TopStrip
        currencyId={filter.currency}
        onChangeCurrency={setCurrency}
        onRun={() => { run.reset(); run.mutate(); }}
        onRefreshCatalog={async () => { await refreshShop(); }}
        busy={run.isPending}
      />

      {run.data && (
        <FilterBar value={filter} onChange={setFilter} />
      )}

      <div className="font-mono text-[10px] text-text-low">
        {shop.isLoading
          ? 'Loading currency catalog…'
          : `${candidateIds.length.toLocaleString()} candidate items`}
        {run.data && <> · {rows.length.toLocaleString()} results</>}
      </div>

      {shop.isError && (
        <StatusBanner kind="error">Currency catalog fetch failed: {(shop.error as Error).message}</StatusBanner>
      )}
      {run.isPending && <Spinner label={`Fetching ${world} prices for ${candidateIds.length} items…`} />}
      {run.isError && <StatusBanner kind="error">Universalis fetch failed: {(run.error as Error).message}</StatusBanner>}
      {run.data && run.data.skipped > 0 && (
        <StatusBanner kind="error">{run.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {run.data && (
        <CurrencyFlipResults
          rows={rows}
          currency={currency}
          totalCandidates={candidateIds.length}
          skippedChunks={run.data.skipped}
          sort={run.data.filterAtRun.sort}
          onSortChange={onSortChange}
        />
      )}
    </div>
  );
}

function TopStrip({ currencyId, onChangeCurrency, onRun, onRefreshCatalog, busy }: {
  currencyId: CurrencyId;
  onChangeCurrency: (id: CurrencyId) => void;
  onRun: () => void;
  onRefreshCatalog: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Currency</span>
        <select
          aria-label="Currency"
          value={currencyId}
          onChange={(e) => onChangeCurrency(e.target.value as CurrencyId)}
          className="mt-1 block bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        >
          {CURRENCIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
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
        onClick={() => { void onRefreshCatalog(); }}
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-aether hover:text-aether"
        title="Re-fetch the SpecialShop catalog"
      >
        ⟳ Catalog
      </button>
    </div>
  );
}

function FilterBar({ value, onChange }: {
  value: CurrencyFlipFilter;
  onChange: (f: CurrencyFlipFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
      <label className="block">
        <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min gil/unit</span>
        <input
          type="number" min={0} step={100} value={value.minGilPerUnit}
          onChange={(e) => onChange({ ...value, minGilPerUnit: Math.max(0, Number(e.target.value) || 0) })}
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
          onChange={(e) => onChange({ ...value, sort: e.target.value as CurrencyFlipSort })}
          className="mt-1 block bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
        >
          <option value="gilPerUnit">Gil/unit</option>
          <option value="salePrice">Sale price</option>
          <option value="velocity">Velocity</option>
          <option value="costPerUnit">Cost per unit</option>
        </select>
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/features/insights/CurrencyFlipView.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/CurrencyFlipView.tsx src/features/insights/CurrencyFlipView.test.tsx
git commit -m "feat(currency): CurrencyFlipView orchestration + picker + filter strip"
```

---

## Task 9: CurrencyFlip route + nav wiring

**Files:**
- Create: `src/routes/CurrencyFlip.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Create the route**

```tsx
// src/routes/CurrencyFlip.tsx
import { CurrencyFlipView } from '../features/insights/CurrencyFlipView';

export default function CurrencyFlip() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Currency Optimizer</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Spend earned currency on vendor items, sell on home MB for the best gil/currency-unit ratio.
        </p>
      </div>
      <CurrencyFlipView />
    </div>
  );
}
```

- [ ] **Step 2: Register the route in App.tsx**

In [src/App.tsx](src/App.tsx), add the import near the other route imports:

```tsx
import CurrencyFlip from './routes/CurrencyFlip';
```

And add the route inside `<Routes>` after the `/vendor-flip` route:

```tsx
<Route path="/currency-flip" element={<CurrencyFlip />} />
```

- [ ] **Step 3: Add NavLink to Header.tsx**

In [src/components/layout/Header.tsx](src/components/layout/Header.tsx), add a NavLink between the existing Vendor flip link (`/vendor-flip`) and the GC Seals link (`/gc-seals`):

```tsx
<NavLink to="/currency-flip" className={navClass}>Currencies</NavLink>
```

- [ ] **Step 4: Run typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/CurrencyFlip.tsx src/App.tsx src/components/layout/Header.tsx
git commit -m "feat(nav): register /currency-flip route + NavLink"
```

---

## Task 10: Final verification

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: ALL tests pass. Baseline before this branch was 527; this plan adds ~46 new tests (Task 1: 4, Task 2: 12, Task 3: 7, Task 5: 1, Task 6: 16, Task 7: 6, Task 8: 4). Expected total ≈ 573.

- [ ] **Step 3: Browser smoke test**

Run: `npm run dev`

In the browser:
1. Visit `/currency-flip` — catalog spinner appears on first load (~5-30 seconds for the full `SpecialShop` fetch). After resolution, currency picker + Run button + candidate count appear.
2. Default currency is Poetics. Click "Run scan" — spinner appears; results table populates with rows sorted by Gil/unit desc.
3. Switch to another currency (e.g., White Crafters' Scrip) — URL updates to `?currency=whiteCrafter`. Candidate count updates. Click Run again.
4. Test filters: bump Min gil/unit up — row count drops. Toggle HQ mode → run again → HQ rows appear (where applicable).
5. Click sortable headers → table reorders, arrow indicator moves.
6. Visit `/currency-flip?currency=bogus` directly — should fall back to Poetics silently.
7. Verify "Currencies" NavLink appears in header between "Vendor flip" and "GC Seals".

No commit needed for smoke testing unless bugs are found and fixed.
