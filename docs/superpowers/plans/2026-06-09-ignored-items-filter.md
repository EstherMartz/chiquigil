# Ignored Items Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users hide specific items from every scan/plan in the app via a persistent personal ignore list, with a per-row hide control, a master on/off toggle, and a Settings management section.

**Architecture:** A persisted zustand settings field (`ignoredItemIds` + `hideIgnored`) drives a shared `isItemHidden` predicate used at every existing `hideCrystals` selection site (true everywhere-parity). For instant feedback, the shared `ResultTableScaffold` also filters ignored rows at render time and exposes a context that makes `ItemNameLinks` render a `✕` hide chip inside scan tables. Settings gets a management section.

**Tech Stack:** React 18, TypeScript, zustand (+persist), vitest, @testing-library/react, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-09-ignored-items-filter-design.md`

**Run all commands from the worktree root** `C:/Users/esthe/Documents/Dev/ffxiv-helper/.claude/worktrees/ignore-filter`.

---

## Task 1: Settings store — ignore list state + actions

**Files:**
- Modify: `src/features/settings/store.ts`
- Test: `src/features/settings/store.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/features/settings/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, defaultSettings } from './store';

describe('settings store — ignored items', () => {
  beforeEach(() => {
    useSettingsStore.setState({ ignoredItemIds: [], hideIgnored: true });
  });

  it('defaults to an empty list with hiding on', () => {
    const d = defaultSettings();
    expect(d.ignoredItemIds).toEqual([]);
    expect(d.hideIgnored).toBe(true);
  });

  it('ignoreItem adds an id and dedupes', () => {
    useSettingsStore.getState().ignoreItem(5);
    useSettingsStore.getState().ignoreItem(5);
    useSettingsStore.getState().ignoreItem(9);
    expect(useSettingsStore.getState().ignoredItemIds).toEqual([5, 9]);
  });

  it('unignoreItem removes an id', () => {
    useSettingsStore.setState({ ignoredItemIds: [5, 9] });
    useSettingsStore.getState().unignoreItem(5);
    expect(useSettingsStore.getState().ignoredItemIds).toEqual([9]);
  });

  it('clearIgnored empties the list', () => {
    useSettingsStore.setState({ ignoredItemIds: [5, 9] });
    useSettingsStore.getState().clearIgnored();
    expect(useSettingsStore.getState().ignoredItemIds).toEqual([]);
  });

  it('setHideIgnored toggles the master flag', () => {
    useSettingsStore.getState().setHideIgnored(false);
    expect(useSettingsStore.getState().hideIgnored).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/settings/store.test.ts`
Expected: FAIL — `ignoreItem` is not a function / `ignoredItemIds` undefined.

- [ ] **Step 3: Implement the store changes**

In `src/features/settings/store.ts`, add to the `SettingsState` interface (after `submarineSlots: number;`):

```ts
  ignoredItemIds: number[];
  hideIgnored: boolean;
```

Add to the action signatures (after `setSubmarineSlots`):

```ts
  ignoreItem: (id: number) => void;
  unignoreItem: (id: number) => void;
  clearIgnored: () => void;
  setHideIgnored: (v: boolean) => void;
```

Extend the `defaultSettings()` return type `Pick<...>` to include `'ignoredItemIds' | 'hideIgnored'`, and add to the returned object (after `submarineSlots: 1,`):

```ts
    ignoredItemIds: [],
    hideIgnored: true,
```

Add the action implementations in the store initializer (after `setSubmarineSlots`):

```ts
      ignoreItem: (id) => set((s) => (s.ignoredItemIds.includes(id)
        ? s
        : { ignoredItemIds: [...s.ignoredItemIds, id] })),
      unignoreItem: (id) => set((s) => ({ ignoredItemIds: s.ignoredItemIds.filter((x) => x !== id) })),
      clearIgnored: () => set({ ignoredItemIds: [] }),
      setHideIgnored: (hideIgnored) => set({ hideIgnored }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/settings/store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/store.ts src/features/settings/store.test.ts
git commit -m "feat(settings): ignored-items state (list + master toggle)"
```

---

## Task 2: `useIgnoredItemSet` hook

**Files:**
- Create: `src/features/settings/useIgnoredItems.ts`
- Test: `src/features/settings/useIgnoredItems.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/settings/useIgnoredItems.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSettingsStore } from './store';
import { useIgnoredItemSet } from './useIgnoredItems';

describe('useIgnoredItemSet', () => {
  beforeEach(() => useSettingsStore.setState({ ignoredItemIds: [1, 2, 3] }));

  it('returns a Set mirroring ignoredItemIds', () => {
    const { result } = renderHook(() => useIgnoredItemSet());
    expect(result.current.has(2)).toBe(true);
    expect(result.current.has(99)).toBe(false);
  });

  it('keeps the same Set identity when the array does not change', () => {
    const { result, rerender } = renderHook(() => useIgnoredItemSet());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/settings/useIgnoredItems.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `src/features/settings/useIgnoredItems.ts`:

```ts
import { useMemo } from 'react';
import { useSettingsStore } from './store';

/** Memoized Set of ignored item IDs for O(1) membership tests in filters. */
export function useIgnoredItemSet(): ReadonlySet<number> {
  const ids = useSettingsStore((s) => s.ignoredItemIds);
  return useMemo(() => new Set(ids), [ids]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/settings/useIgnoredItems.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/useIgnoredItems.ts src/features/settings/useIgnoredItems.test.ts
git commit -m "feat(settings): useIgnoredItemSet hook"
```

---

## Task 3: `isItemHidden` shared predicate

**Files:**
- Modify: `src/features/queries/commonFilters.ts`
- Test: `src/features/queries/commonFilters.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/features/queries/commonFilters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isItemHidden, CRYSTALS_SEARCH_CATEGORY } from './commonFilters';

const opts = (over = {}) => ({ hideCrystals: true, hideIgnored: true, ignored: new Set<number>([7]), ...over });

describe('isItemHidden', () => {
  it('hides crystals when hideCrystals is on', () => {
    expect(isItemHidden({ id: 1, sc: CRYSTALS_SEARCH_CATEGORY }, opts())).toBe(true);
  });
  it('keeps crystals when hideCrystals is off', () => {
    expect(isItemHidden({ id: 1, sc: CRYSTALS_SEARCH_CATEGORY }, opts({ hideCrystals: false }))).toBe(false);
  });
  it('hides an ignored id when hideIgnored is on', () => {
    expect(isItemHidden({ id: 7, sc: 5 }, opts())).toBe(true);
  });
  it('keeps an ignored id when hideIgnored is off', () => {
    expect(isItemHidden({ id: 7, sc: 5 }, opts({ hideIgnored: false }))).toBe(false);
  });
  it('keeps an ordinary item', () => {
    expect(isItemHidden({ id: 3, sc: 5 }, opts())).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/queries/commonFilters.test.ts`
Expected: FAIL — `isItemHidden` is not exported.

- [ ] **Step 3: Implement the predicate**

Append to `src/features/queries/commonFilters.ts`:

```ts
export interface ItemHideOpts {
  hideCrystals: boolean;
  hideIgnored: boolean;
  ignored: ReadonlySet<number>;
}

/** True when an item should be hidden from scans/plans (crystal category or on the personal ignore list). */
export function isItemHidden(item: { id: number; sc: number }, o: ItemHideOpts): boolean {
  if (o.hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) return true;
  if (o.hideIgnored && o.ignored.has(item.id)) return true;
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/queries/commonFilters.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/commonFilters.ts src/features/queries/commonFilters.test.ts
git commit -m "feat(filters): isItemHidden predicate (crystals + ignore list)"
```

---

## Task 4: Hide chip in `ItemNameLinks` + affordance context

**Files:**
- Create: `src/features/items/ignoreAffordance.ts`
- Modify: `src/components/ItemNameLinks.tsx`
- Test: `src/components/ItemNameLinks.test.tsx` (create)

- [ ] **Step 1: Create the context**

Create `src/features/items/ignoreAffordance.ts`:

```ts
import { createContext } from 'react';

/**
 * True inside a scan/result table, where an item row should offer a "hide"
 * control. Defaults to false so ItemNameLinks renders no chip on item pages,
 * hovers, etc.
 */
export const IgnoreAffordanceContext = createContext<boolean>(false);
```

- [ ] **Step 2: Write the failing test**

Create `src/components/ItemNameLinks.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ItemNameLinks } from './ItemNameLinks';
import { IgnoreAffordanceContext } from '../features/items/ignoreAffordance';
import { useSettingsStore } from '../features/settings/store';

function ui(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('ItemNameLinks hide chip', () => {
  beforeEach(() => useSettingsStore.setState({ ignoredItemIds: [] }));

  it('shows no hide chip outside the affordance context', () => {
    ui(<ItemNameLinks id={42} name="Widget" />);
    expect(screen.queryByTitle(/hide this item/i)).toBeNull();
  });

  it('shows a hide chip inside the context and calls ignoreItem on click', () => {
    const spy = vi.spyOn(useSettingsStore.getState(), 'ignoreItem');
    ui(
      <IgnoreAffordanceContext.Provider value={true}>
        <ItemNameLinks id={42} name="Widget" />
      </IgnoreAffordanceContext.Provider>,
    );
    fireEvent.click(screen.getByTitle(/hide this item/i));
    expect(spy).toHaveBeenCalledWith(42);
  });

  it('hides the chip when the item is already ignored', () => {
    useSettingsStore.setState({ ignoredItemIds: [42] });
    ui(
      <IgnoreAffordanceContext.Provider value={true}>
        <ItemNameLinks id={42} name="Widget" />
      </IgnoreAffordanceContext.Provider>,
    );
    expect(screen.queryByTitle(/hide this item/i)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/ItemNameLinks.test.tsx`
Expected: FAIL — no element with that title.

- [ ] **Step 4: Implement the chip**

In `src/components/ItemNameLinks.tsx`:

Add imports at the top:

```ts
import { useContext } from 'react';
import { IgnoreAffordanceContext } from '../features/items/ignoreAffordance';
import { useSettingsStore } from '../features/settings/store';
```

Inside `ItemNameLinks`, after `const ilvl = byId.get(id)?.ilvl;`, add:

```ts
  const canHide = useContext(IgnoreAffordanceContext);
  const isIgnored = useSettingsStore((s) => s.ignoredItemIds.includes(id));
  const ignoreItem = useSettingsStore((s) => s.ignoreItem);
```

Add the chip immediately after the `UV` `<a>` (before the closing `</RecipeHover>`):

```tsx
        {canHide && !isIgnored && (
          <button
            type="button"
            onClick={() => ignoreItem(id)}
            title="Hide this item from scans"
            aria-label={`Hide ${name} from scans`}
            className="font-mono text-[9px] text-text-low hover:text-crimson transition-colors shrink-0"
          >
            ✕
          </button>
        )}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/ItemNameLinks.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/items/ignoreAffordance.ts src/components/ItemNameLinks.tsx src/components/ItemNameLinks.test.tsx
git commit -m "feat(items): per-row hide chip in ItemNameLinks (scan tables only)"
```

---

## Task 5: `ResultTableScaffold` — filter ignored rows + provide context

**Files:**
- Modify: `src/features/queries/ResultTableScaffold.tsx`
- Test: `src/features/queries/ResultTableScaffold.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/features/queries/ResultTableScaffold.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultTableScaffold } from './ResultTableScaffold';
import { useSettingsStore } from '../settings/store';

type Row = { id: number; name: string };
const rows: Row[] = [{ id: 1, name: 'Keep' }, { id: 2, name: 'Drop' }];

function renderScaffold() {
  return render(
    <ResultTableScaffold
      rows={rows}
      totalCandidates={2}
      skippedChunks={0}
      emptyState={<div>empty</div>}
      renderTable={(visible) => (
        <ul>{visible.map((r) => <li key={r.id}>{r.name}</li>)}</ul>
      )}
    />,
  );
}

describe('ResultTableScaffold ignore filtering', () => {
  beforeEach(() => useSettingsStore.setState({ ignoredItemIds: [], hideIgnored: true }));

  it('drops ignored rows when hideIgnored is on', () => {
    useSettingsStore.setState({ ignoredItemIds: [2], hideIgnored: true });
    renderScaffold();
    expect(screen.getByText('Keep')).toBeInTheDocument();
    expect(screen.queryByText('Drop')).toBeNull();
    expect(screen.getByText(/1 matches from 2 candidates/)).toBeInTheDocument();
  });

  it('keeps ignored rows when hideIgnored is off', () => {
    useSettingsStore.setState({ ignoredItemIds: [2], hideIgnored: false });
    renderScaffold();
    expect(screen.getByText('Drop')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/queries/ResultTableScaffold.test.tsx`
Expected: FAIL — "Drop" still rendered.

- [ ] **Step 3: Implement the filter + provider**

In `src/features/queries/ResultTableScaffold.tsx`:

Add imports:

```ts
import { useMemo } from 'react';
import { useSettingsStore } from '../settings/store';
import { useIgnoredItemSet } from '../settings/useIgnoredItems';
import { IgnoreAffordanceContext } from '../items/ignoreAffordance';
```

At the top of the `ResultTableScaffold` body (before `const lm = ...`), derive the visible rows:

```ts
  const hideIgnored = useSettingsStore((s) => s.hideIgnored);
  const ignored = useIgnoredItemSet();
  const rows = useMemo(
    () => (hideIgnored ? allRows.filter((r) => !ignored.has(r.id)) : allRows),
    [allRows, hideIgnored, ignored],
  );
```

Rename the destructured prop `rows` to `allRows` in the signature:

```ts
export function ResultTableScaffold<T extends { id: number }>({
  rows: allRows, totalCandidates, skippedChunks, emptyState, renderTable, renderMobile, csvColumns, csvFilename, onVisibleRows,
}: Props<T>) {
```

(The rest of the body already references `rows`, which now points at the filtered list — `useLoadMore(rows, 25)`, the matches count, CSV export.)

Wrap the returned JSX (both the early `emptyState` return and the main `return`) in the provider. Change the empty return to:

```tsx
  if (rows.length === 0) return <IgnoreAffordanceContext.Provider value={true}>{emptyState}</IgnoreAffordanceContext.Provider>;
```

and wrap the main `return (<div className="space-y-2">…</div>)` so it reads:

```tsx
  return (
    <IgnoreAffordanceContext.Provider value={true}>
      <div className="space-y-2">
        {/* …existing content unchanged… */}
      </div>
    </IgnoreAffordanceContext.Provider>
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/queries/ResultTableScaffold.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/ResultTableScaffold.tsx src/features/queries/ResultTableScaffold.test.tsx
git commit -m "feat(results): scaffold hides ignored rows live + provides hide affordance"
```

---

## Task 6: Selection-site parity — flip & insight views

Each edit swaps the inline crystal check for `isItemHidden(...)`, wires the two
new store values, and adds them to the surrounding `useMemo` deps. The
**wiring snippet** to add near each view's other `useSettingsStore` reads:

```ts
  const hideIgnored = useSettingsStore((s) => s.hideIgnored);
  const ignored = useIgnoredItemSet();
```

with imports (add to each file's import block):

```ts
import { isItemHidden } from '../queries/commonFilters'; // adjust relative path per file
import { useIgnoredItemSet } from '../settings/useIgnoredItems'; // adjust relative path
```

> Note: `CurrencyFlipView`, `EmptyShelfView`, `MaterialFlipView`, `VendorFlipView`
> already import from `../queries/commonFilters` (they use `CRYSTALS_SEARCH_CATEGORY`);
> add `isItemHidden` to that existing import. Relative path to settings from
> `features/insights/*` is `../settings/useIgnoredItems`.

**Files & exact edits:**

- [ ] **Step 1: `src/features/insights/MaterialFlipView.tsx`**

Replace line ~52:
`      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;`
with:
`      if (isItemHidden(item, { hideCrystals, hideIgnored, ignored })) continue;`
Add wiring snippet near the `const { world, hideCrystals } = useSettingsStore();` line. Add `hideIgnored, ignored` to the candidate `useMemo` deps array (currently `[snapshot.data, filter.searchCategories, filter.hq, hideCrystals]`).

- [ ] **Step 2: `src/features/insights/VendorFlipView.tsx`**

Replace `      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;` (line ~37) with `      if (isItemHidden(item, { hideCrystals, hideIgnored, ignored })) continue;`. Add wiring + deps (`[snapshot.data, vendors.data, hideCrystals]` → add `hideIgnored, ignored`).

- [ ] **Step 3: `src/features/insights/CurrencyFlipView.tsx`**

Replace `        if (hideCrystals && it.sc === CRYSTALS_SEARCH_CATEGORY) return false;` (line ~68) with `        if (isItemHidden(it, { hideCrystals, hideIgnored, ignored })) return false;`. Add wiring + deps (`[snapshot.data, shop.data, hideCrystals]`).

- [ ] **Step 4: `src/features/insights/EmptyShelfView.tsx`**

Replace `      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;` (line ~33) with `      if (isItemHidden(item, { hideCrystals, hideIgnored, ignored })) continue;`. Add wiring + deps (`[snapshot.data, filter.hq, hideCrystals]`).

- [ ] **Step 5: Run typecheck + relevant tests**

Run: `npx tsc --noEmit 2>&1 | grep -v bson` (expect no new errors)
Run: `npx vitest run src/features/insights/` (expect existing tests still pass)

- [ ] **Step 6: Commit**

```bash
git add src/features/insights/
git commit -m "feat(insights): honor ignore list in flip/shelf candidate selection"
```

---

## Task 7: Selection-site parity — queries, travel, heatmap

- [ ] **Step 1: `src/features/queries/QueriesView.tsx`**

Replace `        if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;` (line ~65) with `        if (isItemHidden(item, { hideCrystals, hideIgnored, ignored })) continue;`. Add wiring (`isItemHidden` is in the same folder → `import { isItemHidden } from './commonFilters';`; `useIgnoredItemSet` from `../settings/useIgnoredItems`). Add `hideIgnored, ignored` to the candidate `useMemo` deps (`[snapshot.data, isGathering, gatheringCatalog.data, hideCrystals]`).

- [ ] **Step 2: `src/features/travel/TravelPlannerView.tsx`**

Replace line ~64:
`      .filter((i) => !(hideCrystals && i.sc === CRYSTALS_SEARCH_CATEGORY))`
with:
`      .filter((i) => !isItemHidden(i, { hideCrystals, hideIgnored, ignored }))`
Add wiring (`import { isItemHidden } from '../queries/commonFilters';`, `import { useIgnoredItemSet } from '../settings/useIgnoredItems';`). Add `hideIgnored, ignored` to the `candidateIds` `useMemo` deps (`[snapshot.data, watchlistItems, hideCrystals, hq]`).

- [ ] **Step 3: `src/features/heatmap/HeatmapView.tsx`**

Replace `      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) return false;` (line ~79) with `      if (isItemHidden(item, { hideCrystals, hideIgnored, ignored })) return false;`. Add wiring (`import { isItemHidden } from '../queries/commonFilters';`, `import { useIgnoredItemSet } from '../settings/useIgnoredItems';`). Add `hideIgnored, ignored` to deps (`[snapshot.data, hideCrystals]`).

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit 2>&1 | grep -v bson`
Run: `npx vitest run src/features/travel/ src/features/queries/`

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/QueriesView.tsx src/features/travel/TravelPlannerView.tsx src/features/heatmap/HeatmapView.tsx
git commit -m "feat: honor ignore list in queries, travel, heatmap selection"
```

---

## Task 8: Selection-site parity — planners (gathering, craft batch, session, what-now, shopping list)

- [ ] **Step 1: `src/features/gathering/useGatheringQuery.ts`**

Replace `        if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;` (line ~56) with `        if (isItemHidden(item, { hideCrystals, hideIgnored, ignored })) continue;`. Add wiring: `import { isItemHidden } from '../queries/commonFilters';` and `import { useIgnoredItemSet } from '../settings/useIgnoredItems';`; in the hook body add `const hideIgnored = useSettingsStore((s) => s.hideIgnored); const ignored = useIgnoredItemSet();` near the existing `const { world, hideCrystals } = useSettingsStore();`. Add `hideIgnored, ignored` to that memo's deps.

- [ ] **Step 2: `src/features/craftBatch/CraftBatchView.tsx`**

Replace `      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;` (line ~67) with `      if (isItemHidden(item, { hideCrystals, hideIgnored, ignored })) continue;`. Add wiring (paths: `../queries/commonFilters`, `../settings/useIgnoredItems`). Add `hideIgnored, ignored` to deps (`[snapshot.data, recipes.data, hideCrystals]`).

- [ ] **Step 3: `src/features/session/SessionPlanner.tsx`**

Replace line ~87:
`      .filter((i) => !(settings.hideCrystals && i.sc === CRYSTALS_SEARCH_CATEGORY))`
with:
`      .filter((i) => !isItemHidden(i, { hideCrystals: settings.hideCrystals, hideIgnored, ignored }))`
Add wiring (`import { isItemHidden } from '../queries/commonFilters';`, `import { useIgnoredItemSet } from '../settings/useIgnoredItems';`, and `const hideIgnored = useSettingsStore((s) => s.hideIgnored); const ignored = useIgnoredItemSet();`). Add `hideIgnored, ignored` to deps (`[snapshot.data, settings.hideCrystals]`).

- [ ] **Step 4: `src/features/whatnow/WhatNowView.tsx`**

Replace line ~172:
`      if (item && item.sc > 0 && !(hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY)) ids.add(id);`
with:
`      if (item && item.sc > 0 && !isItemHidden(item, { hideCrystals, hideIgnored, ignored })) ids.add(id);`
Add wiring (`../queries/commonFilters`, `../settings/useIgnoredItems`). Add `hideIgnored, ignored` to that memo's deps.

- [ ] **Step 5: `src/routes/ShoppingList.tsx` — intentionally NO change**

Verified: its `hideCrystals` use (line ~61) builds a crystal-id set that is
excluded from the **materials buy list** (ingredient axis), not a list of
sellable/scan output items. The ignore list is an output-axis concept (items you
don't want to *see*), so excluding an ignored item from a materials buy list
would wrongly drop a material a craft needs. Leave this file unchanged. (Same
rationale as `craftFromInventory` ingredient excludes — Task 9.)

- [ ] **Step 6: Typecheck + full test run**

Run: `npx tsc --noEmit 2>&1 | grep -v bson`
Run: `npx vitest run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/features/gathering/useGatheringQuery.ts src/features/craftBatch/CraftBatchView.tsx src/features/session/SessionPlanner.tsx src/features/whatnow/WhatNowView.tsx
git commit -m "feat: honor ignore list in gathering/craft/session/what-now planners"
```

---

## Task 9: `craftFromInventory` — filter ignored craftable OUTPUTS (keep ingredient excludes)

**Files:**
- Modify: `src/features/craftFromInventory/CraftFromInventoryView.tsx`

Confirmed facts: this view does NOT use `ResultTableScaffold`. Its `rows` memo
(line ~50–82) returns `findCraftableFromInventory(...)` results; each row's
output item id is `row.recipeItemId` (see the `marketIds` memo at line ~84–93).
The existing `excludeIngredientIds` (line ~70) is ingredient-axis and MUST stay
keyed on `hideCrystals` only — do not touch it.

- [ ] **Step 1: Add wiring imports**

Add to the import block:

```ts
import { useIgnoredItemSet } from '../settings/useIgnoredItems';
```

`useSettingsStore` is already imported (line ~25).

- [ ] **Step 2: Read the store values**

Near `const hideCrystals = useSettingsStore((s) => s.hideCrystals);` (line ~25) add:

```ts
  const hideIgnored = useSettingsStore((s) => s.hideIgnored);
  const ignored = useIgnoredItemSet();
```

- [ ] **Step 3: Filter ignored outputs inside the `rows` memo**

Change the `return findCraftableFromInventory(...)` (line ~74) so the result is
filtered before returning:

```ts
    const found = findCraftableFromInventory(inventory, recipes.data, namesById, {
      maxMissing,
      marketableOnly,
      velocityMap,
      vendorMap,
      gatheringSet,
      excludeIngredientIds,
    });
    return hideIgnored ? found.filter((r) => !ignored.has(r.recipeItemId)) : found;
```

Add `hideIgnored, ignored` to the `rows` memo dependency array (currently ends
`…gathering.data, hideCrystals, snapshot.data]`). Because the count line, empty
state, render, and `marketIds` all derive from `rows`, they update automatically.

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit 2>&1 | grep -v bson`
Run: `npx vitest run src/features/craftFromInventory/`

- [ ] **Step 5: Commit**

```bash
git add src/features/craftFromInventory/CraftFromInventoryView.tsx
git commit -m "feat(craftFromInventory): hide ignored craftable outputs (ingredient excludes unchanged)"
```

---

## Task 10: Dashboard "What changed" movers respect the ignore list

**Files:**
- Modify: `src/features/dashboard/tiles/ChangedDigest.tsx`
- Test: `src/features/dashboard/tiles/ChangedDigest.test.tsx` (create if absent; otherwise add a case)

- [ ] **Step 1: Write the failing test**

Create `src/features/dashboard/tiles/ChangedDigest.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChangedDigest } from './ChangedDigest';
import { useSettingsStore } from '../../settings/store';
import type { MoversDigest } from '../aggregate';

const row = (id: number, name: string) => ({ id, name, delta: 10, dcMinHQ: 100, dcMinNQ: 100, staleDays: 0, craftable: false, profit: 0 } as any);
const digest: MoversDigest = { gainers: [row(1, 'KeepUp'), row(2, 'DropUp')], losers: [], stale: [] } as any;

describe('ChangedDigest ignore filtering', () => {
  beforeEach(() => useSettingsStore.setState({ ignoredItemIds: [], hideIgnored: true }));

  it('omits ignored items from the movers columns', () => {
    useSettingsStore.setState({ ignoredItemIds: [2], hideIgnored: true });
    render(<MemoryRouter><ChangedDigest digest={digest} /></MemoryRouter>);
    expect(screen.getByText('KeepUp')).toBeInTheDocument();
    expect(screen.queryByText('DropUp')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/dashboard/tiles/ChangedDigest.test.tsx`
Expected: FAIL — "DropUp" present.

- [ ] **Step 3: Implement the filter**

In `src/features/dashboard/tiles/ChangedDigest.tsx`, add imports:

```ts
import { useMemo } from 'react';
import { useSettingsStore } from '../../settings/store';
import { useIgnoredItemSet } from '../../settings/useIgnoredItems';
```

At the top of the `ChangedDigest` component body, derive a filtered digest and use it in place of `digest` for the three columns:

```ts
  const hideIgnored = useSettingsStore((s) => s.hideIgnored);
  const ignored = useIgnoredItemSet();
  const shown = useMemo(() => {
    if (!hideIgnored) return digest;
    const keep = <T extends { id: number }>(rs: T[]) => rs.filter((r) => !ignored.has(r.id));
    return { ...digest, gainers: keep(digest.gainers), losers: keep(digest.losers), stale: keep(digest.stale) };
  }, [digest, hideIgnored, ignored]);
```

Then change the three `<Column … rows={digest.gainers}/…losers/…stale>` references to `shown.gainers` / `shown.losers` / `shown.stale`. (Leave `newPatchItems` as-is unless you also want patch movers filtered — out of scope.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/dashboard/tiles/ChangedDigest.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/tiles/ChangedDigest.tsx src/features/dashboard/tiles/ChangedDigest.test.tsx
git commit -m "feat(dashboard): What-changed movers respect the ignore list"
```

---

## Task 11: Settings — "Ignored items" management section

**Files:**
- Modify: `src/routes/Settings.tsx`

- [ ] **Step 1: Read the surrounding Settings code**

Run: `git grep -n "Filters\|SectionHeader\|hideCrystals\|useSnapshotById" src/routes/Settings.tsx`
Confirm the `Filters` `<section>` (ends ~line 220) and how `SectionHeader` is used.

- [ ] **Step 2: Add store reads**

Near the other `useSettingsStore` selectors at the top of the Settings component, add:

```ts
  const ignoredItemIds = useSettingsStore((s) => s.ignoredItemIds);
  const hideIgnored = useSettingsStore((s) => s.hideIgnored);
  const setHideIgnored = useSettingsStore((s) => s.setHideIgnored);
  const unignoreItem = useSettingsStore((s) => s.unignoreItem);
  const clearIgnored = useSettingsStore((s) => s.clearIgnored);
```

- [ ] **Step 3: Add the section UI**

Immediately after the closing `</section>` of the `Filters` section, insert:

```tsx
      <section>
        <SectionHeader label="Ignored items" />
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={hideIgnored}
            onChange={(e) => setHideIgnored(e.target.checked)}
            className="accent-gold w-4 h-4"
          />
          <span className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
            Hide ignored items
          </span>
        </label>
        <p className="font-mono text-[10px] text-text-low mt-1 ml-6">
          Turn off to temporarily show ignored items again without losing your list.
          Add items by clicking the ✕ next to an item in any scan.
        </p>
        <IgnoredItemsList ids={ignoredItemIds} onRemove={unignoreItem} onClear={clearIgnored} />
      </section>
```

- [ ] **Step 4: Add the `IgnoredItemsList` helper component**

At the bottom of `src/routes/Settings.tsx` (alongside `DensityToggle`), add:

```tsx
function IgnoredItemsList({ ids, onRemove, onClear }: {
  ids: number[]; onRemove: (id: number) => void; onClear: () => void;
}) {
  const byId = useSnapshotById();
  if (ids.length === 0) {
    return <p className="font-mono text-[10px] text-text-low mt-2 ml-6 italic">No ignored items yet.</p>;
  }
  return (
    <div className="mt-2 ml-6 space-y-1">
      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
        {ids.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 border border-border-base px-1.5 py-0.5 font-mono text-[10px] text-text-cream">
            {byId.get(id)?.name ?? `#${id}`}
            <button
              type="button"
              onClick={() => onRemove(id)}
              title="Remove from ignore list"
              aria-label={`Stop ignoring ${byId.get(id)?.name ?? id}`}
              className="text-text-low hover:text-crimson transition-colors"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="font-mono text-[10px] tracking-widest uppercase text-text-dim hover:text-crimson transition-colors"
      >
        Clear all ({ids.length})
      </button>
    </div>
  );
}
```

Add the import at the top of `Settings.tsx` if not present:

```ts
import { useSnapshotById } from '../features/queries/useSnapshotById';
```

- [ ] **Step 5: Typecheck + run app build check**

Run: `npx tsc --noEmit 2>&1 | grep -v bson`
Run: `npx vitest run src/routes/` (existing Settings/route tests still pass)

- [ ] **Step 6: Commit**

```bash
git add src/routes/Settings.tsx
git commit -m "feat(settings): Ignored items management section (toggle, list, clear)"
```

---

## Task 12: Full verification

- [ ] **Step 1: Lint, typecheck, full test suite**

Run: `npx eslint src --max-warnings 0`
Run: `npx tsc --noEmit 2>&1 | grep -v bson` (only the pre-existing unrelated `bson` error is acceptable)
Run: `npx vitest run`
Expected: lint clean, no new type errors, all tests green.

- [ ] **Step 2: Manual smoke (optional, behind auth gate)**

If a dev server is available and logged in: open a scan (e.g., Material Flip), click a row's ✕, confirm the row disappears and a chip appears in Settings → Ignored items. Toggle "Hide ignored items" off → the item reappears across scans. Remove it from Settings → it stays visible.

- [ ] **Step 3: Final commit (if any residual changes)**

```bash
git add -A && git commit -m "chore(ignore-filter): final lint/typecheck pass" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Relative import paths differ by folder.** From `features/insights/*` and
  `features/travel/*` etc., `commonFilters` is `../queries/commonFilters` and the
  hook is `../settings/useIgnoredItems`. From `features/queries/*`, it's
  `./commonFilters`. From `src/routes/*`, prefix with `../features/`.
- **`useMemo` deps:** every site that now reads `hideIgnored`/`ignored` inside a
  memo MUST add both to that memo's dependency array, or the scan won't react to
  toggling the master switch or ignoring an item.
- **Don't double-filter blindly:** table views already get a live display filter
  from Task 5; the selection-site edits (Tasks 6–9) add scan-time parity so
  ignored items aren't priced and are also hidden on non-table surfaces. Both are
  intended.
