# Vendor Flip Category Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a category multi-select to the Vendor Flip FilterBar so users can narrow flip results to specific item types (e.g. Furnishings).

**Architecture:** UI-only change. The data layer already consumes `filter.searchCategories` (candidate building, runner filtering, and stale-detection all reference it) — the only missing piece is a FilterBar control bound to it. We reuse the existing `CategorySelect` component, wiring it exactly as `QueryBuilder` does.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react.

---

## Background facts (read before starting)

- `VendorFlipFilter.searchCategories: number[]` already exists ([src/features/queries/types.ts:142](../../../src/features/queries/types.ts)) and defaults to `[]` (= all categories).
- `candidateIds` already filters by it — [src/features/insights/VendorFlipView.tsx:43-48](../../../src/features/insights/VendorFlipView.tsx).
- `runVendorFlip` already filters by it — [src/features/queries/runVendorFlip.ts:23-26](../../../src/features/queries/runVendorFlip.ts).
- `scanParamsChanged` already compares it, so a change marks the scan stale — [src/features/insights/VendorFlipView.tsx:23-31](../../../src/features/insights/VendorFlipView.tsx).
- The reusable control is `CategorySelect` ([src/components/CategorySelect.tsx](../../../src/components/CategorySelect.tsx)). It renders a search `<input>` (placeholder prop), a checkbox dropdown on focus, and selected pills.
- `ITEM_SEARCH_CATEGORIES` + `categoryLabel(id)` live in [src/lib/itemSearchCategories.ts](../../../src/lib/itemSearchCategories.ts). `categoryLabel(1)` === `"Primary Arms"`.
- Reference wiring to copy: [src/features/queries/QueryBuilder.tsx:43-55](../../../src/features/queries/QueryBuilder.tsx).

**Run all tests with:** `npm test -- src/features/insights/VendorFlipView.test.tsx`

---

## File Structure

- **Modify:** `src/features/insights/VendorFlipView.tsx` — add imports; render `CategorySelect` in a new top row of `FilterBar`, bound to `filter.searchCategories`.
- **Modify:** `src/features/insights/VendorFlipView.test.tsx` — add a test that selecting a category marks the scan stale.

No other files change. No changes to `types.ts`, `runVendorFlip.ts`, fetch logic, or the snapshot.

---

## Task 1: Render the category control in the FilterBar

**Files:**
- Modify: `src/features/insights/VendorFlipView.tsx`
- Test: `src/features/insights/VendorFlipView.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('VendorFlipView', ...)` block in `src/features/insights/VendorFlipView.test.tsx` (after the existing `'runs the scan...'` test):

```tsx
it('renders the category filter control', () => {
  renderView();
  expect(screen.getByPlaceholderText(/search categories/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/insights/VendorFlipView.test.tsx -t "renders the category filter control"`
Expected: FAIL — `Unable to find an element with the placeholder text /search categories/i`.

- [ ] **Step 3: Add imports**

At the top of `src/features/insights/VendorFlipView.tsx`, add these imports alongside the existing import block:

```tsx
import { CategorySelect } from '../../components/CategorySelect';
import { ITEM_SEARCH_CATEGORIES, categoryLabel } from '../../lib/itemSearchCategories';
```

- [ ] **Step 4: Render `CategorySelect` as a new top row in `FilterBar`**

In `src/features/insights/VendorFlipView.tsx`, the `FilterBar` currently returns a single
`<div className="flex flex-wrap …">`. Wrap that existing row plus a new category row in an
outer container. Replace the opening of the `FilterBar` return — change:

```tsx
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card justify-between">
```

to:

```tsx
  return (
    <div className="border border-border-base bg-bg-card p-3 space-y-3">
      <div>
        <label className="font-mono text-[13px] tracking-widest text-text-low uppercase block mb-1">
          Categories ({value.searchCategories.length || 'all'})
        </label>
        <CategorySelect
          categories={ITEM_SEARCH_CATEGORIES.map((c) => ({ id: c.id, name: categoryLabel(c.id) }))}
          selected={value.searchCategories}
          onChange={(ids) => onChange({ ...value, searchCategories: ids })}
          placeholder="Search categories…"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3 justify-between">
```

Then add a matching extra closing `</div>` at the end of the `FilterBar` return so the new
outer container is closed. The existing return currently ends:

```tsx
      </div>
    </div>
  );
}
```

Change it to:

```tsx
        </div>
      </div>
    </div>
  );
}
```

(The numeric/HQ/button row that was the old outer `<div>` is now the inner
`flex flex-wrap …` row; the original `p-3` and `justify-between` moved to the new outer
container / inner row respectively, and `border`/`bg-bg-card` stay on the outer container.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/insights/VendorFlipView.test.tsx -t "renders the category filter control"`
Expected: PASS.

- [ ] **Step 6: Run the full view test file to confirm no regressions**

Run: `npm test -- src/features/insights/VendorFlipView.test.tsx`
Expected: all tests PASS (the two original tests + the new one).

- [ ] **Step 7: Commit**

```bash
git add src/features/insights/VendorFlipView.tsx src/features/insights/VendorFlipView.test.tsx
git commit -m "feat(vendor-flip): wire category multi-select into FilterBar"
```

---

## Task 2: Verify category change marks the scan stale

This behavior is already implemented (`scanParamsChanged` tracks `searchCategories`). This task
adds a regression test proving the control is correctly bound and the stale prompt appears.

**Files:**
- Test: `src/features/insights/VendorFlipView.test.tsx`

- [ ] **Step 1: Write the test**

Add this test inside the `describe('VendorFlipView', ...)` block in
`src/features/insights/VendorFlipView.test.tsx`:

```tsx
it('marks the scan stale when a category is selected after a scan', async () => {
  renderView();
  // Run an initial scan so stale-detection can apply (stale requires run.data != null).
  fireEvent.click(screen.getAllByRole('button', { name: /run scan/i })[0]);
  await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

  // Open the category dropdown and narrow to a single, uniquely-named category.
  const search = screen.getByPlaceholderText(/search categories/i);
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Primary Arms' } });
  fireEvent.click(screen.getByRole('checkbox'));

  // Changing a scan parameter should surface the "Run scan to refresh" prompt.
  await waitFor(() =>
    expect(screen.getByText(/filters changed/i)).toBeInTheDocument(),
  );
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- src/features/insights/VendorFlipView.test.tsx -t "marks the scan stale"`
Expected: PASS. (`categoryLabel(1)` is `"Primary Arms"`, which is unique, so the filtered
dropdown shows exactly one checkbox; selecting it sets `searchCategories: [1]`, which
`scanParamsChanged` detects, rendering the `Filters changed — Run scan to refresh` text from
[VendorFlipView.tsx:200-203](../../../src/features/insights/VendorFlipView.tsx).)

- [ ] **Step 3: Run the full view test file**

Run: `npm test -- src/features/insights/VendorFlipView.test.tsx`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/insights/VendorFlipView.test.tsx
git commit -m "test(vendor-flip): category change marks scan stale"
```

---

## Task 3: Typecheck and full test sweep

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npm run build` (or the project's typecheck script, e.g. `npx tsc --noEmit` — check `package.json` `scripts`).
Expected: no type errors.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests PASS — confirms the FilterBar restructure didn't break sibling insight views.

- [ ] **Step 3: Final commit (only if Steps 1-2 produced fixable changes; otherwise skip)**

```bash
git add -A
git commit -m "chore(vendor-flip): typecheck + test sweep for category filter"
```

---

## Self-Review notes

- **Spec coverage:** Spec's two changes (restructure FilterBar to stacked layout; wire `CategorySelect` to `searchCategories`) → Task 1. Spec's behavior claim (category change marks stale) → Task 2 regression test. Spec's "no data-layer changes" → respected (only `VendorFlipView.tsx` + its test touched).
- **No placeholders:** every code/edit step shows the exact code or command.
- **Type consistency:** `CategorySelect` prop names (`categories`, `selected`, `onChange`, `placeholder`) match [CategorySelect.tsx:8-13](../../../src/components/CategorySelect.tsx); `categories` items use `{ id, name }`; `onChange` receives `number[]` and is spread into the existing `VendorFlipFilter` via `onChange({ ...value, searchCategories: ids })`, matching the `FilterBar` prop signature already in the file.
