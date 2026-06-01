# Craft Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Shopping List into a Craft Helper that proposes what to craft, gather, and buy; fix the add-to-list recipe-gate bug; and hide the web "Plan" page unless the plugin is connected.

**Architecture:** A new pure `buildCraftPlan` runs the existing cycle-safe `explode()` recursively across every target item and sorts the result into three buckets — Craft (anything with a recipe), Gather (leaves in the gathering catalog), Buy (other leaves). The Buy bucket feeds the existing `surveyIngredients`/`ShoppingListPlan` pricing stack unchanged. The add button stops depending on recipes entirely (kills the bug). The sidebar "Plan" item is gated on `usePluginBridge().connected`.

**Tech Stack:** React 18 + TypeScript, Zustand (persisted store), TanStack Query, Vitest + Testing Library, Tailwind. Tests run with `npx vitest run <file>`.

---

## File structure

**New**
- `src/bot/craftExplode.test.ts` — covers the new `forceLeaf` option (no existing test file).
- `src/features/shoppingList/buildCraftPlan.ts` — the 3-bucket engine.
- `src/features/shoppingList/buildCraftPlan.test.ts`
- `src/features/shoppingList/CraftSection.tsx` — Craft bucket display + per-row "Buy instead".
- `src/features/shoppingList/CraftSection.test.tsx`
- `src/features/shoppingList/GatherSection.tsx` — Gather bucket display + per-row "Buy instead".
- `src/features/shoppingList/GatherSection.test.tsx`
- `src/components/layout/Sidebar.test.tsx` — Plan gating.

**Modified**
- `src/bot/craftExplode.ts` — add optional `forceLeaf` predicate.
- `src/features/shoppingList/AddToShoppingListButton.tsx` — drop recipe gate; relabel.
- `src/features/shoppingList/AddToShoppingListButton.test.tsx` — rewrite for new behavior.
- `src/features/shoppingList/ShoppingListPanel.tsx` — remove "not craftable" search-add gate.
- `src/features/shoppingList/ShoppingListPanel.test.tsx` — adjust if it asserts the gate.
- `src/routes/Item.tsx` — `<AddToShoppingListButton itemId={itemId} />` (drop `hasRecipe`).
- `src/routes/ShoppingList.tsx` — orchestrate Craft/Gather/Buy via `buildCraftPlan` + overrides; relabel.
- `src/components/layout/Sidebar.tsx` — relabel "Shopping" → "Craft Helper"; gate "Plan".
- `src/App.tsx` — `PAGE_TITLES` relabel; `/craft-helper` redirect alias.

**Reused untouched:** `src/bot/craftExplode.ts` (`explode`), `surveyIngredients`, `ShoppingListPlan.tsx`, `useGatheringCatalog`.

---

## Task 1: Extend `explode` with a `forceLeaf` predicate

Lets `buildCraftPlan` stop recursion at a node the user chose to buy/gather instead of craft. Backward-compatible (optional, default no-op).

**Files:**
- Modify: `src/bot/craftExplode.ts:14-67`
- Test: `src/bot/craftExplode.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/bot/craftExplode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { explode } from './craftExplode';
import type { Recipe } from '../lib/recipes';

function mkRecipe(itemId: number, ingredients: { itemId: number; amount: number }[]): Recipe {
  return { itemResultId: itemId, classJob: 'CRP', recipeLevel: 1, ingredients };
}

describe('explode', () => {
  it('recurses fully by default (deep tree)', () => {
    // 100 -> 2x 50 -> 4x 10 (10 is a raw leaf)
    const recipes = new Map<number, Recipe>([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
    ]);
    const { crafts, leaves } = explode(100, 1, recipes);
    expect(crafts.has(100)).toBe(true);
    expect(crafts.has(50)).toBe(true);   // intermediate is crafted
    expect(leaves.get(10)).toBe(8);      // raw leaf, 2*4
    expect(leaves.has(50)).toBe(false);
  });

  it('treats a forceLeaf node as a leaf and stops recursing it', () => {
    const recipes = new Map<number, Recipe>([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
    ]);
    const { crafts, leaves } = explode(100, 1, recipes, {
      forceLeaf: (id) => id === 50,
    });
    expect(crafts.has(50)).toBe(false);  // not crafted
    expect(leaves.get(50)).toBe(2);      // bought as a leaf instead
    expect(leaves.has(10)).toBe(false);  // its children are NOT expanded
  });

  it('never forces the top-level target to a leaf', () => {
    const recipes = new Map<number, Recipe>([
      [100, mkRecipe(100, [{ itemId: 10, amount: 3 }])],
    ]);
    const { crafts } = explode(100, 1, recipes, { forceLeaf: () => true });
    expect(crafts.has(100)).toBe(true);  // target still crafted
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bot/craftExplode.test.ts`
Expected: FAIL — the `forceLeaf` test fails (50 still crafted) because the option doesn't exist yet.

- [ ] **Step 3: Add the option to `ExplodeOpts` and the walk**

In `src/bot/craftExplode.ts`, add the field to the interface (currently lines 14-17):

```ts
export interface ExplodeOpts {
  craftIntermediates?: boolean;  // default true
  maxDepth?: number;            // default 20
  forceLeaf?: (id: number) => boolean;  // treat matching non-target nodes as leaves
}
```

Then in `walk`, replace the craft condition (currently line 45 `if (recipe && (id === targetId || craftIntermediates)) {`) with:

```ts
    const forcedLeaf = id !== targetId && (opts.forceLeaf?.(id) ?? false);
    // Craft if: recipe exists, not forced to leaf, AND (top-level target OR crafting intermediates)
    if (recipe && !forcedLeaf && (id === targetId || craftIntermediates)) {
```

(Leave the rest of the function unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bot/craftExplode.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/bot/craftExplode.ts src/bot/craftExplode.test.ts
git commit -m "feat(craft): add forceLeaf option to explode"
```

---

## Task 2: `buildCraftPlan` engine

Pure function that produces the three buckets from the shopping list.

**Files:**
- Create: `src/features/shoppingList/buildCraftPlan.ts`
- Test: `src/features/shoppingList/buildCraftPlan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/shoppingList/buildCraftPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCraftPlan, type SourceKind } from './buildCraftPlan';
import type { Recipe } from '../../lib/recipes';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import type { ShoppingListItem } from './shoppingListStore';

function mkRecipe(itemId: number, ingredients: { itemId: number; amount: number }[]): Recipe {
  return { itemResultId: itemId, classJob: 'CRP', recipeLevel: 1, ingredients };
}
function item(id: number, qty = 1): ShoppingListItem {
  return { id, qty, craftIntermediates: false };
}
const noGather: GatheringCatalog = new Map();

describe('buildCraftPlan', () => {
  it('returns empty buckets for an empty list', () => {
    const plan = buildCraftPlan([], new Map(), noGather);
    expect(plan.craft.size).toBe(0);
    expect(plan.gather.size).toBe(0);
    expect(plan.buy.size).toBe(0);
  });

  it('crafts the target and buys a non-gatherable leaf', () => {
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
    ]);
    const plan = buildCraftPlan([item(100)], recipes, noGather);
    expect(plan.craft.get(100)?.craftCount).toBe(1);
    expect(plan.buy.get(5)).toBe(3);
    expect(plan.gather.size).toBe(0);
  });

  it('routes a gatherable leaf into the gather bucket with level/timed', () => {
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
    ]);
    const gathering: GatheringCatalog = new Map([[5, { level: 50, timed: true, hidden: false }]]);
    const plan = buildCraftPlan([item(100)], recipes, gathering);
    expect(plan.gather.get(5)).toEqual({ qty: 3, level: 50, timed: true });
    expect(plan.buy.has(5)).toBe(false);
  });

  it('recurses fully: crafts intermediates, leaves bottom out', () => {
    // 100 -> 2x 50 -> 4x 10 (raw)
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
    ]);
    const plan = buildCraftPlan([item(100)], recipes, noGather);
    expect(plan.craft.has(100)).toBe(true);
    expect(plan.craft.has(50)).toBe(true);
    expect(plan.buy.get(10)).toBe(8);
    expect(plan.buy.has(50)).toBe(false);
  });

  it('override "buy" on an intermediate stops recursion and moves it to buy', () => {
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 50, amount: 2 }])],
      [50, mkRecipe(50, [{ itemId: 10, amount: 4 }])],
    ]);
    const overrides = new Map<number, SourceKind>([[50, 'buy']]);
    const plan = buildCraftPlan([item(100)], recipes, noGather, overrides);
    expect(plan.craft.has(50)).toBe(false);
    expect(plan.buy.get(50)).toBe(2);
    expect(plan.buy.has(10)).toBe(false);
  });

  it('override "buy" on a gatherable leaf moves it from gather to buy', () => {
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
    ]);
    const gathering: GatheringCatalog = new Map([[5, { level: 50, timed: false, hidden: false }]]);
    const overrides = new Map<number, SourceKind>([[5, 'buy']]);
    const plan = buildCraftPlan([item(100)], recipes, gathering, overrides);
    expect(plan.gather.has(5)).toBe(false);
    expect(plan.buy.get(5)).toBe(3);
  });

  it('merges quantities across multiple targets', () => {
    const recipes = new Map<number, Recipe | null>([
      [100, mkRecipe(100, [{ itemId: 5, amount: 3 }])],
      [200, mkRecipe(200, [{ itemId: 5, amount: 4 }])],
    ]);
    const plan = buildCraftPlan([item(100, 1), item(200, 2)], recipes, noGather);
    expect(plan.buy.get(5)).toBe(3 + 4 * 2); // 11
  });

  it('puts a non-craftable target into a bucket (gather if gatherable, else buy)', () => {
    const gathering: GatheringCatalog = new Map([[7, { level: 10, timed: false, hidden: false }]]);
    const plan = buildCraftPlan(
      [item(7), item(9)],
      new Map<number, Recipe | null>([[7, null], [9, null]]),
      gathering,
    );
    expect(plan.gather.get(7)?.qty).toBe(1);
    expect(plan.buy.get(9)).toBe(1);
    expect(plan.craft.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/buildCraftPlan.test.ts`
Expected: FAIL with "Failed to resolve import './buildCraftPlan'".

- [ ] **Step 3: Write the implementation**

Create `src/features/shoppingList/buildCraftPlan.ts`:

```ts
import { explode } from '../../bot/craftExplode';
import type { Recipe } from '../../lib/recipes';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import type { ShoppingListItem } from './shoppingListStore';

export type SourceKind = 'craft' | 'gather' | 'buy';

export interface CraftPlan {
  /** Items to synthesize (targets + craftable intermediates). */
  craft: Map<number, { qty: number; craftCount: number; job: string }>;
  /** Raw leaves available from gathering nodes. */
  gather: Map<number, { qty: number; level: number; timed: boolean }>;
  /** Leaves to purchase (fed into surveyIngredients). itemId -> qty. */
  buy: Map<number, number>;
}

export function buildCraftPlan(
  items: ShoppingListItem[],
  recipeMap: Map<number, Recipe | null>,
  gathering: GatheringCatalog,
  overrides: Map<number, SourceKind> = new Map(),
): CraftPlan {
  const craft: CraftPlan['craft'] = new Map();
  const leaves = new Map<number, number>();

  // A node the user chose to buy/gather instead of craft becomes a leaf.
  const forceLeaf = (id: number) => {
    const o = overrides.get(id);
    return o === 'buy' || o === 'gather';
  };

  // explode truthy-checks recipes.get(id), so null snapshot entries are safe.
  const recipes = recipeMap as Map<number, Recipe>;

  for (const it of items) {
    const { crafts, leaves: lv } = explode(it.id, it.qty, recipes, {
      craftIntermediates: true,
      forceLeaf,
    });
    for (const [id, c] of crafts) {
      const ex = craft.get(id);
      if (ex) {
        ex.qty += c.outputQty;
        ex.craftCount += c.craftCount;
      } else {
        craft.set(id, { qty: c.outputQty, craftCount: c.craftCount, job: c.job });
      }
    }
    for (const [id, qty] of lv) leaves.set(id, (leaves.get(id) ?? 0) + qty);
  }

  const gather: CraftPlan['gather'] = new Map();
  const buy: CraftPlan['buy'] = new Map();
  for (const [id, qty] of leaves) {
    const info = gathering.get(id);
    const forcedBuy = overrides.get(id) === 'buy';
    if (info && !forcedBuy) {
      gather.set(id, { qty, level: info.level, timed: info.timed });
    } else {
      buy.set(id, qty);
    }
  }

  return { craft, gather, buy };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/shoppingList/buildCraftPlan.test.ts`
Expected: PASS (8 passing).

- [ ] **Step 5: Commit**

```bash
git add src/features/shoppingList/buildCraftPlan.ts src/features/shoppingList/buildCraftPlan.test.ts
git commit -m "feat(craft): add buildCraftPlan three-bucket engine"
```

---

## Task 3: Fix the add-to-list button (remove the recipe gate)

The button must never depend on recipe availability — that kills both the loading-race "Not craftable" lie and the non-craftable exclusion.

**Files:**
- Modify: `src/features/shoppingList/AddToShoppingListButton.tsx`
- Modify: `src/routes/Item.tsx:340`
- Test: `src/features/shoppingList/AddToShoppingListButton.test.tsx` (rewrite)

- [ ] **Step 1: Rewrite the test for new behavior**

Replace the entire contents of `src/features/shoppingList/AddToShoppingListButton.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddToShoppingListButton } from './AddToShoppingListButton';
import { useShoppingListStore, defaultShoppingList } from './shoppingListStore';

beforeEach(() => {
  localStorage.clear();
  useShoppingListStore.setState(defaultShoppingList());
});

describe('AddToShoppingListButton', () => {
  it('renders an enabled add button for any item (no recipe required)', () => {
    render(<AddToShoppingListButton itemId={1} />);
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toContain('Craft Helper');
  });

  it('adds the item to the store on click', () => {
    render(<AddToShoppingListButton itemId={42} />);
    fireEvent.click(screen.getByRole('button'));
    expect(useShoppingListStore.getState().items).toEqual([
      { id: 42, qty: 1, craftIntermediates: false },
    ]);
  });

  it('renders "On list · Remove" when the item is already on the list', () => {
    useShoppingListStore.getState().addItem(42);
    render(<AddToShoppingListButton itemId={42} />);
    expect(screen.getByRole('button').textContent).toContain('On list');
  });

  it('removes the item on click when already on the list', () => {
    useShoppingListStore.getState().addItem(42);
    render(<AddToShoppingListButton itemId={42} />);
    fireEvent.click(screen.getByRole('button'));
    expect(useShoppingListStore.getState().items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/AddToShoppingListButton.test.tsx`
Expected: FAIL — the first test fails because the component still requires `hasRecipe` and renders "Not craftable".

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/features/shoppingList/AddToShoppingListButton.tsx`:

```tsx
import { useShoppingListStore } from './shoppingListStore';

interface Props {
  itemId: number;
}

export function AddToShoppingListButton({ itemId }: Props) {
  const items = useShoppingListStore((s) => s.items);
  const addItem = useShoppingListStore((s) => s.addItem);
  const removeItem = useShoppingListStore((s) => s.removeItem);
  const onList = items.some((i) => i.id === itemId);

  if (onList) {
    return (
      <button
        onClick={() => removeItem(itemId)}
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-crimson hover:text-crimson transition-colors"
      >
        ✓ On list · Remove
      </button>
    );
  }

  return (
    <button
      onClick={() => addItem(itemId)}
      className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-3 py-2 hover:bg-aether hover:text-bg-deep transition-colors"
    >
      + Craft Helper
    </button>
  );
}
```

- [ ] **Step 4: Update the call site in `Item.tsx`**

In `src/routes/Item.tsx` line 340, change:

```tsx
          <AddToShoppingListButton itemId={itemId} hasRecipe={recipe != null} />
```

to:

```tsx
          <AddToShoppingListButton itemId={itemId} />
```

- [ ] **Step 5: Run tests + typecheck to verify they pass**

Run: `npx vitest run src/features/shoppingList/AddToShoppingListButton.test.tsx`
Expected: PASS (4 passing).

Run: `npx tsc --noEmit`
Expected: no errors (confirms no other caller still passes `hasRecipe`).

- [ ] **Step 6: Commit**

```bash
git add src/features/shoppingList/AddToShoppingListButton.tsx src/features/shoppingList/AddToShoppingListButton.test.tsx src/routes/Item.tsx
git commit -m "fix(craft): let any item be added from the item page"
```

---

## Task 4: Remove the "not craftable" gate from panel search-add

**Files:**
- Modify: `src/features/shoppingList/ShoppingListPanel.tsx:35-51`
- Test: `src/features/shoppingList/ShoppingListPanel.test.tsx`

- [ ] **Step 1: Add a failing test**

Open `src/features/shoppingList/ShoppingListPanel.test.tsx`. If a test asserts the "not craftable" error on search-add, delete it. Add this test inside the existing top-level `describe(...)` block (match the file's existing render/provider helper — reuse whatever `render` wrapper the other tests in this file use):

```tsx
  it('adds a non-craftable item from the search box', () => {
    useShoppingListStore.setState(defaultShoppingList());
    const searchable = [{ id: 7, name: 'Copper Ore', hasRecipe: false }];
    render(<ShoppingListPanel searchableItems={searchable} onPlan={() => {}} />);
    fireEvent.change(screen.getByLabelText(/search item/i), { target: { value: 'copper' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(useShoppingListStore.getState().items.map((i) => i.id)).toContain(7);
  });
```

Ensure the test file imports `defaultShoppingList` from `./shoppingListStore` and `fireEvent`, `screen` from `@testing-library/react` (add to existing imports if missing).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/ShoppingListPanel.test.tsx`
Expected: FAIL — the item is not added because `handleAdd` rejects non-craftable matches.

- [ ] **Step 3: Remove the gate**

In `src/features/shoppingList/ShoppingListPanel.tsx`, delete these lines from `handleAdd` (currently lines 44-47):

```tsx
    if (!match.hasRecipe) {
      setError(`"${match.name}" is not craftable.`);
      return;
    }
```

Leave the rest of `handleAdd` intact (it still calls `addItem(match.id, Math.max(1, qty))`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/shoppingList/ShoppingListPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/shoppingList/ShoppingListPanel.tsx src/features/shoppingList/ShoppingListPanel.test.tsx
git commit -m "fix(craft): allow non-craftable items in panel search-add"
```

---

## Task 5: Craft + Gather section components

Display the Craft and Gather buckets, each with a per-row "Buy instead" override (non-target rows only, for Craft).

**Files:**
- Create: `src/features/shoppingList/CraftSection.tsx` + `.test.tsx`
- Create: `src/features/shoppingList/GatherSection.tsx` + `.test.tsx`

- [ ] **Step 1: Write the failing CraftSection test**

Create `src/features/shoppingList/CraftSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CraftSection } from './CraftSection';

const craft = new Map([
  [100, { qty: 1, craftCount: 1, job: 'CRP' }],
  [50, { qty: 2, craftCount: 1, job: 'BSM' }],
]);
const nameById = new Map([[100, 'Oak Chair'], [50, 'Oak Lumber']]);

function ui(node: React.ReactNode) {
  return <MemoryRouter>{node}</MemoryRouter>;
}

describe('CraftSection', () => {
  it('renders a row per craftable item with its job', () => {
    render(ui(<CraftSection craft={craft} targetIds={new Set([100])} nameById={nameById} onBuyInstead={() => {}} />));
    expect(screen.getByText('Oak Chair')).toBeInTheDocument();
    expect(screen.getByText('Oak Lumber')).toBeInTheDocument();
    expect(screen.getByText('BSM')).toBeInTheDocument();
  });

  it('offers "Buy instead" only for non-target intermediates', () => {
    const onBuy = vi.fn();
    render(ui(<CraftSection craft={craft} targetIds={new Set([100])} nameById={nameById} onBuyInstead={onBuy} />));
    const buyButtons = screen.getAllByRole('button', { name: /buy instead/i });
    expect(buyButtons).toHaveLength(1); // only the intermediate (50), not the target (100)
    fireEvent.click(buyButtons[0]);
    expect(onBuy).toHaveBeenCalledWith(50);
  });

  it('renders nothing when the craft bucket is empty', () => {
    const { container } = render(ui(<CraftSection craft={new Map()} targetIds={new Set()} nameById={nameById} onBuyInstead={() => {}} />));
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/CraftSection.test.tsx`
Expected: FAIL with "Failed to resolve import './CraftSection'".

- [ ] **Step 3: Implement CraftSection**

Create `src/features/shoppingList/CraftSection.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { CraftPlan } from './buildCraftPlan';

interface Props {
  craft: CraftPlan['craft'];
  targetIds: Set<number>;
  nameById: Map<number, string>;
  onBuyInstead: (id: number) => void;
}

export function CraftSection({ craft, targetIds, nameById, onBuyInstead }: Props) {
  if (craft.size === 0) return null;
  const rows = [...craft.entries()];
  return (
    <div>
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2">
        Craft ({rows.length})
      </div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-left px-3 py-2">Job</th>
              <th className="text-right px-3 py-2">Crafts</th>
              <th className="text-right px-3 py-2">Output</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, c]) => (
              <tr key={id} className="border-t border-border-base hover:bg-bg-card-hi transition-colors">
                <td className="px-3 py-2">
                  <Link to={`/item/${id}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                    {nameById.get(id) ?? `Item #${id}`}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-text-low">{c.job}</td>
                <td className="px-3 py-2 text-right font-mono">{c.craftCount}</td>
                <td className="px-3 py-2 text-right font-mono">{c.qty}</td>
                <td className="px-3 py-2 text-right">
                  {!targetIds.has(id) && (
                    <button
                      type="button"
                      onClick={() => onBuyInstead(id)}
                      className="font-mono text-[10px] tracking-widest uppercase px-2 py-1 border border-border-base text-text-dim hover:text-aether hover:border-aether transition-colors"
                    >
                      Buy instead
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run CraftSection test to verify it passes**

Run: `npx vitest run src/features/shoppingList/CraftSection.test.tsx`
Expected: PASS (3 passing).

- [ ] **Step 5: Write the failing GatherSection test**

Create `src/features/shoppingList/GatherSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GatherSection } from './GatherSection';

const gather = new Map([
  [5, { qty: 8, level: 50, timed: false }],
  [6, { qty: 3, level: 90, timed: true }],
]);
const nameById = new Map([[5, 'Iron Ore'], [6, 'Darksteel Ore']]);

function ui(node: React.ReactNode) {
  return <MemoryRouter>{node}</MemoryRouter>;
}

describe('GatherSection', () => {
  it('renders a row per gatherable with level and qty', () => {
    render(ui(<GatherSection gather={gather} nameById={nameById} onBuyInstead={() => {}} />));
    expect(screen.getByText('Iron Ore')).toBeInTheDocument();
    expect(screen.getByText('Darksteel Ore')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('calls onBuyInstead with the row id', () => {
    const onBuy = vi.fn();
    render(ui(<GatherSection gather={gather} nameById={nameById} onBuyInstead={onBuy} />));
    fireEvent.click(screen.getAllByRole('button', { name: /buy instead/i })[0]);
    expect(onBuy).toHaveBeenCalledWith(5);
  });

  it('renders nothing when empty', () => {
    const { container } = render(ui(<GatherSection gather={new Map()} nameById={nameById} onBuyInstead={() => {}} />));
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/GatherSection.test.tsx`
Expected: FAIL with "Failed to resolve import './GatherSection'".

- [ ] **Step 7: Implement GatherSection**

Create `src/features/shoppingList/GatherSection.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { CraftPlan } from './buildCraftPlan';

interface Props {
  gather: CraftPlan['gather'];
  nameById: Map<number, string>;
  onBuyInstead: (id: number) => void;
}

export function GatherSection({ gather, nameById, onBuyInstead }: Props) {
  if (gather.size === 0) return null;
  const rows = [...gather.entries()];
  return (
    <div>
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-2 flex items-center gap-2">
        <span>Gather ({rows.length})</span>
        <Link to="/gathering/plan" className="text-aether hover:underline decoration-1 underline-offset-4 normal-case tracking-normal">
          open gathering plan →
        </Link>
      </div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Lvl</th>
              <th className="text-right px-3 py-2">Qty</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, g]) => (
              <tr key={id} className="border-t border-border-base hover:bg-bg-card-hi transition-colors">
                <td className="px-3 py-2">
                  <Link to={`/item/${id}`} className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4">
                    {nameById.get(id) ?? `Item #${id}`}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right font-mono">{g.level}</td>
                <td className="px-3 py-2 text-right font-mono">{g.qty}</td>
                <td className="px-3 py-2 font-mono text-text-low">{g.timed ? 'timed' : 'standard'}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onBuyInstead(id)}
                    className="font-mono text-[10px] tracking-widest uppercase px-2 py-1 border border-border-base text-text-dim hover:text-aether hover:border-aether transition-colors"
                  >
                    Buy instead
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run GatherSection test to verify it passes**

Run: `npx vitest run src/features/shoppingList/GatherSection.test.tsx`
Expected: PASS (3 passing).

- [ ] **Step 9: Commit**

```bash
git add src/features/shoppingList/CraftSection.tsx src/features/shoppingList/CraftSection.test.tsx src/features/shoppingList/GatherSection.tsx src/features/shoppingList/GatherSection.test.tsx
git commit -m "feat(craft): add Craft and Gather section components"
```

---

## Task 6: Wire the route to render the three buckets

Replace the single ingredient aggregate with `buildCraftPlan`; render Craft + Gather immediately; feed the Buy bucket into the existing survey/plan (still gated by the "Plan" button to avoid eager market fetches).

**Files:**
- Modify: `src/routes/ShoppingList.tsx`

- [ ] **Step 1: Add the gathering catalog + plan + overrides wiring**

In `src/routes/ShoppingList.tsx`, update imports — remove `aggregateIngredients`, add:

```tsx
import { useState } from 'react'; // ensure useState is imported (already used below)
import { buildCraftPlan, type SourceKind } from '../features/shoppingList/buildCraftPlan';
import { CraftSection } from '../features/shoppingList/CraftSection';
import { GatherSection } from '../features/shoppingList/GatherSection';
import { useGatheringCatalog } from '../features/queries/useGatheringCatalog';
```

Inside the component, add the catalog query and override state near the top (after `const recipes = useRecipeSnapshot(...)`):

```tsx
  const gathering = useGatheringCatalog();
  const [overrides, setOverrides] = useState<Map<number, SourceKind>>(new Map());
  const setBuyOverride = (id: number) =>
    setOverrides((prev) => { const next = new Map(prev); next.set(id, 'buy'); return next; });
  const resetOverrides = () => setOverrides(new Map());
  const targetIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
```

- [ ] **Step 2: Replace the aggregate memo with a craft-plan memo**

Replace the existing `aggregate` memo (currently lines 28-31):

```tsx
  const aggregate = useMemo(() => {
    if (!recipes.data) return null;
    return aggregateIngredients(items, recipes.data);
  }, [items, recipes.data]);
```

with:

```tsx
  const plan = useMemo(() => {
    if (!recipes.data || !gathering.data) return null;
    return buildCraftPlan(items, recipes.data, gathering.data, overrides);
  }, [items, recipes.data, gathering.data, overrides]);
```

- [ ] **Step 3: Point pricing at the Buy bucket**

Update `priceIds` (currently uses `aggregate.demand`) and the survey memo (currently uses `aggregate.demand`) to use `plan.buy`:

In `priceIds`:

```tsx
  const priceIds = useMemo(() => {
    const ids = new Set<number>(itemIds);
    if (plan) for (const id of plan.buy.keys()) ids.add(id);
    return [...ids];
  }, [itemIds, plan]);
```

In the `survey` memo, replace `if (!planRequested || !aggregate || ...)` guard and the `let demand = aggregate.demand;` line:

```tsx
  const survey = useMemo(() => {
    if (!planRequested || !plan || !market.data || !snapshot.data) return null;
    const vendorMap = vendor.data?.snapshot ?? new Map<number, number>();
    const shopSnapshot = shop.data?.snapshot ?? { byCurrency: new Map() };

    let demand = plan.buy;
    if (hideCrystals) {
      const crystalIds = new Set(
        snapshot.data.items.filter((s) => s.sc === CRYSTALS_SEARCH_CATEGORY).map((s) => s.id),
      );
      demand = new Map([...demand].filter(([id]) => !crystalIds.has(id)));
    }

    return surveyIngredients(demand, market.data.region, vendorMap, shopSnapshot);
  }, [planRequested, plan, market.data, snapshot.data, vendor.data, shop.data, hideCrystals]);
```

- [ ] **Step 4: Update the plugin-push memo to use the acquisition leaves**

Replace the `pluginShoppingItems` memo (currently maps over `aggregate.demand`) with one over gather + buy:

```tsx
  const pluginShoppingItems = useMemo(() => {
    if (!plan) return [];
    const acquire = new Map<number, number>();
    for (const [id, g] of plan.gather) acquire.set(id, g.qty);
    for (const [id, qty] of plan.buy) acquire.set(id, (acquire.get(id) ?? 0) + qty);
    return [...acquire].map(([id, qty]) => ({ name: nameById.get(id) ?? `#${id}`, qty }));
  }, [plan, nameById]);
```

- [ ] **Step 5: Render the Craft and Gather sections + overrides reset**

In the JSX, after `<PluginShoppingSend .../>` and before the `planRequested && ...` loading blocks, add:

```tsx
      {plan && overrides.size > 0 && (
        <div className="font-mono text-[11px] text-text-low flex items-center gap-2">
          <span>{overrides.size} item{overrides.size === 1 ? '' : 's'} moved to Buy</span>
          <button onClick={resetOverrides} className="text-aether hover:underline decoration-1 underline-offset-4">
            reset
          </button>
        </div>
      )}
      {plan && (
        <CraftSection craft={plan.craft} targetIds={targetIds} nameById={nameById} onBuyInstead={setBuyOverride} />
      )}
      {plan && (
        <GatherSection gather={plan.gather} nameById={nameById} onBuyInstead={setBuyOverride} />
      )}
```

The existing `survey && snapshot.data && market.data && <ShoppingListPlan .../>` block stays as the Buy section. Leave it unchanged.

- [ ] **Step 6: Run the route's neighbours + typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (catches any leftover `aggregate` reference).

Run: `npx vitest run src/features/shoppingList`
Expected: PASS (all shoppingList tests green).

- [ ] **Step 7: Retire `aggregateIngredients` if now unused**

Run: `npx grep -rn "aggregateIngredients" src` (or use ripgrep `rg aggregateIngredients src`).
Expected: references only in `aggregateIngredients.ts` and `aggregateIngredients.test.ts`.
If so, delete both files:

```bash
git rm src/features/shoppingList/aggregateIngredients.ts src/features/shoppingList/aggregateIngredients.test.ts
```

If any other file still imports it, skip the delete and leave a note.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(craft): render craft/gather/buy buckets on the list route"
```

---

## Task 7: Rename "Shopping List" → "Craft Helper"

User-facing strings only; route path and persistence key stay.

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:44`
- Modify: `src/App.tsx` (PAGE_TITLES + redirect alias)
- Modify: `src/routes/ShoppingList.tsx` (heading + description)

- [ ] **Step 1: Relabel the sidebar nav item**

In `src/components/layout/Sidebar.tsx`, change line 44:

```tsx
      { label: 'Shopping', path: '/shopping-list' },
```

to:

```tsx
      { label: 'Craft Helper', path: '/shopping-list' },
```

- [ ] **Step 2: Update the page title + add a redirect alias**

In `src/App.tsx`, change the `PAGE_TITLES` entry (line 51):

```tsx
  '/shopping-list': 'Craft Helper',
```

Add a redirect route inside the inner `<Routes>` (next to the `/shopping-list` route, line ~119):

```tsx
                      <Route path="/craft-helper" element={<Navigate to="/shopping-list" replace />} />
```

(`Navigate` is already imported in `App.tsx`.)

- [ ] **Step 3: Update the page heading and description**

In `src/routes/ShoppingList.tsx`, replace the heading block (currently lines 89-94):

```tsx
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Craft Helper</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Plan a crafting session end-to-end — what to craft, what to gather, and what to buy, with the cheapest source per material.
        </p>
      </div>
```

- [ ] **Step 4: Typecheck + build sanity**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/App.tsx src/routes/ShoppingList.tsx
git commit -m "feat(craft): rename Shopping List to Craft Helper"
```

---

## Task 8: Hide "Plan" from the web unless the plugin is connected

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Test: `src/components/layout/Sidebar.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/Sidebar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { usePluginStore } from '../../features/plugin/pluginStore';

beforeEach(() => {
  usePluginStore.setState({ status: 'idle' });
});

function ui() {
  return <MemoryRouter><Sidebar /></MemoryRouter>;
}

describe('Sidebar Plan gating', () => {
  it('hides the Plan nav item when the plugin is disconnected', () => {
    usePluginStore.setState({ status: 'idle' });
    render(ui());
    expect(screen.queryAllByText('Plan')).toHaveLength(0);
  });

  it('shows the Plan nav item when the plugin is connected', () => {
    usePluginStore.setState({ status: 'open' });
    render(ui());
    expect(screen.queryAllByText('Plan').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/Sidebar.test.tsx`
Expected: FAIL — Plan is always shown, so the first test fails (length 2, not 0).

- [ ] **Step 3: Gate the Plan item on plugin connection**

In `src/components/layout/Sidebar.tsx`:

1. Add the import at the top:

```tsx
import { usePluginBridge } from '../../features/plugin/usePluginBridge';
```

2. Remove the static `{ label: 'Plan', path: '/planner' }` entry from the `NAV_GROUPS` "Planning" group (line 39) so the constant no longer contains it.

3. Inside the `Sidebar` component, build the displayed groups dynamically. After `const [mobileOpen, setMobileOpen] = useState(false);` add:

```tsx
  const { connected } = usePluginBridge();
  const navGroups = NAV_GROUPS.map((group) =>
    group.label === 'Planning' && connected
      ? { ...group, items: [{ label: 'Plan', path: '/planner' }, ...group.items] }
      : group,
  );
```

4. Replace both `NAV_GROUPS.map(...)` usages (in `desktopContent` and `mobileContent`) with `navGroups.map(...)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/Sidebar.test.tsx`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx
git commit -m "feat(craft): gate web Plan nav on plugin connection"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors/warnings.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke (optional, via `/run` or `npm run dev`)**

- Open an item page for a **non-craftable** item (e.g. a raw ore) → the add button is enabled and adds it.
- Open `/shopping-list` (now titled "Craft Helper") with a craftable item on the list → Craft + Gather sections render; click "Plan" → Buy section prices appear.
- Click "Buy instead" on an intermediate → it moves into the Buy survey; "reset" restores it.
- With no plugin connected, the sidebar shows no "Plan" item; `/craft-helper` redirects to `/shopping-list`.

---

## Self-review notes

- **Spec coverage:** rename (T7), craft/gather/buy buckets (T2/T5/T6), full recursion (T1/T2), auto-categorize + override (T2/T5/T6), bug fix both facets (T3/T4), hide Plan (T8). All covered.
- **Override scope (v1):** only `'buy'` overrides are emitted by the UI (push craft/gather → buy), with a global "reset" to revert. Per-row revert inside the Buy table and gather↔craft flips are deferred (noted in spec non-goals). `buildCraftPlan` itself handles the general `SourceKind` so future controls need no engine change.
- **Type consistency:** `CraftPlan` shape (`craft`/`gather`/`buy`) is defined in T2 and consumed unchanged in T5/T6; `SourceKind` is shared; `forceLeaf` signature matches between T1 and T2.
