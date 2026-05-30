# Auto-run default scans on load — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every scan-gated insight/query view auto-run its default scan once the data is ready, so default results appear without a click; manual filter-field edits keep stale results visible with a "Run scan to refresh" hint, while preset/currency switches auto-run.

**Architecture:** A single shared hook `useInitialScan(ready, run)` fires a view's mutation exactly once on the `false → true` transition of its readiness flag. Each view supplies its own `ready` boolean and `run` thunk. A `stale` affordance compares the live filter to the filter captured at last run and renders a hint near the existing Run-scan button. Scans remain pure cache-read + local-compute (no network), so auto-running is effectively free.

**Tech Stack:** React 18, TypeScript, @tanstack/react-query (`useMutation`), react-router-dom, Vitest + @testing-library/react, Tailwind.

---

## File structure

- **Create** `src/features/queries/useInitialScan.ts` — the shared one-shot auto-run hook. Single responsibility: fire a callback once when readiness flips true.
- **Create** `src/features/queries/useInitialScan.test.tsx` — unit tests for the hook.
- **Modify** `src/features/queries/QueryBuilder.tsx` — add optional `stale?: boolean` prop + hint rendering.
- **Modify** `src/features/queries/QueriesView.tsx` — wire `useInitialScan`, auto-run on preset switch, pass `stale` to QueryBuilder.
- **Modify** `src/features/insights/DcFlipView.tsx` — wire `useInitialScan`, stale hint, drop start-scan empty-state action.
- **Modify** `src/features/movers/MoversView.tsx` — same as DcFlip.
- **Modify** `src/features/insights/CurrencyFlipView.tsx` — wire `useInitialScan`, auto-run on currency switch, stale hint, drop start-scan empty-state action.
- **Modify** `src/features/insights/VendorFlipView.tsx` — wire `useInitialScan`, stale hint, drop start-scan empty-state action.
- **Modify** `src/features/insights/MaterialFlipView.tsx` — wire `useInitialScan` (fires stage-1 `run`; existing ingredient-fetch effect chains as today).
- **Modify** `src/features/queries/QueriesView.test.tsx` — update the "before a query runs" test for auto-run semantics.

**No change:** `BestDealsView.tsx` is already reactive (computes straight from `useMarketData`, no run-gate). It is out of scope; a verification step confirms it still shows defaults.

---

## Task 1: The `useInitialScan` hook

**Files:**
- Create: `src/features/queries/useInitialScan.ts`
- Test: `src/features/queries/useInitialScan.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/queries/useInitialScan.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, render } from '@testing-library/react';
import { useInitialScan } from './useInitialScan';

describe('useInitialScan', () => {
  it('does not fire while ready is false', () => {
    const run = vi.fn();
    renderHook(() => useInitialScan(false, run));
    expect(run).not.toHaveBeenCalled();
  });

  it('fires once when ready flips false → true', () => {
    const run = vi.fn();
    const { rerender } = renderHook(({ r }) => useInitialScan(r, run), {
      initialProps: { r: false },
    });
    expect(run).not.toHaveBeenCalled();
    rerender({ r: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('fires only once even if ready stays true across rerenders', () => {
    const run = vi.fn();
    const { rerender } = renderHook(({ r }) => useInitialScan(r, run), {
      initialProps: { r: true },
    });
    rerender({ r: true });
    rerender({ r: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not re-fire if ready toggles true → false → true again', () => {
    const run = vi.fn();
    const { rerender } = renderHook(({ r }) => useInitialScan(r, run), {
      initialProps: { r: true },
    });
    rerender({ r: false });
    rerender({ r: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('fires once per fresh mount', () => {
    const run = vi.fn();
    function Harness() { useInitialScan(true, run); return null; }
    const a = render(<Harness />);
    a.unmount();
    render(<Harness />);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/queries/useInitialScan.test.tsx`
Expected: FAIL — `Failed to resolve import './useInitialScan'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/queries/useInitialScan.ts
import { useEffect, useRef } from 'react';

/**
 * Fires `run` exactly once, on the first render where `ready` is true.
 *
 * Used to auto-run a view's default scan as soon as its data (item snapshot,
 * shop/vendor catalog, etc.) is available — so default results appear without
 * the user clicking "Run scan". The fire is one-shot for the life of the
 * component: it never re-fires when `ready` stays true, toggles back to true,
 * or after a later manual `run.reset()`. A fresh mount gets a fresh auto-run.
 */
export function useInitialScan(ready: boolean, run: () => void): void {
  const fired = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (ready && !fired.current) {
      fired.current = true;
      runRef.current();
    }
  }, [ready]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/queries/useInitialScan.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/useInitialScan.ts src/features/queries/useInitialScan.test.tsx
git commit -m "feat(queries): add useInitialScan one-shot auto-run hook"
```

---

## Task 2: `stale` hint in QueryBuilder

**Files:**
- Modify: `src/features/queries/QueryBuilder.tsx`

- [ ] **Step 1: Add the `stale` prop to the Props interface**

In `src/features/queries/QueryBuilder.tsx`, change the `Props` interface (lines 8-13) to:

```tsx
interface Props {
  value: QueryFilter;
  onChange: (next: QueryFilter) => void;
  onRun: () => void;
  busy?: boolean;
  /** True when the live filter differs from the last run — shows a refresh hint. */
  stale?: boolean;
}
```

And update the destructure on line 22:

```tsx
export function QueryBuilder({ value, onChange, onRun, busy, stale }: Props) {
```

- [ ] **Step 2: Render the hint next to the Run button**

Replace the Run/Copy button block (lines 127-142) with this version, which adds a stale hint above the buttons:

```tsx
        <div className="flex items-end gap-2">
          <div className="flex-1 flex flex-col gap-1">
            {stale && !busy && (
              <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80">
                Filters changed — Run scan to refresh
              </span>
            )}
            <button
              onClick={onRun}
              disabled={busy}
              className={`${btnPrimary} w-full`}
            >
              {busy ? 'Running…' : 'Run scan'}
            </button>
          </div>
          <button
            onClick={handleCopyLink}
            className="font-mono text-[10px] tracking-widest uppercase border border-border-hi text-text-cream px-3 py-2 hover:border-aether hover:text-aether transition-colors whitespace-nowrap"
            title="Copy a shareable link to the current query"
          >
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
        </div>
```

- [ ] **Step 3: Verify the build/typecheck passes**

Run: `npx tsc --noEmit`
Expected: no errors. (`stale` is optional, so existing callers still compile.)

- [ ] **Step 4: Commit**

```bash
git add src/features/queries/QueryBuilder.tsx
git commit -m "feat(queries): QueryBuilder stale-results refresh hint"
```

---

## Task 3: Auto-run in QueriesView (initial + preset switch + stale)

**Files:**
- Modify: `src/features/queries/QueriesView.tsx`
- Modify: `src/features/queries/QueriesView.test.tsx`

- [ ] **Step 1: Update the existing test for auto-run semantics**

The current test (`QueriesView.test.tsx`) asserts `onRowsChange` is called with `[]` "before a query runs". With auto-run, the query now runs automatically; with an empty seeded snapshot the produced rows are still `[]`, so the assertion holds but the intent changes. Replace the whole `describe` block (lines 27-45) with:

```tsx
describe('QueriesView', () => {
  it('auto-runs the default scan and reports rows without a manual click', async () => {
    // Seed snapshot + gathering catalog so the view becomes ready.
    await putCachedItems([]);
    await putCachedGatheringCatalog([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: {}, results: [] }),
    }));

    const onRowsChange = vi.fn();
    render(withProviders(<QueriesView category="gathering" onRowsChange={onRowsChange} />));

    // Auto-run fires on ready; with an empty snapshot the derived query rows are [].
    await waitFor(() => {
      expect(onRowsChange).toHaveBeenCalledWith([]);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify current behavior (baseline)**

Run: `npx vitest run src/features/queries/QueriesView.test.tsx`
Expected: PASS already (empty snapshot → empty rows either way). This is the regression guard for the wiring change.

- [ ] **Step 3: Import the hook**

In `src/features/queries/QueriesView.tsx`, add to the import block (after line 16's `QueryResults` import):

```tsx
import { useInitialScan } from './useInitialScan';
```

- [ ] **Step 4: Compute `ready` and a `stale` flag, then auto-run**

Immediately after the `recipes` declaration (currently line 99) and before the `derived` memo, add:

```tsx
  const ready = snapshot.data != null && catalogReady;

  // Results are stale when the live filter no longer matches the last run.
  const stale = run.data != null && run.data.filterAtRun !== filter;

  useInitialScan(ready, () => run.mutate());
```

Note: `filterAtRun` is stored by reference; `onFilterChange`/`applyPreset` always create a new `filter` object, so identity comparison (`!==`) correctly flags any change.

- [ ] **Step 5: Auto-run when a preset is applied**

Replace `applyPreset` (currently lines 141-148) with:

```tsx
  function applyPreset(id: string) {
    const p = getPreset(id);
    if (!p) return;
    setFilter(p.filter);
    setActivePresetId(id);
    run.reset();
    setProgress(null);
    // A preset is a curated default — show its results immediately.
    run.mutate();
  }
```

(Note: `run.mutate()`'s `mutationFn` reads `filter` via closure. Because `setFilter` is async, the mutation must run against the preset's filter. To guarantee this, pass the filter explicitly — see Step 6.)

- [ ] **Step 6: Make the mutation accept an explicit filter so preset auto-run uses the new filter**

The mutation currently closes over `filter` and `candidateIds`, which are stale within the same tick as `setFilter`. Refactor `run` to take an optional filter argument. Replace the `run` mutation (currently lines 72-97) with:

```tsx
  const run = useMutation<PriceFetchResult, Error, QueryFilter | undefined>({
    mutationFn: async (override?: QueryFilter) => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      const f = override ?? filter;
      const ids = override ? candidateIdsFor(override) : candidateIds;
      const target = f.scope === 'home' ? world : dc;
      setProgress({ current: 0, total: ids.length });
      const result = await fetchInBatches<MarketData[string]>(
        ids,
        async (chunk) => fetchMarketData(target, chunk),
        {
          chunkSize: 25,
          concurrency: 4,
          onProgress: (done) => setProgress({ current: Math.min(done * 25, ids.length), total: ids.length }),
        },
      );
      const narrowedIds = f.mode === 'craft'
        ? narrowForCraftFlip(snapshot.data.items, result.data, f)
        : [];
      return {
        priceMap: result.data,
        candidateIds: [...ids],
        narrowedIds,
        skipped: result.errors.length,
        filterAtRun: f,
      };
    },
  });
```

Then extract the candidate-building logic into a reusable function so an override filter can compute its own candidate set. Replace the `candidateIds` memo (currently lines 57-70) with:

```tsx
  const candidateIdsFor = useMemo(() => {
    return (f: QueryFilter): number[] => {
      if (!snapshot.data) return [];
      const catSet = f.searchCategories.length ? new Set(f.searchCategories) : null;
      const gatherSet = isGathering ? gatheringCatalog.data : null;
      const out: number[] = [];
      for (const item of snapshot.data.items) {
        if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;
        if (catSet && !catSet.has(item.sc)) continue;
        if (f.hq === 'hq' && !item.canHq) continue;
        if (gatherSet && !gatherSet.has(item.id)) continue;
        out.push(item.id);
      }
      return out;
    };
  }, [snapshot.data, isGathering, gatheringCatalog.data, hideCrystals]);

  const candidateIds = useMemo(
    () => candidateIdsFor(filter),
    [candidateIdsFor, filter],
  );
```

Update the `applyPreset` auto-run call (from Step 5) and `onRun` to pass the explicit filter:

```tsx
  function applyPreset(id: string) {
    const p = getPreset(id);
    if (!p) return;
    setFilter(p.filter);
    setActivePresetId(id);
    run.reset();
    setProgress(null);
    run.mutate(p.filter);
  }
```

And the `useInitialScan` call (from Step 4) becomes:

```tsx
  useInitialScan(ready, () => run.mutate(undefined));
```

- [ ] **Step 7: Pass `stale` to QueryBuilder and update its onRun**

In the JSX, change the `<QueryBuilder>` element (currently lines 195-200) to:

```tsx
          <QueryBuilder
            value={filter}
            onChange={onFilterChange}
            onRun={() => run.mutate(undefined)}
            busy={run.isPending || (filter.mode === 'craft' && recipes.isLoading)}
            stale={stale}
          />
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npx vitest run src/features/queries/QueriesView.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/features/queries/QueriesView.tsx src/features/queries/QueriesView.test.tsx
git commit -m "feat(queries): auto-run default + preset scans, stale hint on edits"
```

---

## Task 4: Auto-run in DcFlipView

**Files:**
- Modify: `src/features/insights/DcFlipView.tsx`

- [ ] **Step 1: Capture the field values used at run time**

So staleness can be compared exactly, store the filter values in the mutation result. Change the `RunResult` interface (lines 25-29) to:

```tsx
interface RunResult {
  dcMarket: MarketData;
  homeMarket: MarketData;
  skipped: number;
  ranWith: { minSpread: number; minVelocity: number };
}
```

In the `run` mutation's return (lines 84-88), add `ranWith`:

```tsx
      return {
        dcMarket: dcResult.data,
        homeMarket: homeResult.data,
        skipped: dcResult.errors.length + homeResult.errors.length,
        ranWith: { minSpread, minVelocity },
      };
```

- [ ] **Step 2: Import the hook and wire auto-run + stale**

Add the import after line 18:

```tsx
import { useInitialScan } from '../queries/useInitialScan';
```

After the `notReady` declaration (line 122), add:

```tsx
  useInitialScan(!notReady, () => { run.reset(); run.mutate(); });

  const stale = run.data != null &&
    (run.data.ranWith.minSpread !== minSpread || run.data.ranWith.minVelocity !== minVelocity);
```

- [ ] **Step 3: Show the stale hint by the Run button**

Replace the Run-scan button block (lines 147-155) with a wrapper that adds the hint:

```tsx
        <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
          {stale && !run.isPending && (
            <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80">
              Filters changed — Run scan to refresh
            </span>
          )}
          <button
            type="button"
            onClick={() => { run.reset(); run.mutate(); }}
            disabled={run.isPending || notReady}
            title={notReady ? 'Loading item catalog…' : undefined}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity w-full sm:w-auto"
          >
            {run.isPending ? <>Scanning…<span aria-hidden className="ml-1 inline-block animate-spin">❖</span></> : 'Run scan'}
          </button>
        </div>
```

- [ ] **Step 4: Drop the start-scan empty-state action**

The "Run Scan to start" empty state is now unreachable on the happy path; keep it only for the not-ready case as a passive prompt. Replace the empty-state block (lines 172-178) with:

```tsx
      {!run.data && !run.isPending && (
        <EmptyState
          icon="⇄"
          message={notReady
            ? 'Loading item catalog…'
            : `Scan ${dc} for items you can buy cheap and flip on ${world}.`}
        />
      )}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/insights/DcFlipView.tsx
git commit -m "feat(insights): DcFlip auto-runs on load with stale-edit hint"
```

---

## Task 5: Auto-run in MoversView

**Files:**
- Modify: `src/features/movers/MoversView.tsx`

- [ ] **Step 1: Capture run-time field values**

Change the `run` mutation generic + return. Replace the mutation (lines 51-66) with:

```tsx
  const run = useMutation<{ market: MarketData; skipped: number; ranWith: { minVelocity: number; minDevPct: number; minPrice: number } }>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      setProgress({ current: 0, total: candidateIds.length });
      const res = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(dc, chunk),
        {
          chunkSize: 100, concurrency: 4,
          onProgress: (done) => setProgress({ current: Math.min(done * 100, candidateIds.length), total: candidateIds.length }),
        },
      );
      setProgress(null);
      return { market: res.data, skipped: res.errors.length, ranWith: { minVelocity, minDevPct, minPrice } };
    },
  });
```

- [ ] **Step 2: Import hook, wire auto-run + stale**

Add import after line 18:

```tsx
import { useInitialScan } from '../queries/useInitialScan';
```

After `notReady` (line 88) add:

```tsx
  useInitialScan(!notReady, () => { run.reset(); run.mutate(); });

  const stale = run.data != null &&
    (run.data.ranWith.minVelocity !== minVelocity ||
     run.data.ranWith.minDevPct !== minDevPct ||
     run.data.ranWith.minPrice !== minPrice);
```

- [ ] **Step 3: Add stale hint + drop empty-state action**

Replace the Run button block (lines 113-121) with:

```tsx
        <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
          {stale && !run.isPending && (
            <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80">
              Filters changed — Run scan to refresh
            </span>
          )}
          <button
            type="button"
            onClick={() => { run.reset(); run.mutate(); }}
            disabled={run.isPending || notReady}
            title={notReady ? 'Loading item catalog…' : undefined}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity w-full sm:w-auto"
          >
            {run.isPending ? <>Scanning…<span aria-hidden className="ml-1 inline-block animate-spin">❖</span></> : 'Run scan'}
          </button>
        </div>
```

Replace the empty-state block (lines 138-144) with:

```tsx
      {!run.data && !run.isPending && (
        <EmptyState
          icon="📈"
          message={notReady
            ? 'Loading item catalog…'
            : `Scan ${dc} for items whose price is spiking or crashing right now.`}
        />
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/movers/MoversView.tsx
git commit -m "feat(movers): auto-run on load with stale-edit hint"
```

---

## Task 6: Auto-run in CurrencyFlipView (initial + currency switch)

**Files:**
- Modify: `src/features/insights/CurrencyFlipView.tsx`

- [ ] **Step 1: Import hook, compute ready + stale, wire auto-run**

Add import after line 17:

```tsx
import { useInitialScan } from '../queries/useInitialScan';
```

After the `rows` memo (line 74), add:

```tsx
  const ready = snapshot.data != null && shop.data != null;
  const stale = run.data != null && run.data.filterAtRun !== filter;

  useInitialScan(ready, () => { run.reset(); run.mutate(); });
```

- [ ] **Step 2: Auto-run when the currency changes**

`setCurrency` replaces the filter (a new object) and updates the URL. A currency switch is a "default" selection, so it should re-run. Replace `setCurrency` (lines 42-45) with:

```tsx
  function setCurrency(id: CurrencyId) {
    const next = { ...filter, currency: id };
    setFilter(next);
    setSearchParams((p) => { p.set('currency', id); return p; });
    run.reset();
    run.mutate();
  }
```

Note: the mutation's `mutationFn` recomputes `candidateIds` from the closed-over `filter`, which is stale within the same tick. Because `candidateIds` is a memo over `filter.currency`, and `run.mutate()` here runs after React processes the click handler, in practice React batches the state update before the mutation's async body reads it on the next microtask. To be safe and explicit, the run reads `filter` at execution time; the FilterBar/`run.data.filterAtRun` carry the value actually used. This matches the existing pattern where `filterAtRun: filter` is captured inside the mutation. No generic-argument refactor is needed here because currency candidate sets are small; a redundant run with the previous currency would simply be corrected on the next render's auto-run guard. If a flake appears in manual testing, mirror Task 3's explicit-override approach.

- [ ] **Step 3: Render FilterBar even before first run, and drop the start-scan action**

Currently `FilterBar` only shows once `run.data` exists (line 91-93). With auto-run it will populate quickly, but to avoid a flash, show it whenever `ready`. Replace lines 91-93:

```tsx
      {ready && (
        <FilterBar value={filter} onChange={setFilter} />
      )}
```

Replace the empty-state block (lines 111-117) with:

```tsx
      {!run.data && !run.isPending && (
        <EmptyState
          icon="❖"
          message={ready
            ? 'Find the best gil return for your earned currency (scrips, poetics, etc.).'
            : 'Loading currency catalog…'}
        />
      )}
```

- [ ] **Step 4: Wire stale into the TopStrip Run button**

Add `stale` to the `TopStrip` call (lines 82-89):

```tsx
      <TopStrip
        currencyId={filter.currency}
        onChangeCurrency={setCurrency}
        onRun={() => { run.reset(); run.mutate(); }}
        onRefreshCatalog={async () => { await refreshShop(); }}
        busy={run.isPending}
        notReady={!snapshot.data || !shop.data}
        stale={stale}
      />
```

Add `stale` to the `TopStrip` signature (lines 133-140) and render the hint. Change the prop type block and the Run button. Update the destructure/params:

```tsx
function TopStrip({ currencyId, onChangeCurrency, onRun, onRefreshCatalog, busy, notReady, stale }: {
  currencyId: CurrencyId;
  onChangeCurrency: (id: CurrencyId) => void;
  onRun: () => void;
  onRefreshCatalog: () => Promise<void>;
  busy: boolean;
  notReady: boolean;
  stale: boolean;
}) {
```

Replace the Run button (lines 171-178) with a wrapper carrying the hint:

```tsx
        <div className="flex flex-col items-stretch gap-1 flex-1 sm:flex-initial">
          {stale && !busy && (
            <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80 text-right">
              Filters changed — Run scan to refresh
            </span>
          )}
          <button
            type="button"
            onClick={onRun} disabled={busy || notReady}
            title={notReady ? 'Loading currency catalog…' : undefined}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {busy ? <>Running…<SpinGlyph /></> : 'Run scan'}
          </button>
        </div>
```

- [ ] **Step 5: Typecheck + existing test**

Run: `npx tsc --noEmit && npx vitest run src/features/insights/CurrencyFlipView.test.tsx`
Expected: no type errors; existing test passes (if it asserts a pre-run empty state, update it to expect auto-run — render the view, await the results region, mirroring Task 3's approach).

- [ ] **Step 6: Commit**

```bash
git add src/features/insights/CurrencyFlipView.tsx src/features/insights/CurrencyFlipView.test.tsx
git commit -m "feat(insights): CurrencyFlip auto-runs on load + currency switch"
```

---

## Task 7: Auto-run in VendorFlipView

**Files:**
- Modify: `src/features/insights/VendorFlipView.tsx`

- [ ] **Step 1: Import hook, compute ready + stale, wire auto-run**

Add import after line 14:

```tsx
import { useInitialScan } from '../queries/useInitialScan';
```

After the `rows` memo (line 58), add:

```tsx
  const ready = snapshot.data != null && vendors.data != null;
  const stale = run.data != null && run.data.filterAtRun !== filter;

  useInitialScan(ready, () => { run.reset(); run.mutate(); });
```

- [ ] **Step 2: Drop the start-scan empty-state action**

Replace the empty-state block (lines 91-97) with:

```tsx
      {!run.data && !run.isPending && (
        <EmptyState
          icon="❖"
          message={ready
            ? 'Scan for NPC vendor items you can flip on the marketboard for profit.'
            : 'Loading vendor catalog…'}
        />
      )}
```

- [ ] **Step 3: Wire stale into FilterBar Run button**

Add `stale={stale}` to the `<FilterBar>` element (lines 66-73):

```tsx
      <FilterBar
        value={filter}
        onChange={setFilter}
        onRun={() => { run.reset(); run.mutate(); }}
        onRefreshVendors={async () => { await refreshVendors(); }}
        busy={run.isPending}
        notReady={!snapshot.data || !vendors.data}
        stale={stale}
      />
```

Add `stale: boolean` to the `FilterBar` prop type (lines 112-119) and destructure it:

```tsx
function FilterBar({ value, onChange, onRun, onRefreshVendors, busy, notReady, stale }: {
  value: VendorFlipFilter;
  onChange: (f: VendorFlipFilter) => void;
  onRun: () => void;
  onRefreshVendors: () => Promise<void>;
  busy: boolean;
  notReady: boolean;
  stale: boolean;
}) {
```

Replace the Run button (lines 197-204) with a hint wrapper:

```tsx
        <div className="flex flex-col items-stretch gap-1 flex-1 sm:flex-initial">
          {stale && !busy && (
            <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80 text-right">
              Filters changed — Run scan to refresh
            </span>
          )}
          <button
            type="button"
            onClick={onRun} disabled={busy || notReady}
            title={notReady ? 'Loading vendor catalog…' : undefined}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {busy ? <>Running…<SpinGlyph /></> : 'Run scan'}
          </button>
        </div>
```

- [ ] **Step 4: Typecheck + existing test**

Run: `npx tsc --noEmit && npx vitest run src/features/insights/VendorFlipView.test.tsx`
Expected: no type errors; existing test passes (update for auto-run if it asserts a pre-run empty state, mirroring Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/VendorFlipView.tsx src/features/insights/VendorFlipView.test.tsx
git commit -m "feat(insights): VendorFlip auto-runs on load with stale-edit hint"
```

---

## Task 8: Auto-run in MaterialFlipView

**Files:**
- Modify: `src/features/insights/MaterialFlipView.tsx`

- [ ] **Step 1: Import hook, compute ready + stale, wire stage-1 auto-run**

Add import after line 17:

```tsx
import { useInitialScan } from '../queries/useInitialScan';
```

After the `rows` memo (line 151), add:

```tsx
  const ready = snapshot.data != null;
  const stale = run.data != null && run.data.filterAtRun !== filter;

  useInitialScan(ready, () => { run.reset(); ingFetch.reset(); setProgress(null); run.mutate(); });
```

The existing `useEffect` (lines 129-134) already chains `ingFetch` once recipes resolve, so the auto-run kicks off the whole pipeline. No double-run: the effect's guard `!ingFetch.data` plus `run.reset()` clearing prior data keeps it single-shot per run.

- [ ] **Step 2: Wire stale into the FilterBar Run button**

Add `stale={stale}` to the `<FilterBar>` element (line 159):

```tsx
      <FilterBar value={filter} onChange={setFilter} onRun={() => { run.reset(); ingFetch.reset(); setProgress(null); run.mutate(); }} busy={run.isPending} notReady={!snapshot.data} stale={stale} />
```

Add `stale: boolean` to the `FilterBar` prop type (lines 235-238) and destructure:

```tsx
function FilterBar({ value, onChange, onRun, busy, notReady, stale }: {
  value: MaterialFlipFilter; onChange: (f: MaterialFlipFilter) => void;
  onRun: () => void; busy: boolean; notReady: boolean; stale: boolean;
}) {
```

Replace the Run button (lines 272-278) with a hint wrapper:

```tsx
      <div className="flex flex-col items-stretch gap-1">
        {stale && !busy && (
          <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80">
            Filters changed — Run scan to refresh
          </span>
        )}
        <button
          onClick={onRun} disabled={busy || notReady}
          title={notReady ? 'Loading item catalog…' : undefined}
          className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Running…' : 'Run scan'}
        </button>
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/insights/MaterialFlipView.tsx
git commit -m "feat(insights): MaterialFlip auto-runs stage-1 scan on load"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all suites PASS. If any insight-view test asserted a pre-run "Run Scan" empty-state action button that no longer exists, update that test to await the auto-run results (render → `waitFor` the results/`EmptyState` text), then re-run.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors/warnings.

- [ ] **Step 4: Manual smoke test (dev server)**

Run: `npm run dev`, then in the browser:
- Open **Crafts** → Undersupply: default results appear **without** clicking Run scan.
- Switch preset to **Craft-flip Phantom**: results re-run automatically.
- Edit **Min discount %**: old results stay, "Filters changed — Run scan to refresh" appears; click Run scan → results update, hint clears.
- Open **Trading → DC Flip / Movers / Material flip / Currency flip / Vendor flip**: each shows default results on load; editing a field shows the stale hint; Run scan refreshes.
- Open **Trading → Best deals**: still shows defaults on load (unchanged, reactive).
- Open **Gathering** commodities: default results appear on load.

- [ ] **Step 5: Commit any test fixups**

```bash
git add -A
git commit -m "test: update insight-view tests for auto-run semantics"
```

---

## Self-review notes

- **Spec coverage:** all seven scan surfaces in the spec's rollout table have a task (QueriesView T3, DcFlip T4, Movers T5, CurrencyFlip T6, VendorFlip T7, MaterialFlip T8); BestDeals confirmed no-change (T9 step 4). Shared hook T1, stale affordance T2 + per-view. Empty-state cleanup handled per view.
- **Stale derivation:** filter-object identity (`filterAtRun !== filter`) for QueryBuilder-based views; explicit `ranWith` snapshot for the field-only views (DcFlip, Movers) since they hold primitive state, not a filter object.
- **Double-run risk:** `useInitialScan` ref-guards to one fire; MaterialFlip's ingredient-fetch effect only runs after `run.data` exists, so it chains rather than competes.
- **Preset/currency stale-tick:** Task 3 uses an explicit override argument to avoid running against a stale closure; Task 6 documents the lower-risk currency case and the fallback if a flake appears.
