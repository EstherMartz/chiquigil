# Vendor Flip Live Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Vendor Flip filter recompute the table instantly, repurpose "Run scan" to "Refresh prices", remove the "⟳ Vendors" button, and make the category group chips always visible.

**Architecture:** Two pieces. (1) Shared `CategorySelect`: move the group chip row out of the dropdown so it's always visible. (2) `VendorFlipView`: the scan fetches the full candidate set once, and `rows` is computed from the **live** `filter` (not a frozen copy), so all filters are instant; the stale mechanism and Vendors button are removed.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react.

**Run a single test file:** `npx vitest run <path>`

---

## File Structure

- **Modify:** `src/components/CategorySelect.tsx` — render group chips above the input, ungated by `isOpen`.
- **Modify:** `src/components/CategorySelect.test.tsx` — chips assert without opening the dropdown.
- **Modify:** `src/features/insights/VendorFlipView.tsx` — live filters, scan-all, button cleanup.
- **Modify:** `src/features/insights/VendorFlipView.test.tsx` — live-update tests, button relabel, Vendors-gone.

---

## Task 1: Always-visible group chips in `CategorySelect`

**Files:**
- Modify: `src/components/CategorySelect.tsx`
- Modify: `src/components/CategorySelect.test.tsx`

- [ ] **Step 1: Update tests to expect chips without opening the dropdown**

In `src/components/CategorySelect.test.tsx`, the helper `openDropdown()` is currently
called before clicking chips. Remove those calls so the chip tests assert the chips
are present **without** focusing the search input. Replace the whole
`describe('CategorySelect group chips', ...)` block with:

```tsx
describe('CategorySelect group chips', () => {
  it('renders group chips without opening the dropdown', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'AB' })).toBeInTheDocument();
  });

  it('selecting a group chip adds all its category ids', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'AB' }));
    expect(screen.getByTestId('sel').textContent).toBe('1,2');
  });

  it('clicking an active group chip removes all its ids (toggle off)', () => {
    render(<Harness initial={[1, 2]} />);
    fireEvent.click(screen.getByRole('button', { name: 'AB' }));
    expect(screen.getByTestId('sel').textContent).toBe('');
  });

  it('marks a fully-selected group chip active (aria-pressed=true)', () => {
    render(<Harness initial={[1, 2]} />);
    expect(screen.getByRole('button', { name: 'AB' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks a partially-selected group chip mixed (aria-pressed=mixed)', () => {
    render(<Harness initial={[1]} />);
    expect(screen.getByRole('button', { name: 'AB' })).toHaveAttribute('aria-pressed', 'mixed');
  });

  it('renders no group chips when groups prop is omitted', () => {
    render(<Harness withGroups={false} />);
    expect(screen.queryByRole('button', { name: 'AB' })).not.toBeInTheDocument();
  });
});
```

If the now-unused `openDropdown` helper remains in the file and is referenced nowhere
else, delete its definition to avoid an unused-variable lint error.

- [ ] **Step 2: Run tests to verify the relocation tests fail**

Run: `npx vitest run src/components/CategorySelect.test.tsx`
Expected: FAIL — chips currently only render inside the open dropdown, so
`getByRole('button', { name: 'AB' })` without focusing throws "Unable to find".

- [ ] **Step 3: Move the chip row out of the dropdown**

In `src/components/CategorySelect.tsx`, **delete** the chip block currently nested
inside the `{isOpen && (...)}` dropdown (the `{groups && groups.length > 0 && (<div className="flex flex-wrap gap-1 p-2 border-b border-border-base">...</div>)}`
block, immediately before `{filteredCategories.length > 0 ? (`).

Then **insert** an always-visible chip row as the FIRST child of the outer
`<div ref={containerRef} className="relative">` — immediately before the
`{/* Input field */}` comment / `<input>`:

```tsx
      {/* Group quick-select chips — always visible */}
      {groups && groups.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {groups.map((g) => {
            const state = groupState(g.ids);
            const cls =
              state === 'active'
                ? 'border-gold text-gold'
                : state === 'mixed'
                ? 'border-gold/50 text-gold/70'
                : 'border-border-base text-text-dim hover:text-aether';
            return (
              <button
                key={g.label}
                type="button"
                aria-pressed={state === 'active' ? 'true' : state === 'mixed' ? 'mixed' : 'false'}
                onClick={() => handleToggleGroup(g.ids)}
                className={`font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 border ${cls}`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      )}
```

(The only differences from the removed block: it lives above the input, and the
wrapper className is `flex flex-wrap gap-1 mb-2` instead of the in-dropdown
`flex flex-wrap gap-1 p-2 border-b border-border-base`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/CategorySelect.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CategorySelect.tsx src/components/CategorySelect.test.tsx
git commit -m "feat(category-select): make group chips always visible"
```

---

## Task 2: Live filters + button cleanup in `VendorFlipView`

**Files:**
- Modify: `src/features/insights/VendorFlipView.tsx`
- Modify: `src/features/insights/VendorFlipView.test.tsx`

- [ ] **Step 1: Rewrite the affected tests (live behavior, button relabel, Vendors gone)**

In `src/features/insights/VendorFlipView.test.tsx`:

(a) In the test `'renders the filter strip + initial idle state with candidate count'`,
change the button matcher from `/run scan/i` to `/refresh prices/i`:

```tsx
  it('renders the filter strip + initial idle state with candidate count', () => {
    renderView();
    expect(screen.getAllByRole('button', { name: /refresh prices/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2 candidate items/i)).toBeInTheDocument();
  });
```

(b) In the test `'runs the scan, fetches home-world prices, and renders rows'`, change
the click target to `/refresh prices/i`:

```tsx
  it('runs the scan, fetches home-world prices, and renders rows', async () => {
    renderView();
    fireEvent.click(screen.getAllByRole('button', { name: /refresh prices/i })[0]);
    await waitFor(() => {
      expect(screen.getByText('Widget')).toBeInTheDocument();
      expect(screen.getByText('Gizmo')).toBeInTheDocument();
    });
    expect(fetchMarketDataMock).toHaveBeenCalledWith('Phantom', expect.arrayContaining([100, 200]));
  });
```

(c) **Replace** the two stale tests (`'marks the scan stale when a category is selected after a scan'`
and `'exposes a Housing group chip that marks the scan stale when selected'`) with these
live-behavior tests:

```tsx
  it('updates results live when Min profit is raised — no refetch', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());
    const callsBefore = fetchMarketDataMock.mock.calls.length;

    // Each fixture row profits 900/u; raising the floor above that drops them live.
    fireEvent.change(screen.getByLabelText(/min profit/i), { target: { value: '5000' } });

    await waitFor(() => expect(screen.queryByText('Widget')).not.toBeInTheDocument());
    expect(fetchMarketDataMock.mock.calls.length).toBe(callsBefore);
  });

  it('applies a group chip live without refetching', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());
    const callsBefore = fetchMarketDataMock.mock.calls.length;

    // Fixture items are category 1 (Primary Arms); selecting Housing yields no matches.
    fireEvent.click(screen.getByRole('button', { name: 'Housing' }));

    await waitFor(() => expect(screen.queryByText('Widget')).not.toBeInTheDocument());
    expect(fetchMarketDataMock.mock.calls.length).toBe(callsBefore);
  });

  it('does not render a Vendors button', () => {
    renderView();
    expect(screen.queryByRole('button', { name: /vendors/i })).not.toBeInTheDocument();
  });
```

Note: `getByLabelText(/min profit/i)` resolves the Min-profit number input because its
`<input>` is nested inside the `<label>` whose text is "Min profit (gil/u)". The
"Housing" chip is now always visible (Task 1), so no dropdown focus is needed.

- [ ] **Step 2: Run the test file to verify the new tests fail**

Run: `npx vitest run src/features/insights/VendorFlipView.test.tsx`
Expected: FAIL — button still says "Run scan", Min-profit change doesn't update rows
(rows use the frozen filter), and the Vendors button still exists.

- [ ] **Step 3: Remove the stale helper and `filterAtRun`**

In `src/features/insights/VendorFlipView.tsx`:

Delete the `scanParamsChanged` function (the whole `function scanParamsChanged(...) { ... }`).

Change the `RunResult` interface to drop `filterAtRun`:

```tsx
interface RunResult {
  saleMap: MarketData;
  skipped: number;
}
```

- [ ] **Step 4: Scan the full candidate set; compute rows from the live filter**

In `src/features/insights/VendorFlipView.tsx`, replace the `candidateIds` memo with a
filter-independent `scanIds` memo:

```tsx
  const scanIds = useMemo(() => {
    if (!snapshot.data || !vendors.data) return [];
    const out: number[] = [];
    for (const item of snapshot.data.items) {
      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;
      if (!vendors.data.snapshot.has(item.id)) continue;
      out.push(item.id);
    }
    return out;
  }, [snapshot.data, vendors.data, hideCrystals]);
```

Update the `run` mutation to fetch `scanIds` and stop recording `filterAtRun`:

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
  });
```

Update `rows` to use the live `filter`:

```tsx
  const rows = useMemo(() => {
    if (!snapshot.data || !vendors.data || !run.data) return [];
    return runVendorFlip(snapshot.data.items, vendors.data.snapshot, run.data.saleMap, { ...filter, sort });
  }, [snapshot.data, vendors.data, run.data, filter, sort]);
```

- [ ] **Step 5: Remove `stale` and the vendor-refresh wiring**

In `src/features/insights/VendorFlipView.tsx`:

Delete the line `const stale = run.data != null && scanParamsChanged(run.data.filterAtRun, filter);`.

Delete the line `const refreshVendors = useRefreshVendorShopSnapshot();`.

Remove the now-unused import of `useRefreshVendorShopSnapshot` (the import line is
`import { useVendorShopSnapshot, useRefreshVendorShopSnapshot } from '../queries/useVendorShopSnapshot';`
→ change to `import { useVendorShopSnapshot } from '../queries/useVendorShopSnapshot';`).

Update the `<FilterBar>` usage to drop `onRefreshVendors` and `stale`:

```tsx
      <FilterBar
        value={filter}
        onChange={setFilter}
        onRun={() => { run.reset(); run.mutate(); }}
        busy={run.isPending}
        notReady={!snapshot.data || !vendors.data}
      />
```

Update the two remaining `candidateIds` references to `scanIds` — the status-line count
and the Spinner label:

```tsx
        {vendors.isLoading
          ? 'Loading vendor catalog…'
          : `${scanIds.length.toLocaleString()} candidate items`}
```

```tsx
      {run.isPending && <Spinner label={`Fetching ${world} prices for ${scanIds.length} items…`} />}
```

- [ ] **Step 6: Update `FilterBar` — drop Vendors button + stale hint, relabel primary button**

In `src/features/insights/VendorFlipView.tsx`, change the `FilterBar` signature to drop
`onRefreshVendors` and `stale`:

```tsx
function FilterBar({ value, onChange, onRun, busy, notReady }: {
  value: VendorFlipFilter;
  onChange: (f: VendorFlipFilter) => void;
  onRun: () => void;
  busy: boolean;
  notReady: boolean;
}) {
```

Replace the entire button-group block (the
`<div className="flex gap-2 w-full sm:w-auto sm:ml-auto order-last"> ... </div>`
containing the ⟳ Vendors button, the stale hint, and the Run-scan button) with:

```tsx
        <div className="flex gap-2 w-full sm:w-auto sm:ml-auto order-last">
          <button
            type="button"
            onClick={onRun} disabled={busy || notReady}
            title={notReady ? 'Loading vendor catalog…' : 'Re-fetch live market prices'}
            className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {busy ? <>Refreshing…<SpinGlyph /></> : 'Refresh prices'}
          </button>
        </div>
```

- [ ] **Step 7: Run the test file to verify it passes**

Run: `npx vitest run src/features/insights/VendorFlipView.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 8: Commit**

```bash
git add src/features/insights/VendorFlipView.tsx src/features/insights/VendorFlipView.test.tsx
git commit -m "feat(vendor-flip): live filters; Run scan -> Refresh prices; drop Vendors button"
```

---

## Task 3: Typecheck and full test sweep

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (In particular, confirm no remaining references to `candidateIds`,
`scanParamsChanged`, `filterAtRun`, `stale`, or `useRefreshVendorShopSnapshot` in
`VendorFlipView.tsx`.)

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 3: Final commit (only if Steps 1-2 required fixes; otherwise skip)**

```bash
git add -A
git commit -m "chore(vendor-flip): typecheck + test sweep for live filters"
```

---

## Self-Review notes

- **Spec coverage:** Part A1 (scan full set) → Task 2 Step 4 (`scanIds`); A2 (live rows) →
  Task 2 Step 4; A3 (remove stale) → Task 2 Steps 3 & 5; A4 (buttons) → Task 2 Step 6;
  A5 (status line) → Task 2 Step 5. Part B (chips always visible) → Task 1. Testing
  section → Tasks 1 & 2 test steps.
- **No placeholders:** every step shows exact code/commands.
- **Type consistency:** `RunResult` loses `filterAtRun` and no remaining code reads it;
  `FilterBar` prop type drops `onRefreshVendors`/`stale` and the call site no longer
  passes them; `candidateIds` fully renamed to `scanIds` at all three use sites (memo,
  status line, Spinner). `runVendorFlip` signature is unchanged — it already accepts a
  full `VendorFlipFilter`, and `{ ...filter, sort }` supplies one.
- **Auto-run note:** `useInitialScan` still fires the initial fetch on load, so rows
  appear without a manual click; the relabeled button only triggers a price refresh.
