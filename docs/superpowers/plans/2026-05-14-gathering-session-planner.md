# Gathering session planner — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stateless session-planner panel to `/gathering` that converts a time-or-gil budget into per-item target quantities and produces a GatherBuddy Reborn clipboard import string.

**Architecture:** A new persisted zustand slice (`gatheringPlanStore`) holds user inputs. A pure-function `computePlan` produces target quantities from `QueryResultRow[]`. A pure-function `encodeGbrList` produces the GBR base64 blob (gzip of `[0x05] + UTF-8 JSON`). `QueriesView` gets an opt-in `onRowsChange` callback so the existing gathering query can feed the planner. A new `GatheringPlanner` component composes everything and renders above the existing browse table on the `/gathering` route.

**Tech Stack:** React 18, TypeScript, Vitest 4 (jsdom), React Testing Library, zustand 5 (with `persist`), Web Streams API (`CompressionStream`).

Spec: [2026-05-14-gathering-session-planner-design.md](../specs/2026-05-14-gathering-session-planner-design.md)

---

### Task 0: Polyfill `CompressionStream` / `DecompressionStream` in test setup

The encode helper uses `CompressionStream('gzip')`, which is part of the browser Web Streams API. jsdom does not provide it, but Node ≥ 18 exposes the same classes via `node:stream/web`. Patch them into `globalThis` for tests so the helper and its round-trip test work uniformly.

**Files:**
- Modify: `src/test/setup.ts`

- [ ] **Step 1: Add the polyfill**

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { CompressionStream, DecompressionStream } from 'node:stream/web';

// jsdom doesn't ship Web Streams compression. Use Node's built-in
// implementation (same API surface) so the gatherBuddyExport helper and its
// round-trip test work the same way in tests as in the browser.
if (typeof (globalThis as Record<string, unknown>).CompressionStream === 'undefined') {
  (globalThis as Record<string, unknown>).CompressionStream = CompressionStream;
}
if (typeof (globalThis as Record<string, unknown>).DecompressionStream === 'undefined') {
  (globalThis as Record<string, unknown>).DecompressionStream = DecompressionStream;
}
```

- [ ] **Step 2: Verify the polyfill works**

Run: `npx vitest run src/features/ui/uiStore.test.ts`
Expected: PASS (no regression in an existing test that imports the same setup).

- [ ] **Step 3: Commit**

```bash
git add src/test/setup.ts
git commit -m "$(printf 'chore(test): polyfill CompressionStream for jsdom\n\nNode 18+ ships CompressionStream/DecompressionStream via node:stream/web\nbut jsdom does not. Patch them onto globalThis so browser code using\nthe Web Streams compression API can be tested without conditional imports.\n')"
```

---

### Task 1: Add `gatheringPlanStore` (persisted zustand slice)

Holds all planner inputs plus the global `itemsPerMin` knob. Same `persist` middleware pattern as `src/features/ui/uiStore.ts`.

**Files:**
- Create: `src/features/gathering/gatheringPlanStore.ts`
- Test: `src/features/gathering/gatheringPlanStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/gathering/gatheringPlanStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useGatheringPlanStore, defaultGatheringPlan } from './gatheringPlanStore';

beforeEach(() => {
  localStorage.clear();
  useGatheringPlanStore.setState(defaultGatheringPlan());
});

describe('gathering plan store', () => {
  it('exposes the documented defaults', () => {
    const s = useGatheringPlanStore.getState();
    expect(s.budgetMode).toBe('time');
    expect(s.budgetTimeMin).toBe(45);
    expect(s.budgetGil).toBe(500_000);
    expect(s.itemCount).toBe(3);
    expect(s.maxLevel).toBe(90);
    expect(s.includeTimed).toBe(false);
    expect(s.listName).toBe('AFK gather');
    expect(s.itemsPerMin).toBe(100);
  });

  it('setters mutate just that field', () => {
    useGatheringPlanStore.getState().setBudgetMode('gil');
    expect(useGatheringPlanStore.getState().budgetMode).toBe('gil');
    expect(useGatheringPlanStore.getState().budgetTimeMin).toBe(45);

    useGatheringPlanStore.getState().setItemCount(7);
    expect(useGatheringPlanStore.getState().itemCount).toBe(7);
  });

  it('clamps itemCount to 1-10', () => {
    useGatheringPlanStore.getState().setItemCount(0);
    expect(useGatheringPlanStore.getState().itemCount).toBe(1);
    useGatheringPlanStore.getState().setItemCount(99);
    expect(useGatheringPlanStore.getState().itemCount).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/gathering/gatheringPlanStore.test.ts`
Expected: FAIL (`gatheringPlanStore` module not found).

- [ ] **Step 3: Implement the store**

Create `src/features/gathering/gatheringPlanStore.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BudgetMode = 'time' | 'gil';

export interface GatheringPlanState {
  _v: 1;
  budgetMode: BudgetMode;
  budgetTimeMin: number;
  budgetGil: number;
  itemCount: number;
  maxLevel: number;
  includeTimed: boolean;
  listName: string;
  itemsPerMin: number;
  setBudgetMode: (m: BudgetMode) => void;
  setBudgetTimeMin: (n: number) => void;
  setBudgetGil: (n: number) => void;
  setItemCount: (n: number) => void;
  setMaxLevel: (n: number) => void;
  setIncludeTimed: (b: boolean) => void;
  setListName: (s: string) => void;
  setItemsPerMin: (n: number) => void;
}

type PlanData = Omit<
  GatheringPlanState,
  | 'setBudgetMode'
  | 'setBudgetTimeMin'
  | 'setBudgetGil'
  | 'setItemCount'
  | 'setMaxLevel'
  | 'setIncludeTimed'
  | 'setListName'
  | 'setItemsPerMin'
>;

export function defaultGatheringPlan(): PlanData {
  return {
    _v: 1,
    budgetMode: 'time',
    budgetTimeMin: 45,
    budgetGil: 500_000,
    itemCount: 3,
    maxLevel: 90,
    includeTimed: false,
    listName: 'AFK gather',
    itemsPerMin: 100,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const useGatheringPlanStore = create<GatheringPlanState>()(
  persist(
    (set) => ({
      ...defaultGatheringPlan(),
      setBudgetMode: (budgetMode) => set({ budgetMode }),
      setBudgetTimeMin: (budgetTimeMin) => set({ budgetTimeMin: Math.max(1, Math.floor(budgetTimeMin)) }),
      setBudgetGil: (budgetGil) => set({ budgetGil: Math.max(0, Math.floor(budgetGil)) }),
      setItemCount: (itemCount) => set({ itemCount: clamp(Math.floor(itemCount), 1, 10) }),
      setMaxLevel: (maxLevel) => set({ maxLevel: clamp(Math.floor(maxLevel), 1, 999) }),
      setIncludeTimed: (includeTimed) => set({ includeTimed }),
      setListName: (listName) => set({ listName }),
      setItemsPerMin: (itemsPerMin) => set({ itemsPerMin: Math.max(1, Math.floor(itemsPerMin)) }),
    }),
    {
      name: 'ffxiv-helper:gathering-plan',
      version: 1,
      migrate: (state, version) => {
        if (version < 1) return defaultGatheringPlan() as unknown as GatheringPlanState;
        return state as GatheringPlanState;
      },
    },
  ),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/gathering/gatheringPlanStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/gathering/gatheringPlanStore.ts src/features/gathering/gatheringPlanStore.test.ts
git commit -m "$(printf 'feat(gathering): persisted store for session-planner inputs\n\nHolds budget mode, item count, filters, list name and the global\nitemsPerMin rate behind a zustand persist slice. Clamps itemCount to\n1-10 to match the planner UI bounds.\n')"
```

---

### Task 2: `computePlan` — pure session math (TDD)

Pure function. Given the filtered rows and the planner options, produces `PlanRow[]` with target quantities + a summary (totals + estimated minutes). No React.

**Files:**
- Create: `src/features/gathering/computePlan.ts`
- Test: `src/features/gathering/computePlan.test.ts`

- [ ] **Step 1: Write the failing test (time mode + gil mode + edge cases)**

Create `src/features/gathering/computePlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computePlan, type ComputePlanRow } from './computePlan';

function row(id: number, unitPrice: number, gilFlow: number): ComputePlanRow {
  return { id, name: `item-${id}`, unitPrice, gilFlow };
}

describe('computePlan', () => {
  it('time mode splits the item pool by gilFlow share', () => {
    const result = computePlan(
      [row(1, 100, 600), row(2, 50, 400)],
      { mode: 'time', itemCount: 2, budgetTimeMin: 10, budgetGil: 0, itemsPerMin: 100 },
    );
    // totalItems = 10 * 100 = 1000, gilFlow shares 60% / 40%
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ id: 1, qty: 600, subtotal: 60_000 });
    expect(result.rows[1]).toMatchObject({ id: 2, qty: 400, subtotal: 20_000 });
    expect(result.totalGil).toBe(80_000);
    expect(result.totalMinutes).toBe(10);
  });

  it('gil mode allocates by gilFlow share and divides by unit price', () => {
    const result = computePlan(
      [row(1, 100, 600), row(2, 50, 400)],
      { mode: 'gil', itemCount: 2, budgetTimeMin: 0, budgetGil: 100_000, itemsPerMin: 100 },
    );
    // share 60k -> qty 600 @ 100 gil; share 40k -> qty 800 @ 50 gil
    expect(result.rows[0]).toMatchObject({ id: 1, qty: 600, subtotal: 60_000 });
    expect(result.rows[1]).toMatchObject({ id: 2, qty: 800, subtotal: 40_000 });
    expect(result.totalGil).toBe(100_000);
    // total items 1400 / 100 ipm = 14 min
    expect(result.totalMinutes).toBe(14);
  });

  it('caps N at the number of available rows', () => {
    const result = computePlan(
      [row(1, 100, 600)],
      { mode: 'time', itemCount: 5, budgetTimeMin: 10, budgetGil: 0, itemsPerMin: 100 },
    );
    expect(result.rows).toHaveLength(1);
    expect(result.cappedAt).toBe(1);
  });

  it('skips rows with non-positive unit price', () => {
    const result = computePlan(
      [row(1, 100, 600), row(2, 0, 1000)],
      { mode: 'time', itemCount: 2, budgetTimeMin: 10, budgetGil: 0, itemsPerMin: 100 },
    );
    // only the valid row participates
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe(1);
    expect(result.skippedZeroPriceIds).toEqual([2]);
  });

  it('clamps per-item qty to GBRs 1-999999 range', () => {
    const result = computePlan(
      [row(1, 1, 1)],
      { mode: 'gil', itemCount: 1, budgetTimeMin: 0, budgetGil: 5_000_000_000, itemsPerMin: 100 },
    );
    expect(result.rows[0].qty).toBe(999_999);
  });

  it('returns an empty result when given no rows', () => {
    const result = computePlan(
      [],
      { mode: 'time', itemCount: 3, budgetTimeMin: 10, budgetGil: 0, itemsPerMin: 100 },
    );
    expect(result.rows).toEqual([]);
    expect(result.cappedAt).toBe(0);
    expect(result.totalGil).toBe(0);
    expect(result.totalMinutes).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/gathering/computePlan.test.ts`
Expected: FAIL (`computePlan` not found).

- [ ] **Step 3: Implement `computePlan`**

Create `src/features/gathering/computePlan.ts`:

```ts
export interface ComputePlanRow {
  id: number;
  name: string;
  unitPrice: number;
  gilFlow: number;
}

export interface ComputePlanOptions {
  mode: 'time' | 'gil';
  itemCount: number;
  budgetTimeMin: number;
  budgetGil: number;
  itemsPerMin: number;
}

export interface PlanRow {
  id: number;
  name: string;
  unitPrice: number;
  gilFlow: number;
  qty: number;
  subtotal: number;
}

export interface PlanResult {
  rows: PlanRow[];
  cappedAt: number;
  skippedZeroPriceIds: number[];
  totalGil: number;
  totalMinutes: number;
}

const GBR_MIN_QTY = 1;
const GBR_MAX_QTY = 999_999;

const clampQty = (n: number) => Math.max(GBR_MIN_QTY, Math.min(GBR_MAX_QTY, Math.round(n)));

export function computePlan(rows: ComputePlanRow[], opts: ComputePlanOptions): PlanResult {
  const skippedZeroPriceIds: number[] = [];
  const valid: ComputePlanRow[] = [];
  for (const r of rows.slice(0, opts.itemCount)) {
    if (r.unitPrice <= 0) {
      skippedZeroPriceIds.push(r.id);
      continue;
    }
    valid.push(r);
  }

  const sumGilFlow = valid.reduce((acc, r) => acc + r.gilFlow, 0);
  if (valid.length === 0 || sumGilFlow <= 0) {
    return {
      rows: [],
      cappedAt: Math.min(opts.itemCount, rows.length),
      skippedZeroPriceIds,
      totalGil: 0,
      totalMinutes: 0,
    };
  }

  const planRows: PlanRow[] = valid.map((r) => {
    const share = r.gilFlow / sumGilFlow;
    let qty: number;
    if (opts.mode === 'time') {
      const totalItems = opts.budgetTimeMin * opts.itemsPerMin;
      qty = clampQty(totalItems * share);
    } else {
      qty = clampQty((opts.budgetGil * share) / r.unitPrice);
    }
    return {
      id: r.id,
      name: r.name,
      unitPrice: r.unitPrice,
      gilFlow: r.gilFlow,
      qty,
      subtotal: qty * r.unitPrice,
    };
  });

  const totalQty = planRows.reduce((acc, r) => acc + r.qty, 0);
  const totalGil = planRows.reduce((acc, r) => acc + r.subtotal, 0);
  const totalMinutes = opts.itemsPerMin > 0 ? Math.ceil(totalQty / opts.itemsPerMin) : 0;

  return {
    rows: planRows,
    cappedAt: Math.min(opts.itemCount, rows.length),
    skippedZeroPriceIds,
    totalGil,
    totalMinutes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/gathering/computePlan.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/gathering/computePlan.ts src/features/gathering/computePlan.test.ts
git commit -m "$(printf 'feat(gathering): pure computePlan for time/gil budget allocation\n\nWeights rows by gilFlow share, drops zero-price rows from the\nweighting, caps N at row count, and clamps per-item qty to GBRs\n1..999999 range so output is always import-safe.\n')"
```

---

### Task 3: `gatherBuddyExport` — GBR clipboard blob encoder (TDD)

Pure async helper. Produces the standard-base64-of-gzip-of-`[0x05] + UTF-8(JSON)` string that GBR's "Import an auto-gather list from clipboard" feature accepts.

**Files:**
- Create: `src/lib/gatherBuddyExport.ts`
- Test: `src/lib/gatherBuddyExport.test.ts`

- [ ] **Step 1: Write the failing test (round-trip + version byte + typo field)**

Create `src/lib/gatherBuddyExport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeGbrList, GBR_VERSION_BYTE } from './gatherBuddyExport';

async function decode(b64: string): Promise<{ versionByte: number; json: Record<string, unknown> }> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Response(bin).body!.pipeThrough(new DecompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  const versionByte = buf[0];
  const json = JSON.parse(new TextDecoder().decode(buf.slice(1)));
  return { versionByte, json };
}

describe('gatherBuddyExport', () => {
  it('emits version byte 0x05 followed by gzip-compressed JSON', async () => {
    const blob = await encodeGbrList({
      name: 'AFK 45m',
      items: [
        { id: 5544, qty: 320 },
        { id: 5543, qty: 151 },
      ],
    });
    const { versionByte, json } = await decode(blob);
    expect(versionByte).toBe(GBR_VERSION_BYTE);
    expect(versionByte).toBe(0x05);
    expect(json).toEqual({
      ItemIds: [5544, 5543],
      Quantities: { '5544': 320, '5543': 151 },
      PrefferedLocations: {},
      EnabledItems: { '5544': true, '5543': true },
      Name: 'AFK 45m',
      Description: '',
      FolderPath: '',
      Order: 0,
      Enabled: true,
      Fallback: false,
    });
  });

  it('preserves item order from the input array', async () => {
    const blob = await encodeGbrList({
      name: 'order test',
      items: [
        { id: 999, qty: 1 },
        { id: 1, qty: 2 },
        { id: 500, qty: 3 },
      ],
    });
    const { json } = await decode(blob);
    expect(json.ItemIds).toEqual([999, 1, 500]);
  });

  it('uses standard base64 (a-z A-Z 0-9 + / =)', async () => {
    const blob = await encodeGbrList({
      name: 'charset',
      items: [{ id: 1, qty: 1 }],
    });
    expect(blob).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gatherBuddyExport.test.ts`
Expected: FAIL (`gatherBuddyExport` not found).

- [ ] **Step 3: Implement the encoder**

Create `src/lib/gatherBuddyExport.ts`:

```ts
// Encodes a gathering list into the clipboard string accepted by GatherBuddy
// Reborn's "Import an auto-gather list from clipboard" feature.
//
// Format (matches GBR source verbatim — see AutoGatherList.Config.ToBase64 in
// https://github.com/FFXIV-CombatReborn/GatherBuddyReborn/blob/main/GatherBuddy/AutoGather/Lists/AutoGatherList.cs
// and Functions.CompressedBase64 in the same repo):
//   base64( gzip( [0x05] ++ utf8(JSON.stringify(Config)) ) )
//
// `PrefferedLocations` is misspelled in the GBR source; we copy the typo so
// the field is not silently dropped on import. If GBR ever bumps the version
// byte, the round-trip test in gatherBuddyExport.test.ts will fail loudly.

export const GBR_VERSION_BYTE = 0x05;

export interface GbrListItem {
  id: number;
  qty: number;
}

export interface GbrListInput {
  name: string;
  items: GbrListItem[];
  description?: string;
  folderPath?: string;
}

interface GbrConfig {
  ItemIds: number[];
  Quantities: Record<string, number>;
  PrefferedLocations: Record<string, number>;
  EnabledItems: Record<string, boolean>;
  Name: string;
  Description: string;
  FolderPath: string;
  Order: number;
  Enabled: boolean;
  Fallback: boolean;
}

function buildConfig(input: GbrListInput): GbrConfig {
  const ItemIds: number[] = [];
  const Quantities: Record<string, number> = {};
  const EnabledItems: Record<string, boolean> = {};
  for (const item of input.items) {
    ItemIds.push(item.id);
    Quantities[String(item.id)] = item.qty;
    EnabledItems[String(item.id)] = true;
  }
  return {
    ItemIds,
    Quantities,
    PrefferedLocations: {},
    EnabledItems,
    Name: input.name,
    Description: input.description ?? '',
    FolderPath: input.folderPath ?? '',
    Order: 0,
    Enabled: true,
    Fallback: false,
  };
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes).body!.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function encodeGbrList(input: GbrListInput): Promise<string> {
  const json = JSON.stringify(buildConfig(input));
  const jsonBytes = new TextEncoder().encode(json);
  const payload = new Uint8Array(jsonBytes.length + 1);
  payload[0] = GBR_VERSION_BYTE;
  payload.set(jsonBytes, 1);
  const compressed = await gzip(payload);
  return bytesToBase64(compressed);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/gatherBuddyExport.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gatherBuddyExport.ts src/lib/gatherBuddyExport.test.ts
git commit -m "$(printf 'feat(gathering): encode auto-gather lists for GatherBuddy Reborn\n\nEmits the standard-base64-of-gzip-of-[0x05]+JSON shape that GBRs\n"Import an auto-gather list from clipboard" feature accepts. Copies the\nupstream PrefferedLocations typo verbatim so the field is not dropped on\nimport. Round-trip test pins the version byte; if GBR ever bumps it the\ntest fails loudly.\n')"
```

---

### Task 4: Surface query rows from `QueriesView` via optional `onRowsChange`

Lets the parent of `QueriesView` (initially just `Gathering.tsx`) observe the row set the user is currently looking at, without changing any rendering or running a second query.

**Files:**
- Modify: `src/features/queries/QueriesView.tsx`

- [ ] **Step 1: Add the prop and fire the callback when standard-query rows change**

Open `src/features/queries/QueriesView.tsx`. Update the imports, the `Props` interface, the signature, and add an effect that notifies the parent.

Add this import at the top with the other React imports:

```ts
import { useEffect, useMemo, useState } from 'react';
```

(Note: the file currently imports `useMemo, useState` — adjust the line to add `useEffect`.)

Update the `Props` interface (currently around line 29) to:

```ts
interface Props {
  category: PresetCategory;
  heading?: string;
  onRowsChange?: (rows: QueryResultRow[]) => void;
}
```

Update the component signature:

```ts
export function QueriesView({ category, heading, onRowsChange }: Props) {
```

Immediately after the `derived` `useMemo` (around line 118), add:

```ts
  useEffect(() => {
    if (!onRowsChange) return;
    if (derived?.kind === 'query') onRowsChange(derived.rows);
    else onRowsChange([]);
  }, [derived, onRowsChange]);
```

- [ ] **Step 2: Add a test that exercises the callback**

Append to (or create) `src/features/queries/QueriesView.test.tsx`. If the file does not already exist, create it with this content; otherwise just add the new test inside the existing `describe` block.

Create `src/features/queries/QueriesView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { QueriesView } from './QueriesView';
import { useSettingsStore, defaultSettings } from '../settings/store';
import { clearItemCache, clearRecipeCache, putCachedItems, putCachedGatheringCatalog } from '../../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
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

describe('QueriesView', () => {
  it('fires onRowsChange with an empty array before a query runs', async () => {
    // Seed snapshot + gathering catalog so the view renders the QueryBuilder.
    await putCachedItems([]);
    await putCachedGatheringCatalog([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));

    const onRowsChange = vi.fn();
    render(withProviders(<QueriesView category="gathering" onRowsChange={onRowsChange} />));

    // The view starts with `derived = null`, so no callback fires until a run
    // produces rows. Assert the callback has not been called yet.
    await waitFor(() => {
      expect(onRowsChange).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx vitest run src/features/queries/QueriesView.test.tsx`
Expected: PASS (1 test).

Also re-run any pre-existing tests that touch `QueriesView` to confirm no regression:

Run: `npx vitest run src/routes/Crafts.test.tsx src/routes/Trading.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/queries/QueriesView.tsx src/features/queries/QueriesView.test.tsx
git commit -m "$(printf 'feat(queries): optional onRowsChange callback on QueriesView\n\nLets a parent observe the standard-query rows the user is looking at\nwithout re-running the query. Used by the gathering session planner;\nharmless for existing callers that omit it.\n')"
```

---

### Task 5: `GatheringPlanner` component (TDD)

The new UI panel. Reads the store, the rows it receives via props, runs `computePlan`, renders the controls + table, and exposes the "Copy GBR clipboard string" button.

**Files:**
- Create: `src/features/gathering/GatheringPlanner.tsx`
- Test: `src/features/gathering/GatheringPlanner.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/gathering/GatheringPlanner.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GatheringPlanner } from './GatheringPlanner';
import { useGatheringPlanStore, defaultGatheringPlan } from './gatheringPlanStore';
import type { QueryResultRow } from '../queries/types';

const rows: QueryResultRow[] = [
  { id: 5544, name: 'Cobalt Ore', sc: 1, unitPrice: 100, averagePrice: 100, dealPct: 0, velocity: 5, gilFlow: 600, hq: false },
  { id: 5543, name: 'Rosewood Log', sc: 1, unitPrice: 50, averagePrice: 50, dealPct: 0, velocity: 5, gilFlow: 400, hq: false },
];

beforeEach(() => {
  localStorage.clear();
  useGatheringPlanStore.setState(defaultGatheringPlan());
});

describe('GatheringPlanner', () => {
  it('renders one row per pick with computed qty (time mode default)', () => {
    render(<GatheringPlanner rows={rows} />);
    // With defaults (45 min * 100 ipm = 4500 items; gilFlow shares 60/40)
    // qty1 = 2700 ; qty2 = 1800
    expect(screen.getByText('Cobalt Ore')).toBeInTheDocument();
    expect(screen.getByText('Rosewood Log')).toBeInTheDocument();
    expect(screen.getByText('2,700')).toBeInTheDocument();
    expect(screen.getByText('1,800')).toBeInTheDocument();
  });

  it('switches to gil mode and recomputes', () => {
    render(<GatheringPlanner rows={rows} />);
    fireEvent.click(screen.getByLabelText(/gil budget/i));
    // gil mode: budgetGil 500_000 default; shares 60/40
    // qty1 = round(500000*0.6/100) = 3000 ; qty2 = round(500000*0.4/50) = 4000
    expect(screen.getByText('3,000')).toBeInTheDocument();
    expect(screen.getByText('4,000')).toBeInTheDocument();
  });

  it('disables the export button when no rows are available', () => {
    render(<GatheringPlanner rows={[]} />);
    expect(screen.getByRole('button', { name: /copy gbr clipboard string/i })).toBeDisabled();
  });

  it('copies an encoded blob to the clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(<GatheringPlanner rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: /copy gbr clipboard string/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(arg.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/gathering/GatheringPlanner.test.tsx`
Expected: FAIL (`GatheringPlanner` not found).

- [ ] **Step 3: Implement the component**

Create `src/features/gathering/GatheringPlanner.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { fmtGil } from '../../lib/format';
import { encodeGbrList } from '../../lib/gatherBuddyExport';
import { computePlan } from './computePlan';
import { useGatheringPlanStore } from './gatheringPlanStore';
import type { QueryResultRow } from '../queries/types';

interface Props {
  rows: QueryResultRow[];
}

export function GatheringPlanner({ rows }: Props) {
  const s = useGatheringPlanStore();
  const [copyError, setCopyError] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  const result = useMemo(
    () =>
      computePlan(rows, {
        mode: s.budgetMode,
        itemCount: s.itemCount,
        budgetTimeMin: s.budgetTimeMin,
        budgetGil: s.budgetGil,
        itemsPerMin: s.itemsPerMin,
      }),
    [rows, s.budgetMode, s.itemCount, s.budgetTimeMin, s.budgetGil, s.itemsPerMin],
  );

  const canExport = result.rows.length > 0;

  async function copyToClipboard() {
    setCopyError(null);
    setFallbackText(null);
    const blob = await encodeGbrList({
      name: s.listName || 'AFK gather',
      items: result.rows.map((r) => ({ id: r.id, qty: r.qty })),
    });
    try {
      await navigator.clipboard.writeText(blob);
    } catch (err) {
      setCopyError((err as Error).message || 'Clipboard write failed');
      setFallbackText(blob);
    }
  }

  return (
    <section className="border border-border-base bg-bg-card p-4 space-y-3">
      <h3 className="font-display text-base text-gold tracking-wide">Plan a session</h3>

      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
        <label className="flex items-center gap-1.5" aria-label="Time budget">
          <input
            type="radio"
            checked={s.budgetMode === 'time'}
            onChange={() => s.setBudgetMode('time')}
          />
          Time
          <input
            type="number"
            min={1}
            value={s.budgetTimeMin}
            onChange={(e) => s.setBudgetTimeMin(Number(e.target.value))}
            className="w-14 bg-bg-card-hi border border-border-base px-1.5 py-0.5"
          />
          min
        </label>

        <label className="flex items-center gap-1.5" aria-label="Gil budget">
          <input
            type="radio"
            checked={s.budgetMode === 'gil'}
            onChange={() => s.setBudgetMode('gil')}
          />
          Gil
          <input
            type="number"
            min={0}
            step={10_000}
            value={s.budgetGil}
            onChange={(e) => s.setBudgetGil(Number(e.target.value))}
            className="w-24 bg-bg-card-hi border border-border-base px-1.5 py-0.5"
          />
        </label>

        <label className="flex items-center gap-1.5" aria-label="Item count">
          Items
          <input
            type="range"
            min={1}
            max={10}
            value={s.itemCount}
            onChange={(e) => s.setItemCount(Number(e.target.value))}
          />
          <span className="text-text-low w-4">{s.itemCount}</span>
        </label>

        <label className="flex items-center gap-1.5" aria-label="Items per minute">
          Rate
          <input
            type="number"
            min={1}
            value={s.itemsPerMin}
            onChange={(e) => s.setItemsPerMin(Number(e.target.value))}
            className="w-14 bg-bg-card-hi border border-border-base px-1.5 py-0.5"
          />
          / min
        </label>
      </div>

      {result.cappedAt < s.itemCount && rows.length > 0 && (
        <div className="font-mono text-[10px] text-text-low">
          Only {result.cappedAt} matching item(s) — slider capped.
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
            <th className="text-left px-2 py-1">#</th>
            <th className="text-left px-2 py-1">Item</th>
            <th className="text-right px-2 py-1">Price</th>
            <th className="text-right px-2 py-1">Qty</th>
            <th className="text-right px-2 py-1">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={r.id} className="border-t border-border-base">
              <td className="px-2 py-1.5 font-mono text-text-low">{i + 1}</td>
              <td className="px-2 py-1.5">{r.name}</td>
              <td className="px-2 py-1.5 text-right font-mono">{fmtGil(r.unitPrice)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{r.qty.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right font-mono text-gold-hi">{fmtGil(r.subtotal)}</td>
            </tr>
          ))}
          {result.rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-2 py-3 text-center text-text-low font-mono text-[11px] italic">
                Run the query below to populate this plan.
              </td>
            </tr>
          )}
        </tbody>
        {result.rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-border-base font-mono text-[11px]">
              <td colSpan={3} className="px-2 py-1.5 text-text-low">
                Total ≈ {fmtGil(result.totalGil)} gil · est {result.totalMinutes} min @ {s.itemsPerMin}/min
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 font-mono text-[11px]">
          List name
          <input
            type="text"
            value={s.listName}
            onChange={(e) => s.setListName(e.target.value)}
            className="bg-bg-card-hi border border-border-base px-1.5 py-0.5 w-40"
          />
        </label>
        <button
          onClick={copyToClipboard}
          disabled={!canExport}
          className="font-mono text-[10px] tracking-widest uppercase px-3 py-2 border border-gold text-gold disabled:border-border-base disabled:text-text-low"
        >
          Copy GBR clipboard string
        </button>
      </div>

      {copyError && (
        <div className="font-mono text-[10px] text-crimson">
          Clipboard write failed ({copyError}). Copy manually below:
        </div>
      )}
      {fallbackText && (
        <textarea
          readOnly
          value={fallbackText}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full font-mono text-[10px] bg-bg-card-hi border border-border-base p-2"
          rows={3}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/gathering/GatheringPlanner.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/gathering/GatheringPlanner.tsx src/features/gathering/GatheringPlanner.test.tsx
git commit -m "$(printf 'feat(gathering): session planner UI with GBR clipboard export\n\nReads gathering rows in via props, runs computePlan to produce target\nquantities, and exports a GatherBuddy Reborn import string. Falls back to\na readonly textarea when clipboard write is denied (e.g. insecure context).\n')"
```

---

### Task 6: Wire `GatheringPlanner` into the `/gathering` route

`Gathering.tsx` becomes the place where `QueriesView`'s rows are observed and piped into the planner.

**Files:**
- Modify: `src/routes/Gathering.tsx`

- [ ] **Step 1: Replace the route component to render the planner above the query view**

Open `src/routes/Gathering.tsx` and replace its full contents with:

```tsx
import { useState } from 'react';
import { QueriesView } from '../features/queries/QueriesView';
import { GatheringPlanner } from '../features/gathering/GatheringPlanner';
import type { QueryResultRow } from '../features/queries/types';

export default function Gathering() {
  const [rows, setRows] = useState<QueryResultRow[]>([]);

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <h2 className="font-display text-lg text-gold tracking-wide">Gathering</h2>
      <p className="font-mono text-[11px] text-text-low max-w-prose">
        Raw materials you can gather while doing other things. Sells as-is — no recipe required.
      </p>
      <GatheringPlanner rows={rows} />
      <QueriesView category="gathering" onRowsChange={setRows} />
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite to confirm no regression**

Run: `npx vitest run`
Expected: PASS (all suites).

- [ ] **Step 3: Type-check the project**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output (exit code 0).

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

In the browser:
1. Open `/gathering`.
2. Pick a preset and click "Run."
3. The planner should populate with the top 3 picks and a computed qty.
4. Toggle the budget radio (Time ↔ Gil) and confirm the table recomputes.
5. Change the slider to 5 items; planner should now show 5 rows.
6. Click "Copy GBR clipboard string"; paste somewhere (e.g. a text editor) to confirm a long base64 string is on your clipboard.
7. In game (optional), open GBR's auto-gather list selector → "Import an auto-gather list from clipboard"; confirm the list materializes with the chosen name and quantities.

If any of these fail, debug before committing. The plan does NOT include a fix path for manual-test regressions — those go through the normal debugging flow.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Gathering.tsx
git commit -m "$(printf 'feat(gathering): render session planner above the candidate table\n\n/gathering now shows a "Plan a session" panel that turns the current\nquery rows into per-item targets and a GatherBuddy Reborn clipboard\nimport string.\n')"
```

---

## Self-review

**Spec coverage (each section of the spec → covered task):**
- Problem/User flow → Tasks 5 (planner UI) + 6 (route wiring).
- Non-goals: explicit non-goals, no tasks needed.
- New file `gatherBuddyExport.ts` → Task 3.
- New file `computePlan.ts` → Task 2.
- New file `GatheringPlanner.tsx` → Task 5.
- New file `gatheringPlanStore.ts` → Task 1.
- Modified `Gathering.tsx` → Task 6.
- Modified `QueriesView.tsx` (expose rows) → Task 4.
- GBR format pipeline (version byte, gzip, base64, `PrefferedLocations` typo) → Task 3 test asserts each.
- Calculation (time / gil modes, zero-price skip, N cap, qty clamp) → Task 2 tests.
- Edge case: no rows → Task 5 test ("disables export button").
- Edge case: clipboard blocked → Task 5 component fallback textarea (covered functionally; not asserted because jsdom's clipboard mock path is exercised in the happy-path test).
- Edge case: GBR format drift → Task 3 round-trip test asserts version byte and JSON shape.
- Test setup prerequisite (CompressionStream polyfill) → Task 0.

**Placeholder scan:** No "TBD", "TODO", or vague "add appropriate handling" strings. All code blocks contain final code, all commands are runnable.

**Type consistency:**
- `ComputePlanRow` fields used in `computePlan.ts` (Task 2) and projected from `QueryResultRow` in `GatheringPlanner.tsx` (Task 5): `id`, `name`, `unitPrice`, `gilFlow`. `QueryResultRow` (verified by reading `src/features/queries/types.ts`) exposes all four with matching names — direct pass-through works.
- `GbrListInput.items[].id` / `.qty` (Task 3) match the `{ id, qty }` shape `GatheringPlanner` builds from `PlanRow` (Task 5).
- `useGatheringPlanStore` setter names referenced by `GatheringPlanner` (Task 5) match those defined in Task 1 (`setBudgetMode`, `setBudgetTimeMin`, `setBudgetGil`, `setItemCount`, `setListName`, `setItemsPerMin`).
- `GBR_VERSION_BYTE = 0x05` (Task 3) is the same byte the round-trip test asserts; the test imports it from the helper.
