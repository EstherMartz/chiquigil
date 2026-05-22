# Batch & Shopping List Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align batch planner with shopping list via estimate disclaimer, post-send redirect, craft-all toggle, and crystal filtering.

**Architecture:** Four independent changes touching batch view, shopping list store, shopping list panel, and shopping list route. No shared state between changes.

**Tech Stack:** React, Zustand, react-router-dom, Vitest + RTL

---

### Task 1: Batch Estimate Disclaimer

**Files:**
- Modify: `src/features/craftBatch/CraftBatchView.tsx:191-193`

- [ ] **Step 1: Add disclaimer line below SummaryCards**

In `CraftBatchView.tsx`, after the `<SummaryCards>` component (line ~192), add:

```tsx
<SummaryCards batch={batch} budget={budget} />
<p className="text-text-dim font-mono text-[11px] text-right">
  Estimates for ranking — see Shopping List for final costs
</p>
```

- [ ] **Step 2: Verify in dev**

Run: `npm run dev`
Generate a batch → confirm disclaimer appears below summary cards.

- [ ] **Step 3: Commit**

```bash
git add src/features/craftBatch/CraftBatchView.tsx
git commit -m "feat(craft-batch): add estimate disclaimer below summary cards"
```

---

### Task 2: Post-Send Navigation

**Files:**
- Modify: `src/features/craftBatch/CraftBatchView.tsx`

- [ ] **Step 1: Add useNavigate import**

At the top of `CraftBatchView.tsx`, add:

```tsx
import { useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Wire navigate into handleSendToShoppingList**

Inside `CraftBatchView()`, add `const navigate = useNavigate();` near the other hooks, then update the callback:

```tsx
const navigate = useNavigate();

const handleSendToShoppingList = useCallback(() => {
  if (!batch) return;
  for (const item of batch.items) {
    addItem(item.id, 1);
  }
  navigate('/shopping-list');
}, [batch, addItem, navigate]);
```

- [ ] **Step 3: Verify in dev**

Run: `npm run dev`
Generate a batch → click "Send to Shopping List" → confirm redirect to `/shopping-list` with items present.

- [ ] **Step 4: Commit**

```bash
git add src/features/craftBatch/CraftBatchView.tsx
git commit -m "feat(craft-batch): navigate to shopping list after send"
```

---

### Task 3: Craft-All Sub-Ingredients Toggle

**Files:**
- Modify: `src/features/shoppingList/shoppingListStore.ts`
- Test: `src/features/shoppingList/shoppingListStore.test.ts`
- Modify: `src/features/shoppingList/ShoppingListPanel.tsx`

- [ ] **Step 1: Write failing test for setAllCraftIntermediates**

In `shoppingListStore.test.ts`, add:

```ts
it('setAllCraftIntermediates sets all items to given value', () => {
  useShoppingListStore.getState().addItem(1);
  useShoppingListStore.getState().addItem(2);
  useShoppingListStore.getState().setCraftIntermediates(1, true);
  // Mixed state: item 1 = true, item 2 = false
  useShoppingListStore.getState().setAllCraftIntermediates(true);
  const items = useShoppingListStore.getState().items;
  expect(items.every((i) => i.craftIntermediates)).toBe(true);

  useShoppingListStore.getState().setAllCraftIntermediates(false);
  const items2 = useShoppingListStore.getState().items;
  expect(items2.every((i) => !i.craftIntermediates)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/shoppingList/shoppingListStore.test.ts`
Expected: FAIL — `setAllCraftIntermediates` is not a function.

- [ ] **Step 3: Add setAllCraftIntermediates to store**

In `shoppingListStore.ts`, add to the interface:

```ts
export interface ShoppingListState {
  _v: 1;
  items: ShoppingListItem[];
  addItem: (id: number, qty?: number) => void;
  removeItem: (id: number) => void;
  setQty: (id: number, qty: number) => void;
  setCraftIntermediates: (id: number, value: boolean) => void;
  setAllCraftIntermediates: (value: boolean) => void;
  clear: () => void;
}
```

And add the implementation inside `create`:

```ts
setAllCraftIntermediates: (value) => set((s) => ({
  items: s.items.map((i) => ({ ...i, craftIntermediates: value })),
})),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/shoppingList/shoppingListStore.test.ts`
Expected: all PASS.

- [ ] **Step 5: Add toggle checkbox to ShoppingListPanel footer**

In `ShoppingListPanel.tsx`, add `useRef` to the React import and add `setAllCraftIntermediates` selector:

```tsx
import { useState, useRef, useEffect } from 'react';
```

```tsx
const setAllCraftIntermediates = useShoppingListStore((s) => s.setAllCraftIntermediates);
```

Compute the tri-state and add an indeterminate checkbox ref. Place this inside the component before the return:

```tsx
const allCraft = items.length > 0 && items.every((i) => i.craftIntermediates);
const noneCraft = items.length === 0 || items.every((i) => !i.craftIntermediates);
const craftAllRef = useRef<HTMLInputElement>(null);
useEffect(() => {
  if (craftAllRef.current) {
    craftAllRef.current.indeterminate = !allCraft && !noneCraft;
  }
}, [allCraft, noneCraft]);
```

In the footer `<div>` (the one with `{items.length} items`), replace the span:

```tsx
<div className="flex items-center gap-3">
  <span className="font-mono text-[11px] text-text-low">{items.length} items</span>
  {items.length > 0 && (
    <label className="flex items-center gap-1 font-mono text-[10px] uppercase text-text-low">
      <input
        ref={craftAllRef}
        type="checkbox"
        checked={allCraft}
        onChange={() => setAllCraftIntermediates(!allCraft)}
      />
      <span>Craft all sub-ingredients</span>
    </label>
  )}
</div>
```

- [ ] **Step 6: Verify in dev**

Run: `npm run dev`
Add 2+ items → toggle individual checkboxes to mixed state → verify footer checkbox shows indeterminate. Click it → all become checked. Click again → all unchecked.

- [ ] **Step 7: Commit**

```bash
git add src/features/shoppingList/shoppingListStore.ts src/features/shoppingList/shoppingListStore.test.ts src/features/shoppingList/ShoppingListPanel.tsx
git commit -m "feat(shopping-list): add craft-all sub-ingredients toggle"
```

---

### Task 4: Filter Crystals from Shopping List

**Files:**
- Modify: `src/routes/ShoppingList.tsx:26-29,43-48`
- Modify: `src/routes/ShoppingList.test.tsx`

- [ ] **Step 1: Write failing test for crystal filtering**

In `ShoppingList.test.tsx`, update the mock snapshot to include a crystal ingredient (sc: 58) and a recipe that uses it. Update the existing mock:

```ts
vi.mock('../features/queries/useItemSnapshot', () => ({
  useItemSnapshot: () => ({
    data: {
      items: [
        { id: 100, name: 'Widget', sc: 1, ui: 1, ilvl: 1, canHq: true },
        { id: 5, name: 'Iron Ingot', sc: 1, ui: 1, ilvl: 1, canHq: false },
        { id: 2, name: 'Fire Shard', sc: 58, ui: 1, ilvl: 1, canHq: false },
      ],
    },
    isLoading: false,
  }),
}));
```

Update the recipe mock to include the crystal:

```ts
vi.mock('../features/profit/useRecipes', () => ({
  useRecipes: (ids: number[]) => ({
    data: new Map(ids.map((id) => [
      id,
      id === 100 ? { itemResultId: 100, classJob: 'CRP', recipeLevel: 1, ingredients: [{ itemId: 5, amount: 2 }, { itemId: 2, amount: 4 }] } : null,
    ])),
    isLoading: false,
    isError: false,
    error: null,
  }),
}));
```

Add a market entry for the crystal:

```ts
// Inside the region object of useMarketData mock:
2: {
  minNQ: 10, minHQ: null,
  worldListings: [{ world: 'Phantom', price: 10, hq: false }],
  velocity: 0, lastUploadTime: 0, listingCount: 1,
  averagePriceNQ: null, averagePriceHQ: null,
  avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
  recentSalesNQ: 0, recentSalesHQ: 0,
},
```

Update the settings mock to include `hideCrystals: true`:

```ts
vi.mock('../features/settings/store', () => ({
  useSettingsStore: () => ({ world: 'Phantom', dc: 'Chaos', hideCrystals: true }),
}));
```

Add the test:

```ts
it('excludes crystal ingredients when hideCrystals is enabled', () => {
  useShoppingListStore.getState().addItem(100, 1);
  renderRoute();
  fireEvent.click(screen.getByRole('button', { name: /plan shopping/i }));
  // Crystal (Fire Shard) should NOT appear in plan
  expect(screen.queryByText('Fire Shard')).not.toBeInTheDocument();
  // Non-crystal ingredient should still appear
  expect(screen.getByText('Iron Ingot')).toBeInTheDocument();
  // Spend should be 200 (2×100 for ingots), not 240 (200 + 4×10 for shards)
  expect(screen.getByText(/total material cost/i).parentElement?.textContent).toContain('200');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/ShoppingList.test.tsx`
Expected: FAIL — crystal still appears and spend includes crystal cost.

- [ ] **Step 3: Filter crystals from demand map**

In `src/routes/ShoppingList.tsx`, add imports:

```tsx
import { useSettingsStore } from '../features/settings/store';
import { CRYSTALS_SEARCH_CATEGORY } from '../features/queries/commonFilters';
```

Note: `useSettingsStore` is already imported; just add `CRYSTALS_SEARCH_CATEGORY`.

Update the destructure of settings to include `hideCrystals`:

```tsx
const { world, dc, hideCrystals } = useSettingsStore();
```

Then update the `survey` memo to filter crystals from the demand map before passing to `surveyIngredients`:

```tsx
const survey = useMemo(() => {
  if (!planRequested || !aggregate || !market.data || !snapshot.data) return null;
  const vendorMap = vendor.data?.snapshot ?? new Map<number, number>();
  const shopSnapshot = shop.data?.snapshot ?? { byCurrency: new Map() };

  let demand = aggregate.demand;
  if (hideCrystals) {
    const crystalIds = new Set(
      snapshot.data.items.filter((s) => s.sc === CRYSTALS_SEARCH_CATEGORY).map((s) => s.id),
    );
    demand = new Map([...demand].filter(([id]) => !crystalIds.has(id)));
  }

  return surveyIngredients(demand, market.data.region, vendorMap, shopSnapshot);
}, [planRequested, aggregate, market.data, snapshot.data, vendor.data, shop.data, hideCrystals]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/ShoppingList.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/ShoppingList.tsx src/routes/ShoppingList.test.tsx
git commit -m "fix(shopping-list): filter crystals when hideCrystals enabled"
```
