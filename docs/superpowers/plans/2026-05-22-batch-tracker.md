# Batch Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist craft batch results and let the user track actual sale prices against estimates.

**Architecture:** Zustand persisted store for batch data, a new route/page for batch history with inline detail expansion, and a "Save & Track" button in the existing CraftBatchView.

**Tech Stack:** React, Zustand (persist), react-router-dom, Vitest + RTL

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/features/batchTracker/batchTrackerStore.ts` | Zustand store: CRUD for saved batches, actual price entry |
| `src/features/batchTracker/batchTrackerStore.test.ts` | Store unit tests |
| `src/features/batchTracker/types.ts` | `SavedBatch`, `SavedBatchItem` types |
| `src/features/batchTracker/BatchHistoryView.tsx` | Main history page: batch cards list + expanded detail |
| `src/features/batchTracker/BatchDetail.tsx` | Detail view: summary cards + per-item table with actual price inputs |
| `src/routes/BatchHistory.tsx` | Route wrapper (title + description + view component) |

Modified files:
| File | Change |
|------|--------|
| `src/features/craftBatch/CraftBatchView.tsx` | Add "Save & Track" button |
| `src/App.tsx` | Add `/batch-history` route |
| `src/components/layout/Header.tsx` | Add nav link |

---

### Task 1: Types

**Files:**
- Create: `src/features/batchTracker/types.ts`

- [ ] **Step 1: Create types file**

```ts
import type { BatchItem } from '../craftBatch/types';

export interface SavedBatchItem {
  id: number;
  name: string;
  materialCost: number;
  estimatedPrice: number;
  hq: boolean;
  actualPrice: number | null;
  soldAt: string | null;
}

export interface SavedBatch {
  batchId: string;
  createdAt: string;
  budget: number;
  items: SavedBatchItem[];
  status: 'active' | 'closed';
}

export function batchItemToSaved(item: BatchItem): SavedBatchItem {
  return {
    id: item.id,
    name: item.name,
    materialCost: item.materialCost,
    estimatedPrice: item.salePrice,
    hq: item.hq,
    actualPrice: null,
    soldAt: null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/batchTracker/types.ts
git commit -m "feat(batch-tracker): add types and conversion helper"
```

---

### Task 2: Store

**Files:**
- Create: `src/features/batchTracker/batchTrackerStore.ts`
- Create: `src/features/batchTracker/batchTrackerStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/features/batchTracker/batchTrackerStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useBatchTrackerStore, defaultBatchTracker } from './batchTrackerStore';

beforeEach(() => {
  localStorage.clear();
  useBatchTrackerStore.setState(defaultBatchTracker());
});

const mockItems = [
  { id: 100, name: 'Widget', materialCost: 500, estimatedPrice: 1200, hq: true, actualPrice: null, soldAt: null },
  { id: 200, name: 'Gadget', materialCost: 300, estimatedPrice: 800, hq: false, actualPrice: null, soldAt: null },
];

describe('batchTrackerStore', () => {
  it('starts empty', () => {
    expect(useBatchTrackerStore.getState().batches).toEqual([]);
  });

  it('saveBatch creates a new active batch', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const batches = useBatchTrackerStore.getState().batches;
    expect(batches).toHaveLength(1);
    expect(batches[0].status).toBe('active');
    expect(batches[0].budget).toBe(5_000_000);
    expect(batches[0].items).toHaveLength(2);
    expect(batches[0].items[0].actualPrice).toBeNull();
  });

  it('saveBatch prepends newest first', () => {
    useBatchTrackerStore.getState().saveBatch(1_000_000, [mockItems[0]]);
    useBatchTrackerStore.getState().saveBatch(2_000_000, [mockItems[1]]);
    const batches = useBatchTrackerStore.getState().batches;
    expect(batches[0].budget).toBe(2_000_000);
    expect(batches[1].budget).toBe(1_000_000);
  });

  it('setActualPrice updates a specific item', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const batchId = useBatchTrackerStore.getState().batches[0].batchId;
    useBatchTrackerStore.getState().setActualPrice(batchId, 100, 1500);
    const item = useBatchTrackerStore.getState().batches[0].items[0];
    expect(item.actualPrice).toBe(1500);
    expect(item.soldAt).toBeTruthy();
  });

  it('clearActualPrice resets price and soldAt', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const batchId = useBatchTrackerStore.getState().batches[0].batchId;
    useBatchTrackerStore.getState().setActualPrice(batchId, 100, 1500);
    useBatchTrackerStore.getState().clearActualPrice(batchId, 100);
    const item = useBatchTrackerStore.getState().batches[0].items[0];
    expect(item.actualPrice).toBeNull();
    expect(item.soldAt).toBeNull();
  });

  it('closeBatch sets status to closed', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const batchId = useBatchTrackerStore.getState().batches[0].batchId;
    useBatchTrackerStore.getState().closeBatch(batchId);
    expect(useBatchTrackerStore.getState().batches[0].status).toBe('closed');
  });

  it('deleteBatch removes the batch', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const batchId = useBatchTrackerStore.getState().batches[0].batchId;
    useBatchTrackerStore.getState().deleteBatch(batchId);
    expect(useBatchTrackerStore.getState().batches).toHaveLength(0);
  });

  it('persists to localStorage', () => {
    useBatchTrackerStore.getState().saveBatch(5_000_000, mockItems);
    const raw = localStorage.getItem('ffxiv-helper:batchTracker');
    expect(raw).toBeTruthy();
    expect(raw!).toContain('"budget":5000000');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/batchTracker/batchTrackerStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement store**

Create `src/features/batchTracker/batchTrackerStore.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SavedBatch, SavedBatchItem } from './types';

export interface BatchTrackerState {
  _v: 1;
  batches: SavedBatch[];
  saveBatch: (budget: number, items: SavedBatchItem[]) => void;
  setActualPrice: (batchId: string, itemId: number, price: number) => void;
  clearActualPrice: (batchId: string, itemId: number) => void;
  closeBatch: (batchId: string) => void;
  deleteBatch: (batchId: string) => void;
}

export function defaultBatchTracker(): Pick<BatchTrackerState, '_v' | 'batches'> {
  return { _v: 1, batches: [] };
}

function updateBatchItem(
  batches: SavedBatch[],
  batchId: string,
  itemId: number,
  updater: (item: SavedBatchItem) => SavedBatchItem,
): SavedBatch[] {
  return batches.map((b) =>
    b.batchId === batchId
      ? { ...b, items: b.items.map((i) => (i.id === itemId ? updater(i) : i)) }
      : b,
  );
}

export const useBatchTrackerStore = create<BatchTrackerState>()(
  persist(
    (set) => ({
      ...defaultBatchTracker(),
      saveBatch: (budget, items) => set((s) => ({
        batches: [
          {
            batchId: Date.now().toString(),
            createdAt: new Date().toISOString(),
            budget,
            items,
            status: 'active' as const,
          },
          ...s.batches,
        ],
      })),
      setActualPrice: (batchId, itemId, price) => set((s) => ({
        batches: updateBatchItem(s.batches, batchId, itemId, (i) => ({
          ...i,
          actualPrice: price,
          soldAt: new Date().toISOString(),
        })),
      })),
      clearActualPrice: (batchId, itemId) => set((s) => ({
        batches: updateBatchItem(s.batches, batchId, itemId, (i) => ({
          ...i,
          actualPrice: null,
          soldAt: null,
        })),
      })),
      closeBatch: (batchId) => set((s) => ({
        batches: s.batches.map((b) =>
          b.batchId === batchId ? { ...b, status: 'closed' as const } : b,
        ),
      })),
      deleteBatch: (batchId) => set((s) => ({
        batches: s.batches.filter((b) => b.batchId !== batchId),
      })),
    }),
    { name: 'ffxiv-helper:batchTracker' },
  ),
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/batchTracker/batchTrackerStore.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/batchTracker/batchTrackerStore.ts src/features/batchTracker/batchTrackerStore.test.ts
git commit -m "feat(batch-tracker): persisted store with CRUD and tests"
```

---

### Task 3: BatchDetail Component

**Files:**
- Create: `src/features/batchTracker/BatchDetail.tsx`

- [ ] **Step 1: Create BatchDetail component**

```tsx
import type { SavedBatch } from './types';
import { useBatchTrackerStore } from './batchTrackerStore';
import { fmtGil } from '../../lib/format';
import { HqStar } from '../../components/HqStar';

interface Props {
  batch: SavedBatch;
}

export function BatchDetail({ batch }: Props) {
  const setActualPrice = useBatchTrackerStore((s) => s.setActualPrice);
  const clearActualPrice = useBatchTrackerStore((s) => s.clearActualPrice);
  const closeBatch = useBatchTrackerStore((s) => s.closeBatch);
  const isClosed = batch.status === 'closed';

  const totalMaterialCost = batch.items.reduce((s, i) => s + i.materialCost, 0);
  const estimatedRevenue = batch.items.reduce((s, i) => s + i.estimatedPrice, 0);
  const estimatedProfit = estimatedRevenue - totalMaterialCost;
  const soldItems = batch.items.filter((i) => i.actualPrice !== null);
  const actualRevenue = soldItems.reduce((s, i) => s + i.actualPrice!, 0);
  const actualProfit = actualRevenue - totalMaterialCost;

  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Material Cost" value={fmtGil(totalMaterialCost)} valueClass="text-crimson" />
        <StatCard label="Est. Profit" value={fmtGil(estimatedProfit)} valueClass="text-text-low" />
        <StatCard
          label="Actual Revenue"
          value={soldItems.length > 0 ? fmtGil(actualRevenue) : '—'}
          valueClass="text-jade"
          sub={`${soldItems.length}/${batch.items.length} sold`}
        />
        <StatCard
          label="Actual Profit"
          value={soldItems.length > 0 ? fmtGil(actualProfit) : '—'}
          valueClass={actualProfit > 0 ? 'text-jade' : actualProfit < 0 ? 'text-crimson' : 'text-text-cream'}
          sub={soldItems.length === batch.items.length ? 'Final' : 'Partial'}
        />
      </div>

      {/* Per-item table */}
      <div className="border border-border-base rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Mat Cost</th>
              <th className="text-right px-3 py-2">Est. Price</th>
              <th className="text-right px-3 py-2">Actual Price</th>
              <th className="text-right px-3 py-2">Delta</th>
            </tr>
          </thead>
          <tbody>
            {batch.items.map((item) => {
              const delta = item.actualPrice !== null ? item.actualPrice - item.estimatedPrice : null;
              return (
                <tr key={item.id} className="border-t border-border-base">
                  <td className="px-3 py-2 text-text-cream">
                    {item.name}{item.hq && <HqStar leading />}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-text-low">{fmtGil(item.materialCost)}</td>
                  <td className="px-3 py-2 text-right font-mono text-text-low">{fmtGil(item.estimatedPrice)}</td>
                  <td className="px-3 py-2 text-right">
                    {isClosed ? (
                      <span className="font-mono">{item.actualPrice !== null ? fmtGil(item.actualPrice) : '—'}</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        value={item.actualPrice ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || val === '0') {
                            clearActualPrice(batch.batchId, item.id);
                          } else {
                            setActualPrice(batch.batchId, item.id, Number(val));
                          }
                        }}
                        placeholder="—"
                        className="bg-bg-card-lo border border-border-base text-text-cream font-mono text-xs px-2 py-1 w-24 text-right"
                      />
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${
                    delta === null ? 'text-text-low' : delta >= 0 ? 'text-jade' : 'text-crimson'
                  }`}>
                    {delta !== null ? `${delta >= 0 ? '+' : ''}${fmtGil(delta)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      {!isClosed && (
        <div className="flex justify-end">
          <button
            onClick={() => closeBatch(batch.batchId)}
            className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-3 py-2 hover:bg-gold hover:text-bg-deep transition-colors"
          >
            Close Batch
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, valueClass, sub }: {
  label: string; value: string; valueClass: string; sub?: string;
}) {
  return (
    <div className="bg-bg-card rounded-lg border border-border-base p-3">
      <div className="font-mono text-[10px] tracking-widest uppercase text-text-dim">{label}</div>
      <div className={`text-xl font-semibold font-mono mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-text-low text-[11px] font-mono">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/batchTracker/BatchDetail.tsx
git commit -m "feat(batch-tracker): batch detail component with actual price inputs"
```

---

### Task 4: BatchHistoryView Component

**Files:**
- Create: `src/features/batchTracker/BatchHistoryView.tsx`

- [ ] **Step 1: Create BatchHistoryView component**

```tsx
import { useState } from 'react';
import { useBatchTrackerStore } from './batchTrackerStore';
import { BatchDetail } from './BatchDetail';
import { fmtGil } from '../../lib/format';

export function BatchHistoryView() {
  const batches = useBatchTrackerStore((s) => s.batches);
  const deleteBatch = useBatchTrackerStore((s) => s.deleteBatch);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (batches.length === 0) {
    return (
      <p className="text-text-dim text-sm font-mono text-center py-8">
        No saved batches yet. Generate a batch and click "Save &amp; Track" to start tracking.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {batches.map((batch) => {
        const isExpanded = expandedId === batch.batchId;
        const totalMaterialCost = batch.items.reduce((s, i) => s + i.materialCost, 0);
        const estimatedProfit = batch.items.reduce((s, i) => s + i.estimatedPrice, 0) - totalMaterialCost;
        const soldItems = batch.items.filter((i) => i.actualPrice !== null);
        const actualRevenue = soldItems.reduce((s, i) => s + i.actualPrice!, 0);
        const actualProfit = soldItems.length > 0 ? actualRevenue - totalMaterialCost : null;

        return (
          <div key={batch.batchId} className="border border-border-base rounded-lg overflow-hidden">
            {/* Card header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : batch.batchId)}
              className="w-full text-left px-4 py-3 bg-bg-card hover:bg-bg-card-hi transition-colors flex items-center gap-4 flex-wrap"
            >
              <span className="font-mono text-[11px] text-text-low">
                {new Date(batch.createdAt).toLocaleDateString()}
              </span>
              <span className={`font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 rounded ${
                batch.status === 'active'
                  ? 'bg-aether/20 text-aether'
                  : 'bg-text-dim/20 text-text-dim'
              }`}>
                {batch.status}
              </span>
              <span className="font-mono text-xs text-text-cream">
                {batch.items.length} items · {fmtGil(batch.budget)} budget
              </span>
              <span className="font-mono text-xs text-text-low">
                Est. profit: <span className="text-jade">{fmtGil(estimatedProfit)}</span>
              </span>
              {actualProfit !== null && (
                <span className="font-mono text-xs text-text-low">
                  Actual: <span className={actualProfit >= 0 ? 'text-jade' : 'text-crimson'}>
                    {fmtGil(actualProfit)}
                  </span>
                  <span className="text-text-dim ml-1">({soldItems.length}/{batch.items.length} sold)</span>
                </span>
              )}
              <span className="ml-auto font-mono text-text-dim">{isExpanded ? '▲' : '▼'}</span>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-border-base p-4 space-y-3">
                <BatchDetail batch={batch} />
                <div className="flex justify-end">
                  <button
                    onClick={() => deleteBatch(batch.batchId)}
                    className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-crimson hover:text-crimson transition-colors"
                  >
                    Delete Batch
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/batchTracker/BatchHistoryView.tsx
git commit -m "feat(batch-tracker): history view with expandable batch cards"
```

---

### Task 5: Route, App, and Nav

**Files:**
- Create: `src/routes/BatchHistory.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Create route wrapper**

Create `src/routes/BatchHistory.tsx`:

```tsx
import { BatchHistoryView } from '../features/batchTracker/BatchHistoryView';

export default function BatchHistory() {
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Batch History</h2>
        <p className="font-mono text-[11px] text-text-low max-w-prose">
          Track craft batch outcomes — compare estimated profits against actual sales.
        </p>
      </div>
      <BatchHistoryView />
    </div>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

In `src/App.tsx`, add import:

```tsx
import BatchHistory from './routes/BatchHistory';
```

Add route after the `/craft-batch` line:

```tsx
<Route path="/batch-history" element={<BatchHistory />} />
```

- [ ] **Step 3: Add nav link to Header.tsx**

In `src/components/layout/Header.tsx`, after the "Batch" NavLink:

```tsx
<NavLink to="/batch-history" className={navClass}>History</NavLink>
```

- [ ] **Step 4: Verify in dev**

Run: `npm run dev`
Navigate to `/batch-history` → should see empty state message.

- [ ] **Step 5: Commit**

```bash
git add src/routes/BatchHistory.tsx src/App.tsx src/components/layout/Header.tsx
git commit -m "feat(batch-tracker): route, nav link, and page wrapper"
```

---

### Task 6: Save & Track Button in CraftBatchView

**Files:**
- Modify: `src/features/craftBatch/CraftBatchView.tsx`

- [ ] **Step 1: Add imports and store hook**

In `CraftBatchView.tsx`, add imports:

```tsx
import { useBatchTrackerStore } from '../batchTracker/batchTrackerStore';
import { batchItemToSaved } from '../batchTracker/types';
```

Inside `CraftBatchView()`, add the store hook near the other hooks:

```tsx
const saveBatch = useBatchTrackerStore((s) => s.saveBatch);
```

- [ ] **Step 2: Add handleSaveAndTrack callback**

After `handleSendToShoppingList`, add:

```tsx
const handleSaveAndTrack = useCallback(() => {
  if (!batch) return;
  saveBatch(budget, batch.items.map(batchItemToSaved));
  navigate('/batch-history');
}, [batch, budget, saveBatch, navigate]);
```

- [ ] **Step 3: Add button to action bar**

In the action bar section (after the `ExportTeamcraftButton`), add:

```tsx
<button
  className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2 hover:border-gold hover:text-gold transition-colors"
  onClick={handleSaveAndTrack}
>
  Save &amp; Track
</button>
```

- [ ] **Step 4: Verify in dev**

Run: `npm run dev`
Generate a batch → click "Save & Track" → should redirect to `/batch-history` with the batch visible.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/craftBatch/CraftBatchView.tsx
git commit -m "feat(craft-batch): add Save & Track button wired to batch tracker"
```
