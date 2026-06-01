# Stack Size Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-item "Stack size analyzer" to `/item/:id` showing which stack sizes actually sell (90-day history) beside which sizes are currently listed (home-world supply), highlighting high-demand/thin-supply gaps.

**Architecture:** A pure-compute module (`stackAnalysis.ts`) groups sale history and current listings by exact stack size. A query-wrapper component (`StackAnalyzerBlock`) fetches 90-day home-world history and delegates to a pure, exported `StackAnalyzerView` (NQ/HQ toggle + two panels), mirroring the existing `SaleHistoryBlock` / `HistoryContent` split so the view tests with arrays and no query client.

**Tech Stack:** TypeScript, React 18, @tanstack/react-query, Vitest + Testing Library, Tailwind.

Spec: `docs/superpowers/specs/2026-06-01-stack-analyzer-design.md`

---

### Task 1: `stackAnalysis.ts` pure compute

**Files:**
- Create: `src/features/items/stackAnalysis.ts`
- Test: `src/features/items/stackAnalysis.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/items/stackAnalysis.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { soldByStack, listedByStack, isStackable } from './stackAnalysis';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';

const sale = (quantity: number, pricePerUnit: number, timestamp: number, hq = false): HistoryEntry =>
  ({ quantity, pricePerUnit, timestamp, hq });
const ls = (quantity: number, price: number, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller: '' });

describe('soldByStack', () => {
  it('returns [] for empty input', () => {
    expect(soldByStack([], false)).toEqual([]);
  });

  it('groups by exact stack size, sorted ascending, with median price + last sold', () => {
    const entries = [
      sale(1, 1000, 50), sale(1, 1200, 200), sale(1, 1100, 100),
      sale(5, 900, 150),
      sale(1, 9999, 300, true), // HQ — excluded from NQ
    ];
    expect(soldByStack(entries, false)).toEqual([
      { stack: 1, sales: 3, units: 3, medianUnitPrice: 1100, lastSoldMs: 200_000 },
      { stack: 5, sales: 1, units: 5, medianUnitPrice: 900, lastSoldMs: 150_000 },
    ]);
  });

  it('filters to the requested quality tier', () => {
    const entries = [sale(1, 1000, 50), sale(2, 5000, 60, true)];
    expect(soldByStack(entries, true)).toEqual([
      { stack: 2, sales: 1, units: 2, medianUnitPrice: 5000, lastSoldMs: 60_000 },
    ]);
  });
});

describe('listedByStack', () => {
  it('counts current listings per stack size, sorted ascending', () => {
    const listings = [ls(1, 100), ls(1, 110), ls(99, 90), ls(20, 95)];
    expect(listedByStack(listings, false)).toEqual([
      { stack: 1, count: 2 },
      { stack: 20, count: 1 },
      { stack: 99, count: 1 },
    ]);
  });

  it('defaults missing quantity to 1 and filters by quality', () => {
    const noQty = { world: 'Phantom', price: 50, hq: false } as WorldListing;
    const listings = [noQty, ls(5, 80), ls(5, 80, true)];
    expect(listedByStack(listings, false)).toEqual([
      { stack: 1, count: 1 },
      { stack: 5, count: 1 },
    ]);
  });
});

describe('isStackable', () => {
  it('false when every observed size is 1', () => {
    expect(isStackable(
      [{ stack: 1, sales: 5, units: 5, medianUnitPrice: 100, lastSoldMs: 1 }],
      [{ stack: 1, count: 3 }],
    )).toBe(false);
  });

  it('true when any sold or listed size exceeds 1', () => {
    expect(isStackable(
      [{ stack: 1, sales: 5, units: 5, medianUnitPrice: 100, lastSoldMs: 1 }],
      [{ stack: 99, count: 1 }],
    )).toBe(true);
  });

  it('false for empty inputs', () => {
    expect(isStackable([], [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/items/stackAnalysis.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Implement**

`src/features/items/stackAnalysis.ts`:

```ts
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';

export interface SoldStackRow {
  stack: number;
  sales: number;
  units: number;
  medianUnitPrice: number;
  lastSoldMs: number;
}

export interface ListedStackRow {
  stack: number;
  count: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/** Group 90-day sales by exact stack size for the demand panel. */
export function soldByStack(entries: HistoryEntry[], hq: boolean): SoldStackRow[] {
  const rows = entries.filter((e) => e.hq === hq && e.quantity > 0 && e.pricePerUnit > 0);
  if (rows.length === 0) return [];

  interface Acc { sales: number; units: number; prices: number[]; lastSoldMs: number }
  const groups = new Map<number, Acc>();
  for (const e of rows) {
    let acc = groups.get(e.quantity);
    if (!acc) { acc = { sales: 0, units: 0, prices: [], lastSoldMs: 0 }; groups.set(e.quantity, acc); }
    acc.sales += 1;
    acc.units += e.quantity;
    acc.prices.push(e.pricePerUnit);
    const ms = e.timestamp * 1000;
    if (ms > acc.lastSoldMs) acc.lastSoldMs = ms;
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stack, acc]) => ({
      stack,
      sales: acc.sales,
      units: acc.units,
      medianUnitPrice: median(acc.prices),
      lastSoldMs: acc.lastSoldMs,
    }));
}

/** Group current listings by exact stack size for the supply panel. */
export function listedByStack(listings: WorldListing[], hq: boolean): ListedStackRow[] {
  const rows = listings.filter((l) => l.hq === hq && l.price > 0);
  if (rows.length === 0) return [];

  const counts = new Map<number, number>();
  for (const l of rows) {
    const stack = l.quantity ?? 1;
    counts.set(stack, (counts.get(stack) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stack, count]) => ({ stack, count }));
}

/** Whether any observed stack size exceeds 1 (else the item is sold singly). */
export function isStackable(sold: SoldStackRow[], listed: ListedStackRow[]): boolean {
  return sold.some((r) => r.stack > 1) || listed.some((r) => r.stack > 1);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/items/stackAnalysis.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/items/stackAnalysis.ts src/features/items/stackAnalysis.test.ts
git commit -m "feat(item): stackAnalysis sold/listed-by-stack-size compute"
```

---

### Task 2: `StackAnalyzerBlock` + pure `StackAnalyzerView`

**Files:**
- Create: `src/features/items/StackAnalyzerBlock.tsx` (exports both `StackAnalyzerBlock` and `StackAnalyzerView`)
- Test: `src/features/items/StackAnalyzerBlock.test.tsx`

Reuses: `QualityTab` (`./QualityTab`), `fmtGil` + `fmtRelative` (`../../lib/format`), `SectionHeader` + `Spinner` (`../../components`). Mirrors the `SaleHistoryBlock` query-wrapper/pure-content split.

- [ ] **Step 1: Write the failing test (targets the pure view)**

`src/features/items/StackAnalyzerBlock.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StackAnalyzerView } from './StackAnalyzerBlock';
import type { HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';

const sale = (quantity: number, pricePerUnit: number, timestamp: number, hq = false): HistoryEntry =>
  ({ quantity, pricePerUnit, timestamp, hq });
const ls = (quantity: number, price: number, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller: '' });

describe('StackAnalyzerView', () => {
  it('renders sold + listed panels and flags a high-demand/thin-supply gap', () => {
    // 5 sales at stack 1, 1 sale at stack 99; only stack-99 is currently listed.
    const entries = [
      sale(1, 1000, 10), sale(1, 1000, 20), sale(1, 1000, 30), sale(1, 1000, 40), sale(1, 1000, 50),
      sale(99, 800, 5),
    ];
    const listings = [ls(99, 790), ls(99, 800)];
    render(<StackAnalyzerView entries={entries} listings={listings} canHq={false} />);

    expect(screen.getByText(/Sold · last 90d/i)).toBeInTheDocument();
    expect(screen.getByText(/Listed now/i)).toBeInTheDocument();
    // stack 1 has strong demand but no listings → gap marker.
    expect(screen.getByText(/gap/i)).toBeInTheDocument();
  });

  it('shows the not-stackable note when every size is 1', () => {
    render(
      <StackAnalyzerView
        entries={[sale(1, 1000, 10)]}
        listings={[ls(1, 1000)]}
        canHq={false}
      />,
    );
    expect(screen.getByText(/Always sold as single units/i)).toBeInTheDocument();
  });

  it('toggles to the HQ tier', async () => {
    const entries = [sale(1, 1000, 10), sale(5, 2000, 20, true)];
    const listings = [ls(5, 1990, true)];
    render(<StackAnalyzerView entries={entries} listings={listings} canHq />);
    // NQ tier first: only the stack-1 NQ sale, no stack>1 → not-stackable note.
    expect(screen.getByText(/Always sold as single units/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'HQ' }));
    // HQ tier: stack 5 present → panels render.
    expect(screen.getByText(/Sold · last 90d/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/items/StackAnalyzerBlock.test.tsx`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement**

`src/features/items/StackAnalyzerBlock.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import type { WorldListing } from '../../lib/universalis';
import { SectionHeader } from '../../components/SectionHeader';
import { Spinner } from '../../components/Spinner';
import { QualityTab } from './QualityTab';
import { fmtGil, fmtRelative } from '../../lib/format';
import { soldByStack, listedByStack, isStackable, type SoldStackRow } from './stackAnalysis';

const NINETY_DAYS_SEC = 90 * 24 * 60 * 60;

interface BlockProps { itemId: number; scope: string; listings: WorldListing[]; canHq: boolean }

/** Query wrapper: fetches 90-day home-world history, delegates to the pure view. */
export function StackAnalyzerBlock({ itemId, scope, listings, canHq }: BlockProps) {
  const q = useQuery({
    queryKey: ['item-history', scope, itemId, 90],
    enabled: Number.isFinite(itemId) && itemId > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => (await fetchHistoryWithin(scope, [itemId], NINETY_DAYS_SEC)).get(itemId) ?? [],
  });
  const entries: HistoryEntry[] = q.data ?? [];

  return (
    <section>
      <SectionHeader label="Stack size analyzer" compact />
      {q.isLoading
        ? <Spinner label="Loading 90-day sale history…" />
        : <StackAnalyzerView entries={entries} listings={listings} canHq={canHq} />}
    </section>
  );
}

interface ViewProps { entries: HistoryEntry[]; listings: WorldListing[]; canHq: boolean }

/** Pure presentation: NQ/HQ toggle + demand and supply panels. Exported for tests. */
export function StackAnalyzerView({ entries, listings, canHq }: ViewProps) {
  const [hq, setHq] = useState(false);
  const sold = soldByStack(entries, hq);
  const listed = listedByStack(listings, hq);
  const stackable = isStackable(sold, listed);

  const totalSales = sold.reduce((s, r) => s + r.sales, 0);
  const listedCountByStack = new Map(listed.map((r) => [r.stack, r.count]));
  const gapThreshold = Math.max(2, totalSales * 0.15);
  const isGap = (r: SoldStackRow) =>
    r.sales >= gapThreshold && (listedCountByStack.get(r.stack) ?? 0) <= 1;
  const maxListed = listed.reduce((m, r) => Math.max(m, r.count), 0);

  return (
    <div>
      {canHq && (
        <div className="flex gap-1 mb-2">
          <QualityTab active={!hq} onClick={() => setHq(false)}>NQ</QualityTab>
          <QualityTab active={hq} onClick={() => setHq(true)}>HQ</QualityTab>
        </div>
      )}

      {!stackable ? (
        <div className="border border-border-base bg-bg-card p-4 text-text-low text-sm italic">
          Always sold as single units — stack analysis doesn't apply.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-border-base bg-bg-card overflow-x-auto">
            <div className="px-3 py-2 font-mono text-[10px] tracking-widest uppercase text-text-low border-b border-border-base">
              Sold · last 90d {hq ? '(HQ)' : '(NQ)'}
            </div>
            {sold.length === 0 ? (
              <div className="p-4 text-text-low text-sm italic">No {hq ? 'HQ' : 'NQ'} sales in the last 90 days.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
                    <th className="text-right px-3 py-2">Stack</th>
                    <th className="text-right px-3 py-2">Sales</th>
                    <th className="text-right px-3 py-2">Units</th>
                    <th className="text-right px-3 py-2">~/unit</th>
                    <th className="text-right px-3 py-2">Last sold</th>
                  </tr>
                </thead>
                <tbody>
                  {sold.map((r) => {
                    const gap = isGap(r);
                    return (
                      <tr key={r.stack} className={`border-t border-border-base ${gap ? 'bg-jade/10' : ''}`}>
                        <td className="px-3 py-2 text-right font-mono text-text-cream">
                          {r.stack}
                          {gap && <span className="text-jade ml-1" title="High demand, thin supply">↙ gap</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{r.sales}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-low">{r.units}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtGil(r.medianUnitPrice)}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-low">{fmtRelative(r.lastSoldMs)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="border border-border-base bg-bg-card overflow-x-auto">
            <div className="px-3 py-2 font-mono text-[10px] tracking-widest uppercase text-text-low border-b border-border-base">
              Listed now {hq ? '(HQ)' : '(NQ)'}
            </div>
            {listed.length === 0 ? (
              <div className="p-4 text-text-low text-sm italic">No {hq ? 'HQ' : 'NQ'} listings.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-low font-mono text-[10px] tracking-widest uppercase">
                    <th className="text-right px-3 py-2">Stack</th>
                    <th className="text-left px-3 py-2 w-1/2">Depth</th>
                    <th className="text-right px-3 py-2">Listings</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((r) => (
                    <tr key={r.stack} className="border-t border-border-base">
                      <td className="px-3 py-2 text-right font-mono text-text-cream">{r.stack}</td>
                      <td className="px-3 py-2">
                        <div className="bg-aether/40 h-3" style={{ width: `${maxListed ? (r.count / maxListed) * 100 : 0}%` }} aria-hidden />
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```
(The `↙` and `·` and `—` are literal Unicode characters — write them as shown.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/items/StackAnalyzerBlock.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/items/StackAnalyzerBlock.tsx src/features/items/StackAnalyzerBlock.test.tsx
git commit -m "feat(item): StackAnalyzerBlock demand-vs-supply by stack size"
```

---

### Task 3: Mount on the item page

**Files:**
- Modify: `src/routes/Item.tsx`
- Test: `src/routes/Item.test.tsx` (run; fix only if it breaks)

- [ ] **Step 1: Add the import**

In `src/routes/Item.tsx`, after the `ConcentrationBlock` import (added last session, near the `SupplyDepthBlock` import), add:

```ts
import { StackAnalyzerBlock } from '../features/items/StackAnalyzerBlock';
```

- [ ] **Step 2: Mount the block**

Find the `ConcentrationBlock` mount:
```tsx
      {phantomMarket && phantomMarket.worldListings.length > 0 && (
        <ConcentrationBlock listings={phantomMarket.worldListings} canHq={canHq} />
      )}
```
Immediately after its closing `)}`, insert:
```tsx
      {phantomMarket && (
        <StackAnalyzerBlock
          itemId={itemId}
          scope={world}
          listings={phantomMarket.worldListings}
          canHq={canHq}
        />
      )}
```
(`world` is already in scope from `useSettingsStore()`; `itemId`, `phantomMarket`, `canHq` are all in scope.)

- [ ] **Step 3: Run the item-page test**

Run: `npx vitest run src/routes/Item.test.tsx`
Expected: PASS. (`MarketSnapshotRow` already issues a 90-day `['item-history', …]` query in this page, so the test environment already tolerates a history query; the new block adds no new network behavior.) If it fails because a number/text now collides with an existing assertion, scope the failing query with `getByRole`/`within` — do not weaken intent or change component output.

- [ ] **Step 4: Run the full suite + type-check**

Run: `npx vitest run`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Item.tsx
git commit -m "feat(item): mount stack size analyzer"
```

---

## Verification Checklist

- [ ] `npx vitest run` — full suite green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `/item/:id` for a stackable item (e.g. a crafting material) shows **Stack size analyzer** with a Sold (90d) panel and a Listed-now panel; a stack size with strong sales but no current listings is jade-tinted with a "↙ gap" marker.
- [ ] A non-stackable item (gear) shows the "Always sold as single units" note instead of tables.
- [ ] Toggling NQ/HQ (on an HQ-capable item) re-slices both panels.

## Notes / Deferred

- Home-world scope only (where the user sells); DC/region stack analysis is out of scope.
- No optimal-stack recommendation or auto-pricing — the view informs, the human decides.
- No historical trend of stack-size mix; current snapshot + 90-day aggregate only.
- `StackAnalyzerBlock` (the query wrapper) is exercised in production; only the pure `StackAnalyzerView` has unit tests (the wrapper is a thin react-query shell identical in shape to `SaleHistoryBlock`).
