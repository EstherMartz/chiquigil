# Unified Crafting Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CompanyCraft (workshop / submarine) support to the Discord crafting planner under the same `/craft new` flow, and mirror all open projects into a read-only web view at `/projects` + `/projects/:id`.

**Architecture:** A new `companyCraft.json` snapshot is baked offline from XIVAPI v2's `CompanyCraftSequence`/`Part`/`Process`/`SupplyItem` sheets, flattened so each top-level sequence becomes one synthetic recipe (all phases aggregated into a single ingredient bucket). `buildBreakdown` falls back to this map when the standard recipe lookup misses and emits a single `source: 'workshop'` task plus the usual `gather`/`market`/`vendor`/`currency` leaves. The web side adds a new Vercel Function `api/projects.mjs` that reads the existing Turso `projects`+`tasks` tables (no schema changes) and TanStack-Query-polls them every 30s into two new React routes.

**Tech Stack:** TypeScript, Vitest, React 18, TanStack Query, react-router-dom, Vercel Functions (Node), `@libsql/client` (Turso), esbuild (`--bundle --packages=external --format=esm`), Tailwind, Zustand.

**Spec:** [docs/superpowers/specs/2026-05-27-unified-crafting-planner-design.md](../specs/2026-05-27-unified-crafting-planner-design.md)

---

## File Structure

### Files created

```
src/lib/companyCraftSnapshot.ts        # XIVAPI v2 fetcher + parser (mirrors recipeSnapshot.ts)
src/lib/companyCraftSnapshot.test.ts   # Parser unit tests against an inlined fixture row
src/api/projects.ts                    # Vercel Function: GET /api/projects, GET /api/projects/:id
src/api/projects.test.ts               # Function tests with a fake CraftStore
src/features/projects/types.ts         # Shared response types (re-export TaskSource etc.)
src/features/projects/useProjects.ts   # TanStack Query hook → list
src/features/projects/useProject.ts    # TanStack Query hook → detail
src/features/projects/ProjectsList.tsx
src/features/projects/ProjectsList.test.tsx
src/features/projects/ProjectDetail.tsx
src/features/projects/ProjectDetail.test.tsx
src/routes/Projects.tsx                # /projects route
src/routes/Project.tsx                 # /projects/:id route
public/data/snapshots/companyCraft.json  # baked output, committed
```

### Files modified

```
src/bot/craftTypes.ts                # Add 'workshop' to TaskSource union
src/bot/craftSourcing.ts             # Branch on companyCraft when recipes miss
src/bot/craftSourcing.test.ts        # New file or expand: workshop-path tests
src/bot/nameIndex.ts                 # Accept extra name→id pairs at build
src/bot/nameIndex.test.ts            # Add CompanyCraft-name test (new file if missing)
src/bot/loadSnapshots.ts             # Load companyCraft.json into BotSnapshots
src/bot/craftRender.ts               # Render 'workshop' source line + section header
src/bot/craftStrings.ts              # SECTION_WORKSHOP string
src/api/discord.ts                   # Pass companyCraft through to buildBreakdown
scripts/bake-snapshots.ts            # New bakeCompanyCraft step
package.json                         # build:api includes projects.ts entry
src/App.tsx                          # Routes for /projects + /projects/:id
src/components/layout/Sidebar.tsx    # Nav entry under "Gil-Making" group
api/discord.mjs                      # Rebuilt by build:api (do not hand-edit)
api/projects.mjs                     # New bundle output
```

### Files NOT touched (intentionally)

- `src/lib/recipeCache.ts` — DB_VERSION stays at 11. The web client never loads companyCraft directly; only the bot uses it server-side via `loadSnapshots.ts`, which fetches the JSON file each cold-start. Spec section "IDB cache version bump" is moot for V1; revisit only if a future feature ingests companyCraft on the web client.
- `src/bot/craftStore.ts` — `tasks.source` is a free-form `TEXT` column, so `'workshop'` writes without a schema change.

---

## Task 1: Add `'workshop'` to the TaskSource type

**Files:**
- Modify: `src/bot/craftTypes.ts:4`

- [ ] **Step 1: Extend the union**

Edit `src/bot/craftTypes.ts` line 4 from:

```ts
export type TaskSource = 'craft' | 'market' | 'vendor' | 'currency' | 'gather';
```

to:

```ts
export type TaskSource = 'craft' | 'workshop' | 'market' | 'vendor' | 'currency' | 'gather';
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no consumers yet narrow on the union, so this is additive.

- [ ] **Step 3: Commit**

```bash
git add src/bot/craftTypes.ts
git commit -m "feat(craft): add 'workshop' TaskSource for CompanyCraft items"
```

---

## Task 2: CompanyCraft snapshot fetcher

Build `src/lib/companyCraftSnapshot.ts` that paginates XIVAPI v2's `CompanyCraftSequence` sheet and flattens each row's Part/Process/SupplyItem tree into a single ingredient bucket per sequence. Mirrors the structure of `src/lib/recipeSnapshot.ts`.

**XIVAPI v2 array filter recap** (from [memory:reference_xivapi_v2_quirks](../../../memory/reference_xivapi_v2_quirks.md)): for nested array fields use `Field[].subfield` syntax. The CompanyCraft chain is deep, so we'll request only the columns we need.

**Files:**
- Create: `src/lib/companyCraftSnapshot.ts`
- Create: `src/lib/companyCraftSnapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/companyCraftSnapshot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCompanyCraftRow, type CompanyCraftRecipe } from './companyCraftSnapshot';

describe('parseCompanyCraftRow', () => {
  it('flattens part→process→supplyItem into one ingredient bucket', () => {
    const row = {
      row_id: 17,
      fields: {
        ResultItem: { value: 31600 },
        CompanyCraftPart: [
          {
            fields: {
              CompanyCraftProcess: [
                {
                  fields: {
                    SupplyItem: [
                      { fields: { Item: { value: 5106 } } },
                      { fields: { Item: { value: 5107 } } },
                    ],
                    SetQuantity: [3, 5],
                    SetsRequired: [2, 2],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    const result = parseCompanyCraftRow(row, new Map([
      [31600, 'Tatanora Hull'],
      [5106, 'Iron Ore'],
      [5107, 'Hardsilver Ore'],
    ]));
    const expected: CompanyCraftRecipe = {
      resultItemId: 31600,
      resultName: 'Tatanora Hull',
      ingredients: [
        { itemId: 5106, qty: 6 },   // 3 × 2
        { itemId: 5107, qty: 10 },  // 5 × 2
      ],
    };
    expect(result).toEqual(expected);
  });

  it('sums duplicate ingredients across phases', () => {
    const row = {
      row_id: 1,
      fields: {
        ResultItem: { value: 100 },
        CompanyCraftPart: [
          {
            fields: {
              CompanyCraftProcess: [
                { fields: { SupplyItem: [{ fields: { Item: { value: 50 } } }], SetQuantity: [4], SetsRequired: [3] } },
                { fields: { SupplyItem: [{ fields: { Item: { value: 50 } } }], SetQuantity: [2], SetsRequired: [1] } },
              ],
            },
          },
        ],
      },
    };
    const result = parseCompanyCraftRow(row, new Map([[100, 'X'], [50, 'Ore']]));
    expect(result?.ingredients).toEqual([{ itemId: 50, qty: 14 }]); // 4·3 + 2·1
  });

  it('returns null when ResultItem is missing or zero', () => {
    const row = { row_id: 1, fields: { ResultItem: { value: 0 }, CompanyCraftPart: [] } };
    expect(parseCompanyCraftRow(row, new Map())).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/companyCraftSnapshot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the fetcher + parser**

Create `src/lib/companyCraftSnapshot.ts`:

```ts
/**
 * One-shot paginated fetch of XIVAPI v2's CompanyCraftSequence sheet.
 * Each row produces one synthetic recipe with all phases aggregated into a
 * single ingredient bucket (per the unified-crafting-planner spec). Used by
 * the bot to make /craft new <workshop-item> work without a real recipe row.
 */
import { fetchXivapiPage, nextCursor } from './xivapiRetry';

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const PAGE_SIZE = 100;

// Deep field selector. Each level uses `[].sub` for array nesting.
const FIELDS = [
  'ResultItem.row_id',
  'CompanyCraftPart[].CompanyCraftProcess[].SupplyItem[].Item.row_id',
  'CompanyCraftPart[].CompanyCraftProcess[].SetQuantity',
  'CompanyCraftPart[].CompanyCraftProcess[].SetsRequired',
].join(',');

export interface CompanyCraftRecipe {
  resultItemId: number;
  resultName: string;
  ingredients: Array<{ itemId: number; qty: number }>;
}

export type CompanyCraftMap = Map<number, CompanyCraftRecipe>;

interface RawRow {
  row_id: number;
  fields: Record<string, unknown>;
}

interface RawPage {
  rows?: RawRow[];
}

export interface BuildOpts {
  onProgress?: (count: number) => void;
}

function buildPageUrl(after: number): string {
  const params = new URLSearchParams({ fields: FIELDS, limit: String(PAGE_SIZE) });
  if (after > 0) params.set('after', String(after));
  return `${BASE.replace(/\/$/, '')}/api/sheet/CompanyCraftSequence?${params.toString()}`;
}

function readArrayField(row: any, key: string): any[] {
  const v = row?.[key];
  return Array.isArray(v) ? v : [];
}

export function parseCompanyCraftRow(
  row: RawRow,
  namesById: Map<number, string>,
): CompanyCraftRecipe | null {
  const f = row.fields as any;
  const resultItemId = (f.ResultItem as { value?: number } | undefined)?.value ?? 0;
  if (resultItemId <= 0) return null;

  const totals = new Map<number, number>();
  for (const part of readArrayField(f, 'CompanyCraftPart')) {
    const partFields = (part as any).fields ?? part;
    for (const process of readArrayField(partFields, 'CompanyCraftProcess')) {
      const procFields = (process as any).fields ?? process;
      const supplies = readArrayField(procFields, 'SupplyItem');
      const setQty = readArrayField(procFields, 'SetQuantity');
      const setsReq = readArrayField(procFields, 'SetsRequired');
      for (let i = 0; i < supplies.length; i++) {
        const sup = supplies[i];
        const supFields = (sup as any).fields ?? sup;
        const itemId = (supFields.Item as { value?: number } | undefined)?.value ?? 0;
        if (itemId <= 0) continue;
        const qty = Number(setQty[i] ?? 0) * Number(setsReq[i] ?? 0);
        if (qty <= 0) continue;
        totals.set(itemId, (totals.get(itemId) ?? 0) + qty);
      }
    }
  }
  if (totals.size === 0) return null;

  return {
    resultItemId,
    resultName: namesById.get(resultItemId) ?? `Item #${resultItemId}`,
    ingredients: [...totals.entries()].map(([itemId, qty]) => ({ itemId, qty })),
  };
}

export async function fetchCompanyCraftSnapshot(
  namesById: Map<number, string>,
  opts: BuildOpts = {},
): Promise<CompanyCraftMap> {
  const out: CompanyCraftMap = new Map();
  let after = 0;
  while (true) {
    const res = await fetchXivapiPage(buildPageUrl(after));
    if (!res.ok) throw new Error(`XIVAPI CompanyCraftSequence ${res.status}`);
    const page = (await res.json()) as RawPage;
    const rows = page.rows ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const parsed = parseCompanyCraftRow(row, namesById);
      if (parsed) out.set(parsed.resultItemId, parsed);
    }
    opts.onProgress?.(out.size);
    after = nextCursor(after, rows[rows.length - 1].row_id);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/companyCraftSnapshot.test.ts`
Expected: PASS — three tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/companyCraftSnapshot.ts src/lib/companyCraftSnapshot.test.ts
git commit -m "feat(snapshots): add CompanyCraftSequence fetcher + parser"
```

---

## Task 3: Bake the CompanyCraft snapshot

Wire `fetchCompanyCraftSnapshot` into `scripts/bake-snapshots.ts` so the snapshot is written to `public/data/snapshots/companyCraft.json` alongside `recipes.json` and friends.

**Files:**
- Modify: `scripts/bake-snapshots.ts`

- [ ] **Step 1: Import and add a bake step**

In `scripts/bake-snapshots.ts`, after the existing imports add:

```ts
import { fetchCompanyCraftSnapshot } from '../src/lib/companyCraftSnapshot';
```

Add a new bake function after `bakeQuests` (around line 104):

```ts
async function bakeCompanyCraft(bakedAt: number, namesById: Map<number, string>) {
  log('companyCraft', 'fetching XIVAPI CompanyCraftSequence sheet…');
  const map = await fetchCompanyCraftSnapshot(namesById, {
    onProgress: (n) => process.stdout.write(`\r[companyCraft] ${n} sequences…`),
  });
  process.stdout.write('\n');
  await writeFile(
    join(OUT_DIR, 'companyCraft.json'),
    JSON.stringify({ bakedAt, entries: [...map.entries()] }),
  );
  log('companyCraft', `wrote ${map.size} sequences`);
  return map.size;
}
```

- [ ] **Step 2: Thread the names map into main()**

`bakeCompanyCraft` needs `namesById`. The existing `bakeItems` returns just a count, so refactor it to also return the items array OR pass the items list separately. Minimal-impact change: read the just-baked `items.json` from disk inside `main()`.

Replace the existing `main()` body (line 106) with:

```ts
async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const bakedAt = Date.now();
  const bakedAtIso = new Date(bakedAt).toISOString();

  const items = await bakeItems(bakedAt);
  const recipes = await bakeRecipes(bakedAt);
  const leves = await bakeLeves(bakedAt);
  const vendor = await bakeVendor(bakedAt);
  const special = await bakeSpecialShop(bakedAt);
  const gathering = await bakeGathering(bakedAt);
  const quests = await bakeQuests(bakedAt);

  // Read baked items back to build names map for CompanyCraft.
  const { readFile } = await import('node:fs/promises');
  const itemsRaw = JSON.parse(await readFile(join(OUT_DIR, 'items.json'), 'utf-8')) as {
    items: Array<{ id: number; name: string }>;
  };
  const namesById = new Map<number, string>(itemsRaw.items.map((i) => [i.id, i.name]));
  const companyCraft = await bakeCompanyCraft(bakedAt, namesById);

  const manifest = {
    bakedAt,
    bakedAtIso,
    counts: { items, recipes, leves, vendorShop: vendor, specialShop: special, gathering, quests, companyCraft },
  };
  await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log('manifest', `bake complete at ${bakedAtIso}`);
}
```

- [ ] **Step 3: Run the bake**

Run: `npm run snapshots`
Expected: console shows `[companyCraft] <N> sequences…` then `wrote N sequences`. Should produce `public/data/snapshots/companyCraft.json`. Run-time will be a few minutes total (most of it from the existing bakes, not the new one).

- [ ] **Step 4: Smoke-check the output**

```bash
node -e "const f=require('./public/data/snapshots/companyCraft.json'); console.log('entries:', f.entries.length); console.log('sample:', JSON.stringify(f.entries[0], null, 2));"
```

Expected: more than 50 entries; a sample row showing `{ resultItemId, resultName, ingredients: [...] }`.

- [ ] **Step 5: Commit**

```bash
git add scripts/bake-snapshots.ts public/data/snapshots/companyCraft.json public/data/snapshots/manifest.json
git commit -m "feat(snapshots): bake companyCraft.json"
```

---

## Task 4: Load CompanyCraft into BotSnapshots

The bot loads all snapshot bundles via `src/bot/loadSnapshots.ts` on cold-start. Add the new file to the parallel fetch and expose it through `BotSnapshots`.

**Files:**
- Modify: `src/bot/loadSnapshots.ts`

- [ ] **Step 1: Edit the loader**

Replace the entire body of `src/bot/loadSnapshots.ts` with:

```ts
import type { SnapshotItem } from '../lib/itemSnapshot';
import type { Recipe } from '../lib/recipes';
import type { GatheringInfo } from '../lib/gatheringCatalog';
import type { SpecialShopSnapshot } from '../lib/specialShopSnapshot';
import type { CompanyCraftRecipe } from '../lib/companyCraftSnapshot';

export interface BotSnapshots {
  itemsById: Map<number, SnapshotItem>;
  namesById: Map<number, string>;
  recipes: Map<number, Recipe>;
  vendorMap: Map<number, number>;
  specialShop: SpecialShopSnapshot;
  gatheringCatalog: Map<number, GatheringInfo>;
  companyCraft: Map<number, CompanyCraftRecipe>;
}

let cached: BotSnapshots | null = null;

export async function loadSnapshots(baseUrl: string): Promise<BotSnapshots> {
  if (cached) return cached;

  const [itemsRaw, recipesRaw, vendorRaw, specialRaw, gatherRaw, companyCraftRaw] = await Promise.all([
    fetch(`${baseUrl}/data/snapshots/items.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/recipes.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/vendorShop.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/specialShop.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/gathering.json`).then(r => r.json()),
    fetch(`${baseUrl}/data/snapshots/companyCraft.json`).then(r => r.json()),
  ]);

  const itemsById = new Map<number, SnapshotItem>();
  const namesById = new Map<number, string>();
  for (const item of (itemsRaw as { items: SnapshotItem[] }).items) {
    itemsById.set(item.id, item);
    namesById.set(item.id, item.name);
  }

  const recipes = new Map<number, Recipe>();
  for (const [id, recipe] of (recipesRaw as { entries: [number, Recipe][] }).entries) {
    recipes.set(id, recipe);
  }

  const vendorMap = new Map<number, number>();
  for (const [id, price] of (vendorRaw as { entries: [number, number][] }).entries) {
    vendorMap.set(id, price);
  }

  const specialShop: SpecialShopSnapshot = {
    byCurrency: new Map(
      (specialRaw as { byCurrency: [string, any[]][] }).byCurrency.map(
        ([currency, entries]) => [currency as any, entries] as [any, any]
      )
    ),
  };

  const gatheringCatalog = new Map<number, GatheringInfo>();
  for (const [id, info] of (gatherRaw as { entries: [number, GatheringInfo][] }).entries) {
    gatheringCatalog.set(id, info);
  }

  const companyCraft = new Map<number, CompanyCraftRecipe>();
  for (const [id, recipe] of (companyCraftRaw as { entries: [number, CompanyCraftRecipe][] }).entries) {
    companyCraft.set(id, recipe);
  }

  cached = { itemsById, namesById, recipes, vendorMap, specialShop, gatheringCatalog, companyCraft };
  return cached;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/bot/loadSnapshots.ts
git commit -m "feat(bot): load companyCraft.json into BotSnapshots"
```

---

## Task 5: Extend buildBreakdown with the workshop branch

When `recipes.get(targetId)` misses, fall back to `companyCraft.get(targetId)`. Build a flat list of leaf ingredients (treated identically to a recipe's leaves), survey them with the existing `surveyIngredients`, and emit one synthetic `source: 'workshop'` craft task.

**Files:**
- Modify: `src/bot/craftSourcing.ts`
- Create: `src/bot/craftSourcing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/bot/craftSourcing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBreakdown, type SourcingDeps } from './craftSourcing';
import type { CompanyCraftRecipe } from '../lib/companyCraftSnapshot';
import type { MarketBundle } from '../features/watchlist/useMarketData';

function emptyDeps(over: Partial<SourcingDeps> = {}): SourcingDeps {
  return {
    recipes: new Map(),
    namesById: new Map(),
    vendorMap: new Map(),
    specialShop: { byCurrency: new Map() },
    gatheringCatalog: new Map(),
    companyCraft: new Map(),
    ...over,
  };
}

const emptyMarket: MarketBundle = { phantom: {}, dc: {}, region: {} };

describe('buildBreakdown (workshop fallback)', () => {
  it('emits one workshop task + leaves when only companyCraft matches', () => {
    const cc: CompanyCraftRecipe = {
      resultItemId: 31600,
      resultName: 'Tatanora Hull',
      ingredients: [
        { itemId: 5106, qty: 6 },
        { itemId: 5107, qty: 10 },
      ],
    };
    const deps = emptyDeps({
      companyCraft: new Map([[31600, cc]]),
      namesById: new Map([[31600, 'Tatanora Hull'], [5106, 'Iron Ore'], [5107, 'Hardsilver Ore']]),
    });
    const out = buildBreakdown(31600, 1, emptyMarket, deps);
    expect(out.crafts).toHaveLength(1);
    expect(out.crafts[0]).toEqual({
      itemId: 31600,
      itemName: 'Tatanora Hull',
      qtyNeeded: 1,
      source: 'workshop',
      meta: {},
    });
    const acquireIds = out.acquire.map((t) => t.itemId).sort();
    expect(acquireIds).toEqual([5106, 5107]);
  });

  it('multiplies workshop ingredients by targetQty', () => {
    const cc: CompanyCraftRecipe = {
      resultItemId: 100,
      resultName: 'Submarine Panel',
      ingredients: [{ itemId: 50, qty: 3 }],
    };
    const deps = emptyDeps({
      companyCraft: new Map([[100, cc]]),
      namesById: new Map([[100, 'Submarine Panel'], [50, 'Steel']]),
    });
    const out = buildBreakdown(100, 4, emptyMarket, deps);
    expect(out.crafts[0].qtyNeeded).toBe(4);
    expect(out.acquire[0].qtyNeeded).toBe(12); // 3 × 4
  });

  it('prefers recipes over companyCraft when both exist (tie-breaker)', () => {
    const deps = emptyDeps({
      recipes: new Map(),       // populated below
      companyCraft: new Map([[
        7,
        { resultItemId: 7, resultName: 'X', ingredients: [{ itemId: 99, qty: 1 }] } as CompanyCraftRecipe,
      ]]),
      namesById: new Map([[7, 'X']]),
    });
    // Stub a recipe so the standard path wins.
    deps.recipes.set(7, {
      itemResultId: 7,
      ingredients: [],
      classJob: 'CRP',
      recipeLevel: 1,
      stars: 0,
      difficulty: 0,
      quality: 0,
      durability: 0,
      requiredCraftsmanship: 0,
      requiredControl: 0,
      amountResult: 1,
    } as any);
    const out = buildBreakdown(7, 1, emptyMarket, deps);
    expect(out.crafts[0].source).toBe('craft');     // not 'workshop'
  });

  it('returns empty breakdown when neither recipes nor companyCraft match', () => {
    const out = buildBreakdown(999, 1, emptyMarket, emptyDeps());
    expect(out.crafts).toEqual([]);
    expect(out.acquire).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bot/craftSourcing.test.ts`
Expected: FAIL — `companyCraft` not on `SourcingDeps`, no workshop branch.

- [ ] **Step 3: Implement the branch**

Replace `src/bot/craftSourcing.ts` with:

```ts
import type { Recipe } from '../lib/recipes';
import type { SpecialShopSnapshot } from '../lib/specialShopSnapshot';
import type { GatheringInfo } from '../lib/gatheringCatalog';
import type { CompanyCraftRecipe } from '../lib/companyCraftSnapshot';
import type { MarketBundle } from '../features/watchlist/useMarketData';
import { surveyIngredients } from '../features/shoppingList/shoppingListSurvey';
import { explode, type ExplodeOpts } from './craftExplode';
import type { Breakdown, CraftTask } from './craftTypes';

export interface SourcingDeps {
  recipes: Map<number, Recipe>;
  namesById: Map<number, string>;
  vendorMap: Map<number, number>;
  specialShop: SpecialShopSnapshot;
  gatheringCatalog: Map<number, GatheringInfo>;
  companyCraft: Map<number, CompanyCraftRecipe>;
}

export interface SourcingOpts extends ExplodeOpts {
  /** Max vendor price to prefer over gathering (default 100 gil). */
  cheapVendorThreshold?: number;
}

/**
 * Build acquire tasks from a flat leaf-map (Map<itemId, qty>) using the same
 * sourcing priority used by the standard recipe path.
 */
function sourceLeaves(
  leaves: Map<number, number>,
  market: MarketBundle,
  deps: SourcingDeps,
  cheapVendorThreshold: number,
): CraftTask[] {
  const survey = surveyIngredients(leaves, market.dc, deps.vendorMap, deps.specialShop);
  const acquire: CraftTask[] = [];
  for (const s of survey) {
    const name = deps.namesById.get(s.id) ?? `Item #${s.id}`;
    const gatherInfo = deps.gatheringCatalog.get(s.id);
    const vendorPrice = deps.vendorMap.get(s.id);

    if (gatherInfo && !(vendorPrice != null && vendorPrice <= cheapVendorThreshold) && !s.currency) {
      acquire.push({ itemId: s.id, itemName: name, qtyNeeded: s.qty, source: 'gather', meta: { gatherLevel: gatherInfo.level, timed: gatherInfo.timed } });
    } else if (s.currency) {
      acquire.push({ itemId: s.id, itemName: name, qtyNeeded: s.qty, source: 'currency', meta: { currency: s.currency.shortLabel, currencyId: s.currency.id, costPerUnit: s.currency.costPerUnit } });
    } else if (s.npc && s.autoSource === 'npc') {
      acquire.push({ itemId: s.id, itemName: name, qtyNeeded: s.qty, source: 'vendor', meta: { price: s.npc.price } });
    } else {
      acquire.push({ itemId: s.id, itemName: name, qtyNeeded: s.qty, source: 'market', meta: s.mb ? { world: s.mb.world, price: s.mb.price } : {} });
    }
  }
  return acquire;
}

/**
 * Builds a full Breakdown from a target item + quantity. Falls back to the
 * companyCraft snapshot when no standard recipe exists (e.g. submarine parts,
 * FC workshop furniture); recipes always win the tie if both exist.
 */
export function buildBreakdown(
  targetId: number,
  targetQty: number,
  market: MarketBundle,
  deps: SourcingDeps,
  opts: SourcingOpts = {},
): Breakdown {
  const cheapVendorThreshold = opts.cheapVendorThreshold ?? 100;

  // Path A — standard recipe: recursive explosion + per-leaf survey.
  if (deps.recipes.get(targetId)) {
    const { crafts: craftMap, leaves } = explode(targetId, targetQty, deps.recipes, opts);
    const acquire = sourceLeaves(leaves, market, deps, cheapVendorThreshold);
    const crafts: CraftTask[] = [];
    for (const [itemId, info] of craftMap) {
      const name = deps.namesById.get(itemId) ?? `Item #${itemId}`;
      crafts.push({
        itemId,
        itemName: name,
        qtyNeeded: info.outputQty,
        source: 'craft',
        meta: { job: info.job as CraftTask['meta']['job'] },
      });
    }
    return { crafts, acquire };
  }

  // Path B — CompanyCraft fallback: one synthetic workshop task + flat acquire leaves.
  const cc = deps.companyCraft.get(targetId);
  if (cc) {
    const leaves = new Map<number, number>();
    for (const ing of cc.ingredients) {
      leaves.set(ing.itemId, (leaves.get(ing.itemId) ?? 0) + ing.qty * targetQty);
    }
    const acquire = sourceLeaves(leaves, market, deps, cheapVendorThreshold);
    const workshopTask: CraftTask = {
      itemId: cc.resultItemId,
      itemName: deps.namesById.get(cc.resultItemId) ?? cc.resultName,
      qtyNeeded: targetQty,
      source: 'workshop',
      meta: {},
    };
    return { crafts: [workshopTask], acquire };
  }

  // Neither path matches.
  return { crafts: [], acquire: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/craftSourcing.test.ts`
Expected: PASS — four tests.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: PASS — older paths unaffected by the refactor.

- [ ] **Step 6: Commit**

```bash
git add src/bot/craftSourcing.ts src/bot/craftSourcing.test.ts
git commit -m "feat(bot): extend buildBreakdown with CompanyCraft fallback"
```

---

## Task 6: Fold CompanyCraft names into the name index

The bot's `/craft new <item>` autocomplete searches `nameIndex`, which is built from `namesById` (items only). CompanyCraft result items are already in `namesById` because they exist in the Item sheet — but only their *Item-sheet* name, which is what we want anyway. **No change needed if the result-item name is already in the Item snapshot.**

Verify this is the case, and only update the test plan if it is not.

**Files:**
- Modify: `src/bot/nameIndex.ts` (only if verification below shows a gap)
- Create: `src/bot/nameIndex.test.ts` (if missing)

- [ ] **Step 1: Verify CompanyCraft names are already covered**

Run a one-shot check:

```bash
node -e "
const items = require('./public/data/snapshots/items.json').items;
const cc = require('./public/data/snapshots/companyCraft.json').entries;
const itemIds = new Set(items.map(i => i.id));
const missing = cc.filter(([id, r]) => !itemIds.has(id));
console.log('total companyCraft sequences:', cc.length);
console.log('missing from items snapshot:', missing.length);
if (missing.length) console.log('first missing:', missing.slice(0, 3));
"
```

Expected: `missing from items snapshot: 0`. If 0, **skip steps 2-4** and go straight to step 5 to commit an empty change noting the verification result.

- [ ] **Step 2 (conditional): Write a failing test if names ARE missing**

Only if step 1 showed missing names. Create `src/bot/nameIndex.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildNameIndex, searchItems } from './nameIndex';

describe('buildNameIndex (with extras)', () => {
  it('includes extra names not already in namesById', () => {
    const namesById = new Map([[1, 'Iron Ore']]);
    const extras = new Map([[100, 'Tatanora Hull']]);
    const index = buildNameIndex(namesById, extras);
    expect(searchItems(index, 'Tatanora')[0]).toEqual({ id: 100, name: 'Tatanora Hull' });
  });

  it('does not overwrite an existing name', () => {
    const namesById = new Map([[1, 'Iron Ore']]);
    const extras = new Map([[1, 'WRONG']]);
    const index = buildNameIndex(namesById, extras);
    expect(index.get('iron ore')).toBe(1);
  });
});
```

Run: `npx vitest run src/bot/nameIndex.test.ts` → FAIL (2nd `buildNameIndex` arg not accepted).

- [ ] **Step 3 (conditional): Implement the extras parameter**

Update `src/bot/nameIndex.ts` `buildNameIndex` signature:

```ts
export function buildNameIndex(
  namesById: Map<number, string>,
  extras?: Map<number, string>,
): NameIndex {
  const map = new Map<string, number>() as NameIndex;
  const entries: NameEntry[] = [];
  for (const [id, name] of namesById) {
    const lower = name.toLowerCase();
    map.set(lower, id);
    entries.push({ id, name, lower });
  }
  if (extras) {
    for (const [id, name] of extras) {
      if (namesById.has(id)) continue;  // first-write wins
      const lower = name.toLowerCase();
      if (!map.has(lower)) map.set(lower, id);
      entries.push({ id, name, lower });
    }
  }
  entries.sort((a, b) => a.lower.localeCompare(b.lower));
  map._entries = entries;
  return map;
}
```

Run: `npx vitest run src/bot/nameIndex.test.ts` → PASS.

Then update `src/api/discord.ts` where `buildNameIndex(namesById)` is called to also pass the CompanyCraft names map.

- [ ] **Step 4 (conditional): Run full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bot/nameIndex.ts src/bot/nameIndex.test.ts src/api/discord.ts
git commit -m "feat(bot): fold CompanyCraft names into nameIndex (if needed)"
```

If verification in step 1 returned 0 missing, replace the commit body with: `chore(bot): verify CompanyCraft names are already in items snapshot — no nameIndex change needed`.

---

## Task 7: Render the workshop source in Discord embeds

Add a section header + render branch for `source: 'workshop'` tasks in `craftRender.ts`. The aesthetic should match the existing emoji-prefixed sections.

**Files:**
- Modify: `src/bot/craftRender.ts`
- Modify: `src/bot/craftStrings.ts`

- [ ] **Step 1: Add the Spanish copy**

Edit `src/bot/craftStrings.ts`. After the existing `SECTION_GATHER` line (line 27):

```ts
export const SECTION_WORKSHOP = '🛠 TALLER DE LA CL';   // "Taller de la Compañía Libre"
```

- [ ] **Step 2: Add workshop to the source emoji map + grouping**

In `src/bot/craftRender.ts`:

Line 9 — extend `SOURCE_EMOJI`:

```ts
const SOURCE_EMOJI: Record<string, string> = {
  craft: '🔨', workshop: '🛠', market: '🪙', vendor: '🏪', currency: '💠', gather: '⛏',
};
```

In `groupBySection` (around line 42), add an else-if for `'workshop'`:

```ts
function groupBySection(tasks: StoredTask[]): Map<string, StoredTask[]> {
  const groups = new Map<string, StoredTask[]>();
  for (const t of tasks) {
    let key: string;
    if (t.source === 'craft') {
      const job = t.meta?.job ?? 'ANY';
      const jobName = S.JOB_NAME[job] ?? job;
      key = `${S.SECTION_CRAFT} — ${JOB_EMOJI[job] ?? '🔨'} ${jobName}`;
    } else if (t.source === 'workshop') {
      key = S.SECTION_WORKSHOP;
    } else if (t.source === 'market') {
      key = S.SECTION_MARKET;
    } else if (t.source === 'vendor') {
      key = S.SECTION_VENDOR;
    } else if (t.source === 'currency') {
      key = S.SECTION_CURRENCY;
    } else {
      key = S.SECTION_GATHER;
    }
    let arr = groups.get(key);
    if (!arr) { arr = []; groups.set(key, arr); }
    arr.push(t);
  }
  return groups;
}
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/bot/craftRender.ts src/bot/craftStrings.ts
git commit -m "feat(bot): render workshop section in craft embed"
```

---

## Task 8: Wire CompanyCraft through src/api/discord.ts and rebuild

`buildBreakdown` now requires a `companyCraft` map on `SourcingDeps`. The caller is `handleCraftNew` in `craftCommands.ts`, which receives `deps.snapshots` (`BotSnapshots`). Since `companyCraft` is already on `BotSnapshots` after Task 4, the call site needs to forward it.

**Files:**
- Modify: `src/bot/craftCommands.ts`

- [ ] **Step 1: Update the buildBreakdown caller**

Open `src/bot/craftCommands.ts`. Around line 57, change:

```ts
const { recipes, namesById, vendorMap, specialShop, gatheringCatalog } = deps.snapshots;
```

to:

```ts
const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;
```

And around line 65, change:

```ts
const breakdown = buildBreakdown(
  itemId,
  opts.qty,
  market,
  { recipes, namesById, vendorMap, specialShop, gatheringCatalog },
  { craftIntermediates },
);
```

to:

```ts
const breakdown = buildBreakdown(
  itemId,
  opts.qty,
  market,
  { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
  { craftIntermediates },
);
```

- [ ] **Step 2: Check for the same destructuring elsewhere**

Run: `grep -rn 'specialShop, gatheringCatalog' src/bot src/api`

Each match that destructures `BotSnapshots` to build a `SourcingDeps` must also forward `companyCraft`. Fix any additional sites the same way.

- [ ] **Step 3: Run typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Rebuild the API bundle**

Run: `npm run build:api`
Expected: `api/discord.mjs` is regenerated. (Some build warnings about "external" packages are normal.)

- [ ] **Step 5: Commit**

```bash
git add src/bot/craftCommands.ts api/discord.mjs
git commit -m "feat(bot): forward companyCraft into SourcingDeps"
```

---

## Task 9: New API endpoints — GET /api/projects, GET /api/projects/:id

A read-only Vercel Function that reads the same Turso store the bot writes to. Returns project lists and per-project task lists with guild allow-list enforcement.

**Files:**
- Create: `src/api/projects.ts`
- Create: `src/api/projects.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/projects.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import handler from './projects';
import { openCraftStore, type CraftStore } from '../bot/craftStore';

// Mock the store so we can swap implementations without going to Turso.
let store: CraftStore;
vi.mock('../bot/craftStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bot/craftStore')>();
  return { ...actual };
});

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

async function seedProject(s: CraftStore) {
  const id = await s.createProject({
    guildId: 'G1', channelId: 'C1', name: 'Test', targetItemId: 42, targetQty: 3, createdBy: 'U1',
  });
  await s.addTasks(id, [
    { itemId: 10, itemName: 'Iron Ore', qtyNeeded: 5, source: 'gather', meta: {} },
    { itemId: 20, itemName: 'Iron Ingot', qtyNeeded: 2, source: 'craft', meta: { job: 'BSM' } },
    { itemId: 99, itemName: 'Tatanora Hull', qtyNeeded: 1, source: 'workshop', meta: {} },
  ]);
  return id;
}

beforeEach(async () => {
  store = await openCraftStore(':memory:');
  process.env.GUILD_ALLOWLIST = 'G1';
  process.env.TURSO_DATABASE_URL = ':memory:';
  // Force the handler to use our in-memory store.
  (globalThis as any).__testCraftStore = store;
});

describe('GET /api/projects', () => {
  it('lists open projects for an allowed guild with task counts', async () => {
    await seedProject(store);
    const req = { method: 'GET', url: '/api/projects?guild=G1', query: { guild: 'G1' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]).toMatchObject({
      name: 'Test',
      targetItemId: 42,
      targetQty: 3,
      status: 'open',
    });
    expect(body.projects[0].taskCounts.bySource.workshop).toBe(1);
  });

  it('403s when guild is not in the allow-list', async () => {
    const req = { method: 'GET', url: '/api/projects?guild=OTHER', query: { guild: 'OTHER' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('400s when guild query param is missing', async () => {
    const req = { method: 'GET', url: '/api/projects', query: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('GET /api/projects/:id', () => {
  it('returns project + tasks for allowed guild', async () => {
    const id = await seedProject(store);
    const req = { method: 'GET', url: `/api/projects/${id}`, query: { id: String(id) } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.project.id).toBe(id);
    expect(body.tasks).toHaveLength(3);
  });

  it('404s when project belongs to a disallowed guild', async () => {
    const id = await store.createProject({
      guildId: 'OTHER', channelId: 'C', name: 'X', targetItemId: 1, targetQty: 1, createdBy: 'U',
    });
    const req = { method: 'GET', url: `/api/projects/${id}`, query: { id: String(id) } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/projects.test.ts`
Expected: FAIL — `src/api/projects` does not exist.

- [ ] **Step 3: Implement the endpoint**

Create `src/api/projects.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import type { StoredTask, TaskSource } from '../bot/craftTypes';

const GUILD_ALLOWLIST = (process.env.GUILD_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);

let storePromise: Promise<CraftStore> | null = null;
function getStore(): Promise<CraftStore> {
  // Test hook so unit tests can supply their own in-memory store.
  const injected = (globalThis as any).__testCraftStore as CraftStore | undefined;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}

function isAllowed(guildId: string): boolean {
  return GUILD_ALLOWLIST.length > 0 && GUILD_ALLOWLIST.includes(guildId);
}

function computeTaskCounts(tasks: StoredTask[]) {
  const byStatus = { open: 0, claimed: 0, done: 0 };
  const bySource: Record<TaskSource, number> = {
    craft: 0, workshop: 0, market: 0, vendor: 0, currency: 0, gather: 0,
  };
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    bySource[t.source] = (bySource[t.source] ?? 0) + 1;
  }
  return { byStatus, bySource };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 'no-store');

  const url = req.url ?? '';
  const detailMatch = /\/api\/projects\/(\d+)/.exec(url);

  const store = await getStore();

  if (detailMatch) {
    const id = Number(detailMatch[1]);
    const project = await store.getProject(id);
    if (!project || !isAllowed(project.guildId)) {
      // Return 404 in both branches to avoid revealing whether the ID exists.
      return res.status(404).json({ error: 'Not found' });
    }
    const tasks = await store.getTasks(id);
    return res.status(200).json({
      project: {
        id: project.id,
        name: project.name,
        targetItemId: project.targetItemId,
        targetQty: project.targetQty,
        createdBy: project.createdBy,
        threadId: project.threadId,
        status: project.status,
        createdAt: project.createdAt,
      },
      tasks,
    });
  }

  // List view
  const guildId = (req.query?.guild as string | undefined) ?? '';
  if (!guildId) return res.status(400).json({ error: 'Missing guild query param' });
  if (!isAllowed(guildId)) return res.status(403).json({ error: 'Guild not in allow-list' });

  const statusFilter = (req.query?.status as string | undefined) ?? 'open';
  let projects = await store.listOpenProjects(guildId);
  if (statusFilter === 'all' || statusFilter === 'closed') {
    // listOpenProjects only returns open; for 'all' or 'closed' callers should
    // hit a future endpoint. V1 only supports the open list — return what we have
    // if 'open', empty if 'closed'.
    if (statusFilter === 'closed') projects = [];
  }

  const summaries = await Promise.all(projects.map(async (p) => {
    const tasks = await store.getTasks(p.id);
    return {
      id: p.id,
      name: p.name,
      targetItemId: p.targetItemId,
      targetQty: p.targetQty,
      createdBy: p.createdBy,
      threadId: p.threadId,
      status: p.status,
      createdAt: p.createdAt,
      taskCounts: computeTaskCounts(tasks),
    };
  }));
  return res.status(200).json({ projects: summaries });
}

export const config = { api: { bodyParser: false } };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/projects.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/projects.ts src/api/projects.test.ts
git commit -m "feat(api): add GET /api/projects + GET /api/projects/:id (read-only)"
```

---

## Task 10: Bundle the new function + register the route

Vercel's file-based routing picks up files in `api/`. Add `src/api/projects.ts` to the `build:api` esbuild entry list, and Vercel's `vercel.json`-style rewrite for `/api/projects/:id` (the regex inside `handler` already covers it, but Vercel needs to know the function exists at this path).

**Files:**
- Modify: `package.json`
- Modify: `vercel.json` (if present) OR create one

- [ ] **Step 1: Update build:api**

Open `package.json`. Line 9 currently:

```json
"build:api": "esbuild src/api/discord.ts src/api/refresh-cache.ts --bundle --platform=node --format=esm --outdir=api --out-extension:.js=.mjs --packages=external",
```

Change to:

```json
"build:api": "esbuild src/api/discord.ts src/api/refresh-cache.ts src/api/projects.ts --bundle --platform=node --format=esm --outdir=api --out-extension:.js=.mjs --packages=external",
```

- [ ] **Step 2: Check / add vercel.json rewrites**

Run: `cat vercel.json 2>/dev/null || echo 'no vercel.json'`

If no `vercel.json` exists, create one:

```json
{
  "rewrites": [
    { "source": "/api/projects/:id", "destination": "/api/projects" }
  ]
}
```

If it exists, merge the rewrite rule into the existing `rewrites` array (or add the array if absent). Leave all other entries untouched.

- [ ] **Step 3: Build the bundle**

Run: `npm run build:api`
Expected: produces `api/projects.mjs` alongside the existing `api/discord.mjs` and `api/refresh-cache.mjs`.

- [ ] **Step 4: Commit**

```bash
git add package.json vercel.json api/projects.mjs
git commit -m "build: bundle api/projects.mjs and add detail-route rewrite"
```

---

## Task 11: Web hooks for project data (useProjects + useProject)

TanStack Query hooks that hit the new endpoints. Reads the active guild ID from a runtime env (`import.meta.env.VITE_GUILD_ID`) — same pattern the rest of the app uses.

**Files:**
- Create: `src/features/projects/types.ts`
- Create: `src/features/projects/useProjects.ts`
- Create: `src/features/projects/useProject.ts`

- [ ] **Step 1: Add the shared response types**

Create `src/features/projects/types.ts`:

```ts
import type { StoredTask, TaskSource } from '../../bot/craftTypes';

export interface ProjectSummary {
  id: number;
  name: string;
  targetItemId: number;
  targetQty: number;
  createdBy: string;
  threadId: string | null;
  status: 'open' | 'closed';
  createdAt: number;
  taskCounts: {
    byStatus: { open: number; claimed: number; done: number };
    bySource: Record<TaskSource, number>;
  };
}

export interface ProjectDetail {
  project: Omit<ProjectSummary, 'taskCounts'>;
  tasks: StoredTask[];
}
```

- [ ] **Step 2: List hook**

Create `src/features/projects/useProjects.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { ProjectSummary } from './types';

const GUILD_ID = (import.meta.env?.VITE_GUILD_ID as string | undefined) ?? '';

async function fetchProjects(): Promise<ProjectSummary[]> {
  if (!GUILD_ID) throw new Error('VITE_GUILD_ID not configured');
  const res = await fetch(`/api/projects?guild=${encodeURIComponent(GUILD_ID)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { projects: ProjectSummary[] };
  return body.projects;
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects', GUILD_ID],
    queryFn: fetchProjects,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
```

- [ ] **Step 3: Detail hook**

Create `src/features/projects/useProject.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { ProjectDetail } from './types';

async function fetchProject(id: number): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ProjectDetail;
}

export function useProject(id: number | null) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id as number),
    enabled: id != null,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/projects/types.ts src/features/projects/useProjects.ts src/features/projects/useProject.ts
git commit -m "feat(web): TanStack Query hooks for project list + detail"
```

---

## Task 12: ProjectsList component

A read-only table of open projects in the current guild. Matches the project-wide table idiom (see [memory:feedback_match_ui_patterns](../../../memory/feedback_match_ui_patterns.md)) — borrow column styles from `src/routes/Crafts.tsx` or `src/features/insights/CurrencyFlipView.tsx` for visual consistency.

**Files:**
- Create: `src/features/projects/ProjectsList.tsx`
- Create: `src/features/projects/ProjectsList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/projects/ProjectsList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProjectsList } from './ProjectsList';
import * as hook from './useProjects';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>,
  );
}

beforeEach(() => vi.restoreAllMocks());

describe('ProjectsList', () => {
  it('renders an empty state when there are no projects', () => {
    vi.spyOn(hook, 'useProjects').mockReturnValue({
      data: [], isLoading: false, error: null, isError: false,
    } as any);
    wrap(<ProjectsList />);
    expect(screen.getByText(/No open projects/i)).toBeInTheDocument();
  });

  it('renders a project row with its task-count summary', () => {
    vi.spyOn(hook, 'useProjects').mockReturnValue({
      data: [{
        id: 42, name: 'Tatanora Hull build',
        targetItemId: 31600, targetQty: 1,
        createdBy: 'U1', threadId: null, status: 'open', createdAt: 0,
        taskCounts: {
          byStatus: { open: 5, claimed: 1, done: 0 },
          bySource: { craft: 0, workshop: 1, market: 4, vendor: 0, currency: 0, gather: 1 },
        },
      }], isLoading: false, error: null, isError: false,
    } as any);
    wrap(<ProjectsList />);
    expect(screen.getByText('Tatanora Hull build')).toBeInTheDocument();
    expect(screen.getByText(/1 workshop/)).toBeInTheDocument();
    expect(screen.getByText(/4 market/)).toBeInTheDocument();
  });

  it('renders an error banner on fetch failure', () => {
    vi.spyOn(hook, 'useProjects').mockReturnValue({
      data: undefined, isLoading: false, error: new Error('HTTP 500'), isError: true,
    } as any);
    wrap(<ProjectsList />);
    expect(screen.getByText(/Couldn't load projects/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/projects/ProjectsList.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement ProjectsList**

Create `src/features/projects/ProjectsList.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { Spinner } from '../../components/Spinner';
import { SectionHeader } from '../../components/SectionHeader';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { ItemNameLink } from '../../components/ItemNameLinks';
import { useProjects } from './useProjects';
import type { ProjectSummary } from './types';

function sourceMixSummary(s: ProjectSummary): string {
  const parts: string[] = [];
  for (const [key, count] of Object.entries(s.taskCounts.bySource)) {
    if (count > 0) parts.push(`${count} ${key}`);
  }
  return parts.join(' · ');
}

function progressLabel(s: ProjectSummary): string {
  const total = s.taskCounts.byStatus.open + s.taskCounts.byStatus.claimed + s.taskCounts.byStatus.done;
  return `${s.taskCounts.byStatus.done} / ${total} done`;
}

export function ProjectsList() {
  const q = useProjects();

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <SectionHeader label="Crafting Projects" />

      {q.isLoading && <div className="font-mono text-[10px] text-text-low flex items-center gap-2"><Spinner /> Loading…</div>}
      {q.isError && <StatusBanner>Couldn't load projects — Discord bot may be down.</StatusBanner>}
      {q.data && q.data.length === 0 && (
        <EmptyState>No open projects. Start one with <code>/craft new</code> in Discord.</EmptyState>
      )}

      {q.data && q.data.length > 0 && (
        <div className="border border-border-base rounded">
          <table className="w-full text-sm">
            <thead className="text-[10px] font-mono text-text-low border-b border-border-base">
              <tr>
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Project</th>
                <th className="text-left p-2">Target</th>
                <th className="text-left p-2">Source mix</th>
                <th className="text-left p-2">Progress</th>
                <th className="text-left p-2">Created by</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((p) => (
                <tr key={p.id} className="border-b border-border-base/30 last:border-0 hover:bg-bg-elev">
                  <td className="p-2 font-mono text-text-low">#{p.id}</td>
                  <td className="p-2"><Link to={`/projects/${p.id}`} className="text-accent hover:underline">{p.name}</Link></td>
                  <td className="p-2">
                    <ItemNameLink itemId={p.targetItemId} fallback={`Item #${p.targetItemId}`} /> × {p.targetQty}
                  </td>
                  <td className="p-2 text-text-low text-xs">{sourceMixSummary(p)}</td>
                  <td className="p-2 font-mono text-xs">{progressLabel(p)}</td>
                  <td className="p-2 font-mono text-xs text-text-low">{p.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

If `ItemNameLink` does not export the named function used above, check `src/components/ItemNameLinks.tsx` and use the actual export name (likely `ItemNameLinks` plural or a different signature). Adjust the import + call.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/projects/ProjectsList.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/projects/ProjectsList.tsx src/features/projects/ProjectsList.test.tsx
git commit -m "feat(web): ProjectsList table view"
```

---

## Task 13: ProjectDetail component

Per-project header + grouped task list. Mirrors the visual ordering used in `craftRender.ts`: craft → workshop → market → vendor → currency → gather.

**Files:**
- Create: `src/features/projects/ProjectDetail.tsx`
- Create: `src/features/projects/ProjectDetail.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/projects/ProjectDetail.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProjectDetail } from './ProjectDetail';
import * as hook from './useProject';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>,
  );
}

beforeEach(() => vi.restoreAllMocks());

describe('ProjectDetail', () => {
  it('renders project header + workshop and acquire sections', () => {
    vi.spyOn(hook, 'useProject').mockReturnValue({
      data: {
        project: {
          id: 1, name: 'Submarine Build',
          targetItemId: 31600, targetQty: 1,
          createdBy: 'U1', threadId: null, status: 'open', createdAt: 0,
        },
        tasks: [
          { id: 1, projectId: 1, itemId: 31600, itemName: 'Tatanora Hull', qtyNeeded: 1, qtyDone: 0, source: 'workshop', meta: {}, assigneeId: null, status: 'open', updatedAt: 0 },
          { id: 2, projectId: 1, itemId: 5106, itemName: 'Iron Ore', qtyNeeded: 6, qtyDone: 2, source: 'gather', meta: { gatherLevel: 20, timed: false }, assigneeId: 'U2', status: 'claimed', updatedAt: 0 },
          { id: 3, projectId: 1, itemId: 5107, itemName: 'Hardsilver Ore', qtyNeeded: 10, qtyDone: 0, source: 'market', meta: { world: 'Phantom', price: 50 }, assigneeId: null, status: 'open', updatedAt: 0 },
        ],
      },
      isLoading: false, error: null, isError: false,
    } as any);
    wrap(<ProjectDetail projectId={1} />);
    expect(screen.getByText('Submarine Build')).toBeInTheDocument();
    expect(screen.getByText('Tatanora Hull')).toBeInTheDocument();
    expect(screen.getByText('Iron Ore')).toBeInTheDocument();
    expect(screen.getByText('Hardsilver Ore')).toBeInTheDocument();
    expect(screen.getByText(/Workshop/i)).toBeInTheDocument();
    expect(screen.getByText(/Gather/i)).toBeInTheDocument();
    expect(screen.getByText(/Market/i)).toBeInTheDocument();
  });

  it('renders an error banner when the fetch fails', () => {
    vi.spyOn(hook, 'useProject').mockReturnValue({
      data: undefined, isLoading: false, error: new Error('HTTP 404'), isError: true,
    } as any);
    wrap(<ProjectDetail projectId={1} />);
    expect(screen.getByText(/Couldn't load project/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/projects/ProjectDetail.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement ProjectDetail**

Create `src/features/projects/ProjectDetail.tsx`:

```tsx
import { Spinner } from '../../components/Spinner';
import { SectionHeader } from '../../components/SectionHeader';
import { StatusBanner } from '../../components/StatusBanner';
import { ItemNameLink } from '../../components/ItemNameLinks';
import { useProject } from './useProject';
import type { StoredTask, TaskSource } from '../../bot/craftTypes';

const SOURCE_ORDER: TaskSource[] = ['craft', 'workshop', 'gather', 'currency', 'vendor', 'market'];

const SOURCE_LABEL: Record<TaskSource, string> = {
  craft: 'Craft',
  workshop: 'Workshop',
  gather: 'Gather',
  currency: 'Currency',
  vendor: 'Vendor',
  market: 'Market',
};

function groupTasks(tasks: StoredTask[]): Map<TaskSource, StoredTask[]> {
  const out = new Map<TaskSource, StoredTask[]>();
  for (const source of SOURCE_ORDER) out.set(source, []);
  for (const t of tasks) out.get(t.source)!.push(t);
  return out;
}

function TaskRow({ t }: { t: StoredTask }) {
  const pct = t.qtyNeeded > 0 ? Math.round((t.qtyDone / t.qtyNeeded) * 100) : 0;
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 border-b border-border-base/20 last:border-0">
      <div className="flex-1 min-w-0">
        <span className="font-mono text-xs text-text-low mr-2">{t.qtyNeeded}×</span>
        <ItemNameLink itemId={t.itemId} fallback={t.itemName} />
      </div>
      <div className="font-mono text-xs text-text-low w-20 text-right">{t.qtyDone}/{t.qtyNeeded} ({pct}%)</div>
      <div className="font-mono text-xs text-text-low w-32 text-right truncate">
        {t.assigneeId ? `@${t.assigneeId}` : 'unclaimed'}
      </div>
      <div className="font-mono text-xs w-16 text-right">{t.status}</div>
    </li>
  );
}

export function ProjectDetail({ projectId }: { projectId: number }) {
  const q = useProject(projectId);

  if (q.isLoading) return <div className="max-w-7xl mx-auto px-4 py-6 font-mono text-[10px] text-text-low flex items-center gap-2"><Spinner /> Loading…</div>;
  if (q.isError || !q.data) return <div className="max-w-7xl mx-auto px-4 py-6"><StatusBanner>Couldn't load project — try again or check Discord.</StatusBanner></div>;

  const { project, tasks } = q.data;
  const groups = groupTasks(tasks);

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <SectionHeader label={project.name} />
      <div className="font-mono text-xs text-text-low">
        Target: <ItemNameLink itemId={project.targetItemId} fallback={`Item #${project.targetItemId}`} /> × {project.targetQty}
        {' · '} Created by @{project.createdBy}
        {project.threadId && <> · <a href={`https://discord.com/channels/@me/${project.threadId}`} className="text-accent hover:underline">Discord thread</a></>}
      </div>
      <div className="text-xs text-text-low italic">View only — edit in Discord with /craft.</div>

      {SOURCE_ORDER.map((source) => {
        const list = groups.get(source) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={source} className="border border-border-base rounded p-3">
            <h3 className="font-mono text-[10px] tracking-widest text-text-low mb-2 uppercase">
              {SOURCE_LABEL[source]} · {list.length}
            </h3>
            <ul>{list.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/projects/ProjectDetail.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/projects/ProjectDetail.tsx src/features/projects/ProjectDetail.test.tsx
git commit -m "feat(web): ProjectDetail grouped task view"
```

---

## Task 14: Wire routes + sidebar entry

Add the two routes to `src/App.tsx` and a "Crafting Projects" link to the sidebar.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Create: `src/routes/Projects.tsx`
- Create: `src/routes/Project.tsx`

- [ ] **Step 1: Route shells**

Create `src/routes/Projects.tsx`:

```tsx
import { ProjectsList } from '../features/projects/ProjectsList';

export default function Projects() {
  return <ProjectsList />;
}
```

Create `src/routes/Project.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { ProjectDetail } from '../features/projects/ProjectDetail';

export default function Project() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return <div className="max-w-7xl mx-auto px-4 py-6 text-text-low">Invalid project id.</div>;
  }
  return <ProjectDetail projectId={projectId} />;
}
```

- [ ] **Step 2: Add to App.tsx**

In `src/App.tsx`, add imports (after the existing route imports):

```tsx
import Projects from './routes/Projects';
import Project from './routes/Project';
```

In the `<Routes>` block, add (after the line for `/submarines` or wherever feels right):

```tsx
<Route path="/projects" element={<Projects />} />
<Route path="/projects/:id" element={<Project />} />
```

- [ ] **Step 3: Add sidebar entry**

Open `src/components/layout/Sidebar.tsx`. Inside the "Gil-Making" group (around line 22-30), add a new item:

```ts
{ label: 'Projects', path: '/projects' },
```

Insert it after `{ label: 'Crafts', path: '/crafts' }` so it lands near related coordination tools.

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Visual check (manual)**

Run: `npm run dev`
Then open http://localhost:5173/projects and confirm the empty state renders (no API calls succeed locally without a Turso connection, so the error banner is also acceptable).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx src/routes/Projects.tsx src/routes/Project.tsx
git commit -m "feat(web): /projects + /projects/:id routes and nav entry"
```

---

## Task 15: End-to-end manual check

After deploy, confirm the bot half and the web half actually agree on what's in the store.

**Files:** none

- [ ] **Step 1: Push**

Run: `git push origin main`

Vercel auto-deploys. Wait until the deploy is live (≈ 1-2 min).

- [ ] **Step 2: Bot side — create a workshop project**

In Discord, in a `/craft setup`-configured channel of an allow-listed guild:

```
/craft new item:Tatanora Hull qty:1
```

Replace `Tatanora Hull` with an actual CompanyCraftSequence result name from the snapshot if that one isn't present (run `node -e "console.log(require('./public/data/snapshots/companyCraft.json').entries.slice(0,5).map(([,r]) => r.resultName))"` for examples).

Expected: bot replies with a project embed; the embed contains a `🛠 TALLER DE LA CL` section with one task and a normal acquire section (gather/market/etc.) with leaves.

- [ ] **Step 3: Web side — open the project**

Navigate to `https://<deploy-url>/projects`. Expected: the project from Step 2 appears in the list.

Click it. Expected: detail view shows the Workshop section + acquire sections grouped identically to the embed.

- [ ] **Step 4: Cross-check counts**

The task-count summary on the list page should match the section counts on the detail page (e.g. `1 workshop · 4 market · 1 gather` on the list ↔ those exact counts on detail).

- [ ] **Step 5: Sanity — close the project**

```
/craft close id:<id>
```

Refresh `/projects` within 30s. Expected: the project disappears from the open list.

- [ ] **Step 6: Update memory**

Edit `C:\Users\esthe\.claude\projects\c--Users-esthe-Documents-Dev-ffxiv-helper\memory\project_vercel_bot_status.md` to:

1. Add `'workshop'` to the list of supported sources.
2. Note the new `/api/projects` + `/api/projects/:id` endpoints + their bundle entry.
3. Move "What can I craft from my inventory?" from "Next feature idea" since CompanyCraft is now done.

Also add a new memory file `project_unified_crafting_planner.md` summarizing the shipped state per the auto-memory rules.

- [ ] **Step 7: Commit memory**

The memory files live outside the repo, so no git commit needed — just save.

---

## Out-of-scope (do NOT do)

- Web-side writes (claim / unclaim / log progress / close). Spec calls these V2.
- Per-phase tracking for CompanyCraft sequences.
- Discord OAuth on the web side.
- Cross-guild views.
- Real-time push (we're polling at 30s).
- IDB cache version bump — companyCraft.json is bot-only in V1.

If you find yourself reaching for any of these, stop and re-read the spec.
