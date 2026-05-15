# Levequest Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone `/leves` route that fetches every levequest from XIVAPI v2, joins recipe + Universalis price data, and ranks leves by net gil or base EXP per allowance.

**Architecture:** Mirrors the gathering-planner layout exactly. Data layer (`leveSnapshot.ts` + `recipeCache.ts` extension + `useLeveSnapshot` hook) feeds a pure compute function (`computeLevePlan.ts`) wired into a react-query mutation hook (`useLevePlanQuery.ts`). The view (`LevePlanner.tsx`) is hosted on a route page (`LevePlan.tsx`). Persisted filter state lives in a zustand slice (`levePlanStore.ts`).

**Tech Stack:** React 18 + TypeScript + Vite, Vitest 4 (jsdom), TanStack Query 5, zustand 5 with `persist`, idb 8 for IndexedDB, Universalis (market) + XIVAPI v2 (game sheets).

**Spec:** [docs/superpowers/specs/2026-05-15-levequest-planner-design.md](../specs/2026-05-15-levequest-planner-design.md)

---

## File Structure

**Create:**
- `src/lib/leveSnapshot.ts` — XIVAPI v2 Leve sheet fetch + parse. Exports `SnapshotLeve`, `parseLeveSheetPage`, `fetchLeveSnapshot`.
- `src/lib/leveSnapshot.test.ts` — fixture-driven unit tests.
- `src/features/queries/useLeveSnapshot.ts` — react-query hook backed by IndexedDB cache. Mirrors `useItemSnapshot.ts` exactly.
- `src/features/leves/levePlanStore.ts` — persisted zustand slice for mode/jobFilter/maxLevel.
- `src/features/leves/levePlanStore.test.ts` — store unit tests.
- `src/features/leves/computeLevePlan.ts` — pure function: snapshot + recipes + prices + filters → ranked rows.
- `src/features/leves/computeLevePlan.test.ts` — pure-function unit tests.
- `src/features/leves/useLevePlanQuery.ts` — orchestration mutation (snapshot + recipeSnapshot + Universalis batch + compute).
- `src/features/leves/useLevePlanQuery.test.tsx` — hook integration test.
- `src/features/leves/LevePlanner.tsx` — view component.
- `src/features/leves/LevePlanner.test.tsx` — render tests.
- `src/routes/LevePlan.tsx` — route page (Run button, status banners, planner).
- `src/routes/LevePlan.test.tsx` — route integration test.

**Modify:**
- `src/lib/recipeCache.ts` — add leve cache helpers + bump DB_VERSION.
- `src/App.tsx` — register `/leves` route.

---

## Conventions

- Tests run with: `npx vitest run <path>` for a single file, `npx vitest run` for the full suite, `npx tsc --noEmit` for typecheck.
- Commit prefix: `feat(leves):` for code, `test(leves):` for test-only commits. Use `chore(cache):` for the recipeCache bump.
- Stage only files this plan touches. Do not `git add -A`.
- Every task ends with a passing test + commit. Frequent small commits beat big batched ones.

---

## Task 1: Leve snapshot — XIVAPI fetch + parse

**Files:**
- Create: `src/lib/leveSnapshot.ts`
- Create: `src/lib/leveSnapshot.test.ts`

The XIVAPI v2 Leve sheet schema is not pinned in the spec (it can drift between game patches and the v2 API has its own field shape). The first step is a live probe to confirm field names; everything else builds on what you observe.

- [ ] **Step 1: Probe the Leve sheet schema**

Run:

```bash
curl -s 'https://v2.xivapi.com/api/sheet/Leve?fields=Name,ClassJobCategory.Name,LeveAssignmentType.Name,ClassJobLevel,AllowanceCost,GilReward,ExpReward,LevelLevemete.Map.PlaceName.Name,DataId&limit=3' | python3 -m json.tool > /tmp/leve_probe.json
cat /tmp/leve_probe.json
```

Then probe the linked `CraftLeve` (for DoH ingredient/qty) and the broader `Leve` row to see what's actually available:

```bash
curl -s 'https://v2.xivapi.com/api/sheet/CraftLeve?fields=Item0,Item1,Item2,Item3,ItemCount0,ItemCount1,ItemCount2,ItemCount3,Repeats&limit=3' | python3 -m json.tool > /tmp/craftleve_probe.json
cat /tmp/craftleve_probe.json
```

Document the actual field names + value shapes you see. Pay special attention to:

- Where the leve's gil reward lives (likely `GilReward` but could be `AllowanceCost`-scaled).
- Whether `LeveAssignmentType` returns a code (`'CRP'`, `'CUL'`, `'MIN'`, etc.) or just a free-form name.
- How city derivation works — `LevelLevemete.Map.PlaceName` may or may not return a populated nested chain; if it doesn't, fall back to mapping by `LeveClient` or set `city: 'Unknown'` and degrade gracefully.
- Whether `DataId` links to `CraftLeve` for DoH leves and to a different sheet (`BattleLeve` etc.) for combat leves.
- Whether some rows have empty `Name` (placeholder/deprecated leves) — those should be dropped at parse time.

Write a short comment block at the top of `src/lib/leveSnapshot.ts` documenting your findings so the next reader doesn't have to re-probe.

- [ ] **Step 2: Write the failing parser test**

Create `src/lib/leveSnapshot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseLeveSheetPage } from './leveSnapshot';

describe('parseLeveSheetPage', () => {
  it('extracts a DoH crafter leve into a SnapshotLeve', () => {
    // Fixture mirrors the shape your Step 1 probe showed. Adjust field names
    // (e.g. GilReward, ClassJobCategory) to match what v2 actually returns.
    const raw = {
      rows: [
        {
          row_id: 1234,
          fields: {
            Name: 'And Bring Plenty of Ale',
            ClassJobCategory: { fields: { Name: 'Culinarian' } },
            LeveAssignmentType: { fields: { Name: 'Tradecraft' } },
            ClassJobLevel: 30,
            AllowanceCost: 1,
            GilReward: 1200,
            ExpReward: 5400,
            LevelLevemete: { fields: { Map: { fields: { PlaceName: { fields: { Name: 'Limsa Lominsa' } } } } } },
            DataId: { value: 5678 },
          },
        },
      ],
    };
    const out = parseLeveSheetPage(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 1234,
      name: 'And Bring Plenty of Ale',
      type: 'doh',
      classJob: 15, // ClassJob id for Culinarian; pulled from CLASS_JOB_BY_NAME map
      level: 30,
      city: 'Limsa Lominsa',
      baseGil: 1200,
      baseExp: 5400,
      hqGilMultiplier: 2.0,
    });
  });

  it('classifies a DoL gatherer leve with hqGilMultiplier=1', () => {
    const raw = {
      rows: [
        {
          row_id: 2222,
          fields: {
            Name: 'Mining for Memories',
            ClassJobCategory: { fields: { Name: 'Miner' } },
            LeveAssignmentType: { fields: { Name: 'Fieldcraft' } },
            ClassJobLevel: 20,
            AllowanceCost: 1,
            GilReward: 800,
            ExpReward: 3000,
            LevelLevemete: { fields: { Map: { fields: { PlaceName: { fields: { Name: "Ul'dah" } } } } } },
            DataId: { value: 0 },
          },
        },
      ],
    };
    const out = parseLeveSheetPage(raw);
    expect(out[0].type).toBe('dol');
    expect(out[0].hqGilMultiplier).toBe(1.0);
  });

  it('classifies a Grand Company combat leve as type=dow', () => {
    const raw = {
      rows: [
        {
          row_id: 3333,
          fields: {
            Name: 'Slay Wamouras',
            ClassJobCategory: { fields: { Name: 'Disciple of War' } },
            LeveAssignmentType: { fields: { Name: 'Maelstrom' } },
            ClassJobLevel: 50,
            AllowanceCost: 1,
            GilReward: 5000,
            ExpReward: 12000,
            LevelLevemete: { fields: { Map: { fields: { PlaceName: { fields: { Name: 'Limsa Lominsa' } } } } } },
            DataId: { value: 0 },
          },
        },
      ],
    };
    const out = parseLeveSheetPage(raw);
    expect(out[0].type).toBe('dow');
    expect(out[0].hqGilMultiplier).toBe(1.0);
  });

  it('drops rows with empty Name (deprecated placeholders)', () => {
    const raw = {
      rows: [
        {
          row_id: 4444,
          fields: { Name: '', ClassJobCategory: { fields: { Name: 'Carpenter' } } },
        },
      ],
    };
    expect(parseLeveSheetPage(raw)).toHaveLength(0);
  });

  it('returns [] for empty input', () => {
    expect(parseLeveSheetPage({})).toEqual([]);
    expect(parseLeveSheetPage({ rows: [] })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/lib/leveSnapshot.test.ts
```

Expected: ERROR "Cannot find module './leveSnapshot'" (file doesn't exist yet).

- [ ] **Step 4: Implement leveSnapshot.ts**

Create `src/lib/leveSnapshot.ts`:

```ts
/**
 * XIVAPI v2 Leve sheet schema (probed 2026-05-15 — see PR #N for raw response):
 *
 *   Name                      string
 *   ClassJobCategory.Name     'Carpenter' | 'Miner' | ... | 'Disciple of War'
 *   LeveAssignmentType.Name   'Tradecraft' | 'Fieldcraft' | 'Maelstrom' | ...
 *   ClassJobLevel             1–100
 *   AllowanceCost             1 (normal) or 10 (Ishgardian Restoration)
 *   GilReward                 base gil for NQ submission, single turn-in
 *   ExpReward                 base exp at leve's level
 *   LevelLevemete.Map.PlaceName.Name   city/zone string — may be empty
 *   DataId                    link to CraftLeve (DoH) / BattleLeve (DoW) etc.
 *
 * If a field is missing or named differently in a future game patch, update
 * this comment + the matching access in parseLeveSheetPage.
 */

export interface SnapshotLeve {
  id: number;
  name: string;
  level: number;
  type: 'doh' | 'dol' | 'dow' | 'dom';
  classJob: number;
  city: string;
  baseGil: number;
  baseExp: number;
  hqGilMultiplier: number;
  targetItemId: number | null;
  targetItemQty: number | null;
}

interface RawFieldLink<T> { value?: T; fields?: T }
interface RawLeveFields {
  Name?: string;
  ClassJobCategory?: { fields?: { Name?: string } };
  LeveAssignmentType?: { fields?: { Name?: string } };
  ClassJobLevel?: number;
  AllowanceCost?: number;
  GilReward?: number;
  ExpReward?: number;
  LevelLevemete?: { fields?: { Map?: { fields?: { PlaceName?: { fields?: { Name?: string } } } } } };
  DataId?: RawFieldLink<number>;
}
interface RawLeveRow { row_id: number; fields: RawLeveFields }
interface RawLeveSheetPage { rows?: RawLeveRow[] }

// ClassJob id mapping (subset — only the codes leves use).
// Source: XIVAPI ClassJob sheet. Pinned because the leve UI only ever shows these.
const CLASS_JOB_BY_NAME: Record<string, number> = {
  Carpenter: 8, Blacksmith: 9, Armorer: 10, Goldsmith: 11,
  Leatherworker: 12, Weaver: 13, Alchemist: 14, Culinarian: 15,
  Miner: 16, Botanist: 17, Fisher: 18,
  // Combat leves use the 'Disciple of War' / 'Disciple of Magic' category — collapse to 99 (synthetic).
  'Disciple of War': 99,
  'Disciple of Magic': 99,
};

const DOH_NAMES = new Set(['Carpenter', 'Blacksmith', 'Armorer', 'Goldsmith', 'Leatherworker', 'Weaver', 'Alchemist', 'Culinarian']);
const DOL_NAMES = new Set(['Miner', 'Botanist', 'Fisher']);

function classifyType(category: string): SnapshotLeve['type'] {
  if (DOH_NAMES.has(category)) return 'doh';
  if (DOL_NAMES.has(category)) return 'dol';
  if (category === 'Disciple of Magic') return 'dom';
  return 'dow';
}

export function parseLeveSheetPage(raw: RawLeveSheetPage): SnapshotLeve[] {
  const out: SnapshotLeve[] = [];
  for (const r of raw.rows ?? []) {
    const f = r.fields ?? {};
    const name = (f.Name ?? '').trim();
    if (!name) continue; // placeholder/deprecated row
    const category = f.ClassJobCategory?.fields?.Name ?? '';
    if (!category) continue;
    const type = classifyType(category);
    out.push({
      id: r.row_id,
      name,
      level: f.ClassJobLevel ?? 0,
      type,
      classJob: CLASS_JOB_BY_NAME[category] ?? 0,
      city: f.LevelLevemete?.fields?.Map?.fields?.PlaceName?.fields?.Name ?? 'Unknown',
      baseGil: f.GilReward ?? 0,
      baseExp: f.ExpReward ?? 0,
      hqGilMultiplier: type === 'doh' ? 2.0 : 1.0,
      // targetItemId/qty come from the CraftLeve linked sheet — populated in fetchLeveSnapshot,
      // not in parse, because the link resolution needs a second fetch.
      targetItemId: null,
      targetItemQty: null,
    });
  }
  return out;
}

export interface FetchLeveSnapshotOpts {
  pageSize?: number;
  onProgress?: (total: number) => void;
}

const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';
const LEVE_FIELDS = 'Name,ClassJobCategory.Name,LeveAssignmentType.Name,ClassJobLevel,AllowanceCost,GilReward,ExpReward,LevelLevemete.Map.PlaceName.Name,DataId';

function buildLevePageUrl(after: number, pageSize: number): string {
  const params = new URLSearchParams({ fields: LEVE_FIELDS, limit: String(pageSize) });
  if (after > 0) params.set('after', String(after));
  return `${BASE.replace(/\/$/, '')}/api/sheet/Leve?${params.toString()}`;
}

export async function fetchLeveSnapshot(opts: FetchLeveSnapshotOpts = {}): Promise<SnapshotLeve[]> {
  const pageSize = opts.pageSize ?? 500;
  const out: SnapshotLeve[] = [];
  let cursor = 0;
  while (true) {
    const res = await fetch(buildLevePageUrl(cursor, pageSize));
    if (!res.ok) throw new Error(`XIVAPI Leve ${res.status}`);
    const raw = (await res.json()) as RawLeveSheetPage;
    const rows = raw.rows ?? [];
    if (rows.length === 0) break;
    out.push(...parseLeveSheetPage(raw));
    opts.onProgress?.(out.length);
    cursor = rows[rows.length - 1].row_id;
  }
  // DoH leves need a second pass to resolve target item ids + counts from the
  // CraftLeve sheet (linked by DataId). The probe in Step 1 showed CraftLeve
  // rows have Item0..Item3 / ItemCount0..ItemCount3 — the "primary" target is
  // Item0/ItemCount0. If your probe shows a different shape, adjust.
  await enrichDohTargets(out, pageSize);
  return out;
}

async function enrichDohTargets(leves: SnapshotLeve[], pageSize: number): Promise<void> {
  // Fetch the entire CraftLeve sheet once and index by row_id (= the DataId of the parent Leve).
  const craftLeves = new Map<number, { itemId: number; qty: number }>();
  let cursor = 0;
  while (true) {
    const url = `${BASE.replace(/\/$/, '')}/api/sheet/CraftLeve?fields=Item0,ItemCount0&limit=${pageSize}${cursor > 0 ? `&after=${cursor}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`XIVAPI CraftLeve ${res.status}`);
    const page = (await res.json()) as { rows?: Array<{ row_id: number; fields: { Item0?: { value?: number }; ItemCount0?: number } }> };
    const rows = page.rows ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const itemId = row.fields.Item0?.value ?? 0;
      const qty = row.fields.ItemCount0 ?? 0;
      if (itemId > 0 && qty > 0) craftLeves.set(row.row_id, { itemId, qty });
    }
    cursor = rows[rows.length - 1].row_id;
  }
  // Walk the parsed leves and attach the target via DataId.
  // Note: we lost the DataId field after parseLeveSheetPage stripped it. The cleanest fix is
  // to pass DataId through SnapshotLeve as a hidden field, OR re-fetch DataId alongside. For
  // simplicity here we do a SECOND Leve-sheet pass with just Name+DataId; the page-cache is
  // already warm from the first pass so it's fast.
  // ... actually a simpler approach: enrich during the first parse. Refactor as needed during
  // implementation if probe results suggest it's cleaner.
}
```

**Implementation note for the engineer:** The `enrichDohTargets` sketch above is intentionally incomplete — the cleanest path depends on what your probe shows. Two reasonable shapes:

1. **Inline approach**: parse the Leve `DataId` field, store it temporarily on `SnapshotLeve` (e.g. as `_craftLeveId`), then walk after fetch and attach `targetItemId/qty` from a single CraftLeve fetch. Strip the temporary field before returning.
2. **Pre-fetch CraftLeve first**: build the `Map<craftLeveId, {itemId, qty}>` first, then parse Leve and resolve in one pass.

Either works. Pick whichever your probe data makes simpler. Update `parseLeveSheetPage` to take an optional `craftLeveMap` parameter if you choose path 2.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/leveSnapshot.test.ts
```

Expected: all tests pass. If the DoH target-item enrichment is asynchronous, the parse-only tests won't exercise it — that's fine; the enrichment is exercised end-to-end in Task 6's hook integration test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/leveSnapshot.ts src/lib/leveSnapshot.test.ts
git commit -m "feat(leves): XIVAPI Leve sheet snapshot + parser"
```

---

## Task 2: Cache extension for leve snapshot

**Files:**
- Modify: `src/lib/recipeCache.ts`

- [ ] **Step 1: Bump DB_VERSION and add the leve object store**

Edit `src/lib/recipeCache.ts`:

```ts
// Line 7 was: const DB_VERSION = 6;
const DB_VERSION = 7;
```

Add a constant near the other store names (around line 14):

```ts
const LEVE_STORE = 'leves';
```

Add a store-creation line inside the `upgrade(database) { ... }` callback (around line 41, before the closing brace):

```ts
if (!database.objectStoreNames.contains(LEVE_STORE)) {
  database.createObjectStore(LEVE_STORE);
}
```

- [ ] **Step 2: Add the leve cache helpers**

Append these exports after the item-snapshot helpers (around line 95, after `getItemSnapshotUpdatedAt`):

```ts
const LEVE_SNAPSHOT_KEY = 'snapshot';
const LEVE_SNAPSHOT_TS_KEY = 'leveSnapshotUpdatedAt';

export async function getCachedLeves(): Promise<SnapshotLeve[] | undefined> {
  return (await db()).get(LEVE_STORE, LEVE_SNAPSHOT_KEY);
}

export async function putCachedLeves(leves: SnapshotLeve[]): Promise<void> {
  const handle = await db();
  await handle.put(LEVE_STORE, leves, LEVE_SNAPSHOT_KEY);
  await handle.put(META_STORE, Date.now(), LEVE_SNAPSHOT_TS_KEY);
}

export async function clearLeveCache(): Promise<void> {
  const handle = await db();
  await handle.clear(LEVE_STORE);
  await handle.delete(META_STORE, LEVE_SNAPSHOT_TS_KEY);
}

export async function getLeveSnapshotUpdatedAt(): Promise<number | undefined> {
  return (await db()).get(META_STORE, LEVE_SNAPSHOT_TS_KEY);
}
```

Add the import at the top with the other type imports (line 3):

```ts
import type { SnapshotLeve } from './leveSnapshot';
```

- [ ] **Step 3: Run typecheck to confirm the imports resolve and the DB upgrade compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run the existing recipeCache test if one exists; otherwise run the full suite**

```bash
npx vitest run src/lib/recipeCache.test.ts || npx vitest run
```

Expected: all tests pass. The DB version bump is invisible to existing tests (they use the same upgrade path).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipeCache.ts
git commit -m "chore(cache): add leve snapshot store (DB v7)"
```

---

## Task 3: `useLeveSnapshot` hook

**Files:**
- Create: `src/features/queries/useLeveSnapshot.ts`

This hook mirrors `useItemSnapshot.ts` exactly (file read at [src/features/queries/useItemSnapshot.ts](../../../src/features/queries/useItemSnapshot.ts)). No new tests in this task — the snapshot logic is tested at the unit level in Task 1 and end-to-end in Task 6.

- [ ] **Step 1: Create the hook**

Create `src/features/queries/useLeveSnapshot.ts`:

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  getCachedLeves,
  putCachedLeves,
  clearLeveCache,
  getLeveSnapshotUpdatedAt,
} from '../../lib/recipeCache';
import { fetchLeveSnapshot, type SnapshotLeve } from '../../lib/leveSnapshot';

const QUERY_KEY = ['leveSnapshot'] as const;

export function useLeveSnapshot() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(setProgress);
  progressRef.current = setProgress;

  const query = useQuery<{ leves: SnapshotLeve[]; updatedAt: number | null }>({
    queryKey: QUERY_KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const cached = await getCachedLeves();
      const ts = await getLeveSnapshotUpdatedAt();
      if (cached) return { leves: cached, updatedAt: ts ?? null };
      const fresh = await fetchLeveSnapshot({ onProgress: (n) => progressRef.current(n) });
      await putCachedLeves(fresh);
      return { leves: fresh, updatedAt: Date.now() };
    },
  });

  return { ...query, progress };
}

export function useRefreshLeveSnapshot() {
  const qc = useQueryClient();
  return async () => {
    await clearLeveCache();
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
}
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/useLeveSnapshot.ts
git commit -m "feat(leves): useLeveSnapshot hook with IDB cache"
```

---

## Task 4: Leve plan store

**Files:**
- Create: `src/features/leves/levePlanStore.ts`
- Create: `src/features/leves/levePlanStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/leves/levePlanStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useLevePlanStore, defaultLevePlan } from './levePlanStore';

beforeEach(() => {
  localStorage.clear();
  useLevePlanStore.setState(defaultLevePlan());
});

describe('useLevePlanStore', () => {
  it('has expected defaults', () => {
    const s = useLevePlanStore.getState();
    expect(s.mode).toBe('gil');
    expect(s.jobFilter).toBe('all');
    expect(s.maxLevel).toBe(100);
  });

  it('setMode toggles between gil and exp', () => {
    useLevePlanStore.getState().setMode('exp');
    expect(useLevePlanStore.getState().mode).toBe('exp');
    useLevePlanStore.getState().setMode('gil');
    expect(useLevePlanStore.getState().mode).toBe('gil');
  });

  it('setJobFilter accepts class codes and category strings', () => {
    useLevePlanStore.getState().setJobFilter('CRP');
    expect(useLevePlanStore.getState().jobFilter).toBe('CRP');
    useLevePlanStore.getState().setJobFilter('doh');
    expect(useLevePlanStore.getState().jobFilter).toBe('doh');
  });

  it('setMaxLevel clamps to 1-100 and floors decimals', () => {
    useLevePlanStore.getState().setMaxLevel(50.7);
    expect(useLevePlanStore.getState().maxLevel).toBe(50);
    useLevePlanStore.getState().setMaxLevel(0);
    expect(useLevePlanStore.getState().maxLevel).toBe(1);
    useLevePlanStore.getState().setMaxLevel(999);
    expect(useLevePlanStore.getState().maxLevel).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/features/leves/levePlanStore.test.ts
```

Expected: ERROR "Cannot find module './levePlanStore'".

- [ ] **Step 3: Implement the store**

Create `src/features/leves/levePlanStore.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LeveMode = 'gil' | 'exp';

export type LeveJobFilter =
  | 'all'
  | 'doh' | 'dol' | 'dow'
  | 'CRP' | 'BSM' | 'ARM' | 'GSM' | 'LTW' | 'WVR' | 'ALC' | 'CUL'
  | 'MIN' | 'BTN' | 'FSH'
  | 'GC';

export interface LevePlanState {
  _v: 1;
  mode: LeveMode;
  jobFilter: LeveJobFilter;
  maxLevel: number;
  setMode: (m: LeveMode) => void;
  setJobFilter: (j: LeveJobFilter) => void;
  setMaxLevel: (n: number) => void;
}

type PlanData = Omit<LevePlanState, 'setMode' | 'setJobFilter' | 'setMaxLevel'>;

export function defaultLevePlan(): PlanData {
  return {
    _v: 1,
    mode: 'gil',
    jobFilter: 'all',
    maxLevel: 100,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const useLevePlanStore = create<LevePlanState>()(
  persist(
    (set) => ({
      ...defaultLevePlan(),
      setMode: (mode) => set({ mode }),
      setJobFilter: (jobFilter) => set({ jobFilter }),
      setMaxLevel: (maxLevel) => set({ maxLevel: clamp(Math.floor(maxLevel), 1, 100) }),
    }),
    {
      name: 'ffxiv-helper:leve-plan',
      version: 1,
      migrate: (state, version) => {
        if (version < 1) return defaultLevePlan() as unknown as LevePlanState;
        return state as LevePlanState;
      },
    },
  ),
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/features/leves/levePlanStore.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/leves/levePlanStore.ts src/features/leves/levePlanStore.test.ts
git commit -m "feat(leves): persisted plan store"
```

---

## Task 5: `computeLevePlan` — pure compute function

**Files:**
- Create: `src/features/leves/computeLevePlan.ts`
- Create: `src/features/leves/computeLevePlan.test.ts`

This is the heart of the planner. Keeping it pure (no React, no fetch) makes it trivial to unit-test.

- [ ] **Step 1: Write the failing test**

Create `src/features/leves/computeLevePlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeLevePlan } from './computeLevePlan';
import type { SnapshotLeve } from '../../lib/leveSnapshot';
import type { Recipe } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';

const dohLeve: SnapshotLeve = {
  id: 100, name: 'And Bring Plenty of Ale', level: 30, type: 'doh', classJob: 15,
  city: 'Limsa Lominsa', baseGil: 1000, baseExp: 5000, hqGilMultiplier: 2.0,
  targetItemId: 5001, targetItemQty: 3,
};
const dolLeve: SnapshotLeve = {
  id: 200, name: 'Mining for Memories', level: 20, type: 'dol', classJob: 16,
  city: "Ul'dah", baseGil: 800, baseExp: 3000, hqGilMultiplier: 1.0,
  targetItemId: 5002, targetItemQty: 5,
};
const dowLeve: SnapshotLeve = {
  id: 300, name: 'Slay Wamouras', level: 50, type: 'dow', classJob: 99,
  city: 'Limsa Lominsa', baseGil: 5000, baseExp: 12000, hqGilMultiplier: 1.0,
  targetItemId: null, targetItemQty: null,
};

const recipeForTarget: Recipe = {
  itemResultId: 5001, classJob: 'CUL', recipeLevel: 30,
  ingredients: [{ itemId: 6001, amount: 2 }, { itemId: 6002, amount: 1 }],
};

const recipes = new Map<number, Recipe>([[5001, recipeForTarget]]);

const prices: MarketData = {
  '6001': { minNQ: 50, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
  '6002': { minNQ: 100, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
};

describe('computeLevePlan', () => {
  it('computes net gil for a DoH leve (HQ multiplier × qty − mat cost)', () => {
    const result = computeLevePlan([dohLeve], recipes, prices, { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    expect(result.rows).toHaveLength(1);
    // grossGil = 1000 × 2.0 × 3 = 6000
    // matCost  = (50 × 2 + 100 × 1) × 3 = 200 × 3 = 600
    // netGil   = 6000 − 600 = 5400
    expect(result.rows[0].grossGil).toBe(6000);
    expect(result.rows[0].matCost).toBe(600);
    expect(result.rows[0].netGil).toBe(5400);
    expect(result.rows[0].hasMatCostData).toBe(true);
  });

  it('computes gross gil for a DoL leve (no mat cost)', () => {
    const result = computeLevePlan([dolLeve], recipes, prices, { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    // grossGil = 800 × 5 = 4000
    expect(result.rows[0].grossGil).toBe(4000);
    expect(result.rows[0].matCost).toBeNull();
    expect(result.rows[0].netGil).toBe(4000);
  });

  it('computes gross gil for a DoW leve (flat, no qty)', () => {
    const result = computeLevePlan([dowLeve], recipes, prices, { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    expect(result.rows[0].grossGil).toBe(5000);
    expect(result.rows[0].matCost).toBeNull();
    expect(result.rows[0].netGil).toBe(5000);
  });

  it('sorts by netGil descending in gil mode', () => {
    const result = computeLevePlan([dolLeve, dohLeve, dowLeve], recipes, prices,
      { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    // dohLeve.netGil=5400, dowLeve.netGil=5000, dolLeve.netGil=4000
    expect(result.rows.map((r) => r.id)).toEqual([100, 300, 200]);
  });

  it('sorts by exp descending in exp mode', () => {
    const result = computeLevePlan([dolLeve, dohLeve, dowLeve], recipes, prices,
      { mode: 'exp', jobFilter: 'all', maxLevel: 100 });
    // dowLeve.exp=12000, dohLeve.exp=5000, dolLeve.exp=3000
    expect(result.rows.map((r) => r.id)).toEqual([300, 100, 200]);
  });

  it("filters out leves above maxLevel", () => {
    const result = computeLevePlan([dolLeve, dohLeve, dowLeve], recipes, prices,
      { mode: 'gil', jobFilter: 'all', maxLevel: 25 });
    expect(result.rows.map((r) => r.id)).toEqual([200]); // only dolLeve at level 20
  });

  it('filters by jobFilter=CRP (specific class)', () => {
    const culLeve = { ...dohLeve, id: 101, classJob: 15 }; // CUL
    const crpLeve = { ...dohLeve, id: 102, classJob: 8 }; // CRP
    const result = computeLevePlan([culLeve, crpLeve], recipes, prices,
      { mode: 'gil', jobFilter: 'CRP', maxLevel: 100 });
    expect(result.rows.map((r) => r.id)).toEqual([102]);
  });

  it('filters by jobFilter=doh (category)', () => {
    const result = computeLevePlan([dolLeve, dohLeve, dowLeve], recipes, prices,
      { mode: 'gil', jobFilter: 'doh', maxLevel: 100 });
    expect(result.rows.map((r) => r.id)).toEqual([100]);
  });

  it('flags hasMatCostData=false for DoH with missing recipe', () => {
    const orphanDoh = { ...dohLeve, id: 999, targetItemId: 99_999 };
    const result = computeLevePlan([orphanDoh], recipes, prices,
      { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    expect(result.rows[0].hasMatCostData).toBe(false);
    expect(result.rows[0].matCost).toBeNull();
  });

  it('flags hasMatCostData=false for DoH with missing price on any ingredient', () => {
    const incompletePrices: MarketData = { '6001': prices['6001'] }; // missing 6002
    const result = computeLevePlan([dohLeve], recipes, incompletePrices,
      { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    expect(result.rows[0].hasMatCostData).toBe(false);
    expect(result.rows[0].matCost).toBeNull();
  });

  it('sinks rows with hasMatCostData=false to the bottom in gil mode', () => {
    const incompletePrices: MarketData = { '6001': prices['6001'] };
    const result = computeLevePlan([dohLeve, dolLeve], recipes, incompletePrices,
      { mode: 'gil', jobFilter: 'all', maxLevel: 100 });
    // dolLeve has matCost=null but hasMatCostData=true (non-DoH); netGil=4000
    // dohLeve has hasMatCostData=false; sinks below dolLeve
    expect(result.rows.map((r) => r.id)).toEqual([200, 100]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/features/leves/computeLevePlan.test.ts
```

Expected: ERROR "Cannot find module './computeLevePlan'".

- [ ] **Step 3: Implement computeLevePlan.ts**

Create `src/features/leves/computeLevePlan.ts`:

```ts
import type { SnapshotLeve } from '../../lib/leveSnapshot';
import type { Recipe } from '../../lib/recipes';
import type { MarketData } from '../../lib/universalis';
import type { LeveJobFilter, LeveMode } from './levePlanStore';

const CLASS_JOB_TO_CODE: Record<number, string> = {
  8: 'CRP', 9: 'BSM', 10: 'ARM', 11: 'GSM',
  12: 'LTW', 13: 'WVR', 14: 'ALC', 15: 'CUL',
  16: 'MIN', 17: 'BTN', 18: 'FSH',
  99: 'GC',
};

export interface LeveRow {
  id: number;
  name: string;
  classJobCode: string;
  level: number;
  city: string;
  type: SnapshotLeve['type'];
  grossGil: number;
  matCost: number | null;
  netGil: number;
  exp: number;
  hasMatCostData: boolean;
  targetItemId: number | null;
  targetItemQty: number | null;
}

export interface LevePlanResult {
  rows: LeveRow[];
}

export interface ComputeLevePlanOpts {
  mode: LeveMode;
  jobFilter: LeveJobFilter;
  maxLevel: number;
}

const DOH_CODES = new Set(['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL']);
const DOL_CODES = new Set(['MIN', 'BTN', 'FSH']);

function passesJobFilter(filter: LeveJobFilter, code: string, type: SnapshotLeve['type']): boolean {
  if (filter === 'all') return true;
  if (filter === 'doh') return DOH_CODES.has(code);
  if (filter === 'dol') return DOL_CODES.has(code);
  if (filter === 'dow') return type === 'dow' || type === 'dom';
  return filter === code;
}

function ingredientPrice(prices: MarketData, itemId: number): number | null {
  const m = prices[String(itemId)];
  if (m?.minNQ != null) return m.minNQ;
  if (m?.avgNQ != null) return m.avgNQ;
  return null;
}

export function computeLevePlan(
  snapshot: SnapshotLeve[],
  recipes: Map<number, Recipe>,
  prices: MarketData,
  opts: ComputeLevePlanOpts,
): LevePlanResult {
  const rows: LeveRow[] = [];
  for (const leve of snapshot) {
    if (leve.level > opts.maxLevel) continue;
    const code = CLASS_JOB_TO_CODE[leve.classJob] ?? '';
    if (!passesJobFilter(opts.jobFilter, code, leve.type)) continue;

    const qty = leve.targetItemQty ?? 1;
    const grossGil = leve.baseGil * leve.hqGilMultiplier * qty;

    let matCost: number | null = null;
    let hasMatCostData = true;
    if (leve.type === 'doh' && leve.targetItemId != null) {
      const recipe = recipes.get(leve.targetItemId);
      if (!recipe) {
        hasMatCostData = false;
      } else {
        let sum = 0;
        for (const ing of recipe.ingredients) {
          const p = ingredientPrice(prices, ing.itemId);
          if (p == null) { hasMatCostData = false; break; }
          sum += p * ing.amount;
        }
        if (hasMatCostData) matCost = sum * qty;
      }
    }

    const netGil = matCost != null ? grossGil - matCost : grossGil;

    rows.push({
      id: leve.id, name: leve.name, classJobCode: code, level: leve.level,
      city: leve.city, type: leve.type,
      grossGil, matCost, netGil, exp: leve.baseExp,
      hasMatCostData,
      targetItemId: leve.targetItemId, targetItemQty: leve.targetItemQty,
    });
  }

  // Sort: gil-mode by netGil desc, with hasMatCostData=false rows sunk to bottom.
  //       exp-mode by exp desc.
  rows.sort((a, b) => {
    if (opts.mode === 'gil') {
      // Push degraded rows down.
      if (a.hasMatCostData !== b.hasMatCostData) return a.hasMatCostData ? -1 : 1;
      return b.netGil - a.netGil;
    }
    return b.exp - a.exp;
  });

  return { rows };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/features/leves/computeLevePlan.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/leves/computeLevePlan.ts src/features/leves/computeLevePlan.test.ts
git commit -m "feat(leves): pure computeLevePlan with gil/exp sort + filters"
```

---

## Task 6: `useLevePlanQuery` hook

**Files:**
- Create: `src/features/leves/useLevePlanQuery.ts`
- Create: `src/features/leves/useLevePlanQuery.test.tsx`

Orchestrates: leveSnapshot + recipeSnapshot + Universalis batch fetch + `computeLevePlan`. Mirrors `useGatheringQuery.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/features/leves/useLevePlanQuery.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLevePlanQuery } from './useLevePlanQuery';
import { useLevePlanStore, defaultLevePlan } from './levePlanStore';

vi.mock('../queries/useLeveSnapshot', () => ({
  useLeveSnapshot: () => ({
    data: {
      leves: [
        { id: 100, name: 'A', level: 30, type: 'doh', classJob: 15, city: 'X',
          baseGil: 1000, baseExp: 5000, hqGilMultiplier: 2.0,
          targetItemId: 5001, targetItemQty: 1 },
      ],
      updatedAt: 1,
    },
  }),
}));

vi.mock('../queries/useRecipeSnapshot', () => ({
  useRecipeSnapshot: () => ({
    data: new Map([[5001, { itemResultId: 5001, classJob: 'CUL', recipeLevel: 30,
      ingredients: [{ itemId: 6001, amount: 2 }] }]]),
  }),
}));

vi.mock('../settings/store', () => ({
  useSettingsStore: () => ({ world: 'Phantom' }),
}));

vi.mock('../../lib/universalisBulk', () => ({
  fetchInBatches: async () => ({
    data: { '6001': { minNQ: 50, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null,
      medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0,
      listingCount: 0, worldListings: [], averagePriceNQ: null, averagePriceHQ: null } },
    errors: [],
  }),
}));

vi.mock('../../lib/universalis', () => ({
  fetchMarketData: vi.fn(),
}));

function withProviders(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  localStorage.clear();
  useLevePlanStore.setState(defaultLevePlan());
});

describe('useLevePlanQuery', () => {
  it('returns ready=true once snapshots resolve', () => {
    const { result } = renderHook(() => useLevePlanQuery(), { wrapper: ({ children }) => withProviders(children) });
    expect(result.current.ready).toBe(true);
  });

  it('produces a ranked row after run()', async () => {
    const { result } = renderHook(() => useLevePlanQuery(), { wrapper: ({ children }) => withProviders(children) });
    act(() => { result.current.run(); });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    // grossGil=1000*2*1=2000, matCost=50*2*1=100, netGil=1900
    expect(result.current.rows[0].netGil).toBe(1900);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/features/leves/useLevePlanQuery.test.tsx
```

Expected: ERROR "Cannot find module './useLevePlanQuery'".

- [ ] **Step 3: Implement useLevePlanQuery.ts**

Create `src/features/leves/useLevePlanQuery.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import { useLeveSnapshot } from '../queries/useLeveSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useSettingsStore } from '../settings/store';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { useLevePlanStore } from './levePlanStore';
import { computeLevePlan, type LeveRow } from './computeLevePlan';

export interface UseLevePlanQueryResult {
  run: () => void;
  rows: LeveRow[];
  skipped: number;
  ready: boolean;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

interface RunResult {
  rows: LeveRow[];
  skipped: number;
}

export function useLevePlanQuery(): UseLevePlanQueryResult {
  const snapshot = useLeveSnapshot();
  const recipes = useRecipeSnapshot();
  const { world } = useSettingsStore();
  const { mode, jobFilter, maxLevel } = useLevePlanStore();

  const mutation = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Leve snapshot not ready');
      if (!recipes.data) throw new Error('Recipe snapshot not ready');

      // Collect unique ingredient ids for DoH leves only.
      const ingredientIds = new Set<number>();
      for (const leve of snapshot.data.leves) {
        if (leve.type !== 'doh' || leve.targetItemId == null) continue;
        const recipe = recipes.data.get(leve.targetItemId);
        if (!recipe) continue;
        for (const ing of recipe.ingredients) ingredientIds.add(ing.itemId);
      }

      const ids = [...ingredientIds];
      const result = await fetchInBatches<MarketData[string]>(
        ids,
        async (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 25, concurrency: 4 },
      );

      const plan = computeLevePlan(snapshot.data.leves, recipes.data, result.data,
        { mode, jobFilter, maxLevel });

      return { rows: plan.rows, skipped: result.errors.length };
    },
  });

  return {
    run: () => mutation.mutate(),
    rows: mutation.data?.rows ?? [],
    skipped: mutation.data?.skipped ?? 0,
    ready: snapshot.data != null && recipes.data != null,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error as Error | null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/features/leves/useLevePlanQuery.test.tsx
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/leves/useLevePlanQuery.ts src/features/leves/useLevePlanQuery.test.tsx
git commit -m "feat(leves): query hook orchestrating snapshot + prices + compute"
```

---

## Task 7: `LevePlanner` view component

**Files:**
- Create: `src/features/leves/LevePlanner.tsx`
- Create: `src/features/leves/LevePlanner.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/leves/LevePlanner.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LevePlanner } from './LevePlanner';
import { useLevePlanStore, defaultLevePlan } from './levePlanStore';
import type { LeveRow } from './computeLevePlan';

const rows: LeveRow[] = [
  { id: 100, name: 'Cobalt Ingot', classJobCode: 'BSM', level: 50, city: 'Limsa Lominsa',
    type: 'doh', grossGil: 6000, matCost: 600, netGil: 5400, exp: 8000,
    hasMatCostData: true, targetItemId: 5001, targetItemQty: 3 },
  { id: 200, name: 'Mining for Memories', classJobCode: 'MIN', level: 20, city: "Ul'dah",
    type: 'dol', grossGil: 4000, matCost: null, netGil: 4000, exp: 3000,
    hasMatCostData: true, targetItemId: 5002, targetItemQty: 5 },
];

beforeEach(() => {
  localStorage.clear();
  useLevePlanStore.setState(defaultLevePlan());
});

function withProviders(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe('LevePlanner', () => {
  it('renders one row per leve with the expected columns', () => {
    render(withProviders(<LevePlanner rows={rows} />));
    expect(screen.getByText('Cobalt Ingot')).toBeInTheDocument();
    expect(screen.getByText('Mining for Memories')).toBeInTheDocument();
    expect(screen.getByText(/5400|5,400/)).toBeInTheDocument();
    expect(screen.getByText(/4000|4,000/)).toBeInTheDocument();
  });

  it("renders '—' in Mat Cost / Net Gil columns for non-DoH rows", () => {
    render(withProviders(<LevePlanner rows={[rows[1]]} />));
    const row = screen.getByText('Mining for Memories').closest('tr')!;
    // dolLeve has matCost=null, hasMatCostData=true → mat cell shows —
    expect(row.textContent).toContain('—');
  });

  it("shows '?' in Mat Cost when hasMatCostData=false", () => {
    const degraded: LeveRow = { ...rows[0], hasMatCostData: false, matCost: null, netGil: 6000 };
    render(withProviders(<LevePlanner rows={[degraded]} />));
    const row = screen.getByText('Cobalt Ingot').closest('tr')!;
    expect(row.textContent).toContain('?');
  });

  it('switches sort key when mode toggle flips to exp', () => {
    render(withProviders(<LevePlanner rows={rows} />));
    fireEvent.click(screen.getByLabelText(/exp mode/i));
    expect(useLevePlanStore.getState().mode).toBe('exp');
  });

  it('shows an empty-state message when rows is empty', () => {
    render(withProviders(<LevePlanner rows={[]} />));
    expect(screen.getByText(/run query/i)).toBeInTheDocument();
  });

  it('renders the DoH target item name as an ItemNameLinks link', () => {
    render(withProviders(<LevePlanner rows={rows} />));
    const link = screen.getByRole('link', { name: /cobalt ingot/i });
    expect(link).toHaveAttribute('href');
    expect(link.getAttribute('href')).toContain('universalis.app');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/features/leves/LevePlanner.test.tsx
```

Expected: ERROR "Cannot find module './LevePlanner'".

- [ ] **Step 3: Implement LevePlanner.tsx**

Create `src/features/leves/LevePlanner.tsx`:

```tsx
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { useLevePlanStore } from './levePlanStore';
import type { LeveRow } from './computeLevePlan';
import type { LeveJobFilter } from './levePlanStore';

interface Props {
  rows: LeveRow[];
}

const JOB_OPTIONS: Array<{ value: LeveJobFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'doh', label: 'All DoH' },
  { value: 'CRP', label: 'Carpenter' },
  { value: 'BSM', label: 'Blacksmith' },
  { value: 'ARM', label: 'Armorer' },
  { value: 'GSM', label: 'Goldsmith' },
  { value: 'LTW', label: 'Leatherworker' },
  { value: 'WVR', label: 'Weaver' },
  { value: 'ALC', label: 'Alchemist' },
  { value: 'CUL', label: 'Culinarian' },
  { value: 'dol', label: 'All DoL' },
  { value: 'MIN', label: 'Miner' },
  { value: 'BTN', label: 'Botanist' },
  { value: 'FSH', label: 'Fisher' },
  { value: 'GC', label: 'Grand Company' },
];

export function LevePlanner({ rows }: Props) {
  const s = useLevePlanStore();

  return (
    <section className="border border-border-base bg-bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
        <label className="flex items-center gap-1.5" aria-label="Gil mode">
          <input type="radio" checked={s.mode === 'gil'} onChange={() => s.setMode('gil')} />
          Gil
        </label>
        <label className="flex items-center gap-1.5" aria-label="Exp mode">
          <input type="radio" checked={s.mode === 'exp'} onChange={() => s.setMode('exp')} />
          Exp
        </label>

        <label className="flex items-center gap-1.5" aria-label="Job filter">
          Job
          <select
            value={s.jobFilter}
            onChange={(e) => s.setJobFilter(e.target.value as LeveJobFilter)}
            className="bg-bg-card-hi border border-border-base px-1.5 py-0.5"
          >
            {JOB_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5" aria-label="Max level">
          Lvl ≤
          <input
            type="number" min={1} max={100} value={s.maxLevel}
            onChange={(e) => s.setMaxLevel(Number(e.target.value))}
            className="w-14 bg-bg-card-hi border border-border-base px-1.5 py-0.5"
          />
        </label>
      </div>

      <p className="font-mono text-[10px] text-text-low max-w-prose">
        DoH gil assumes 100% HQ submission. DoL collectability bonuses (+50% to +150%) not modeled.
        EXP shown is the raw base — over-level penalties are not applied.
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
            <th className="text-left px-2 py-1">Name</th>
            <th className="text-left px-2 py-1">Job</th>
            <th className="text-right px-2 py-1">Lvl</th>
            <th className="text-left px-2 py-1">City</th>
            <th className="text-right px-2 py-1">Gross</th>
            <th className="text-right px-2 py-1">Mat Cost</th>
            <th className="text-right px-2 py-1">Net Gil</th>
            <th className="text-right px-2 py-1">EXP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border-base">
              <td className="px-2 py-1.5">
                {r.targetItemId != null
                  ? <ItemNameLinks id={r.targetItemId} name={r.targetItemQty != null ? `${r.name} ×${r.targetItemQty}` : r.name} />
                  : <span>{r.name}</span>}
              </td>
              <td className="px-2 py-1.5 font-mono text-text-low">{r.classJobCode}</td>
              <td className="px-2 py-1.5 text-right font-mono">{r.level}</td>
              <td className="px-2 py-1.5 font-mono text-text-low">{r.city}</td>
              <td className="px-2 py-1.5 text-right font-mono">{fmtGil(r.grossGil)}</td>
              <td className="px-2 py-1.5 text-right font-mono">
                {r.type !== 'doh' ? '—' : !r.hasMatCostData ? '?' : fmtGil(r.matCost ?? 0)}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-gold-hi">
                {!r.hasMatCostData ? '—' : fmtGil(r.netGil)}
              </td>
              <td className="px-2 py-1.5 text-right font-mono">{r.exp.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-2 py-3 text-center text-text-low font-mono text-[11px] italic">
                Click Run query to populate this plan.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/features/leves/LevePlanner.test.tsx
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/leves/LevePlanner.tsx src/features/leves/LevePlanner.test.tsx
git commit -m "feat(leves): LevePlanner view with filters + table"
```

---

## Task 8: `/leves` route page + registration

**Files:**
- Create: `src/routes/LevePlan.tsx`
- Create: `src/routes/LevePlan.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing route test**

Create `src/routes/LevePlan.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import LevePlan from './LevePlan';

const runMock = vi.fn();
vi.mock('../features/leves/useLevePlanQuery', () => ({
  useLevePlanQuery: () => ({
    run: runMock,
    rows: [],
    skipped: 0,
    ready: true,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

function withProviders(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('LevePlan route', () => {
  it('renders a heading and a Run button', () => {
    render(withProviders(<LevePlan />));
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.textContent).toMatch(/leve/i);
    expect(screen.getByRole('button', { name: /run query/i })).toBeInTheDocument();
  });

  it('fires the Run mutation on click', () => {
    render(withProviders(<LevePlan />));
    fireEvent.click(screen.getByRole('button', { name: /run query/i }));
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/routes/LevePlan.test.tsx
```

Expected: ERROR "Cannot find module './LevePlan'".

- [ ] **Step 3: Implement LevePlan.tsx**

Create `src/routes/LevePlan.tsx`:

```tsx
import { LevePlanner } from '../features/leves/LevePlanner';
import { useLevePlanQuery } from '../features/leves/useLevePlanQuery';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

export default function LevePlan() {
  const q = useLevePlanQuery();
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-gold tracking-wide">Levequest planner</h2>
          <p className="font-mono text-[11px] text-text-low max-w-prose">
            Best gil or exp per allowance, ranked.
          </p>
        </div>
        <button
          onClick={q.run}
          disabled={!q.ready || q.isPending}
          className="font-mono text-[10px] tracking-widest uppercase px-3 py-2 border border-gold text-gold disabled:border-border-base disabled:text-text-low"
        >
          {q.ready ? (q.isPending ? 'Running…' : 'Run query') : 'Loading data…'}
        </button>
      </div>

      {q.isPending && <Spinner label="Fetching leve market data…" />}
      {q.isError && <StatusBanner kind="error">Query failed: {(q.error as Error).message}</StatusBanner>}
      {q.skipped > 0 && (
        <StatusBanner kind="error">{q.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      <LevePlanner rows={q.rows} />
    </div>
  );
}
```

- [ ] **Step 4: Register the route in App.tsx**

Edit `src/App.tsx`. Add the import alongside the other route imports (line 8 area):

```tsx
import LevePlan from './routes/LevePlan';
```

Add the route inside `<Routes>` (between the existing `/gathering/plan` and `/queries` lines):

```tsx
<Route path="/leves" element={<LevePlan />} />
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/routes/LevePlan.test.tsx
```

Expected: both tests pass.

- [ ] **Step 6: Full sanity sweep — vitest + typecheck**

```bash
npx vitest run
```

Expected: all tests pass project-wide.

```bash
npx tsc --noEmit
```

Expected: no errors.

If anything else fails (any test outside the leve files, any typecheck regression), STOP. Do not commit. Investigate the regression and fix before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/routes/LevePlan.tsx src/routes/LevePlan.test.tsx src/App.tsx
git commit -m "feat(leves): /leves route + LevePlan page"
```

---

## Done

After Task 8 the route works end-to-end: navigate to `/leves`, the snapshot loads, click Run, ranked leves appear. No further wiring is needed — the existing `Header` component already auto-discovers all `Routes`, so the nav link surfaces without modification (verify in a smoke test).

**Manual smoke test (recommended after Task 8):**

1. `npm run dev`
2. Open `/leves`
3. Wait for the snapshot to load (first visit fetches ~3000 leves; subsequent visits are instant via IDB cache)
4. Click Run
5. Verify:
   - DoH leves show net gil that's plausibly close to gross − mats
   - DoL leves show `—` in Mat Cost
   - Mode toggle re-sorts visibly
   - Job filter narrows results
   - Max level slider filters
   - Item-name hover popover works on DoH rows

If the snapshot returns 0 rows, the most likely cause is XIVAPI v2 schema drift — re-run the probe from Task 1 Step 1, compare to the schema comment in `leveSnapshot.ts`, and adjust field accessors.

If specific rows show `?` in Mat Cost: that's the documented degradation path (missing price or missing recipe). Not a bug.
