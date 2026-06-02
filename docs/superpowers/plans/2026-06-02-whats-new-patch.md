# What's New This Patch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "What's New" insight page listing the items and recipes added by the latest game patch, with a live Universalis market snapshot (price · velocity · recent sales · last-sale freshness) so the user can spot early-sale opportunities.

**Architecture:** "New" = the ID delta between consecutive snapshot bakes, captured as a derived `whatsNew.json` bundle. The bake script computes it going forward; a one-time backfill computes it for the current patch from git history (no XIVAPI re-fetch). The UI mirrors the existing Empty Shelf insight page exactly (FilterBar → market fetch via `fetchInBatches` → pure row builder → `ResultTableScaffold`).

**Tech Stack:** React 18 + Vite + TypeScript, react-router-dom v7, @tanstack/react-query, vitest, tsx (for scripts), Tailwind.

---

## File Structure

**New files**
- `scripts/whatsNewDiff.ts` — pure `newIdsSince(prev, next)` diff (shared by bake + backfill).
- `scripts/whatsNewDiff.test.ts` — unit test for the diff.
- `scripts/backfillWhatsNew.ts` — one-time generator: diffs git `a42c4b0` snapshots vs current on-disk → `whatsNew.json`.
- `public/data/snapshots/whatsNew.json` — generated bundle (committed).
- `src/features/queries/useWhatsNewSnapshot.ts` — runtime hook (static bundle only).
- `src/features/queries/runWhatsNew.ts` — pure row builder + price pick.
- `src/features/queries/runWhatsNew.test.ts` — unit test for the builder.
- `src/features/queries/WhatsNewResults.tsx` — results table (mirrors EmptyShelfResults).
- `src/features/insights/WhatsNewView.tsx` — view + filter bar + tabs.
- `src/routes/WhatsNew.tsx` — thin route wrapper.

**Modified files**
- `src/features/queries/types.ts` — add `WhatsNewTab`, `WhatsNewSort`, `WhatsNewFilter`, `WhatsNewRow`, `defaultWhatsNewFilter`.
- `src/lib/staticSnapshots.ts` — add `WhatsNewData` + `loadStaticWhatsNewSnapshot`.
- `scripts/bake-snapshots.ts` — read prior IDs before overwrite, write `whatsNew.json`, add manifest counts.
- `src/App.tsx` — route + page title.
- `src/components/layout/Sidebar.tsx` — nav link.
- `src/components/layout/Header.tsx` — nav link.

---

## Task 1: Pure diff function `newIdsSince`

**Files:**
- Create: `scripts/whatsNewDiff.ts`
- Test: `scripts/whatsNewDiff.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/whatsNewDiff.test.ts
import { describe, it, expect } from 'vitest';
import { newIdsSince } from './whatsNewDiff';

describe('newIdsSince', () => {
  it('returns IDs present in next but absent in prev, ascending', () => {
    expect(newIdsSince([1, 2, 3], [3, 2, 5, 1, 4])).toEqual([4, 5]);
  });

  it('ignores IDs removed since prev', () => {
    expect(newIdsSince([1, 2, 3], [2, 3])).toEqual([]);
  });

  it('returns empty when the sets are equal', () => {
    expect(newIdsSince([5, 6], [6, 5])).toEqual([]);
  });

  it('returns all of next when prev is empty', () => {
    expect(newIdsSince([], [9, 7, 8])).toEqual([7, 8, 9]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/whatsNewDiff.test.ts`
Expected: FAIL — cannot find module `./whatsNewDiff`.

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/whatsNewDiff.ts
/**
 * IDs present in `next` but not in `prev`, sorted ascending.
 * Shared by the bake (prior on-disk vs freshly fetched) and the one-time
 * backfill (git-committed prior vs current on-disk).
 */
export function newIdsSince(prev: Iterable<number>, next: Iterable<number>): number[] {
  const prevSet = new Set(prev);
  const out: number[] = [];
  for (const id of next) {
    if (!prevSet.has(id)) out.push(id);
  }
  out.sort((a, b) => a - b);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/whatsNewDiff.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/whatsNewDiff.ts scripts/whatsNewDiff.test.ts
git commit -m "feat(whats-new): pure newIdsSince snapshot diff"
```

---

## Task 2: One-time backfill — generate `whatsNew.json` for the current patch

The prior snapshots live in git at commit `a42c4b0` (pre-bake). This script diffs them against the current on-disk snapshots and writes the bundle. Items snapshot shape: `{ bakedAt, items: [{id,…}] }`. Recipes shape: `{ bakedAt, entries: [[itemResultId, Recipe], …] }`.

**Files:**
- Create: `scripts/backfillWhatsNew.ts`
- Create (output): `public/data/snapshots/whatsNew.json`

- [ ] **Step 1: Write the backfill script**

```ts
// scripts/backfillWhatsNew.ts
/**
 * One-time generator for the current patch's whatsNew.json.
 * Reads the PRIOR items.json/recipes.json from git commit a42c4b0 (the
 * pre-bake state) and diffs them against the CURRENT on-disk bundles using
 * the same newIdsSince() the bake uses. No XIVAPI re-fetch.
 *
 * Run once:  npx tsx scripts/backfillWhatsNew.ts
 */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newIdsSince } from './whatsNewDiff';

const PRIOR_COMMIT = 'a42c4b0';
const OUT_DIR = join(process.cwd(), 'public', 'data', 'snapshots');

function gitShow(path: string): string {
  return execFileSync('git', ['show', `${PRIOR_COMMIT}:${path}`], {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function itemIds(raw: string): number[] {
  const parsed = JSON.parse(raw) as { items: Array<{ id: number }> };
  return parsed.items.map((i) => i.id);
}

function recipeKeys(raw: string): number[] {
  const parsed = JSON.parse(raw) as { entries: Array<[number, unknown]> };
  return parsed.entries.map(([id]) => id);
}

async function main() {
  const priorItems = itemIds(gitShow('public/data/snapshots/items.json'));
  const priorRecipes = recipeKeys(gitShow('public/data/snapshots/recipes.json'));

  const curItemsRaw = await readFile(join(OUT_DIR, 'items.json'), 'utf-8');
  const curRecipesRaw = await readFile(join(OUT_DIR, 'recipes.json'), 'utf-8');
  const curItems = JSON.parse(curItemsRaw) as { bakedAt: number; items: Array<{ id: number }> };
  const priorBaked = JSON.parse(gitShow('public/data/snapshots/items.json')) as { bakedAt: number };

  const bundle = {
    bakedAt: curItems.bakedAt,
    prevBakedAt: priorBaked.bakedAt ?? null,
    newItems: newIdsSince(priorItems, curItems.items.map((i) => i.id)),
    newRecipeItems: newIdsSince(priorRecipes, recipeKeys(curRecipesRaw)),
  };

  await writeFile(join(OUT_DIR, 'whatsNew.json'), JSON.stringify(bundle));
  process.stdout.write(
    `whatsNew.json: ${bundle.newItems.length} new items, ${bundle.newRecipeItems.length} new recipes ` +
    `(prev bake ${new Date(bundle.prevBakedAt!).toISOString()})\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`backfill failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Run the backfill**

Run: `npx tsx scripts/backfillWhatsNew.ts`
Expected: prints a line like `whatsNew.json: NNN new items, MMM new recipes (prev bake 2026-05-25T22:45:19.689Z)`. `NNN` should be ≤ 512, `MMM` should be ≤ 135.

- [ ] **Step 3: Sanity-check the output**

Run: `node -e "const b=require('./public/data/snapshots/whatsNew.json'); console.log({items:b.newItems.length, recipes:b.newRecipeItems.length, prevBakedAt:b.prevBakedAt, sampleItems:b.newItems.slice(0,5)})"`
Expected: non-empty `newItems`, `prevBakedAt` = 1779749119689.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfillWhatsNew.ts public/data/snapshots/whatsNew.json
git commit -m "feat(whats-new): backfill whatsNew.json for current patch from git history"
```

---

## Task 3: Bake-script integration (forward-looking)

Make every future `npm run snapshots` produce `whatsNew.json` automatically by diffing the prior on-disk bundles (read before overwrite) against the freshly fetched data, and add counts to the manifest.

**Files:**
- Modify: `scripts/bake-snapshots.ts`

- [ ] **Step 1: Add prior-ID capture + bakeWhatsNew helper**

Add this import near the top of `scripts/bake-snapshots.ts` (after the existing imports):

```ts
import { readFile } from 'node:fs/promises';
import { newIdsSince } from './whatsNewDiff';
```

(Note: `writeFile` and `mkdir` are already imported from `node:fs/promises`; merge `readFile` into that existing import line instead of duplicating if your linter flags it. `main()` already does a dynamic `import('node:fs/promises')` for readFile at the bottom — replace that dynamic import usage with this top-level `readFile`.)

Add these helpers above `main()`:

```ts
/** Read IDs from an existing on-disk bundle; empty + null bakedAt if absent (first bake). */
async function readPriorItemIds(): Promise<{ ids: number[]; bakedAt: number | null }> {
  try {
    const raw = JSON.parse(await readFile(join(OUT_DIR, 'items.json'), 'utf-8')) as {
      bakedAt: number; items: Array<{ id: number }>;
    };
    return { ids: raw.items.map((i) => i.id), bakedAt: raw.bakedAt };
  } catch {
    return { ids: [], bakedAt: null };
  }
}

async function readPriorRecipeKeys(): Promise<number[]> {
  try {
    const raw = JSON.parse(await readFile(join(OUT_DIR, 'recipes.json'), 'utf-8')) as {
      entries: Array<[number, unknown]>;
    };
    return raw.entries.map(([id]) => id);
  } catch {
    return [];
  }
}

async function bakeWhatsNew(
  bakedAt: number,
  prevBakedAt: number | null,
  priorItemIds: number[],
  priorRecipeKeys: number[],
  curItemIds: number[],
  curRecipeKeys: number[],
) {
  const bundle = {
    bakedAt,
    prevBakedAt,
    newItems: newIdsSince(priorItemIds, curItemIds),
    newRecipeItems: newIdsSince(priorRecipeKeys, curRecipeKeys),
  };
  await writeFile(join(OUT_DIR, 'whatsNew.json'), JSON.stringify(bundle));
  log('whatsNew', `wrote ${bundle.newItems.length} new items, ${bundle.newRecipeItems.length} new recipes`);
  return { newItems: bundle.newItems.length, newRecipeItems: bundle.newRecipeItems.length };
}
```

- [ ] **Step 2: Capture prior IDs at the start of `main()` (before any bake overwrites files)**

In `main()`, immediately after `await mkdir(OUT_DIR, { recursive: true });` and before `const bakedAt = Date.now();`, add:

```ts
  // Capture the PREVIOUS bake's IDs before bakeItems/bakeRecipes overwrite them.
  const prior = await readPriorItemIds();
  const priorRecipeKeys = await readPriorRecipeKeys();
```

- [ ] **Step 3: Reuse the already-read current items + read current recipe keys, then bake whatsNew**

`main()` already reads `items.json` back into `itemsRaw` (the block that builds `namesById`). Right after `companyCraft` is baked and before building `manifest`, add:

```ts
  const curItemIds = itemsRaw.items.map((i) => i.id);
  const curRecipesRaw = JSON.parse(await readFile(join(OUT_DIR, 'recipes.json'), 'utf-8')) as {
    entries: Array<[number, unknown]>;
  };
  const curRecipeKeys = curRecipesRaw.entries.map(([id]) => id);
  const whatsNew = await bakeWhatsNew(
    bakedAt, prior.bakedAt, prior.ids, priorRecipeKeys, curItemIds, curRecipeKeys,
  );
```

(The existing `const { readFile } = await import('node:fs/promises');` line in `main()` is now redundant — delete it, since `readFile` is imported at the top.)

- [ ] **Step 4: Add whatsNew to the manifest counts**

Change the `manifest.counts` object to include the new counts:

```ts
    counts: { items, recipes, leves, vendorShop: vendor, specialShop: special, gathering, quests, companyCraft, whatsNew },
```

- [ ] **Step 5: Type-check the script compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (If `whatsNew` object vs number mismatch in manifest is flagged, confirm `counts.whatsNew` holds the `{ newItems, newRecipeItems }` object — that is intended.)

- [ ] **Step 6: Commit**

```bash
git add scripts/bake-snapshots.ts
git commit -m "feat(whats-new): bake whatsNew.json on every snapshot bake"
```

---

## Task 4: Static bundle loader

**Files:**
- Modify: `src/lib/staticSnapshots.ts`
- Test: `src/lib/staticSnapshots.test.ts` (existing file — add a case)

- [ ] **Step 1: Add the failing test case**

Append to `src/lib/staticSnapshots.test.ts`:

```ts
import { loadStaticWhatsNewSnapshot } from './staticSnapshots';

describe('loadStaticWhatsNewSnapshot', () => {
  it('maps the bundle into StaticBundle<WhatsNewData>', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ bakedAt: 123, prevBakedAt: 100, newItems: [7, 8], newRecipeItems: [9] }),
    } as Response);
    const got = await loadStaticWhatsNewSnapshot();
    expect(got).toEqual({
      bakedAt: 123,
      data: { prevBakedAt: 100, newItems: [7, 8], newRecipeItems: [9] },
    });
  });

  it('returns null when the bundle is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);
    expect(await loadStaticWhatsNewSnapshot()).toBeNull();
  });
});
```

(If `describe`/`it`/`expect`/`vi` are not already imported in this file, add `import { describe, it, expect, vi } from 'vitest';` at the top — check the existing header first and reuse it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/staticSnapshots.test.ts`
Expected: FAIL — `loadStaticWhatsNewSnapshot` is not exported.

- [ ] **Step 3: Implement the loader**

Add to `src/lib/staticSnapshots.ts` (after `loadStaticItemsSnapshot`):

```ts
export interface WhatsNewData {
  prevBakedAt: number | null;
  newItems: number[];
  newRecipeItems: number[];
}

export async function loadStaticWhatsNewSnapshot(): Promise<StaticBundle<WhatsNewData> | null> {
  const raw = await load<{ bakedAt: number; prevBakedAt: number | null; newItems: number[]; newRecipeItems: number[] }>(
    `${BASE}/whatsNew.json`,
  );
  return raw
    ? { bakedAt: raw.bakedAt, data: { prevBakedAt: raw.prevBakedAt, newItems: raw.newItems, newRecipeItems: raw.newRecipeItems } }
    : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/staticSnapshots.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/staticSnapshots.ts src/lib/staticSnapshots.test.ts
git commit -m "feat(whats-new): static loader for whatsNew bundle"
```

---

## Task 5: Runtime hook `useWhatsNewSnapshot`

Static-bundle only (derived artifact — no IDB cache, no live fallback). If the bundle is missing (older deploy), return empty arrays so the page shows an empty state instead of erroring.

**Files:**
- Create: `src/features/queries/useWhatsNewSnapshot.ts`

- [ ] **Step 1: Implement the hook**

```ts
// src/features/queries/useWhatsNewSnapshot.ts
import { useQuery } from '@tanstack/react-query';
import { loadStaticWhatsNewSnapshot, type WhatsNewData } from '../../lib/staticSnapshots';

export interface WhatsNewSnapshot extends WhatsNewData {
  bakedAt: number | null;
}

const EMPTY: WhatsNewSnapshot = { bakedAt: null, prevBakedAt: null, newItems: [], newRecipeItems: [] };

export function useWhatsNewSnapshot() {
  return useQuery<WhatsNewSnapshot>({
    queryKey: ['whatsNewSnapshot'],
    staleTime: Infinity,
    queryFn: async () => {
      const bundle = await loadStaticWhatsNewSnapshot();
      if (!bundle) return EMPTY;
      return { bakedAt: bundle.bakedAt, ...bundle.data };
    },
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/useWhatsNewSnapshot.ts
git commit -m "feat(whats-new): useWhatsNewSnapshot runtime hook"
```

---

## Task 6: Types + pure row builder `runWhatsNew`

**Files:**
- Modify: `src/features/queries/types.ts`
- Create: `src/features/queries/runWhatsNew.ts`
- Test: `src/features/queries/runWhatsNew.test.ts`

- [ ] **Step 1: Add types to `src/features/queries/types.ts`**

Append at the end of the file:

```ts
export type WhatsNewTab = 'items' | 'recipes';
export type WhatsNewSort = 'velocity' | 'price' | 'freshness' | 'name';

export interface WhatsNewFilter {
  tab: WhatsNewTab;
  tradeableOnly: boolean;
  minVelocity: number;
  sort: WhatsNewSort;
  limit: number;
}

export interface WhatsNewRow {
  id: number;
  name: string;
  sc: number;
  craftable: boolean;
  hq: boolean;
  price: number | null;
  velocity: number;
  recentSales: number;
  lastSaleMs: number | null;
  daysSinceLastSale: number | null;
}

export function defaultWhatsNewFilter(): WhatsNewFilter {
  return { tab: 'items', tradeableOnly: true, minVelocity: 0, sort: 'velocity', limit: 200 };
}
```

- [ ] **Step 2: Write the failing test for the builder**

```ts
// src/features/queries/runWhatsNew.test.ts
import { describe, it, expect } from 'vitest';
import { runWhatsNew } from './runWhatsNew';
import { defaultWhatsNewFilter } from './types';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';

function item(id: number, name: string): SnapshotItem {
  return { id, name, sc: 1, ui: 1, ilvl: 1, canHq: true };
}

function market(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: 100, medianHQ: null,
    recentSalesNQ: 3, recentSalesHQ: 0, velocity: 2, lastUploadTime: 0, listingCount: 5,
    worldListings: [], averagePriceNQ: 100, averagePriceHQ: null, lastSaleMs: 1000, ...over,
  };
}

const NOW = 1000 + 86_400_000; // exactly 1 day after lastSaleMs=1000

describe('runWhatsNew', () => {
  const items = new Map<number, SnapshotItem>([
    [1, item(1, 'Alpha')],
    [2, item(2, 'Beta')],
    [3, item(3, 'Gamma')], // untradeable: no market entry
  ]);
  const data: MarketData = {
    1: market({ velocity: 5, medianNQ: 200, recentSalesNQ: 4 }),
    2: market({ velocity: 1, medianNQ: 50, recentSalesNQ: 2 }),
  };
  const recipeKeys = new Set<number>([2]);

  it('builds rows for tradeable new items, sorted by velocity desc', () => {
    const rows = runWhatsNew([1, 2, 3], items, data, recipeKeys, defaultWhatsNewFilter(), NOW);
    expect(rows.map((r) => r.id)).toEqual([1, 2]); // 3 dropped (tradeableOnly, no market)
    expect(rows[0].velocity).toBe(5);
    expect(rows[0].price).toBe(200);
    expect(rows[0].daysSinceLastSale).toBe(1);
  });

  it('flags craftable rows', () => {
    const rows = runWhatsNew([1, 2], items, data, recipeKeys, defaultWhatsNewFilter(), NOW);
    expect(rows.find((r) => r.id === 2)!.craftable).toBe(true);
    expect(rows.find((r) => r.id === 1)!.craftable).toBe(false);
  });

  it('includes untradeable items with null price when tradeableOnly is false', () => {
    const filter = { ...defaultWhatsNewFilter(), tradeableOnly: false, sort: 'name' as const };
    const rows = runWhatsNew([1, 2, 3], items, data, recipeKeys, filter, NOW);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]); // name asc: Alpha, Beta, Gamma
    expect(rows.find((r) => r.id === 3)!.price).toBeNull();
    expect(rows.find((r) => r.id === 3)!.velocity).toBe(0);
  });

  it('drops rows below minVelocity', () => {
    const filter = { ...defaultWhatsNewFilter(), minVelocity: 2 };
    const rows = runWhatsNew([1, 2], items, data, recipeKeys, filter, NOW);
    expect(rows.map((r) => r.id)).toEqual([1]); // item 2 velocity 1 < 2
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/features/queries/runWhatsNew.test.ts`
Expected: FAIL — cannot find module `./runWhatsNew`.

- [ ] **Step 4: Implement the builder**

```ts
// src/features/queries/runWhatsNew.ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { WhatsNewFilter, WhatsNewRow, WhatsNewSort } from './types';

const DAY_MS = 86_400_000;

/** Pick the sale-side price tier, preferring whichever tier sold more recently. */
function pickPrice(m: MarketItem): { price: number; isHq: boolean } | null {
  const nq = m.medianNQ ?? m.averagePriceNQ;
  const hq = m.medianHQ ?? m.averagePriceHQ;
  const nqTier = nq != null && nq > 0 ? { price: nq, isHq: false } : null;
  const hqTier = hq != null && hq > 0 ? { price: hq, isHq: true } : null;
  if (nqTier && hqTier) return m.recentSalesHQ > m.recentSalesNQ ? hqTier : nqTier;
  return nqTier ?? hqTier;
}

function compare(a: WhatsNewRow, b: WhatsNewRow, sort: WhatsNewSort): number {
  switch (sort) {
    case 'velocity': return b.velocity - a.velocity;
    case 'price':    return (b.price ?? -1) - (a.price ?? -1);
    case 'name':     return a.name.localeCompare(b.name);
    case 'freshness': {
      const ad = a.daysSinceLastSale, bd = b.daysSinceLastSale;
      if (ad == null && bd == null) return 0;
      if (ad == null) return 1;
      if (bd == null) return -1;
      return ad - bd;
    }
  }
}

export function runWhatsNew(
  ids: number[],
  items: Map<number, SnapshotItem>,
  market: MarketData,
  recipeKeys: Set<number>,
  filter: WhatsNewFilter,
  nowMs: number,
): WhatsNewRow[] {
  const out: WhatsNewRow[] = [];
  for (const id of ids) {
    const it = items.get(id);
    if (!it) continue; // ID no longer in catalog
    const m = market[id];
    if (filter.tradeableOnly && !m) continue;
    if (m && m.velocity < filter.minVelocity) continue;

    const tier = m ? pickPrice(m) : null;
    const lastSaleMs = m?.lastSaleMs ?? null;
    out.push({
      id: it.id,
      name: it.name,
      sc: it.sc,
      craftable: recipeKeys.has(it.id),
      hq: tier?.isHq ?? false,
      price: tier ? Math.round(tier.price) : null,
      velocity: m?.velocity ?? 0,
      recentSales: m ? m.recentSalesNQ + m.recentSalesHQ : 0,
      lastSaleMs,
      daysSinceLastSale: lastSaleMs != null ? (nowMs - lastSaleMs) / DAY_MS : null,
    });
  }
  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/queries/runWhatsNew.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/queries/types.ts src/features/queries/runWhatsNew.ts src/features/queries/runWhatsNew.test.ts
git commit -m "feat(whats-new): WhatsNew types + runWhatsNew row builder"
```

---

## Task 7: Results table `WhatsNewResults`

Mirrors `EmptyShelfResults.tsx` (same scaffold, SortableHeader, ItemNameLinks, density, CSV). Adds a Craftable badge column on the Items tab.

**Files:**
- Create: `src/features/queries/WhatsNewResults.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/features/queries/WhatsNewResults.tsx
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { WhatsNewRow, WhatsNewSort, WhatsNewTab } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: WhatsNewRow[];
  totalCandidates: number;
  skippedChunks: number;
  tab: WhatsNewTab;
  sort: WhatsNewSort;
  onSortChange: (next: WhatsNewSort) => void;
}

const CSV_COLUMNS: CsvColumn<WhatsNewRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'craftable', label: 'Craftable', value: (r) => (r.craftable ? 'yes' : '') },
  { key: 'price', label: 'Price', value: (r) => r.price ?? '' },
  { key: 'velocity', label: 'Velocity (sales/day)' },
  { key: 'recentSales', label: 'Recent sales' },
  { key: 'lastSaleMs', label: 'Days since last sale', value: (r) => (r.daysSinceLastSale == null ? '' : Math.round(r.daysSinceLastSale)) },
];

function lastSold(r: WhatsNewRow): string {
  if (r.daysSinceLastSale == null) return '—';
  const d = Math.round(r.daysSinceLastSale);
  return d <= 0 ? 'today' : `${d}d ago`;
}

function SortableHeader({ active, onClick, children, hideOnMobile = false }: {
  active: boolean; onClick: () => void; children: React.ReactNode; hideOnMobile?: boolean;
}) {
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none text-right ${hideOnMobile ? 'hidden md:table-cell' : ''} ${active ? 'text-gold' : 'text-text-dim hover:text-aether'}`}
      onClick={onClick}
      aria-sort={active ? 'descending' : 'none'}
    >
      {children}{active ? ' ▼' : ''}
    </th>
  );
}

export function WhatsNewResults({ rows, totalCandidates, skippedChunks, tab, sort, onSortChange }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  const showCraftable = tab === 'items';
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={<EmptyResults>No new {tab === 'items' ? 'items' : 'recipes'} are selling yet. Turn off “Tradeable only” to see every new entry, or lower Min sales/day.</EmptyResults>}
      csvColumns={CSV_COLUMNS}
      csvFilename={`whats-new-${tab}-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2 text-text-dim">#</th>
              <th className="text-left px-3 py-2 text-text-dim">Item</th>
              <SortableHeader active={sort === 'price'} onClick={() => onSortChange('price')}>Price</SortableHeader>
              <SortableHeader active={sort === 'velocity'} onClick={() => onSortChange('velocity')}>Sales/day</SortableHeader>
              <SortableHeader active={false} onClick={() => onSortChange('velocity')} hideOnMobile>Recent</SortableHeader>
              <SortableHeader active={sort === 'freshness'} onClick={() => onSortChange('freshness')}>Last sold</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks id={r.id} name={r.name} />
                  {showCraftable && r.craftable && (
                    <span className="ml-2 font-mono text-[9px] tracking-widest uppercase text-aether border border-aether/40 px-1 py-0.5 align-middle">craft</span>
                  )}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right`}>
                  {r.price == null ? <span className="text-text-low">—</span> : fmtGil(r.price)}
                  {r.hq && <span className="text-gold ml-1 inline-flex items-baseline"><HqStar /></span>}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} font-mono text-right text-text-low hidden md:table-cell`}>{r.recentSales}</td>
                <td className={`px-3 ${rowY} font-mono text-right text-text-low`}>{lastSold(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/WhatsNewResults.tsx
git commit -m "feat(whats-new): WhatsNewResults table"
```

---

## Task 8: View `WhatsNewView` + route wrapper

Mirrors `EmptyShelfView.tsx`: loads snapshots, fetches market for the active tab's IDs via `fetchInBatches`, auto-runs on mount, renders a tab switcher + filter bar + results.

**Files:**
- Create: `src/features/insights/WhatsNewView.tsx`
- Create: `src/routes/WhatsNew.tsx`

- [ ] **Step 1: Implement the view**

```tsx
// src/features/insights/WhatsNewView.tsx
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useWhatsNewSnapshot } from '../queries/useWhatsNewSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runWhatsNew } from '../queries/runWhatsNew';
import { WhatsNewResults } from '../queries/WhatsNewResults';
import { defaultWhatsNewFilter, type WhatsNewFilter, type WhatsNewSort, type WhatsNewTab } from '../queries/types';
import { Spinner, SpinGlyph } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { useInitialScan } from '../queries/useInitialScan';

interface RunResult { saleMap: MarketData; skipped: number; tabAtRun: WhatsNewTab; }

export function WhatsNewView() {
  const { world } = useSettingsStore();
  const itemSnap = useItemSnapshot();
  const recipeSnap = useRecipeSnapshot();
  const whatsNew = useWhatsNewSnapshot();
  const [filter, setFilter] = useState<WhatsNewFilter>(defaultWhatsNewFilter());
  const [sort, setSort] = useState<WhatsNewSort>(defaultWhatsNewFilter().sort);

  const itemsById = useMemo(() => {
    const m = new Map<number, import('../../lib/itemSnapshot').SnapshotItem>();
    if (itemSnap.data) for (const it of itemSnap.data.items) m.set(it.id, it);
    return m;
  }, [itemSnap.data]);

  const recipeKeys = useMemo(
    () => new Set<number>(recipeSnap.data ? [...recipeSnap.data.keys()] : []),
    [recipeSnap.data],
  );

  const activeIds = useMemo(() => {
    if (!whatsNew.data) return [];
    return filter.tab === 'items' ? whatsNew.data.newItems : whatsNew.data.newRecipeItems;
  }, [whatsNew.data, filter.tab]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      const sale = await fetchInBatches<MarketData[string]>(
        activeIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: sale.data, skipped: sale.errors.length, tabAtRun: filter.tab };
    },
  });

  const rows = useMemo(() => {
    if (!run.data) return [];
    return runWhatsNew(activeIds, itemsById, run.data.saleMap, recipeKeys, { ...filter, sort }, Date.now());
  }, [run.data, activeIds, itemsById, recipeKeys, filter, sort]);

  const ready = itemSnap.data != null && whatsNew.data != null;
  const tabStale = run.data != null && run.data.tabAtRun !== filter.tab;
  // Auto-run once when ready; re-run is triggered on tab change below.
  useInitialScan(ready, () => { run.reset(); run.mutate(); });

  const patchDate = whatsNew.data?.bakedAt ? new Date(whatsNew.data.bakedAt).toISOString().slice(0, 10) : null;
  const count = activeIds.length;

  return (
    <div className="space-y-4">
      {patchDate && (
        <div className="font-mono text-[11px] tracking-widest uppercase text-text-low">
          {count.toLocaleString()} new {filter.tab === 'items' ? 'items' : 'recipes'} since the {patchDate} update
        </div>
      )}

      <TabBar
        tab={filter.tab}
        onTab={(tab) => { setFilter({ ...filter, tab }); run.reset(); run.mutate(); }}
        filter={filter}
        onChange={setFilter}
        onRun={() => { run.reset(); run.mutate(); }}
        busy={run.isPending}
        notReady={!ready}
        stale={tabStale}
      />

      {run.isPending && <Spinner label={`Checking ${world} market for new ${filter.tab}…`} />}
      {run.isError && <StatusBanner kind="error">Lookup failed: {(run.error as Error).message}</StatusBanner>}

      {!run.data && !run.isPending && (
        <EmptyState icon="✦" message={ready ? 'Loading the patch’s new entries…' : 'Loading catalog…'} />
      )}

      {run.data && (
        <WhatsNewResults
          rows={rows}
          totalCandidates={count}
          skippedChunks={run.data.skipped}
          tab={filter.tab}
          sort={sort}
          onSortChange={setSort}
        />
      )}
    </div>
  );
}

function TabBar({ tab, onTab, filter, onChange, onRun, busy, notReady, stale }: {
  tab: WhatsNewTab; onTab: (t: WhatsNewTab) => void;
  filter: WhatsNewFilter; onChange: (f: WhatsNewFilter) => void;
  onRun: () => void; busy: boolean; notReady: boolean; stale: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card justify-between">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Show</span>
        <div className="flex gap-2">
          {(['items', 'recipes'] as WhatsNewTab[]).map((t) => (
            <button key={t} type="button" onClick={() => onTab(t)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${tab === t ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'}`}>
              {t === 'items' ? 'New items' : 'New recipes'}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min sales/day</span>
        <input type="number" inputMode="decimal" min={0} step={0.1} value={filter.minVelocity}
          onChange={(e) => onChange({ ...filter, minVelocity: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <label className="flex items-center gap-2 pb-2">
        <input type="checkbox" checked={filter.tradeableOnly}
          onChange={(e) => onChange({ ...filter, tradeableOnly: e.target.checked })} />
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Tradeable only</span>
      </label>
      <div className="flex flex-col items-stretch gap-1 w-full sm:w-auto sm:ml-auto order-last">
        {stale && !busy && (
          <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80 text-right">Tab changed — Refresh to load</span>
        )}
        <button type="button" onClick={onRun} disabled={busy || notReady}
          className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
          {busy ? <>Loading…<SpinGlyph /></> : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the route wrapper**

```tsx
// src/routes/WhatsNew.tsx
import { WhatsNewView } from '../features/insights/WhatsNewView';

export default function WhatsNew() {
  return <WhatsNewView />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirm `useSettingsStore` exposes `world` and `Spinner`/`SpinGlyph`/`StatusBanner`/`EmptyState` export names match the Empty Shelf imports — they are copied verbatim from `EmptyShelfView.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add src/features/insights/WhatsNewView.tsx src/routes/WhatsNew.tsx
git commit -m "feat(whats-new): WhatsNewView + route wrapper"
```

---

## Task 9: Wire route + navigation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Import + register the route in `src/App.tsx`**

Add the import alongside the other route imports (after the `EmptyShelf` import line):

```ts
import WhatsNew from './routes/WhatsNew';
```

Add the route inside the inner `<Routes>` block, right after the `/empty-shelf` route:

```tsx
                      <Route path="/whats-new" element={<WhatsNew />} />
```

Add the page title to `PAGE_TITLES` (after the `/empty-shelf` entry):

```ts
  '/whats-new': "What's New",
```

- [ ] **Step 2: Add the Sidebar nav link**

In `src/components/layout/Sidebar.tsx`, in the `'Gil-Making'` group's `items` array, add after the `Empty Shelf` entry:

```ts
      { label: "What's New", path: '/whats-new' },
```

- [ ] **Step 3: Add the Header nav link**

In `src/components/layout/Header.tsx`, after the `Empty Shelf` NavLink:

```tsx
            <NavLink to="/whats-new" className={navClass}>What's New</NavLink>
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no warnings.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx src/components/layout/Header.tsx
git commit -m "feat(whats-new): route + nav links"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: all tests pass, including the three new test files.

- [ ] **Step 2: Type-check + lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds (tsc + vite build + build:api).

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, open the app, navigate to **What's New** via the sidebar.
Expected:
- Banner reads "N new items since the 2026-06-02 update."
- Items tab auto-loads a table with price/sales-day/recent/last-sold columns, sorted by sales/day.
- Toggling **New recipes** reloads with the recipe list.
- Toggling **Tradeable only** off shows additional rows with "—" prices.
- A few new items show a `craft` badge on the Items tab.

- [ ] **Step 5: Final commit (if any smoke-test fixes were needed)**

```bash
git add -A
git commit -m "fix(whats-new): smoke-test adjustments"
```

---

## Notes for the implementer

- **Patterns to copy verbatim:** `EmptyShelfView.tsx`, `EmptyShelfResults.tsx`, `runEmptyShelf.ts`. The new files are deliberate parallels — keep imports and class names identical so the page matches the established insight-page look.
- **Market fetch is cache-backed:** `fetchMarketData` reads the in-memory/IDB cache seeded from the bot's hourly blob plus any live fetches `fetchInBatches` performs; no extra wiring needed.
- **Do not re-run `npm run snapshots`** as part of this work — Task 2 backfills `whatsNew.json` from git without hitting XIVAPI.
- **`counts.whatsNew` in the manifest is an object** (`{ newItems, newRecipeItems }`), intentionally unlike the other numeric counts.
