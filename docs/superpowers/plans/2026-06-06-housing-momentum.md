# Restore Housing Momentum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a 7-day price Δ% ("momentum") column on `/housing`, populated on-demand by live-fetching sale history only for the rows currently visible.

**Architecture:** A pure layer (`idsToFetch`, `mergeDeltas`, `fmtDelta`) computes which ids still need history and turns fetched history into deltas. `ResultTableScaffold` gains an optional `onVisibleRows` callback so the view learns its visible slice. A thin `useHousingMomentum` hook orchestrates batched live fetches and accumulates a `Map<id, number|null>`. `HousingMarketView` renders a display-only 7d Δ column from that map.

**Tech Stack:** React + TypeScript, @tanstack/react-query (already used by the view), Vitest + @testing-library/react, the existing `fetchHistoryWithin` / `computeWeekDelta` history utilities.

**Branch:** Already on `feature/housing-momentum` (off `main`). The spec is at `docs/superpowers/specs/2026-06-06-housing-momentum-design.md`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/features/housing/spikeSignal.ts` (modify) | Add pure `idsToFetch`, `mergeDeltas`, `fmtDelta`. |
| `src/features/housing/spikeSignal.test.ts` (modify) | Tests for the three new pure helpers. |
| `src/features/queries/ResultTableScaffold.tsx` (modify) | Add optional `onVisibleRows` prop, fired via effect. |
| `src/features/queries/ResultTableScaffold.test.tsx` (create) | Test that `onVisibleRows` fires with the visible slice. |
| `src/features/housing/useHousingMomentum.ts` (create) | Hook: batched live history fetch → accumulating delta map. |
| `src/features/housing/useHousingMomentum.test.tsx` (create) | Hook test with a mocked `fetchHistoryWithin`. |
| `src/features/housing/HousingMarketView.tsx` (modify) | Track visible ids, call the hook, render the 7d Δ column. |

---

## Task 1: Pure helpers — `idsToFetch`, `mergeDeltas`, `fmtDelta`

**Files:**
- Modify: `src/features/housing/spikeSignal.ts`
- Test: `src/features/housing/spikeSignal.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this `describe` block to `src/features/housing/spikeSignal.test.ts` (after the existing `sortHousingRows` block). Also add `idsToFetch, mergeDeltas, fmtDelta` to the existing import from `./spikeSignal` at the top of the file.

```ts
describe('idsToFetch', () => {
  it('returns visible ids not present as keys in the cache', () => {
    const cache = new Map<number, number | null>([[1, 5], [2, null]]);
    expect(idsToFetch([1, 2, 3, 4], cache)).toEqual([3, 4]);
  });
  it('dedupes and returns empty when all are cached', () => {
    const cache = new Map<number, number | null>([[1, 5]]);
    expect(idsToFetch([1, 1], cache)).toEqual([]);
  });
  it('treats a cached null (insufficient history) as already fetched', () => {
    const cache = new Map<number, number | null>([[7, null]]);
    expect(idsToFetch([7], cache)).toEqual([]);
  });
});

describe('mergeDeltas', () => {
  const DAY = 86_400_000;
  const NOW = 1_000 * DAY;
  // recent week avg 120, prior week avg 100 -> +20%
  const entries = [
    { pricePerUnit: 120, quantity: 1, timestamp: (NOW - 2 * DAY) / 1000, hq: false },
    { pricePerUnit: 100, quantity: 1, timestamp: (NOW - 9 * DAY) / 1000, hq: false },
  ];
  it('computes a delta for each requested id and null when no history', () => {
    const history = new Map([[1, entries]]);
    const out = mergeDeltas(new Map(), [1, 2], history, NOW);
    expect(out.get(1)).toBeCloseTo(20, 5);
    expect(out.get(2)).toBeNull(); // requested but no history -> resolved null, not left absent
  });
  it('preserves prior cache entries', () => {
    const out = mergeDeltas(new Map([[9, 3]]), [1], new Map(), NOW);
    expect(out.get(9)).toBe(3);
    expect(out.get(1)).toBeNull();
  });
});

describe('fmtDelta', () => {
  it('prefixes a + for gains and rounds to whole percent', () => {
    expect(fmtDelta(12.4)).toBe('+12%');
  });
  it('keeps the minus for losses', () => {
    expect(fmtDelta(-8.6)).toBe('-9%');
  });
  it('shows 0% without a sign', () => {
    expect(fmtDelta(0)).toBe('0%');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/housing/spikeSignal.test.ts`
Expected: FAIL — `idsToFetch`, `mergeDeltas`, `fmtDelta` are not exported.

- [ ] **Step 3: Implement the helpers**

In `src/features/housing/spikeSignal.ts`, append these exports (the file already imports `HistoryEntry` and `computeWeekDelta` from `../../lib/universalisHistory`):

```ts
/**
 * Of the visible ids, the unique ones not yet present in the momentum cache.
 * A cached value of `null` (fetched but insufficient history) counts as already
 * fetched, so we never re-request it.
 */
export function idsToFetch(visibleIds: number[], cache: Map<number, unknown>): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of visibleIds) {
    if (seen.has(id) || cache.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Fold freshly-fetched history into the momentum cache: every requested id gets
 * a value (its 7-day delta, or `null` when a week had no sales), so requested-
 * but-history-less ids resolve to `null` rather than staying absent (which would
 * make idsToFetch request them forever). Prior cache entries are preserved.
 */
export function mergeDeltas(
  cache: Map<number, number | null>,
  requestedIds: number[],
  history: Map<number, HistoryEntry[]>,
  nowMs: number,
): Map<number, number | null> {
  const next = new Map(cache);
  for (const id of requestedIds) {
    next.set(id, computeWeekDelta(history.get(id) ?? [], nowMs));
  }
  return next;
}

/** Format a 7-day delta percent as a signed whole-percent string ("+12%", "-9%", "0%"). */
export function fmtDelta(pct: number): string {
  const rounded = Math.round(pct);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/housing/spikeSignal.test.ts`
Expected: PASS (existing tests + the new `idsToFetch`/`mergeDeltas`/`fmtDelta` cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/housing/spikeSignal.ts src/features/housing/spikeSignal.test.ts
git commit -m "feat(housing): pure momentum helpers (idsToFetch, mergeDeltas, fmtDelta)"
```

---

## Task 2: `ResultTableScaffold` — optional `onVisibleRows`

**Files:**
- Modify: `src/features/queries/ResultTableScaffold.tsx`
- Test: `src/features/queries/ResultTableScaffold.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/queries/ResultTableScaffold.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ResultTableScaffold } from './ResultTableScaffold';

interface Row { id: number }

function renderScaffold(rows: Row[], onVisibleRows: (v: Row[]) => void) {
  return render(
    <ResultTableScaffold<Row>
      rows={rows}
      totalCandidates={rows.length}
      skippedChunks={0}
      emptyState={<div>empty</div>}
      onVisibleRows={onVisibleRows}
      renderTable={(visible) => <table><tbody>{visible.map((r) => <tr key={r.id}><td>{r.id}</td></tr>)}</tbody></table>}
    />,
  );
}

describe('ResultTableScaffold onVisibleRows', () => {
  it('fires with the visible slice on mount', () => {
    const spy = vi.fn();
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    renderScaffold(rows, spy);
    expect(spy).toHaveBeenCalled();
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0] as Row[];
    expect(lastCall.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('does not throw when onVisibleRows is omitted', () => {
    expect(() =>
      render(
        <ResultTableScaffold<Row>
          rows={[{ id: 1 }]}
          totalCandidates={1}
          skippedChunks={0}
          emptyState={<div>empty</div>}
          renderTable={(visible) => <div>{visible.length}</div>}
        />,
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/queries/ResultTableScaffold.test.tsx`
Expected: FAIL — `onVisibleRows` is not an accepted prop / not invoked.

- [ ] **Step 3: Implement the prop**

In `src/features/queries/ResultTableScaffold.tsx`:

3a. Add `useEffect` to the React import. The file currently starts with `import type { ReactNode } from 'react';` — add a value import beneath it:

```ts
import { useEffect } from 'react';
```

3b. Add the prop to the `Props<T>` interface (next to the other optional props):

```ts
  /** Fires with the currently-visible (paginated) rows whenever that slice
   *  changes — lets a parent enrich just the rows on screen. */
  onVisibleRows?: (visible: T[]) => void;
```

3c. Destructure it in the component signature:

```ts
export function ResultTableScaffold<T extends { id: number }>({
  rows, totalCandidates, skippedChunks, emptyState, renderTable, renderMobile, csvColumns, csvFilename, onVisibleRows,
}: Props<T>) {
```

3d. Immediately after `const lm = useLoadMore(rows, 25);` (and BEFORE the `if (rows.length === 0)` early return, to keep hook order stable), add:

```ts
  const visibleSig = lm.visible.map((r) => r.id).join(',');
  useEffect(() => {
    onVisibleRows?.(lm.visible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSig]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/queries/ResultTableScaffold.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify no other scaffold consumer broke**

Run: `npx vitest run src/features/queries src/features/insights`
Expected: PASS (existing result-table views still green).

- [ ] **Step 6: Commit**

```bash
git add src/features/queries/ResultTableScaffold.tsx src/features/queries/ResultTableScaffold.test.tsx
git commit -m "feat(scaffold): optional onVisibleRows callback for per-visible enrichment"
```

---

## Task 3: `useHousingMomentum` hook

**Files:**
- Create: `src/features/housing/useHousingMomentum.ts`
- Test: `src/features/housing/useHousingMomentum.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/housing/useHousingMomentum.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHousingMomentum } from './useHousingMomentum';
import { fetchHistoryWithin } from '../../lib/universalisHistory';

// Mock only fetchHistoryWithin; keep computeWeekDelta real (mergeDeltas uses it).
vi.mock('../../lib/universalisHistory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/universalisHistory')>();
  return { ...actual, fetchHistoryWithin: vi.fn() };
});

describe('useHousingMomentum', () => {
  beforeEach(() => { (fetchHistoryWithin as Mock).mockReset(); });

  it('fetches history for visible ids and resolves them in the map', async () => {
    (fetchHistoryWithin as Mock).mockResolvedValue(new Map()); // no entries -> deltas resolve to null
    const { result } = renderHook(() =>
      useHousingMomentum('Phantom', 'Phantom:furnishings', [1, 2]),
    );
    await waitFor(() => {
      expect(result.current.get(1)).toBeNull();
      expect(result.current.get(2)).toBeNull();
    });
    expect(fetchHistoryWithin).toHaveBeenCalledWith('Phantom', [1, 2], 14 * 86400);
  });

  it('does not refetch ids already in the map', async () => {
    (fetchHistoryWithin as Mock).mockResolvedValue(new Map());
    const { result, rerender } = renderHook(
      ({ ids }) => useHousingMomentum('Phantom', 'Phantom:furnishings', ids),
      { initialProps: { ids: [1] } },
    );
    await waitFor(() => expect(result.current.get(1)).toBeNull());
    rerender({ ids: [1] });
    await waitFor(() => expect((fetchHistoryWithin as Mock).mock.calls.length).toBe(1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/housing/useHousingMomentum.test.tsx`
Expected: FAIL — `Failed to resolve import './useHousingMomentum'`.

- [ ] **Step 3: Implement the hook**

Create `src/features/housing/useHousingMomentum.ts`:

```ts
import { useEffect, useState } from 'react';
import { chunkIds } from '../../lib/universalisBulk';
import { fetchHistoryWithin } from '../../lib/universalisHistory';
import { idsToFetch, mergeDeltas } from './spikeSignal';

const FOURTEEN_DAYS_SECONDS = 14 * 86400;

/**
 * On-demand 7-day price momentum for housing rows. Given the ids currently
 * visible in the table, live-fetches their sale history (batched, home world)
 * and accumulates a `Map<id, number | null>` of 7-day deltas — `number` = delta%,
 * `null` = fetched but insufficient history, absent = still pending. The map
 * resets whenever `scanKey` (e.g. `world:tab`) changes.
 *
 * History is live-only (not in the bot cache); fetching just the visible window
 * keeps the per-page cost to ~one request.
 */
export function useHousingMomentum(
  world: string,
  scanKey: string,
  visibleIds: number[],
): Map<number, number | null> {
  const [cache, setCache] = useState<Map<number, number | null>>(() => new Map());

  // Reset the accumulated deltas when the scope/tab changes.
  useEffect(() => {
    setCache(new Map());
  }, [scanKey]);

  const signature = visibleIds.join(',');
  useEffect(() => {
    const missing = idsToFetch(visibleIds, cache);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const chunk of chunkIds(missing, 100)) {
        const history = await fetchHistoryWithin(world, chunk, FOURTEEN_DAYS_SECONDS);
        if (cancelled) return;
        setCache((prev) => mergeDeltas(prev, chunk, history, Date.now()));
      }
    })();
    return () => { cancelled = true; };
    // `cache` is intentionally excluded: re-running on every setCache would loop.
    // A changed `signature` (load-more / new rows) or `scanKey` re-triggers with
    // the latest cache from the render closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, world, scanKey]);

  return cache;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/housing/useHousingMomentum.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/housing/useHousingMomentum.ts src/features/housing/useHousingMomentum.test.tsx
git commit -m "feat(housing): useHousingMomentum — on-demand 7d delta for visible rows"
```

---

## Task 4: Wire the 7d Δ column into `HousingMarketView`

**Files:**
- Modify: `src/features/housing/HousingMarketView.tsx`

No new automated test (the view composes already-tested units behind data fetching, like the other insight views). Verified by tsc + the full suite + manual smoke.

- [ ] **Step 1: Add imports**

At the top of `src/features/housing/HousingMarketView.tsx`:

4a. Add `useState` is already imported (`import { useMemo, useState } from 'react';`) — leave as is.

4b. Extend the `spikeSignal` import to include `fmtDelta`. The current line is:

```ts
import { buildHousingRow, housingMaterialCost, collectRecipeIngredientIds, sortHousingRows, type HousingRow, type HousingSortKey } from './spikeSignal';
```

Replace with:

```ts
import { buildHousingRow, housingMaterialCost, collectRecipeIngredientIds, sortHousingRows, fmtDelta, type HousingRow, type HousingSortKey } from './spikeSignal';
```

4c. Add the hook import beneath the other `./` imports:

```ts
import { useHousingMomentum } from './useHousingMomentum';
```

- [ ] **Step 2: Track visible ids and call the hook**

Inside `HousingMarketView`, after the existing `const [sortKey, setSortKey] = useState<HousingSortKey>('craftGilPerDay');` line, add:

```ts
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
```

Then, after the `rows` `useMemo` (the block that ends with `return sortHousingRows(built, sortKey);` and its `}, [...]);`), add:

```ts
  const momentum = useHousingMomentum(world, `${world}:${tab}`, visibleIds);
```

- [ ] **Step 3: Pass `onVisibleRows` to the scaffold**

In the `<ResultTableScaffold<HousingRow>` element, add the prop alongside `rows`/`totalCandidates`/`skippedChunks`:

```tsx
          onVisibleRows={(vis) => setVisibleIds(vis.map((r) => r.id))}
```

- [ ] **Step 4: Add the 7d Δ header and cell**

4a. In the `<thead>` row, add a header after the Sales/day header. The current header row is:

```tsx
                  <th className="px-3 py-2">Item</th>
                  <SortableHeader active={sortKey === 'price'} onClick={() => setSortKey('price')}>Price</SortableHeader>
                  <SortableHeader active={sortKey === 'velocity'} onClick={() => setSortKey('velocity')}>Sales/day</SortableHeader>
                  <SortableHeader active={sortKey === 'craftMargin'} onClick={() => setSortKey('craftMargin')}>Craft margin</SortableHeader>
                  <SortableHeader active={sortKey === 'craftGilPerDay'} onClick={() => setSortKey('craftGilPerDay')}>Gil/day</SortableHeader>
```

Insert a plain (non-sortable) header after the Sales/day line:

```tsx
                  <th className="px-3 py-2 text-right text-text-low">7d Δ</th>
```

4b. In the `<tbody>` row, add a cell after the Sales/day cell. The current row cells are:

```tsx
                    <td className="px-3 py-2"><ItemNameLinks id={r.id} name={r.name} /></td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.price != null ? fmtGil(r.price) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.velocity.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.craftMargin != null ? fmtGil(r.craftMargin) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gold">{r.craftGilPerDay != null ? fmtGil(r.craftGilPerDay) : '—'}</td>
```

Insert a momentum cell after the Sales/day (`r.velocity`) cell:

```tsx
                    <td className="px-3 py-2 text-right font-mono tabular-nums"><MomentumCell value={momentum.get(r.id)} /></td>
```

- [ ] **Step 5: Add the `MomentumCell` component**

At the bottom of the file (next to the existing `SortableHeader` function), add:

```tsx
function MomentumCell({ value }: { value: number | null | undefined }) {
  if (value === undefined) return <span className="text-text-low">…</span>;
  if (value === null) return <span className="text-text-low">—</span>;
  const cls = value > 0 ? 'text-jade' : value < 0 ? 'text-crimson' : 'text-text-dim';
  return <span className={cls}>{fmtDelta(value)}</span>;
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/housing/HousingMarketView.tsx
git commit -m "feat(housing): on-demand 7d Δ momentum column"
```

---

## Task 5: Full verification

- [ ] **Step 1: Typecheck, full suite, build**

Run: `npx tsc --noEmit`
Expected: zero errors.

Run: `npx vitest run`
Expected: all pass, including the new `idsToFetch`/`mergeDeltas`/`fmtDelta`, `ResultTableScaffold`, and `useHousingMomentum` tests.

Run: `npm run build`
Expected: success.

- [ ] **Step 2: Manual smoke (optional, if running the app)**

Run: `npm run dev`, open `/housing`:
1. The **7d Δ** column appears after Sales/day; cells show `…` then resolve to `+N%` (jade) / `−N%` (crimson) / `—` (insufficient history) for the visible rows.
2. Clicking **Load more** fills momentum for the newly-shown rows.
3. Switching tabs resets and refills momentum for the new tab's visible rows.

- [ ] **Step 3: Discard any regenerated build artifacts**

If `npm run build` regenerated `api/*.mjs`, discard them (unrelated to this feature): `git checkout -- api/`.

---

## Self-Review

**Spec coverage:**
- 7d Δ column, on-demand for visible rows — Tasks 2–4. ✓
- `onVisibleRows` on the scaffold — Task 2. ✓
- `useHousingMomentum` with batched live fetch + accumulating map + reset on `scanKey` — Task 3. ✓
- Pure `idsToFetch` / `mergeDeltas` / `fmtDelta` — Task 1. ✓
- Display-only (no momentum sort key wired) — Task 4 adds a plain `<th>`, not a `SortableHeader`. ✓
- Soft errors (history failure → `null` → `—`) — `fetchHistoryWithin` already swallows errors; `mergeDeltas` resolves history-less ids to `null`. ✓

**Type consistency:** `useHousingMomentum(world, scanKey, visibleIds): Map<number, number | null>` matches the call in Task 4 and the test in Task 3. `idsToFetch(visibleIds, cache)` / `mergeDeltas(cache, requestedIds, history, nowMs)` / `fmtDelta(pct)` signatures match across Tasks 1, 3, 4. `onVisibleRows?: (visible: T[]) => void` matches the Task 4 usage `(vis) => setVisibleIds(vis.map((r) => r.id))`.

**Placeholder scan:** No TBD/TODO; every step has complete, copy-pasteable code and exact commands.
