# Vendor Flip Refresh Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Vendor Flip "Refresh prices" action clear feedback — a freshness stamp, a 60s cooldown lock with countdown, an opt-in auto-refresh — and stop blanking the table mid-refresh.

**Architecture:** A new `VendorRefreshControl` component encapsulates the refresh button, cooldown/now timers, freshness stamp, and Auto toggle (mirroring the item page's `LiveRefreshBar`). `VendorFlipView` tracks `lastRefreshTs`, drops `run.reset()` so results stay visible during a refresh, shows the full Spinner only on first load, and moves the action out of `FilterBar` into the new control.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react (`vi.useFakeTimers()` for the timer tests).

**Run a single test file:** `npx vitest run <path>`

---

## Reference facts (read before starting)

- Pattern to mirror: `src/features/items/LiveRefreshBar.tsx` — `COOLDOWN_MS = 60_000`,
  `AUTO_INTERVAL_MS = 5 * 60_000`, a `now` ticker via `setInterval(…, 500)` active only
  while busy/cooldown, an `onRefreshedRef` to keep the auto-interval identity stable.
- `src/components/FreshnessChip.tsx` exports `FreshnessChip({ ts, now })` → renders
  "Fresh · just now" / "OK · 12m ago" / "Stale · 1h ago".
- `src/components/Spinner.tsx` exports both `Spinner` and `SpinGlyph`.
- `Date.now()` is allowed in component code (this is not a workflow script).

---

## File Structure

- **Create:** `src/features/insights/VendorRefreshControl.tsx` — the refresh control.
- **Create:** `src/features/insights/VendorRefreshControl.test.tsx` — timer/cooldown tests.
- **Modify:** `src/features/insights/VendorFlipView.tsx` — track `lastRefreshTs`, relocate the action, gate the Spinner.
- **Modify:** `src/features/insights/VendorFlipView.test.tsx` — adjust for the relocated control + auto-load.

---

## Task 1: `VendorRefreshControl` component

**Files:**
- Create: `src/features/insights/VendorRefreshControl.tsx`
- Create: `src/features/insights/VendorRefreshControl.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/features/insights/VendorRefreshControl.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { VendorRefreshControl } from './VendorRefreshControl';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('VendorRefreshControl', () => {
  it('calls onRefresh when the button is clicked', () => {
    const onRefresh = vi.fn();
    render(<VendorRefreshControl onRefresh={onRefresh} busy={false} notReady={false} lastRefreshTs={null} />);
    fireEvent.click(screen.getByRole('button', { name: /refresh prices/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows Refreshing… and disables the button while busy', () => {
    render(<VendorRefreshControl onRefresh={vi.fn()} busy={true} notReady={false} lastRefreshTs={null} />);
    expect(screen.getByRole('button', { name: /refreshing/i })).toBeDisabled();
  });

  it('disables the button when notReady', () => {
    render(<VendorRefreshControl onRefresh={vi.fn()} busy={false} notReady={true} lastRefreshTs={null} />);
    expect(screen.getByRole('button', { name: /refresh prices/i })).toBeDisabled();
  });

  it('renders a freshness stamp once a refresh has happened', () => {
    render(<VendorRefreshControl onRefresh={vi.fn()} busy={false} notReady={false} lastRefreshTs={0} />);
    expect(screen.getByText(/just now/i)).toBeInTheDocument();
  });

  it('locks with a countdown after a refresh, then re-enables', () => {
    render(<VendorRefreshControl onRefresh={vi.fn()} busy={false} notReady={false} lastRefreshTs={0} />);
    expect(screen.getByRole('button', { name: /wait/i })).toBeDisabled();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole('button', { name: /refresh prices/i })).toBeEnabled();
  });

  it('fires an immediate refresh when Auto is enabled and not on cooldown', () => {
    const onRefresh = vi.fn();
    render(<VendorRefreshControl onRefresh={onRefresh} busy={false} notReady={false} lastRefreshTs={null} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/insights/VendorRefreshControl.test.tsx`
Expected: FAIL — module `./VendorRefreshControl` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/features/insights/VendorRefreshControl.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { FreshnessChip } from '../../components/FreshnessChip';
import { SpinGlyph } from '../../components/Spinner';

/** Re-clicks (and the auto pull) are blocked for this long after a refresh. */
const COOLDOWN_MS = 60_000;
/** Opt-in auto-refresh cadence — long enough that it never trips the cooldown. */
const AUTO_INTERVAL_MS = 5 * 60_000;

interface Props {
  /** Trigger the bulk price re-fetch. */
  onRefresh: () => void;
  /** A refresh is in flight. */
  busy: boolean;
  /** Catalog not loaded yet. */
  notReady: boolean;
  /** When the last successful refresh completed (ms epoch), or null if never. */
  lastRefreshTs: number | null;
}

/**
 * Bulk "refresh prices" control for the Vendor Flip view. Re-pulls live
 * marketboard prices for the whole candidate set, throttled by a cooldown so it
 * can't be hammered, with a freshness stamp and an opt-in slow auto-refresh.
 * Mirrors the per-item LiveRefreshBar idiom.
 */
export function VendorRefreshControl({ onRefresh, busy, notReady, lastRefreshTs }: Props) {
  const [auto, setAuto] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const cooldownLeft = lastRefreshTs ? Math.max(0, COOLDOWN_MS - (now - lastRefreshTs)) : 0;
  const onCooldown = cooldownLeft > 0;

  // Keep the latest props in refs so the auto interval's identity stays stable.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const lastRefreshTsRef = useRef(lastRefreshTs);
  lastRefreshTsRef.current = lastRefreshTs;

  // Tick the "now" clock only while a countdown or fetch is in flight.
  useEffect(() => {
    if (!onCooldown && !busy) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [onCooldown, busy]);

  // Opt-in auto-refresh: one immediate pull on enable (unless still cooling), then
  // every AUTO_INTERVAL_MS. Refs keep this effect from re-running each render.
  useEffect(() => {
    if (!auto) return;
    const ts = lastRefreshTsRef.current;
    const cooling = ts != null && Date.now() - ts < COOLDOWN_MS;
    if (!cooling) onRefreshRef.current();
    const t = setInterval(() => onRefreshRef.current(), AUTO_INTERVAL_MS);
    return () => clearInterval(t);
  }, [auto]);

  const disabled = busy || onCooldown || notReady;
  const label = onCooldown ? `Wait ${Math.ceil(cooldownLeft / 1000)}s` : '↻ Refresh prices';

  return (
    <div className="flex items-center justify-end gap-3 flex-wrap font-mono text-[10px] tracking-widest uppercase text-text-low">
      {lastRefreshTs != null && <FreshnessChip ts={lastRefreshTs} now={now} />}

      <label className="flex items-center gap-1.5 cursor-pointer select-none hover:text-text-cream transition-colors">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => setAuto(e.target.checked)}
          className="accent-gold"
        />
        Auto
      </label>

      <button
        type="button"
        onClick={onRefresh}
        disabled={disabled}
        title={notReady ? 'Loading vendor catalog…' : 'Re-fetch live market prices from Universalis'}
        className="inline-flex items-center gap-1 font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {busy ? <>Refreshing…<SpinGlyph /></> : label}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/insights/VendorRefreshControl.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/VendorRefreshControl.tsx src/features/insights/VendorRefreshControl.test.tsx
git commit -m "feat(vendor-flip): VendorRefreshControl — cooldown lock, freshness, auto"
```

---

## Task 2: Wire the control into `VendorFlipView`

**Files:**
- Modify: `src/features/insights/VendorFlipView.tsx`
- Modify: `src/features/insights/VendorFlipView.test.tsx`

- [ ] **Step 1: Update the view's tests**

In `src/features/insights/VendorFlipView.test.tsx`:

(a) Replace the test `'runs the scan, fetches home-world prices, and renders rows'` (it
clicked the button, which is now cooldown-gated after the auto-load) with an auto-load
assertion that needs no click:

```tsx
  it('auto-scans on load, fetches home-world prices, and renders rows', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Widget')).toBeInTheDocument();
      expect(screen.getByText('Gizmo')).toBeInTheDocument();
    });
    expect(fetchMarketDataMock).toHaveBeenCalledWith('Phantom', expect.arrayContaining([100, 200]));
  });
```

(b) The test `'renders the filter strip + initial idle state with candidate count'` keeps
asserting a `/refresh prices/i` button (now in the control) and `2 candidate items`; leave
it as-is. The three other tests (`renders the category filter control`,
`updates results live when Min profit is raised — no refetch`,
`applies a group chip live without refetching`, `does not render a Vendors button`) are
unaffected — leave them as-is.

- [ ] **Step 2: Run the view tests to confirm the new one is consistent**

Run: `npx vitest run src/features/insights/VendorFlipView.test.tsx`
Expected: the replaced test passes against current behavior (auto-load already renders
rows); the rest still pass. (If any fail, it is only because the wiring in later steps is
not done yet — proceed; they must all pass after Step 6.)

- [ ] **Step 3: Track `lastRefreshTs` and stop blanking on refresh**

In `src/features/insights/VendorFlipView.tsx`:

Add the import (top of file, with the other component imports):

```tsx
import { VendorRefreshControl } from './VendorRefreshControl';
```

Add state next to the other `useState` calls:

```tsx
  const [lastRefreshTs, setLastRefreshTs] = useState<number | null>(null);
```

Add an `onSuccess` to the `run` mutation that stamps the time:

```tsx
  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data || !vendors.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        scanIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: sale.data, skipped: sale.errors.length };
    },
    onSuccess: () => setLastRefreshTs(Date.now()),
  });
```

Change the initial scan to not reset (so a re-trigger never blanks the table):

```tsx
  useInitialScan(ready, () => { run.mutate(); });
```

- [ ] **Step 4: Gate the full Spinner to first load only**

In `src/features/insights/VendorFlipView.tsx`, change the Spinner line so it shows only
when there's no data yet:

```tsx
      {run.isPending && !run.data && <Spinner label={`Fetching ${world} prices for ${scanIds.length} items…`} />}
```

- [ ] **Step 5: Relocate the action — status row + control; strip the button from `FilterBar`**

In `src/features/insights/VendorFlipView.tsx`, replace the status-count `<div>` with a row
that pairs the count and the control:

```tsx
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-mono text-[10px] text-text-low">
          {vendors.isLoading
            ? 'Loading vendor catalog…'
            : `${scanIds.length.toLocaleString()} candidate items`}
          {run.data && <> · {rows.length.toLocaleString()} results</>}
        </div>
        <VendorRefreshControl
          onRefresh={() => run.mutate()}
          busy={run.isPending}
          notReady={!snapshot.data || !vendors.data}
          lastRefreshTs={lastRefreshTs}
        />
      </div>
```

Change the `<FilterBar>` usage to drop `onRun`/`busy`/`notReady`:

```tsx
      <FilterBar value={filter} onChange={setFilter} />
```

Change the `FilterBar` function signature to:

```tsx
function FilterBar({ value, onChange }: {
  value: VendorFlipFilter;
  onChange: (f: VendorFlipFilter) => void;
}) {
```

Delete the entire button-group block at the end of `FilterBar` (the
`<div className="flex gap-2 w-full sm:w-auto sm:ml-auto order-last"> ... </div>` containing
the "Refresh prices" button).

Remove the now-unused `SpinGlyph` from the Spinner import in this file (the control owns
its own copy):

```tsx
import { Spinner } from '../../components/Spinner';
```

- [ ] **Step 6: Run the view tests to verify they pass**

Run: `npx vitest run src/features/insights/VendorFlipView.test.tsx`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/insights/VendorFlipView.tsx src/features/insights/VendorFlipView.test.tsx
git commit -m "feat(vendor-flip): wire VendorRefreshControl; keep table visible on refresh"
```

---

## Task 3: Typecheck and full test sweep

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirm `SpinGlyph` is no longer referenced in `VendorFlipView.tsx`,
and `FilterBar` no longer references `onRun`/`busy`/`notReady`.)

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 3: Final commit (only if Steps 1-2 required fixes; otherwise skip)**

```bash
git add -A
git commit -m "chore(vendor-flip): typecheck + test sweep for refresh control"
```

---

## Self-Review notes

- **Spec coverage:** `VendorRefreshControl` (cooldown/now/auto/freshness/button states) →
  Task 1; `lastRefreshTs` via `onSuccess` → Task 2 Step 3; stop blanking (no `run.reset()`)
  → Task 2 Step 3; Spinner first-load-only → Task 2 Step 4; relocate action + strip
  `FilterBar` button → Task 2 Step 5; existing error banner untouched → preserved. Tests →
  Tasks 1 & 2.
- **No placeholders:** every step shows exact code/commands.
- **Type consistency:** `VendorRefreshControl` `Props` (`onRefresh`, `busy`, `notReady`,
  `lastRefreshTs`) match the call site in Task 2 Step 5. `FilterBar` signature reduced to
  `{ value, onChange }` and the call site matches. `SpinGlyph` import removed from the view
  (still imported inside the control). `useInitialScan` still receives a `() => void`.
- **Timer-test note:** the control's `now` ticker runs only while busy/cooldown; the view
  tests don't fake timers, but the mutation resolves in a microtask so `waitFor` settles
  before the 500ms tick — no flakiness expected.
