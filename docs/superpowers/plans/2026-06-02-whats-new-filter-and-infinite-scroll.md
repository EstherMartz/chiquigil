# What's New Filter + Infinite Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an item-type (category) filter to the What's New page, and make results tables auto-load on scroll (infinite scroll) across all insight pages.

**Architecture:** The category filter adds a `categories: number[]` field to `WhatsNewFilter`, filtered in the pure `runWhatsNew` builder and driven by the existing `CategorySelect` populated only with categories present in the current tab. Infinite scroll is added to the shared `LoadMoreFooter` via an `IntersectionObserver` sentinel (with a manual-button fallback when the observer is unavailable, which is also what jsdom test environments hit), so every `ResultTableScaffold` consumer benefits with no per-page changes.

**Tech Stack:** React 18 + TypeScript, @tanstack/react-query, vitest + @testing-library/react.

---

## File Structure

- `src/features/queries/types.ts` — add `categories` to `WhatsNewFilter`.
- `src/features/queries/runWhatsNew.ts` — apply the category filter.
- `src/features/queries/runWhatsNew.test.ts` — category-filter test.
- `src/features/insights/WhatsNewView.tsx` — derive present categories, render `CategorySelect`, reset on tab change.
- `src/components/LoadMoreFooter.tsx` — IntersectionObserver auto-load + fallback button.
- `src/components/LoadMoreFooter.test.tsx` — new test file (observer + fallback).

---

## Task 1: Category filter in types + runWhatsNew

**Files:**
- Modify: `src/features/queries/types.ts`
- Modify: `src/features/queries/runWhatsNew.ts`
- Test: `src/features/queries/runWhatsNew.test.ts`

- [ ] **Step 1: Add `categories` to the filter type + default**

In `src/features/queries/types.ts`, update the `WhatsNewFilter` interface and `defaultWhatsNewFilter`:

```ts
export interface WhatsNewFilter {
  tab: WhatsNewTab;
  tradeableOnly: boolean;
  minVelocity: number;
  categories: number[];
  sort: WhatsNewSort;
  limit: number;
}

export function defaultWhatsNewFilter(): WhatsNewFilter {
  return { tab: 'items', tradeableOnly: true, minVelocity: 0, categories: [], sort: 'velocity', limit: 200 };
}
```

- [ ] **Step 2: Write the failing test**

Append a test to `src/features/queries/runWhatsNew.test.ts` (inside the existing `describe('runWhatsNew', …)` block, after the last `it`):

```ts
  it('filters to the selected item-search-categories', () => {
    const catItems = new Map<number, SnapshotItem>([
      [1, { id: 1, name: 'Alpha', sc: 7, ui: 1, ilvl: 1, canHq: true }],
      [2, { id: 2, name: 'Beta', sc: 56, ui: 1, ilvl: 1, canHq: true }],
    ]);
    const catData: MarketData = {
      1: market({ velocity: 5, medianNQ: 200, recentSalesNQ: 4 }),
      2: market({ velocity: 4, medianNQ: 100, recentSalesNQ: 4 }),
    };
    const filter = { ...defaultWhatsNewFilter(), categories: [56] };
    const rows = runWhatsNew([1, 2], catItems, catData, new Set<number>(), filter, NOW);
    expect(rows.map((r) => r.id)).toEqual([2]); // only sc=56 kept
  });

  it('shows all categories when none are selected', () => {
    const catItems = new Map<number, SnapshotItem>([
      [1, { id: 1, name: 'Alpha', sc: 7, ui: 1, ilvl: 1, canHq: true }],
      [2, { id: 2, name: 'Beta', sc: 56, ui: 1, ilvl: 1, canHq: true }],
    ]);
    const catData: MarketData = {
      1: market({ velocity: 5 }),
      2: market({ velocity: 4 }),
    };
    const rows = runWhatsNew([1, 2], catItems, catData, new Set<number>(), defaultWhatsNewFilter(), NOW);
    expect(rows.map((r) => r.id).sort()).toEqual([1, 2]);
  });
```

(The `market(...)`, `NOW`, and `defaultWhatsNewFilter` helpers/imports already exist in this test file.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/features/queries/runWhatsNew.test.ts`
Expected: FAIL — the category-filter test returns both rows (filter not yet applied).

- [ ] **Step 4: Apply the filter in `runWhatsNew`**

In `src/features/queries/runWhatsNew.ts`, inside the `for (const id of ids)` loop, immediately after the `const it = items.get(id); if (!it) continue;` line, add the category gate:

```ts
    if (filter.categories.length > 0 && !filter.categories.includes(it.sc)) continue;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/queries/runWhatsNew.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (Note: `WhatsNewView.tsx` spreads `{ ...filter, sort }` into `runWhatsNew`, so `categories` flows through automatically once added to the type and the default.)

- [ ] **Step 7: Commit**

```bash
git add src/features/queries/types.ts src/features/queries/runWhatsNew.ts src/features/queries/runWhatsNew.test.ts
git commit -m "feat(whats-new): category filter in runWhatsNew + WhatsNewFilter"
```

---

## Task 2: CategorySelect in WhatsNewView

**Files:**
- Modify: `src/features/insights/WhatsNewView.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/features/insights/WhatsNewView.tsx`, add:

```ts
import { CategorySelect } from '../../components/CategorySelect';
import { categoryLabel } from '../../lib/itemSearchCategories';
```

- [ ] **Step 2: Derive the present categories for the active tab**

In `WhatsNewView`, after the `activeIds` useMemo (around line 42), add:

```ts
  const presentCategories = useMemo(() => {
    const ids = new Set<number>();
    for (const id of activeIds) {
      const it = itemsById.get(id);
      if (it && it.sc > 0) ids.add(it.sc);
    }
    return [...ids]
      .map((id) => ({ id, name: categoryLabel(id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeIds, itemsById]);
```

- [ ] **Step 3: Reset categories when the tab changes + pass categories to the TabBar**

Change the `onTab` handler passed to `<TabBar>` (currently `onTab={(tab) => { setFilter({ ...filter, tab }); run.reset(); run.mutate(); }}`) to also clear categories, and add a `categories` prop:

```tsx
      <TabBar
        tab={filter.tab}
        onTab={(tab) => { setFilter({ ...filter, tab, categories: [] }); run.reset(); run.mutate(); }}
        filter={filter}
        onChange={setFilter}
        categories={presentCategories}
        onRun={() => { run.reset(); run.mutate(); }}
        busy={run.isPending}
        notReady={!ready}
        stale={tabStale}
      />
```

- [ ] **Step 4: Add the `categories` prop + CategorySelect to TabBar**

Update the `TabBar` function signature and render. Replace the entire `TabBar` function with:

```tsx
function TabBar({ tab, onTab, filter, onChange, categories, onRun, busy, notReady, stale }: {
  tab: WhatsNewTab; onTab: (t: WhatsNewTab) => void;
  filter: WhatsNewFilter; onChange: (f: WhatsNewFilter) => void;
  categories: { id: number; name: string }[];
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
      {categories.length > 0 && (
        <div className="flex flex-col gap-1 w-56">
          <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Item type</span>
          <CategorySelect
            categories={categories}
            selected={filter.categories}
            onChange={(ids) => onChange({ ...filter, categories: ids })}
            placeholder="All types"
          />
        </div>
      )}
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

Note: changing categories re-filters instantly (the `rows` useMemo depends on `filter`); it does NOT re-run the market fetch. The banner count stays the patch total (`activeIds.length`); the scaffold's "matches" line reflects the filtered count.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/insights/WhatsNewView.tsx
git commit -m "feat(whats-new): item-type CategorySelect filter in the TabBar"
```

---

## Task 3: Infinite scroll in LoadMoreFooter

Auto-load on scroll for every `ResultTableScaffold` consumer. Uses an `IntersectionObserver` on a sentinel; when unavailable (e.g. jsdom test env, very old browsers) it renders the existing manual button, preserving current behavior and tests.

**Files:**
- Modify: `src/components/LoadMoreFooter.tsx`
- Test: `src/components/LoadMoreFooter.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/components/LoadMoreFooter.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LoadMoreFooter } from './LoadMoreFooter';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Install a controllable IntersectionObserver stub; returns a trigger fn. */
function stubIO() {
  let cb: IntersectionObserverCallback | null = null;
  const observe = vi.fn();
  const disconnect = vi.fn();
  class IO {
    constructor(c: IntersectionObserverCallback) { cb = c; }
    observe = observe;
    disconnect = disconnect;
    unobserve = vi.fn();
    takeRecords = () => [];
    root = null;
    rootMargin = '';
    thresholds = [];
  }
  vi.stubGlobal('IntersectionObserver', IO as unknown as typeof IntersectionObserver);
  return {
    observe,
    disconnect,
    fire: (isIntersecting: boolean) =>
      act(() => { cb?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver); }),
  };
}

describe('LoadMoreFooter', () => {
  it('auto-loads when the sentinel intersects and more remain', () => {
    const io = stubIO();
    const onLoadMore = vi.fn();
    render(<LoadMoreFooter hasMore total={100} shown={25} onLoadMore={onLoadMore} />);
    expect(io.observe).toHaveBeenCalled();
    io.fire(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not auto-load when the sentinel is not intersecting', () => {
    const io = stubIO();
    const onLoadMore = vi.fn();
    render(<LoadMoreFooter hasMore total={100} shown={25} onLoadMore={onLoadMore} />);
    io.fire(false);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('shows the end-of-list message and does not observe when nothing remains', () => {
    const io = stubIO();
    render(<LoadMoreFooter hasMore={false} total={100} shown={100} onLoadMore={vi.fn()} />);
    expect(io.observe).not.toHaveBeenCalled();
    expect(screen.getByText(/end of list/i)).toBeInTheDocument();
  });

  it('falls back to a manual button when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined as unknown as typeof IntersectionObserver);
    const onLoadMore = vi.fn();
    render(<LoadMoreFooter hasMore total={100} shown={25} onLoadMore={onLoadMore} />);
    const btn = screen.getByRole('button', { name: /load more/i });
    fireEvent.click(btn);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/LoadMoreFooter.test.tsx`
Expected: FAIL — the auto-load tests fail (no observer wired yet; current footer only renders a button).

- [ ] **Step 3: Implement infinite scroll in LoadMoreFooter**

Replace the entire contents of `src/components/LoadMoreFooter.tsx` with:

```tsx
import { useEffect, useRef } from 'react';

interface Props {
  hasMore: boolean;
  total: number;
  shown: number;
  onLoadMore: () => void;
  pageSize?: number;
  /** When set, override the "no more items" empty state copy. */
  emptyLabel?: string;
}

export function LoadMoreFooter({ hasMore, total, shown, onLoadMore, pageSize = 25, emptyLabel }: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const hasObserver = typeof IntersectionObserver !== 'undefined';

  // Auto-load the next page when the sentinel scrolls into view. Re-observes on
  // each `shown` change so a sentinel that stays visible (tall viewport) keeps
  // filling until the list ends or the content overflows the viewport.
  useEffect(() => {
    if (!hasMore || !hasObserver) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) onLoadMoreRef.current(); },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, hasObserver, shown]);

  if (total === 0) return null;

  return (
    <div className="border-t border-border-base bg-bg-card py-3 px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">
        Showing {shown} of {total}
      </div>
      {hasMore ? (
        hasObserver ? (
          <div
            ref={sentinelRef}
            className="font-mono text-[10px] tracking-widest uppercase text-text-low italic"
          >
            Loading more…
          </div>
        ) : (
          <button
            onClick={onLoadMore}
            className="font-mono text-[10px] tracking-[0.3em] uppercase border border-border-base px-4 py-2 hover:border-gold hover:text-gold transition-colors text-text-dim self-start sm:self-auto"
          >
            Load more · +{Math.min(pageSize, total - shown)}
          </button>
        )
      ) : (
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low italic">
          {emptyLabel ?? 'End of list — no more items'}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/LoadMoreFooter.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/LoadMoreFooter.tsx src/components/LoadMoreFooter.test.tsx
git commit -m "feat(tables): infinite-scroll auto-load in LoadMoreFooter (button fallback)"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all pass. Pay attention to any existing test that interacts with `LoadMoreFooter`/`ResultTableScaffold` — in jsdom `IntersectionObserver` is undefined, so the footer renders the manual button exactly as before, and any test clicking "Load more" still works. If a test instead now expects auto-load, that's an environment with a stubbed observer — inspect and reconcile.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit (only if step 2/3 required fixes)**

```bash
git add -A
git commit -m "fix(whats-new): verification adjustments"
```

---

## Notes for the implementer

- **No change to `useLoadMore` or `ResultTableScaffold`** — the footer's props are unchanged; only its internal rendering/behavior changes, so all consumers (Empty Shelf, Trading, Vendor Flip, Currencies, Repost, CraftFlip, What's New, …) get infinite scroll for free.
- **Category filter is client-side** — it re-filters already-fetched rows via the `rows` useMemo; it must NOT trigger a new market fetch.
- **`CategorySelect` props:** `{ categories: {id,name}[]; selected: number[]; onChange: (ids:number[])=>void; placeholder?: string }` — already used by `QueryBuilder`.
- **`categoryLabel(id)`** returns the category name (or `SC <id>` fallback). Items with `sc===0` contribute no category and are excluded when any category is selected — expected.
