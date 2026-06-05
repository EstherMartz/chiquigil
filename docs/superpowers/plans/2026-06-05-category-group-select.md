# Category Group Quick-Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-click group selection to the shared `CategorySelect` so picking e.g. "Housing" selects all 11 housing categories at once.

**Architecture:** `CategorySelect` stays generic — it gains one optional `groups?: { label: string; ids: number[] }[]` prop and renders toggle chips when given. The FFXIV group taxonomy lives in `itemSearchCategories.ts` as a new `CATEGORY_GROUPS` constant that consumers pass in. No data-layer/filter changes.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react.

---

## Background facts (read before starting)

- `ITEM_SEARCH_CATEGORIES` entries have a `group` field; type union is
  `'Weapons' | 'Tools' | 'Armor' | 'Accessories' | 'Medicines & Meals' | 'Materials' | 'Other' | 'Housing'`
  ([src/lib/itemSearchCategories.ts](../../../src/lib/itemSearchCategories.ts)).
- Housing category ids: 56, 65, 66, 67, 68, 69, 70, 71, 72, 81, 82.
- `CategorySelect` ([src/components/CategorySelect.tsx](../../../src/components/CategorySelect.tsx))
  renders a search `<input>` (focus opens the dropdown), a checkbox list, and pills.
  Its props today: `{ categories: {id:number;name:string}[]; selected: number[]; onChange: (ids:number[])=>void; placeholder?: string }`.
- Consumers: `src/features/insights/VendorFlipView.tsx` and `src/features/queries/QueryBuilder.tsx`.

**Run a single test file:** `npx vitest run <path>`

---

## File Structure

- **Modify:** `src/lib/itemSearchCategories.ts` — add `CategoryGroup` type + `CATEGORY_GROUPS` constant.
- **Create:** `src/lib/itemSearchCategories.test.ts` — tests for `CATEGORY_GROUPS`.
- **Modify:** `src/components/CategorySelect.tsx` — add `groups` prop, chip row, toggle logic.
- **Create:** `src/components/CategorySelect.test.tsx` — group-chip behavior tests.
- **Modify:** `src/features/insights/VendorFlipView.tsx` — pass `groups={CATEGORY_GROUPS}`.
- **Modify:** `src/features/queries/QueryBuilder.tsx` — pass `groups={CATEGORY_GROUPS}`.
- **Modify:** `src/features/insights/VendorFlipView.test.tsx` — Housing-chip smoke test.

---

## Task 1: `CATEGORY_GROUPS` taxonomy helper

**Files:**
- Modify: `src/lib/itemSearchCategories.ts`
- Create: `src/lib/itemSearchCategories.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/itemSearchCategories.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CATEGORY_GROUPS, ITEM_SEARCH_CATEGORIES } from './itemSearchCategories';

describe('CATEGORY_GROUPS', () => {
  it('has one entry per distinct group', () => {
    const distinct = new Set(ITEM_SEARCH_CATEGORIES.map((c) => c.group));
    expect(CATEGORY_GROUPS.length).toBe(distinct.size);
  });

  it('groups the housing categories under "Housing"', () => {
    const housing = CATEGORY_GROUPS.find((g) => g.label === 'Housing');
    expect(housing).toBeDefined();
    expect(housing!.ids).toEqual(
      expect.arrayContaining([56, 65, 66, 67, 68, 69, 70, 71, 72, 81, 82]),
    );
  });

  it('covers every category id exactly once', () => {
    const all = CATEGORY_GROUPS.flatMap((g) => g.ids);
    expect(all.length).toBe(ITEM_SEARCH_CATEGORIES.length);
    expect(new Set(all).size).toBe(ITEM_SEARCH_CATEGORIES.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/itemSearchCategories.test.ts`
Expected: FAIL — `CATEGORY_GROUPS` is not exported (import is undefined).

- [ ] **Step 3: Implement `CATEGORY_GROUPS`**

In `src/lib/itemSearchCategories.ts`, append after the existing `categoryLabel` function:

```ts
export interface CategoryGroup {
  label: ItemSearchCategoryEntry['group'];
  ids: number[];
}

/** Each distinct `group`, in first-seen order, with its member category ids. */
export const CATEGORY_GROUPS: CategoryGroup[] = (() => {
  const order: ItemSearchCategoryEntry['group'][] = [];
  const byGroup = new Map<ItemSearchCategoryEntry['group'], number[]>();
  for (const c of ITEM_SEARCH_CATEGORIES) {
    let ids = byGroup.get(c.group);
    if (!ids) { ids = []; byGroup.set(c.group, ids); order.push(c.group); }
    ids.push(c.id);
  }
  return order.map((label) => ({ label, ids: byGroup.get(label)! }));
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/itemSearchCategories.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/itemSearchCategories.ts src/lib/itemSearchCategories.test.ts
git commit -m "feat(categories): derive CATEGORY_GROUPS from group taxonomy"
```

---

## Task 2: Group chips in `CategorySelect`

**Files:**
- Modify: `src/components/CategorySelect.tsx`
- Create: `src/components/CategorySelect.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/CategorySelect.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategorySelect } from './CategorySelect';

const CATS = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
  { id: 3, name: 'Gamma' },
];
const GROUPS = [
  { label: 'AB', ids: [1, 2] },
  { label: 'C', ids: [3] },
];

function Harness({ initial = [] as number[], withGroups = true }) {
  const [sel, setSel] = useState<number[]>(initial);
  return (
    <div>
      <CategorySelect
        categories={CATS}
        selected={sel}
        onChange={setSel}
        groups={withGroups ? GROUPS : undefined}
      />
      <div data-testid="sel">{[...sel].sort((a, b) => a - b).join(',')}</div>
    </div>
  );
}

function openDropdown() {
  fireEvent.focus(screen.getByPlaceholderText(/search categories/i));
}

describe('CategorySelect group chips', () => {
  it('selecting a group chip adds all its category ids', () => {
    render(<Harness />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: 'AB' }));
    expect(screen.getByTestId('sel').textContent).toBe('1,2');
  });

  it('clicking an active group chip removes all its ids (toggle off)', () => {
    render(<Harness initial={[1, 2]} />);
    openDropdown();
    fireEvent.click(screen.getByRole('button', { name: 'AB' }));
    expect(screen.getByTestId('sel').textContent).toBe('');
  });

  it('marks a fully-selected group chip active (aria-pressed=true)', () => {
    render(<Harness initial={[1, 2]} />);
    openDropdown();
    expect(screen.getByRole('button', { name: 'AB' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks a partially-selected group chip mixed (aria-pressed=mixed)', () => {
    render(<Harness initial={[1]} />);
    openDropdown();
    expect(screen.getByRole('button', { name: 'AB' })).toHaveAttribute('aria-pressed', 'mixed');
  });

  it('renders no group chips when groups prop is omitted', () => {
    render(<Harness withGroups={false} />);
    openDropdown();
    expect(screen.queryByRole('button', { name: 'AB' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/CategorySelect.test.tsx`
Expected: FAIL — chips don't exist yet (`Unable to find an accessible element with the role "button" and name "AB"`).

- [ ] **Step 3: Add the `groups` prop to the interface**

In `src/components/CategorySelect.tsx`, extend the `Props` interface (currently lines 8-13):

```tsx
interface Props {
  categories: Category[];
  selected: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  groups?: { label: string; ids: number[] }[];
}
```

And add `groups` to the destructured params of `CategorySelect`:

```tsx
export function CategorySelect({
  categories,
  selected,
  onChange,
  placeholder = 'Search categories...',
  groups,
}: Props) {
```

- [ ] **Step 4: Add group helpers inside the component**

In `src/components/CategorySelect.tsx`, add these two helpers next to the existing
`handleToggle` (around line 38, inside the component body):

```tsx
  // Tri-state for a group: 'active' (all ids selected), 'mixed' (some), 'none'.
  const groupState = (ids: number[]): 'active' | 'mixed' | 'none' => {
    const n = ids.reduce((acc, id) => acc + (selected.includes(id) ? 1 : 0), 0);
    if (n === 0) return 'none';
    return n === ids.length ? 'active' : 'mixed';
  };

  // Toggle a whole group: remove all if fully selected, otherwise add all.
  const handleToggleGroup = (ids: number[]) => {
    if (ids.every((id) => selected.includes(id))) {
      onChange(selected.filter((id) => !ids.includes(id)));
    } else {
      const next = new Set(selected);
      ids.forEach((id) => next.add(id));
      onChange([...next]);
    }
  };
```

- [ ] **Step 5: Render the chip row at the top of the dropdown**

In `src/components/CategorySelect.tsx`, the dropdown is the `{isOpen && (<div className="absolute z-20 ...">...)}` block (around lines 89-114). Insert the chip row as the FIRST child inside that dropdown container, immediately before the `{filteredCategories.length > 0 ? (` expression:

```tsx
          {groups && groups.length > 0 && (
            <div className="flex flex-wrap gap-1 p-2 border-b border-border-base">
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

Note: the `aria-pressed` value is a string union — `'true' | 'mixed' | 'false'` — which is a valid React attribute value and what the tests assert.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/CategorySelect.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/CategorySelect.tsx src/components/CategorySelect.test.tsx
git commit -m "feat(category-select): group quick-select toggle chips"
```

---

## Task 3: Wire groups into both consumers

**Files:**
- Modify: `src/features/insights/VendorFlipView.tsx`
- Modify: `src/features/queries/QueryBuilder.tsx`
- Modify: `src/features/insights/VendorFlipView.test.tsx`

- [ ] **Step 1: Write the failing smoke test**

Add this test inside the `describe('VendorFlipView', ...)` block in
`src/features/insights/VendorFlipView.test.tsx`:

```tsx
it('exposes a Housing group chip that marks the scan stale when selected', async () => {
  renderView();
  fireEvent.click(screen.getAllByRole('button', { name: /run scan/i })[0]);
  await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

  fireEvent.focus(screen.getByPlaceholderText(/search categories/i));
  fireEvent.click(screen.getByRole('button', { name: 'Housing' }));

  await waitFor(() =>
    expect(screen.getByText(/filters changed — run scan to refresh/i)).toBeInTheDocument(),
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/insights/VendorFlipView.test.tsx -t "Housing group chip"`
Expected: FAIL — no button named "Housing" (groups not wired yet).

- [ ] **Step 3: Wire `groups` into VendorFlipView**

In `src/features/insights/VendorFlipView.tsx`, update the import of category helpers
to include `CATEGORY_GROUPS`:

```tsx
import { ITEM_SEARCH_CATEGORIES, categoryLabel, CATEGORY_GROUPS } from '../../lib/itemSearchCategories';
```

Then add the `groups` prop to the `CategorySelect` usage in `FilterBar`:

```tsx
        <CategorySelect
          categories={ITEM_SEARCH_CATEGORIES.map((c) => ({ id: c.id, name: categoryLabel(c.id) }))}
          selected={value.searchCategories}
          onChange={(ids) => onChange({ ...value, searchCategories: ids })}
          placeholder="Search categories…"
          groups={CATEGORY_GROUPS}
        />
```

- [ ] **Step 4: Run the smoke test to verify it passes**

Run: `npx vitest run src/features/insights/VendorFlipView.test.tsx -t "Housing group chip"`
Expected: PASS.

- [ ] **Step 5: Wire `groups` into QueryBuilder**

In `src/features/queries/QueryBuilder.tsx`, update the category-helpers import:

```tsx
import { ITEM_SEARCH_CATEGORIES, categoryLabel, CATEGORY_GROUPS } from '../../lib/itemSearchCategories';
```

Then add the `groups` prop to its `CategorySelect` usage (around lines 49-54):

```tsx
        <CategorySelect
          categories={ITEM_SEARCH_CATEGORIES.map((c) => ({ id: c.id, name: categoryLabel(c.id) }))}
          selected={value.searchCategories}
          onChange={(ids) => patch({ searchCategories: ids })}
          placeholder="Search categories…"
          groups={CATEGORY_GROUPS}
        />
```

- [ ] **Step 6: Run both consumers' test files**

Run: `npx vitest run src/features/insights/VendorFlipView.test.tsx src/features/queries`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/insights/VendorFlipView.tsx src/features/queries/QueryBuilder.tsx src/features/insights/VendorFlipView.test.tsx
git commit -m "feat(filters): expose category group chips in Vendor Flip + QueryBuilder"
```

---

## Task 4: Typecheck and full test sweep

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 3: Final commit (only if Steps 1-2 required fixes; otherwise skip)**

```bash
git add -A
git commit -m "chore(filters): typecheck + test sweep for category group chips"
```

---

## Self-Review notes

- **Spec coverage:** generic `groups` prop → Task 2; `CATEGORY_GROUPS` helper → Task 1;
  chip row in dropdown → Task 2 Step 5; toggle on/off → Task 2 (`handleToggleGroup`);
  active/partial/none state → Task 2 (`groupState` + `aria-pressed`); both consumers
  wired → Task 3; component + smoke tests → Tasks 2 & 3; back-compat when `groups`
  omitted → Task 2 test "renders no group chips when groups prop is omitted".
- **No placeholders:** every code/edit step shows exact code and commands.
- **Type consistency:** `groups` prop type `{ label: string; ids: number[] }[]` is a
  structural match for `CategoryGroup` (`label` is the group string-union, assignable
  to `string`), so passing `CATEGORY_GROUPS` typechecks. Helper names `groupState`
  and `handleToggleGroup` are used consistently within Task 2. `aria-pressed` uses the
  string union `'true' | 'mixed' | 'false'` in both the implementation and the tests.
