# FFXIV Helper Phase 4 Implementation Plan — Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the app for daily use. Real ingredient names in the recipe modal. 30-day price/velocity sparklines per item. Export/import settings + watchlist as JSON. Mobile UX pass on the SessionPlanner with sticky summary and larger touch targets.

**Architecture:** Three new pure-data modules (item-name cache, history client, sparkline math). One UI-only addition (sparkline SVG component). One JSON export/import flow. No new runtime deps — sparkline is hand-rolled SVG; export uses native `Blob` + `URL.createObjectURL`.

**Tech Stack:** Same as Phase 1-3. No new deps.

**Spec:** Phase 4 appendix in `docs/superpowers/specs/2026-05-10-ffxiv-helper-rebuild-design.md` plus the Phase 3 follow-up about ingredient names.

**Decisions baked in:**
- Hand-rolled SVG sparkline (no chart lib).
- Item-name lookup uses XIVAPI batched `rows` query, cached forever in IndexedDB just like recipes.
- Export/import is a single JSON file containing settings + watchlist. Recipe cache and per-session UI state are NOT exported (rebuild on demand).
- Virtualized table is dropped from Phase 4 scope — user's watchlist is ~80 items, virtualization is premature.

---

## Conventions

- TDD for pure functions. Smoke tests for new components.
- `npm test -- --run` and `npm run build` stay green.
- Run from `c:/Users/esthe/Documents/Dev/ffxiv-helper`.

---

## Task 1: Item-name client + cache

**Files:**
- Create: `src/lib/itemNames.ts`
- Create: `src/lib/itemNames.test.ts`
- Modify: `src/lib/recipeCache.ts` (add a second store for names)

XIVAPI v2 supports fetching multiple rows in a single request via `?rows=id1,id2,...`. We'll use this for batch name lookup. Cache forever in the same IndexedDB DB used for recipes (different store).

- [ ] **Step 1: Add a second IndexedDB store for names**

Edit `src/lib/recipeCache.ts`. Bump `DB_VERSION` to 2 and add the `names` store in the upgrade callback:
```ts
const DB_NAME = 'ffxiv-helper';
const DB_VERSION = 2;
const RECIPE_STORE = 'recipes';
const NAME_STORE = 'names';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(RECIPE_STORE)) {
          database.createObjectStore(RECIPE_STORE);
        }
        if (!database.objectStoreNames.contains(NAME_STORE)) {
          database.createObjectStore(NAME_STORE);
        }
      },
    });
  }
  return dbPromise;
}
```

Rename the existing `STORE` constant references to `RECIPE_STORE`. Then export name-cache helpers:
```ts
export async function getCachedName(itemId: number): Promise<string | undefined> {
  return (await db()).get(NAME_STORE, itemId);
}

export async function putCachedName(itemId: number, name: string): Promise<void> {
  await (await db()).put(NAME_STORE, name, itemId);
}

export async function clearNameCache(): Promise<void> {
  await (await db()).clear(NAME_STORE);
}
```

The existing `clearRecipeCache` stays as is. Settings' "Clear recipe cache" button keeps its current scope; we add a separate name-cache button (or call both — see Task 9).

Existing recipeCache tests still pass — same DB, same recipe store, no schema change for recipes.

- [ ] **Step 2: Test for itemNames `src/lib/itemNames.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildNamesUrl, parseNamesResponse, fetchItemNames } from './itemNames';

describe('buildNamesUrl', () => {
  it('builds a rows-by-id URL', () => {
    expect(buildNamesUrl([1, 2, 3])).toBe(
      'https://v2.xivapi.com/api/sheet/Item?rows=1,2,3&fields=Name&limit=200'
    );
  });
});

describe('parseNamesResponse', () => {
  it('returns a map of id → Name', () => {
    const raw = {
      rows: [
        { row_id: 1, fields: { Name: 'Bronze Ingot' } },
        { row_id: 2, fields: { Name: 'Wind Shard' } },
      ],
    };
    expect(parseNamesResponse(raw)).toEqual(new Map([[1, 'Bronze Ingot'], [2, 'Wind Shard']]));
  });

  it('drops rows missing a Name', () => {
    const raw = { rows: [{ row_id: 1 }, { row_id: 2, fields: {} }] };
    expect(parseNamesResponse(raw)).toEqual(new Map());
  });
});

describe('fetchItemNames', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns empty map for empty input', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchItemNames([])).toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on non-OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchItemNames([1])).rejects.toThrow('XIVAPI 500');
  });
});
```

- [ ] **Step 3: Implement `src/lib/itemNames.ts`**

```ts
const BASE = (import.meta.env?.VITE_XIVAPI_BASE as string | undefined) ?? 'https://v2.xivapi.com';

export function buildNamesUrl(ids: number[]): string {
  return `${BASE.replace(/\/$/, '')}/api/sheet/Item?rows=${ids.join(',')}&fields=Name&limit=200`;
}

interface RawRow { row_id?: number; fields?: { Name?: string } }

export function parseNamesResponse(raw: { rows?: RawRow[] }): Map<number, string> {
  const out = new Map<number, string>();
  for (const r of raw.rows ?? []) {
    if (typeof r.row_id === 'number' && typeof r.fields?.Name === 'string') {
      out.set(r.row_id, r.fields.Name);
    }
  }
  return out;
}

export async function fetchItemNames(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const res = await fetch(buildNamesUrl(ids));
  if (!res.ok) throw new Error(`XIVAPI ${res.status}`);
  return parseNamesResponse(await res.json());
}
```

- [ ] **Step 4: Run + pass + commit**

```
git add -A
git commit -m "feat(names): XIVAPI item-name client + IndexedDB store"
```

---

## Task 2: useItemNames hook

**Files:**
- Create: `src/features/profit/useItemNames.ts`
- Create: `src/features/profit/useItemNames.test.tsx`

Cache-aware batch hook. Given a list of ids, return a `Map<number, string>`. Hits IndexedDB first; for any cache misses, batch-fetch from XIVAPI and write back.

- [ ] **Step 1: Test `src/features/profit/useItemNames.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useItemNames } from './useItemNames';
import { clearNameCache } from '../../lib/recipeCache';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await clearNameCache();
});

describe('useItemNames', () => {
  it('returns names from a single batched fetch on cache miss', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      calls++;
      return Promise.resolve({
        ok: true,
        json: async () => ({ rows: [
          { row_id: 1, fields: { Name: 'Item 1' } },
          { row_id: 2, fields: { Name: 'Item 2' } },
        ] }),
      });
    }));

    const { result } = renderHook(() => useItemNames([1, 2]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(1)).toBe('Item 1');
    expect(result.current.data!.get(2)).toBe('Item 2');
    expect(calls).toBe(1);
  });

  it('skips network when all ids are cached', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { putCachedName } = await import('../../lib/recipeCache');
    await putCachedName(1, 'Cached');

    const { result } = renderHook(() => useItemNames([1]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(1)).toBe('Cached');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only fetches missing ids when partially cached', async () => {
    const { putCachedName } = await import('../../lib/recipeCache');
    await putCachedName(1, 'Cached One');

    let calledWith = '';
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      calledWith = url;
      return Promise.resolve({
        ok: true,
        json: async () => ({ rows: [{ row_id: 2, fields: { Name: 'Fetched Two' } }] }),
      });
    }));

    const { result } = renderHook(() => useItemNames([1, 2]), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.get(1)).toBe('Cached One');
    expect(result.current.data!.get(2)).toBe('Fetched Two');
    expect(calledWith).toContain('rows=2');
    expect(calledWith).not.toContain('rows=1,2');
  });
});
```

- [ ] **Step 2: Implement `src/features/profit/useItemNames.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchItemNames } from '../../lib/itemNames';
import { getCachedName, putCachedName } from '../../lib/recipeCache';

async function resolveNames(ids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const missing: number[] = [];
  for (const id of ids) {
    const cached = await getCachedName(id);
    if (cached !== undefined) {
      result.set(id, cached);
    } else {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    const fresh = await fetchItemNames(missing);
    for (const [id, name] of fresh) {
      result.set(id, name);
      await putCachedName(id, name);
    }
  }
  return result;
}

export function useItemNames(itemIds: number[]) {
  const sorted = [...new Set(itemIds)].sort((a, b) => a - b);
  return useQuery<Map<number, string>>({
    queryKey: ['item-names', sorted],
    enabled: sorted.length > 0,
    staleTime: Infinity,
    queryFn: () => resolveNames(sorted),
  });
}
```

- [ ] **Step 3: Run + pass + commit**

```
git add -A
git commit -m "feat(profit): cache-aware useItemNames hook"
```

---

## Task 3: RecipeModal — show real ingredient names

**Files:**
- Modify: `src/features/profit/RecipeModal.tsx`
- Modify: caller in `src/routes/Watchlist.tsx`

Pass a `nameMap: Map<number, string>` prop to the modal. Replace the `#${id}` placeholder with the real name (fall back to `#${id}` if the name hasn't loaded yet).

- [ ] **Step 1: Update `RecipeModal.tsx`**

Add `nameMap: Map<number, string>` to `Props`. Update `ingredientName`:
```tsx
const ingredientName = (id: number) => {
  const name = nameMap.get(id);
  if (!name) return `#${id}`;
  return recipeMap.get(id) ? `${name} (craftable)` : name;
};
```

(The existing "(craftable) #id" prefix moves to a parenthetical suffix once we have real names.)

- [ ] **Step 2: Update `Watchlist.tsx`**

Read the file. Then:
- Import `useItemNames` from `'../features/profit/useItemNames'`.
- Compute the union of (item ids on watchlist) ∪ (every ingredient id from every recipe in `recipes.data`):
  ```tsx
  const ingredientIds = useMemo(() => {
    if (!recipes.data) return [];
    const ids = new Set<number>();
    for (const recipe of recipes.data.values()) {
      if (!recipe) continue;
      for (const ing of recipe.ingredients) ids.add(ing.itemId);
    }
    return [...ids];
  }, [recipes.data]);
  const allIdsForNames = useMemo(() => [...new Set([...ids, ...ingredientIds])], [ids, ingredientIds]);
  const names = useItemNames(allIdsForNames);
  ```
- Pass `nameMap={names.data ?? new Map()}` to the `<RecipeModal>`.

- [ ] **Step 3: Build clean. Tests green. Manual: open recipe modal, see real ingredient names.**

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(profit): RecipeModal shows real ingredient names via XIVAPI cache"
```

---

## Task 4: Universalis history client (pure)

**Files:**
- Create: `src/lib/universalisHistory.ts`
- Create: `src/lib/universalisHistory.test.ts`

Universalis exposes per-item history at `https://universalis.app/api/v2/history/{world|dc}/{ids}?entriesToReturn=50`. Returns `entries` with `pricePerUnit`, `quantity`, `timestamp`. We aggregate into daily buckets for the sparkline.

- [ ] **Step 1: Test `src/lib/universalisHistory.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildHistoryUrl, parseHistoryResponse, dailyBuckets } from './universalisHistory';

describe('buildHistoryUrl', () => {
  it('builds a Chaos history URL with entriesToReturn', () => {
    expect(buildHistoryUrl('Chaos', [1, 2])).toBe(
      'https://universalis.app/api/v2/history/Chaos/1,2?entriesToReturn=50'
    );
  });
});

describe('parseHistoryResponse', () => {
  it('extracts entries per item id', () => {
    const raw = {
      items: {
        '1': {
          entries: [
            { pricePerUnit: 100, quantity: 1, timestamp: 1, hq: false },
            { pricePerUnit: 110, quantity: 2, timestamp: 2, hq: true },
          ],
        },
      },
    };
    const out = parseHistoryResponse(raw);
    expect(out.get(1)).toHaveLength(2);
    expect(out.get(1)![0]).toEqual({ pricePerUnit: 100, quantity: 1, timestamp: 1, hq: false });
  });
});

describe('dailyBuckets', () => {
  it('groups entries into UTC daily buckets with mean price + total quantity', () => {
    const dayMs = 86_400_000;
    const day1 = 1_700_000_000_000;
    const day2 = day1 + dayMs;
    const entries = [
      { pricePerUnit: 100, quantity: 2, timestamp: Math.floor(day1 / 1000),     hq: false },
      { pricePerUnit: 200, quantity: 3, timestamp: Math.floor((day1 + 100) / 1000), hq: false },
      { pricePerUnit: 300, quantity: 1, timestamp: Math.floor(day2 / 1000),     hq: false },
    ];
    const out = dailyBuckets(entries, 30);
    // Day 1: weighted mean = (100*2 + 200*3) / (2+3) = (200+600)/5 = 160; qty = 5
    // Day 2: 300 / 1 = 300; qty = 1
    expect(out).toEqual([
      { dayStartMs: Math.floor(day1 / dayMs) * dayMs, meanPrice: 160, quantity: 5 },
      { dayStartMs: Math.floor(day2 / dayMs) * dayMs, meanPrice: 300, quantity: 1 },
    ]);
  });

  it('drops days outside the lookback window', () => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const oldEntry = { pricePerUnit: 50, quantity: 1, timestamp: Math.floor((now - 40 * dayMs) / 1000), hq: false };
    const recentEntry = { pricePerUnit: 60, quantity: 1, timestamp: Math.floor((now - 1 * dayMs) / 1000), hq: false };
    const out = dailyBuckets([oldEntry, recentEntry], 30);
    expect(out).toHaveLength(1);
    expect(out[0].meanPrice).toBe(60);
  });
});
```

- [ ] **Step 2: Implement `src/lib/universalisHistory.ts`**

```ts
export interface HistoryEntry {
  pricePerUnit: number;
  quantity: number;
  timestamp: number; // SECONDS, per Universalis convention
  hq: boolean;
}

export interface DailyBucket {
  dayStartMs: number;
  meanPrice: number;
  quantity: number;
}

export function buildHistoryUrl(scope: string, ids: number[]): string {
  return `https://universalis.app/api/v2/history/${scope}/${ids.join(',')}?entriesToReturn=50`;
}

interface RawHistoryItem { entries?: HistoryEntry[] }

export function parseHistoryResponse(raw: { items?: Record<string, RawHistoryItem> }): Map<number, HistoryEntry[]> {
  const out = new Map<number, HistoryEntry[]>();
  for (const [id, item] of Object.entries(raw.items ?? {})) {
    out.set(Number(id), item.entries ?? []);
  }
  return out;
}

export async function fetchHistoryFor(scope: string, ids: number[]): Promise<Map<number, HistoryEntry[]>> {
  if (ids.length === 0) return new Map();
  const res = await fetch(buildHistoryUrl(scope, ids));
  if (!res.ok) throw new Error(`Universalis history ${res.status}`);
  return parseHistoryResponse(await res.json());
}

const DAY_MS = 86_400_000;

export function dailyBuckets(entries: HistoryEntry[], lookbackDays: number): DailyBucket[] {
  const cutoffMs = Date.now() - lookbackDays * DAY_MS;
  const grouped = new Map<number, { qty: number; weightedSum: number }>();
  for (const e of entries) {
    const tsMs = e.timestamp * 1000;
    if (tsMs < cutoffMs) continue;
    const dayStart = Math.floor(tsMs / DAY_MS) * DAY_MS;
    const cur = grouped.get(dayStart) ?? { qty: 0, weightedSum: 0 };
    cur.qty += e.quantity;
    cur.weightedSum += e.pricePerUnit * e.quantity;
    grouped.set(dayStart, cur);
  }
  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayStartMs, { qty, weightedSum }]) => ({
      dayStartMs,
      meanPrice: Math.round(weightedSum / qty),
      quantity: qty,
    }));
}
```

- [ ] **Step 3: Run + pass + commit**

```
git add -A
git commit -m "feat(history): Universalis history client + daily-bucket aggregator"
```

---

## Task 5: useItemHistory hook

**Files:**
- Create: `src/features/profit/useItemHistory.ts`

A single-item history hook. Used by the modal lazily — only fetches when an item is selected.

- [ ] **Step 1: Implement (no dedicated test; covered by smoke test in Task 7)**

Write `src/features/profit/useItemHistory.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { fetchHistoryFor, dailyBuckets, type DailyBucket } from '../../lib/universalisHistory';

export function useItemHistory(itemId: number | null, scope: string, lookbackDays = 30) {
  return useQuery<DailyBucket[]>({
    queryKey: ['history', scope, itemId, lookbackDays],
    enabled: itemId != null,
    staleTime: 30 * 60 * 1000, // 30 min
    queryFn: async () => {
      const map = await fetchHistoryFor(scope, [itemId!]);
      const entries = map.get(itemId!) ?? [];
      return dailyBuckets(entries, lookbackDays);
    },
  });
}
```

- [ ] **Step 2: Build clean. Commit:**

```
git add -A
git commit -m "feat(history): useItemHistory hook (lazy per-item)"
```

---

## Task 6: Sparkline SVG component (pure)

**Files:**
- Create: `src/components/Sparkline.tsx`
- Create: `src/components/Sparkline.test.tsx`

Tiny SVG sparkline. Takes `points: number[]` and renders a polyline scaled to fit. No deps.

- [ ] **Step 1: Test `src/components/Sparkline.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders an SVG with one path for non-empty data', () => {
    const { container } = render(<Sparkline points={[1, 2, 3, 4]} width={100} height={20} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(container.querySelectorAll('polyline')).toHaveLength(1);
  });

  it('renders a placeholder when points is empty', () => {
    const { container } = render(<Sparkline points={[]} width={100} height={20} />);
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
    expect(container.textContent).toContain('—');
  });

  it('renders a flat line when all points are equal', () => {
    const { container } = render(<Sparkline points={[5, 5, 5]} width={100} height={20} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    // All Y values should be the midline (height/2) when range is zero.
    const pts = polyline!.getAttribute('points')!;
    const ys = pts.split(' ').map((p) => Number(p.split(',')[1]));
    expect(ys.every((y) => y === 10)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `src/components/Sparkline.tsx`**

```tsx
interface Props {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ points, width = 120, height = 24, className = '' }: Props) {
  if (points.length === 0) {
    return <span className={`font-mono text-xs text-text-low ${className}`}>—</span>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;
  const stepX = points.length === 1 ? 0 : width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = range === 0 ? height / 2 : height - ((p - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        points={coords}
      />
    </svg>
  );
}
```

- [ ] **Step 3: Run + pass + commit**

```
git add -A
git commit -m "feat(ui): tiny SVG Sparkline component"
```

---

## Task 7: RecipeModal — history sparkline section

**Files:**
- Modify: `src/features/profit/RecipeModal.tsx`
- Modify: `src/routes/Watchlist.tsx` (pass `world`/`dc` to modal so the hook can scope)

The modal gets a new section below the ingredient table: 30-day price + velocity sparkline for the selected item, fetched lazily via `useItemHistory`.

- [ ] **Step 1: Update `RecipeModal.tsx`**

Read the file. Add `dc: string` to `Props`. Inside the component:
```tsx
import { useItemHistory } from './useItemHistory';
import { Sparkline } from '../../components/Sparkline';
import { fmtGil } from '../../lib/format';

// inside component:
const history = useItemHistory(item.id, dc, 30);
```

After the existing ingredient table + checkboxes, add a section:
```tsx
<section className="border-t border-border-base pt-4 mt-4">
  <h4 className="font-mono text-[10px] tracking-widest text-text-low uppercase mb-2">30-day history (DC)</h4>
  {history.isLoading && <span className="font-mono text-xs text-text-low">Loading…</span>}
  {history.isError && <span className="font-mono text-xs text-crimson">Failed to load history</span>}
  {history.data && history.data.length === 0 && (
    <span className="font-mono text-xs text-text-low">No recent sales.</span>
  )}
  {history.data && history.data.length > 0 && (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="font-mono text-[10px] text-text-low mb-1">Mean price</div>
        <Sparkline points={history.data.map((b) => b.meanPrice)} width={200} height={32} className="text-aether" />
        <div className="font-mono text-[10px] text-text-low mt-1">
          {fmtGil(history.data[0].meanPrice)} → {fmtGil(history.data[history.data.length - 1].meanPrice)}
        </div>
      </div>
      <div>
        <div className="font-mono text-[10px] text-text-low mb-1">Daily quantity sold</div>
        <Sparkline points={history.data.map((b) => b.quantity)} width={200} height={32} className="text-gold" />
        <div className="font-mono text-[10px] text-text-low mt-1">
          {history.data.length} active days, total {history.data.reduce((a, b) => a + b.quantity, 0)} sold
        </div>
      </div>
    </div>
  )}
</section>
```

- [ ] **Step 2: Pass `dc` from Watchlist route**

In `src/routes/Watchlist.tsx`, the existing `<RecipeModal>` invocation gets a new prop:
```tsx
<RecipeModal
  // ... existing
  dc={dc}
  // ... existing
/>
```

(`dc` is already destructured from `useSettingsStore` in this component.)

- [ ] **Step 3: Build clean. Tests green. Manual: open a recipe modal, confirm sparkline + numbers render after a brief load.**

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(profit): 30-day price + quantity sparklines in RecipeModal"
```

---

## Task 8: Export / import settings + watchlist (JSON)

**Files:**
- Create: `src/features/settings/exportImport.ts`
- Create: `src/features/settings/exportImport.test.ts`
- Create: `src/features/settings/ExportImportPanel.tsx`
- Modify: `src/routes/Settings.tsx`

A single JSON file `{ settings, watchlist, version: 1 }`. Download via Blob; upload via `<input type="file">`. Imports validate shape minimally (object with the right top-level keys) and replace state via Zustand `setState`.

- [ ] **Step 1: Pure helpers + tests**

Write `src/features/settings/exportImport.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildExportPayload, parseImportPayload } from './exportImport';
import type { SettingsState } from './store';
import type { WatchlistState } from '../items/watchlistStore';

const settings = { _v: 1, world: 'Phantom', dc: 'Chaos' } as unknown as SettingsState;
const watchlist = { _v: 1, starterPacks: { 'raid-current': true }, customItems: [], perItemFlags: {} } as unknown as WatchlistState;

describe('buildExportPayload', () => {
  it('produces a versioned object with settings + watchlist', () => {
    const out = buildExportPayload(settings, watchlist);
    expect(out.exportVersion).toBe(1);
    expect(out.settings.world).toBe('Phantom');
    expect(out.watchlist.starterPacks['raid-current']).toBe(true);
  });
});

describe('parseImportPayload', () => {
  it('returns parsed object on valid JSON', () => {
    const raw = JSON.stringify({ exportVersion: 1, settings, watchlist });
    const out = parseImportPayload(raw);
    expect(out.settings.world).toBe('Phantom');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseImportPayload('not json')).toThrow();
  });

  it('throws on missing top-level keys', () => {
    expect(() => parseImportPayload(JSON.stringify({ exportVersion: 1 }))).toThrow(/settings/);
    expect(() => parseImportPayload(JSON.stringify({ exportVersion: 1, settings }))).toThrow(/watchlist/);
  });

  it('throws on unsupported exportVersion', () => {
    expect(() => parseImportPayload(JSON.stringify({ exportVersion: 99, settings, watchlist }))).toThrow(/version/);
  });
});
```

Implement `src/features/settings/exportImport.ts`:
```ts
import type { SettingsState } from './store';
import type { WatchlistState } from '../items/watchlistStore';

export interface ExportPayload {
  exportVersion: 1;
  settings: SettingsState;
  watchlist: WatchlistState;
}

const SUPPORTED_VERSIONS = [1];

export function buildExportPayload(settings: SettingsState, watchlist: WatchlistState): ExportPayload {
  return { exportVersion: 1, settings, watchlist };
}

export function parseImportPayload(raw: string): ExportPayload {
  const obj = JSON.parse(raw);
  if (typeof obj !== 'object' || obj === null) throw new Error('Invalid payload: not an object');
  if (!SUPPORTED_VERSIONS.includes(obj.exportVersion)) {
    throw new Error(`Unsupported exportVersion: ${obj.exportVersion}`);
  }
  if (!obj.settings || typeof obj.settings !== 'object') throw new Error('Invalid payload: missing settings');
  if (!obj.watchlist || typeof obj.watchlist !== 'object') throw new Error('Invalid payload: missing watchlist');
  return obj as ExportPayload;
}
```

Run + pass.

- [ ] **Step 2: ExportImportPanel component**

Write `src/features/settings/ExportImportPanel.tsx`:
```tsx
import { useRef, useState } from 'react';
import { useSettingsStore } from './store';
import { useWatchlistStore } from '../items/watchlistStore';
import { buildExportPayload, parseImportPayload } from './exportImport';

export function ExportImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  function onExport() {
    const settings = useSettingsStore.getState();
    const watchlist = useWatchlistStore.getState();
    const payload = buildExportPayload(settings, watchlist);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    a.href = url;
    a.download = `ffxiv-helper-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: 'ok', msg: 'Exported.' });
  }

  async function onImport(file: File) {
    try {
      const text = await file.text();
      const payload = parseImportPayload(text);
      // Strip non-state fields (Zustand actions). The persist wrapper will rehydrate methods.
      useSettingsStore.setState(payload.settings);
      useWatchlistStore.setState(payload.watchlist);
      setStatus({ kind: 'ok', msg: 'Imported. Reload may help if anything looks stale.' });
    } catch (e) {
      setStatus({ kind: 'error', msg: (e as Error).message });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onExport}
          className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-4 py-2 hover:bg-aether hover:text-bg-deep"
        >
          Export JSON
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep"
        >
          Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
        />
      </div>
      {status && (
        <div className={`font-mono text-xs ${status.kind === 'ok' ? 'text-jade' : 'text-crimson'}`}>{status.msg}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire into Settings**

In `src/routes/Settings.tsx`, add a section (place after Recipe cache):
```tsx
<section>
  <h2 className="font-display text-lg text-gold mb-3 tracking-wide">Backup &amp; restore</h2>
  <p className="text-text-low text-sm mb-3">
    Export saves your retainer levels, world/DC, watchlist, starter pack toggles, custom items,
    and per-item overrides as a JSON file. Import overwrites your current state.
  </p>
  <ExportImportPanel />
</section>
```

Add the import at the top of the file.

- [ ] **Step 4: Build clean. Tests green. Manual: export, look at the file, re-import, confirm state survives.**

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(settings): export/import settings + watchlist as JSON"
```

---

## Task 9: SessionPlanner mobile UX pass

**Files:**
- Modify: `src/features/session/SessionPlanner.tsx`
- Modify: `src/features/session/SessionResults.tsx`

Two small things:
1. Sticky session summary bar at the top of `SessionResults` so the gil total stays visible when scrolling the picks.
2. Larger touch targets on the strategy chips (mobile).

- [ ] **Step 1: Sticky summary in `SessionResults.tsx`**

Read the file. Wrap the existing summary `<div>` (the one with "items" + "min" + total gil) in a `sticky` container so it pins to the top of its scroll context:

Change the outer `<div className="border border-border-base bg-bg-card">` to:
```tsx
<div className="border border-border-base bg-bg-card relative">
  <div className="sticky top-0 z-10 bg-bg-card px-4 py-3 border-b border-border-base flex justify-between items-baseline">
    {/* existing summary content */}
  </div>
  <table className="w-full text-sm">
    {/* unchanged */}
  </table>
</div>
```

(The existing summary already lives in a `<div>` — just add `sticky top-0 z-10 bg-bg-card`. Keep `border-b border-border-base`.)

- [ ] **Step 2: Mobile-friendly strategy chips in `SessionPlanner.tsx`**

In the strategy buttons, add wider padding on mobile and stack the tag below the label so it's readable:

Change the existing:
```tsx
className={`px-4 py-2 border font-mono text-xs tracking-wider uppercase ${...}`}
```
to:
```tsx
className={`px-4 py-3 sm:py-2 border font-mono text-xs tracking-wider uppercase min-w-[140px] sm:min-w-0 ${...}`}
```

And change the label/tag layout from a single `<span>` line to a stacked block:
```tsx
<button ...>
  <div>{s.label}</div>
  <div className="text-[10px] text-text-low normal-case mt-0.5">{s.tag}</div>
</button>
```

(Drops the inline `<span>` for `tag` and gives it its own line.)

- [ ] **Step 3: Build clean. Tests green. Manual: resize narrow, verify summary stays visible while scrolling picks, strategy chips are easier to tap.**

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(session): sticky session summary + larger touch targets on mobile"
```

---

## Task 10: README + final smoke test

**Files:**
- Modify: `README.md`
- Create: `src/features/profit/RecipeModal.test.tsx`

Final smoke test renders the modal with all Phase 4 props (names + history) and confirms it doesn't crash.

- [ ] **Step 1: Modal smoke test `src/features/profit/RecipeModal.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecipeModal } from './RecipeModal';
import type { Recipe } from '../../lib/recipes';

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const recipe: Recipe = {
  itemResultId: 49281, classJob: 'LTW', recipeLevel: 100,
  ingredients: [{ itemId: 7, amount: 5 }],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: { '49281': { entries: [] } } }),
  }));
});

describe('RecipeModal', () => {
  it('renders ingredient name when nameMap has it', () => {
    render(wrap(
      <RecipeModal
        item={{ id: 49281, name: "Courtly Lover's Temple Chain of Striking", crafter: 'LTW', lvl: 100, cat: 'Raid' }}
        recipe={recipe}
        recipeMap={new Map()}
        phantom={{}}
        dc={{}}
        nameMap={new Map([[7, 'Wind Shard']])}
        craftIntermediates={false}
        onToggleCraftIntermediates={() => {}}
        craftTimeSeconds={undefined}
        defaultCraftTimeSeconds={60}
        onChangeCraftTime={() => {}}
        dc={'Chaos'}
        onClose={() => {}}
      />
    ));
    expect(screen.getByText(/Wind Shard/)).toBeInTheDocument();
    expect(screen.queryByText(/#7/)).not.toBeInTheDocument();
  });

  it('falls back to #id when name is not in nameMap', () => {
    render(wrap(
      <RecipeModal
        item={{ id: 49281, name: 'X', crafter: 'LTW', lvl: 100, cat: 'Raid' }}
        recipe={recipe}
        recipeMap={new Map()}
        phantom={{}}
        dc={{}}
        nameMap={new Map()}
        craftIntermediates={false}
        onToggleCraftIntermediates={() => {}}
        craftTimeSeconds={undefined}
        defaultCraftTimeSeconds={60}
        onChangeCraftTime={() => {}}
        dc={'Chaos'}
        onClose={() => {}}
      />
    ));
    expect(screen.getByText(/#7/)).toBeInTheDocument();
  });
});
```

NOTE: the test imports `RecipeModal` and `dc` is named twice in the props because the existing prop in Phase 1-3 is `dc: MarketData` (the market data) and Phase 4 adds `dc: string` for the world/DC scope. This is a naming collision. Resolve by renaming the new prop to `worldDc` or `historyScope`. To avoid scope collision in the existing API, **rename the new Phase 4 prop to `historyScope: string`** in `RecipeModal.tsx` and update the caller in `Watchlist.tsx`. Then in the smoke test, drop the duplicate `dc` line and use `historyScope='Chaos'`.

(This means going back to Task 7 step 1 and using `historyScope` instead of `dc` for the new prop. If you've already shipped Task 7, edit it in place: rename the prop, update the call site. Mention this fix in the commit.)

Updated test snippet (single `dc` for market data, `historyScope` for the API call):
```tsx
<RecipeModal
  item={...}
  recipe={recipe}
  recipeMap={new Map()}
  phantom={{}}
  dc={{}}                      // MarketData (already existed)
  historyScope={'Chaos'}       // NEW Phase 4 prop
  nameMap={new Map([[7, 'Wind Shard']])}
  craftIntermediates={false}
  onToggleCraftIntermediates={() => {}}
  craftTimeSeconds={undefined}
  defaultCraftTimeSeconds={60}
  onChangeCraftTime={() => {}}
  onClose={() => {}}
/>
```

- [ ] **Step 2: README append**

```markdown

## Phase 4 — Polish

- **Real ingredient names** in the recipe modal (XIVAPI item-name cache, IndexedDB).
- **30-day sparklines** for price + quantity sold per item, fetched lazily when the modal opens.
- **Backup &amp; restore** in Settings: export your settings + watchlist as JSON; import to restore.
- **Mobile UX:** sticky session summary, larger strategy chips.

The recipe cache and item-name cache are both in IndexedDB (`ffxiv-helper` DB). "Clear recipe cache" in Settings only clears recipes — names stick around independently.
```

- [ ] **Step 3: Run + pass + commit**

```
git add -A
git commit -m "docs+test: Phase 4 README + RecipeModal smoke test"
```

---

## Phase 4 ships when

- `npm test -- --run` green (count grows from 105 to ~120).
- `npm run build` clean.
- `npm run dev` shows: ingredient names in modal (real, not `#id`), sparklines below ingredients, "Backup &amp; restore" section in Settings with export + import buttons that round-trip cleanly, sticky session summary on the planner, larger strategy chips.

Phase 4 is the last phase planned. After this, the app is feature-complete for personal use. Future work would be its own brainstorm: per-character profile switching, multi-retainer planning, automation hooks, etc.
