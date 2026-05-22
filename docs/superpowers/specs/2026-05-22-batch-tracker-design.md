# Batch Tracker

Track craft batch results over time — compare estimated profit against actual sale outcomes.

## Data Model

### Store: `batchTrackerStore`

Zustand + `persist` middleware → localStorage key `ffxiv-helper:batchTracker`.

```ts
interface SavedBatchItem {
  id: number;          // XIVAPI item ID
  name: string;
  materialCost: number;
  estimatedPrice: number; // salePrice at time of batch generation
  hq: boolean;
  actualPrice: number | null;  // user-entered actual sale price
  soldAt: string | null;       // ISO date string when marked sold
}

interface SavedBatch {
  batchId: string;       // timestamp-based unique ID (e.g. Date.now().toString())
  createdAt: string;     // ISO date string
  budget: number;
  items: SavedBatchItem[];
  status: 'active' | 'closed';
}

interface BatchTrackerState {
  _v: 1;
  batches: SavedBatch[];
  saveBatch: (budget: number, items: BatchItem[]) => void;
  setActualPrice: (batchId: string, itemId: number, price: number) => void;
  clearActualPrice: (batchId: string, itemId: number) => void;
  closeBatch: (batchId: string) => void;
  deleteBatch: (batchId: string) => void;
}
```

### Derived values (computed in components, not stored)

- `itemsSold`: count of items where `actualPrice !== null`
- `estimatedRevenue`: sum of `estimatedPrice` for all items
- `actualRevenue`: sum of `actualPrice` for sold items
- `estimatedProfit`: `estimatedRevenue - totalMaterialCost`
- `actualProfit`: `actualRevenue - totalMaterialCost` (only meaningful when all sold)
- `totalMaterialCost`: sum of `materialCost` for all items

## Flow

### Saving a batch

In `CraftBatchView`, the action bar gains a "Save & Track" button alongside the existing Send to Shopping List / CSV / Teamcraft buttons. Clicking it:

1. Calls `saveBatch(budget, batch.items)` on the store
2. Navigates to `/batch-history`

The button uses the same styling as the other action bar buttons (`font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-low px-3 py-2`).

### Batch history page

New route: `/batch-history`
New nav link in the app navigation.

Displays a list of saved batches as cards, newest first. Each card shows:

- Date created
- Budget
- Item count + how many sold (e.g. "3/8 sold")
- Status badge: `active` or `closed`
- Estimated profit vs actual profit (if any items sold)
- Delete button (with confirmation or just small/unobtrusive)

Clicking a card expands it inline or navigates to a detail section.

### Batch detail view

Shown when a batch card is selected/expanded. Contains:

**Summary cards** (same pattern as CraftBatchView SummaryCards):
- Material Cost (fixed, from generation)
- Estimated Revenue / Profit
- Actual Revenue / Profit (updates live as prices entered)

**Per-item table:**

| Item | Mat Cost | Est. Price | Actual Price | Delta |
|------|----------|------------|--------------|-------|

- `Actual Price` column has an inline number input, pre-populated if already set
- `Delta` shows `actualPrice - estimatedPrice` with color coding (green if higher, red if lower)
- Items with `actualPrice` set show a subtle "sold" indicator

**Actions:**
- "Close Batch" button — sets status to `closed`, inputs become read-only
- "Delete Batch" button

### Navigation

- Batch history accessible from nav bar
- CraftBatchView "Save & Track" redirects to history page after saving

## What's excluded

- No auto-fetching from Universalis
- No charts or trend graphs
- No CSV export of history
- No batch editing (re-opening a closed batch)
- No sorting/filtering on history page (simple list, newest first)
