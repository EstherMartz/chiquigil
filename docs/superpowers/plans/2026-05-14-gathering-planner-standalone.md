# Gathering planner standalone — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `/gathering/plan` as a single-purpose route that runs its own gathering market query and renders the planner output, while reverting `/gathering` to its pre-planner browse-only state with a link to the new page.

**Architecture:** A new `useGatheringQuery` hook wraps the existing snapshot + catalog + market-fetch + `runQuery` pipeline with a baked-in filter for the brain-off use case (gatherable-only, NQ, home server, sort by gil/day, top 100). The new `GatheringPlan.tsx` route hosts the form + Run button and renders the existing `<GatheringPlanner>` once rows arrive. `Gathering.tsx` reverts to a browse-only page with a single in-page link to the new route.

**Tech Stack:** React 18, TypeScript, React Router 7, React Query 5, vitest 4 (jsdom), Testing Library, zustand 5 (existing planner store, unchanged).

Spec: [2026-05-14-gathering-planner-standalone-design.md](../specs/2026-05-14-gathering-planner-standalone-design.md)

---

### Task 1: `useGatheringQuery` hook (TDD)

A small hook that owns: snapshot readiness, gathering catalog readiness, the mutation that fetches market data and runs the gathering query, and the resulting rows.

**Files:**
- Create: `src/features/gathering/useGatheringQuery.ts`
- Test: `src/features/gathering/useGatheringQuery.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/gathering/useGatheringQuery.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { useGatheringQuery } from './useGatheringQuery';
import { useSettingsStore, defaultSettings } from '../settings/store';
import { clearItemCache, putCachedItems, putCachedGatheringCatalog } from '../../lib/recipeCache';
import type { SnapshotItem } from '../../lib/itemSnapshot';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  await clearItemCache();
  vi.restoreAllMocks();
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const snapshotItems: SnapshotItem[] = [
  { id: 5544, name: 'Cobalt Ore',     sc: 1, ui: 1, ilvl: 1, canHq: false },
  { id: 5543, name: 'Rosewood Log',   sc: 1, ui: 1, ilvl: 1, canHq: false },
  { id: 9999, name: 'Not Gatherable', sc: 1, ui: 1, ilvl: 1, canHq: false },
];

describe('useGatheringQuery', () => {
  it('starts with rows empty and ready=false until snapshot + catalog resolve', async () => {
    // No seeded data → both queries will try to fetch and fail (no mock).
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const { result } = renderHook(() => useGatheringQuery(), { wrapper });
    expect(result.current.rows).toEqual([]);
    expect(result.current.ready).toBe(false);
    expect(result.current.isPending).toBe(false);
  });

  it('after run(), fetches market data and returns rows for catalog-known items only', async () => {
    // Seed both caches so snapshot + catalog resolve from IDB.
    await putCachedItems(snapshotItems);
    await putCachedGatheringCatalog([
      [5544, { level: 50, timed: false, hidden: false }],
      [5543, { level: 60, timed: false, hidden: false }],
      // 9999 not in catalog → filtered out of the candidate id list.
    ]);

    // Mock the Universalis bulk endpoint.
    const marketResponse = {
      items: {
        '5544': {
          listings: [{ hq: false, pricePerUnit: 100 }],
          recentHistory: Array.from({ length: 10 }, () => ({ hq: false, pricePerUnit: 100 })),
          regularSaleVelocity: 5,
          averagePriceNQ: 110,
        },
        '5543': {
          listings: [{ hq: false, pricePerUnit: 50 }],
          recentHistory: Array.from({ length: 10 }, () => ({ hq: false, pricePerUnit: 50 })),
          regularSaleVelocity: 4,
          averagePriceNQ: 55,
        },
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => marketResponse,
    }));

    const { result } = renderHook(() => useGatheringQuery(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      result.current.run();
    });

    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));

    const ids = result.current.rows.map((r) => r.id).sort();
    expect(ids).toEqual([5543, 5544]);
    expect(result.current.skipped).toBe(0);
  });

  it('exposes skipped when a chunk fetch fails', async () => {
    await putCachedItems(snapshotItems);
    await putCachedGatheringCatalog([
      [5544, { level: 50, timed: false, hidden: false }],
    ]);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Universalis 504')));

    const { result } = renderHook(() => useGatheringQuery(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      result.current.run();
    });

    await waitFor(() => expect(result.current.skipped).toBeGreaterThan(0));
    expect(result.current.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/gathering/useGatheringQuery.test.tsx`
Expected: FAIL (`useGatheringQuery` module not found).

- [ ] **Step 3: Implement the hook**

Create `src/features/gathering/useGatheringQuery.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { useSettingsStore } from '../settings/store';
import { runQuery } from '../queries/runQuery';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import type { QueryFilter, QueryResultRow } from '../queries/types';

// Baked-in filter for the standalone planner: gatherable items only, NQ
// preference, home server, sort by gil/day. The planner UI does not expose
// these knobs — see docs/superpowers/specs/2026-05-14-gathering-planner-standalone-design.md.
const DEFAULT_GATHERING_FILTER: QueryFilter = {
  searchCategories: [],
  hq: 'either',
  minDealPct: 0,
  minVelocity: 0,
  minPrice: null,
  maxPrice: null,
  sort: 'gilFlow',
  limit: 100,
  scope: 'home',
  maxListings: null,
  mode: 'standard',
  minGap: null,
};

interface RunResult {
  rows: QueryResultRow[];
  skipped: number;
}

export interface UseGatheringQueryResult {
  run: () => void;
  rows: QueryResultRow[];
  skipped: number;
  ready: boolean;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

export function useGatheringQuery(): UseGatheringQueryResult {
  const snapshot = useItemSnapshot();
  const catalog = useGatheringCatalog();
  const { world } = useSettingsStore();

  const mutation = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      if (!catalog.data) throw new Error('Gathering catalog not ready');
      const ids: number[] = [];
      for (const item of snapshot.data.items) {
        if (catalog.data.has(item.id)) ids.push(item.id);
      }
      const result = await fetchInBatches<MarketData[string]>(
        ids,
        async (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 25, concurrency: 4 },
      );
      const rows = runQuery(snapshot.data.items, result.data, DEFAULT_GATHERING_FILTER);
      return { rows, skipped: result.errors.length };
    },
  });

  return {
    run: () => mutation.mutate(),
    rows: mutation.data?.rows ?? [],
    skipped: mutation.data?.skipped ?? 0,
    ready: snapshot.data != null && catalog.data != null,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error as Error | null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/gathering/useGatheringQuery.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/gathering/useGatheringQuery.ts src/features/gathering/useGatheringQuery.test.tsx
git commit -m "$(printf 'feat(gathering): useGatheringQuery hook for standalone planner\n\nWraps the existing snapshot + catalog + bulk-market-fetch + runQuery\npipeline with a baked-in filter (gatherable-only, NQ, home server,\nsort by gil/day, top 100) so the new /gathering/plan route can run\nits own query without leaning on QueriesView.\n')"
```

---

### Task 2: `GatheringPlan` route component (TDD)

The new page. Renders the page header, the planner (which owns the form inputs), and the Run + back-link controls. Owns the run trigger and the rows passed down to `<GatheringPlanner>`.

**Files:**
- Create: `src/routes/GatheringPlan.tsx`
- Test: `src/routes/GatheringPlan.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/routes/GatheringPlan.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import GatheringPlan from './GatheringPlan';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { useGatheringPlanStore, defaultGatheringPlan } from '../features/gathering/gatheringPlanStore';
import { clearItemCache, putCachedItems, putCachedGatheringCatalog } from '../lib/recipeCache';
import type { SnapshotItem } from '../lib/itemSnapshot';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useGatheringPlanStore.setState(defaultGatheringPlan());
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

const snapshotItems: SnapshotItem[] = [
  { id: 5544, name: 'Cobalt Ore',   sc: 1, ui: 1, ilvl: 1, canHq: false },
  { id: 5543, name: 'Rosewood Log', sc: 1, ui: 1, ilvl: 1, canHq: false },
];

const marketResponse = {
  items: {
    '5544': {
      itemID: 5544,
      minPriceNQ: 100, minPriceHQ: 0, averagePriceNQ: 110, averagePriceHQ: 0,
      regularSaleVelocity: 5, listings: [],
      recentHistory: Array.from({ length: 10 }, () => ({ pricePerUnit: 100, hq: false, timestamp: 1 })),
    },
    '5543': {
      itemID: 5543,
      minPriceNQ: 50, minPriceHQ: 0, averagePriceNQ: 55, averagePriceHQ: 0,
      regularSaleVelocity: 4, listings: [],
      recentHistory: Array.from({ length: 10 }, () => ({ pricePerUnit: 50, hq: false, timestamp: 1 })),
    },
  },
};

describe('GatheringPlan route', () => {
  it('renders the page title, planner section, Run button, and back link', async () => {
    await putCachedItems(snapshotItems);
    await putCachedGatheringCatalog([
      [5544, { level: 50, timed: false, hidden: false }],
      [5543, { level: 60, timed: false, hidden: false }],
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => marketResponse }));

    render(withProviders(<GatheringPlan />));

    expect(await screen.findByRole('heading', { name: /plan a session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run query/i })).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: /browse all gatherables/i });
    expect(backLink).toHaveAttribute('href', '/gathering');
  });

  it('clicking Run query populates the plan table', async () => {
    await putCachedItems(snapshotItems);
    await putCachedGatheringCatalog([
      [5544, { level: 50, timed: false, hidden: false }],
      [5543, { level: 60, timed: false, hidden: false }],
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => marketResponse }));

    render(withProviders(<GatheringPlan />));

    const runBtn = await screen.findByRole('button', { name: /run query/i });
    await waitFor(() => expect(runBtn).not.toBeDisabled());
    fireEvent.click(runBtn);

    await waitFor(() => expect(screen.getByText('Cobalt Ore')).toBeInTheDocument());
    expect(screen.getByText('Rosewood Log')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy gbr clipboard string/i })).not.toBeDisabled();
  });

  it('disables Run query until snapshot and catalog are ready', () => {
    // No seeded caches; fetch fails so they never resolve.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    render(withProviders(<GatheringPlan />));
    expect(screen.getByRole('button', { name: /loading data/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/GatheringPlan.test.tsx`
Expected: FAIL (`GatheringPlan` module not found).

- [ ] **Step 3: Implement the route component**

Create `src/routes/GatheringPlan.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { GatheringPlanner } from '../features/gathering/GatheringPlanner';
import { useGatheringQuery } from '../features/gathering/useGatheringQuery';
import { useGatheringCatalog } from '../features/queries/useGatheringCatalog';
import { Spinner } from '../components/Spinner';
import { StatusBanner } from '../components/StatusBanner';

export default function GatheringPlan() {
  const q = useGatheringQuery();
  const catalog = useGatheringCatalog();

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-gold tracking-wide">Plan a session</h2>
          <p className="font-mono text-[11px] text-text-low max-w-prose">
            Brain-off picks for your next auto-gather run.
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

      {q.isPending && <Spinner label="Fetching gathering market data…" />}
      {q.isError && <StatusBanner kind="error">Query failed: {(q.error as Error).message}</StatusBanner>}
      {q.skipped > 0 && (
        <StatusBanner kind="error">{q.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      <GatheringPlanner rows={q.rows} catalog={catalog.data} />

      <div>
        <Link to="/gathering" className="font-mono text-[10px] tracking-widest uppercase text-text-dim hover:text-aether">
          ← Browse all gatherables
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/GatheringPlan.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/GatheringPlan.tsx src/routes/GatheringPlan.test.tsx
git commit -m "$(printf 'feat(gathering): standalone /gathering/plan route\n\nNew page that runs its own gathering market query via\nuseGatheringQuery and renders the existing GatheringPlanner. Run\nbutton is disabled until snapshot + catalog resolve; loading and\nerror states surface inline. Back link returns to /gathering.\n')"
```

---

### Task 3: Wire route + revert `/gathering` + update empty-state copy

Three small surface changes that ship together: register the new route, revert `Gathering.tsx` to browse-only with a forward link, and update the planner's empty-state copy (since the run trigger no longer lives "below" the table).

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/routes/Gathering.tsx`
- Modify: `src/features/gathering/GatheringPlanner.tsx`
- Test: `src/routes/Gathering.test.tsx` (new)

- [ ] **Step 1: Update `App.tsx` to register the new route**

Open `src/App.tsx`. Add the import after the existing route imports:

```tsx
import GatheringPlan from './routes/GatheringPlan';
```

Insert the new `<Route>` immediately after the existing `/gathering` route (around line 19):

```tsx
<Route path="/gathering" element={<Gathering />} />
<Route path="/gathering/plan" element={<GatheringPlan />} />
```

- [ ] **Step 2: Revert `Gathering.tsx` and add the forward link**

Replace the full contents of `src/routes/Gathering.tsx` with:

```tsx
import { Link } from 'react-router-dom';
import { QueriesView } from '../features/queries/QueriesView';

export default function Gathering() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-gold tracking-wide">Gathering</h2>
          <p className="font-mono text-[11px] text-text-low max-w-prose">
            Raw materials you can gather while doing other things. Sells as-is — no recipe required.
          </p>
        </div>
        <Link
          to="/gathering/plan"
          className="font-mono text-[10px] tracking-widest uppercase px-3 py-2 border border-gold text-gold hover:bg-bg-card-hi"
        >
          Plan a session →
        </Link>
      </div>
      <QueriesView category="gathering" />
    </div>
  );
}
```

- [ ] **Step 3: Update the planner's empty-state copy**

Open `src/features/gathering/GatheringPlanner.tsx`. Around line 182, find:

```tsx
                Run the query below to populate this plan.
```

Replace with:

```tsx
                Click Run query to populate this plan.
```

That's the only change to this file.

- [ ] **Step 4: Add a minimal test for the reverted `Gathering.tsx`**

Create `src/routes/Gathering.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import Gathering from './Gathering';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { clearItemCache, clearRecipeCache } from '../lib/recipeCache';

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

describe('Gathering route', () => {
  it('renders the heading and a "Plan a session" link to /gathering/plan', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: {}, results: [] }) }));
    render(withProviders(<Gathering />));
    expect(screen.getByRole('heading', { name: /^gathering$/i })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /plan a session/i });
    expect(link).toHaveAttribute('href', '/gathering/plan');
  });
});
```

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: all suites pass (existing + the new `useGatheringQuery`, `GatheringPlan`, and `Gathering` tests).

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output (exit 0).

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`

In the browser:
1. Open `/gathering`. Confirm the browse view renders (preset chips + QueryBuilder + ranked table). Confirm "Plan a session →" link appears top-right.
2. Click the link. URL becomes `/gathering/plan`.
3. Confirm planner form renders with default values. Confirm Run button reads "Loading data…" briefly, then "Run query" once snapshot + catalog are warm.
4. Click Run query. Confirm a spinner appears, then the plan table populates with items.
5. Click "Copy GBR clipboard string". Paste somewhere — confirm a base64 string lands on your clipboard.
6. Click "← Browse all gatherables". URL returns to `/gathering`.

If any step fails, debug before committing.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/routes/Gathering.tsx src/routes/Gathering.test.tsx src/features/gathering/GatheringPlanner.tsx
git commit -m "$(printf 'feat(gathering): split planner onto /gathering/plan; revert /gathering\n\nThe planner is now its own page reached via a "Plan a session" link on\n/gathering, which goes back to its pre-planner browse-only form. The\nplanner empty-state copy updates from "Run the query below" to "Click\nRun query" since the trigger now lives in the page header.\n')"
```

---

## Self-review

**Spec coverage:**
- New `/gathering/plan` route → Task 2 (component) + Task 3 (route registration).
- `useGatheringQuery` hook → Task 1.
- Baked-in default filter (gatherable-only, NQ, home, gilFlow, 100) → Task 1, `DEFAULT_GATHERING_FILTER` constant.
- Run + loading + error + skipped UI → Task 2 component.
- "Plan a session →" link on `/gathering` → Task 3 Step 2.
- "← Browse all gatherables" link on `/gathering/plan` → Task 2 component.
- Revert `Gathering.tsx` to browse-only → Task 3 Step 2.
- Planner empty-state copy update → Task 3 Step 3.
- Tests for hook, page, reverted route → Tasks 1, 2, 3.
- Untouched files (`computePlan`, `gatheringPlanStore`, `gatherBuddyExport`, `QueriesView`) → confirmed not in any file list.
- Edge cases (snapshot/catalog loading, fetch error, no results, navigation away mid-fetch) → covered by hook readiness flag + error/skipped surfacing in Task 2.

**Placeholder scan:** No "TBD", "TODO", "implement later". All code blocks contain final code, all commands runnable.

**Type consistency:**
- `useGatheringQuery` returns `{ run, rows, skipped, ready, isPending, isError, error }`. The page in Task 2 uses each one with matching access.
- `q.error` typed as `Error | null` in both files.
- `GatheringPlanner` props `{ rows, catalog }` already exist on the component (Task 5 of the previous plan). Task 2 passes both correctly.
- `SnapshotItem` shape in test fixtures (`{ id, name, sc, ilvl, canHq }`) — verified by reading `src/lib/itemSnapshot.ts` matches the existing snapshot type used elsewhere in tests.
- `MarketItem` shape used in fixtures matches the Universalis raw response format consumed by `parseMarketResponse` (`itemID`, `minPriceNQ`, `averagePriceNQ`, `regularSaleVelocity`, `listings`, `recentHistory`).
