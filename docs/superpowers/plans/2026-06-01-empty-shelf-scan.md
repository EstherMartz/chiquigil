# Empty Shelf scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated `/empty-shelf` page that ranks sold-out items with proven, recent demand (restock opportunities).

**Architecture:** Enrich the cached market data with a newest-sale timestamp (`lastSaleMs`); a pure `runEmptyShelf` filters sold-out + still-selling items and ranks by recency/demand; an `EmptyShelfView` (mirroring `VendorFlipView`) scans the item snapshot via cache-only `fetchMarketData` and renders an `EmptyShelfResults` table, wired to a new route + nav entry.

**Tech Stack:** TypeScript, React 18, @tanstack/react-query, Vitest + Testing Library, Tailwind, esbuild (API bundles).

Spec: `docs/superpowers/specs/2026-06-01-empty-shelf-design.md`

---

### Task 1: Add `lastSaleMs` to the market parser

**Files:**
- Modify: `src/lib/universalis.ts`
- Test: `src/lib/universalis.test.ts`

- [ ] **Step 1: Update tests.** First READ `src/lib/universalis.test.ts`. Then:
  (a) For every `parseMarketResponse(...)` assertion that uses `toEqual({ ... })` on a **full** `MarketItem` object (the "extracts min NQ…" test and the "returns null prices when no matching listings" test), add `lastSaleMs: null,` to the expected object (their `recentHistory` entries carry no `timestamp`, so the result is null).
  (b) Append two new tests at the end of the `describe('parseMarketResponse', …)` block:
```ts
  it('captures the newest sale timestamp as lastSaleMs (ms)', () => {
    const raw = { items: { '110': {
      listings: [],
      recentHistory: [
        { hq: false, pricePerUnit: 100, timestamp: 1_000 },
        { hq: true,  pricePerUnit: 200, timestamp: 5_000 },
        { hq: false, pricePerUnit: 90,  timestamp: 3_000 },
      ],
      regularSaleVelocity: 1, lastUploadTime: 0,
    } } };
    expect(parseMarketResponse(raw)['110'].lastSaleMs).toBe(5_000_000);
  });

  it('lastSaleMs is null when history has no timestamps', () => {
    const raw = { items: { '111': {
      listings: [], recentHistory: [{ hq: false, pricePerUnit: 100 }],
      regularSaleVelocity: 1, lastUploadTime: 0,
    } } };
    expect(parseMarketResponse(raw)['111'].lastSaleMs).toBeNull();
  });
```

- [ ] **Step 2: Run** `npx vitest run src/lib/universalis.test.ts` → expect FAIL (`lastSaleMs` undefined / property missing).

- [ ] **Step 3: Implement** in `src/lib/universalis.ts`:
  (a) Extend `RawHistory`:
```ts
interface RawHistory { hq: boolean; pricePerUnit: number; timestamp?: number }
```
  (b) Add to the `MarketItem` interface (after `lastUploadTime: number;`):
```ts
  /** Newest recorded sale time in ms (max recentHistory timestamp ×1000), or null when no dated history. */
  lastSaleMs: number | null;
```
  (c) Inside `parseMarketResponse`, after `const history = item.recentHistory ?? [];`, add:
```ts
    const saleTimes = history
      .map((h) => h.timestamp)
      .filter((t): t is number => typeof t === 'number' && t > 0);
    const lastSaleMs = saleTimes.length ? Math.max(...saleTimes) * 1000 : null;
```
  and add `lastSaleMs,` to the object pushed into `out[id]` (anywhere among its fields).
  (d) In `emptyMarketItem()`, add `lastSaleMs: null,`.

- [ ] **Step 4: Run** `npx vitest run src/lib/universalis.test.ts` → expect PASS. Then `npx vitest run` (full suite) → expect PASS (other MarketItem literals use `as MarketItem` casts, so the new field doesn't break them).

- [ ] **Step 5: Commit**
```bash
git add src/lib/universalis.ts src/lib/universalis.test.ts
git commit -m "feat(market): parse newest-sale timestamp into MarketItem.lastSaleMs"
```

---

### Task 2: `runEmptyShelf` runner + types

**Files:**
- Modify: `src/features/queries/types.ts`
- Create: `src/features/queries/runEmptyShelf.ts`
- Test: `src/features/queries/runEmptyShelf.test.ts`

- [ ] **Step 1: Add types.** Append to `src/features/queries/types.ts`:
```ts
export type EmptyShelfSort = 'freshness' | 'velocity' | 'estGilPerDay' | 'suggestedPrice';

export interface EmptyShelfFilter {
  searchCategories: number[];
  hq: HqMode;
  minVelocity: number;
  maxListings: number;
  maxDaysSinceSale: number | null;
  sort: EmptyShelfSort;
  limit: number;
}

export interface EmptyShelfRow {
  id: number; name: string; sc: number; hq: boolean;
  suggestedPrice: number;
  velocity: number;
  lastSaleMs: number | null;
  daysSinceLastSale: number | null;
  estGilPerDay: number;
}

export function defaultEmptyShelfFilter(): EmptyShelfFilter {
  return { searchCategories: [], hq: 'either', minVelocity: 0.14, maxListings: 0,
           maxDaysSinceSale: 30, sort: 'freshness', limit: 200 };
}
```

- [ ] **Step 2: Write the failing test** `src/features/queries/runEmptyShelf.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runEmptyShelf } from './runEmptyShelf';
import { defaultEmptyShelfFilter, type EmptyShelfFilter } from './types';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketItem, MarketData } from '../../lib/universalis';

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

const item = (id: number, sc = 1, canHq = true): SnapshotItem =>
  ({ id, name: `Item ${id}`, sc, canHq } as SnapshotItem);

const mkt = (over: Partial<MarketItem>): MarketItem => ({
  minNQ: null, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null,
  recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0, listingCount: 0,
  worldListings: [], averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null, ...over,
} as MarketItem);

const filt = (over: Partial<EmptyShelfFilter> = {}): EmptyShelfFilter => ({ ...defaultEmptyShelfFilter(), ...over });

describe('runEmptyShelf', () => {
  it('keeps sold-out, still-selling items and computes recency, price, gil/day', () => {
    const snap = [item(100)];
    const market: MarketData = { 100: mkt({ listingCount: 0, velocity: 1, medianNQ: 1000, recentSalesNQ: 5, lastSaleMs: NOW - 2 * DAY }) };
    const rows = runEmptyShelf(snap, market, filt(), NOW);
    expect(rows).toEqual([{
      id: 100, name: 'Item 100', sc: 1, hq: false,
      suggestedPrice: 1000, velocity: 1, lastSaleMs: NOW - 2 * DAY,
      daysSinceLastSale: 2, estGilPerDay: 1000,
    }]);
  });

  it('drops items that still have listings above maxListings', () => {
    const market: MarketData = { 200: mkt({ listingCount: 3, velocity: 1, medianNQ: 500, lastSaleMs: NOW }) };
    expect(runEmptyShelf([item(200)], market, filt(), NOW)).toEqual([]);
  });

  it('drops items below minVelocity', () => {
    const market: MarketData = { 300: mkt({ listingCount: 0, velocity: 0.05, medianNQ: 9000, lastSaleMs: NOW }) };
    expect(runEmptyShelf([item(300)], market, filt(), NOW)).toEqual([]);
  });

  it('drops items whose last sale is older than maxDaysSinceSale, keeps unknown-recency rows', () => {
    const snap = [item(1), item(2)];
    const market: MarketData = {
      1: mkt({ listingCount: 0, velocity: 1, medianNQ: 100, lastSaleMs: NOW - 60 * DAY }), // 60d old → dropped (>30)
      2: mkt({ listingCount: 0, velocity: 1, medianNQ: 100, lastSaleMs: null }),           // unknown → kept
    };
    const rows = runEmptyShelf(snap, market, filt({ maxDaysSinceSale: 30 }), NOW);
    expect(rows.map((r) => r.id)).toEqual([2]);
    expect(rows[0].daysSinceLastSale).toBeNull();
  });

  it('either-mode picks the tier with more recent sales', () => {
    const market: MarketData = { 5: mkt({ listingCount: 0, velocity: 1, medianNQ: 1000, recentSalesNQ: 2, medianHQ: 5000, recentSalesHQ: 10, lastSaleMs: NOW }) };
    const rows = runEmptyShelf([item(5)], market, filt({ hq: 'either' }), NOW);
    expect(rows[0].hq).toBe(true);
    expect(rows[0].suggestedPrice).toBe(5000);
  });

  it('sorts by freshness with unknown recency last', () => {
    const snap = [item(1), item(2), item(3)];
    const market: MarketData = {
      1: mkt({ listingCount: 0, velocity: 1, medianNQ: 100, lastSaleMs: NOW - 9 * DAY }),
      2: mkt({ listingCount: 0, velocity: 1, medianNQ: 100, lastSaleMs: null }),
      3: mkt({ listingCount: 0, velocity: 1, medianNQ: 100, lastSaleMs: NOW - 1 * DAY }),
    };
    const rows = runEmptyShelf(snap, market, filt({ maxDaysSinceSale: null, sort: 'freshness' }), NOW);
    expect(rows.map((r) => r.id)).toEqual([3, 1, 2]); // 1d, 9d, then unknown
  });

  it('honors the limit', () => {
    const snap = [item(1), item(2), item(3)];
    const market: MarketData = Object.fromEntries(
      snap.map((s, i) => [s.id, mkt({ listingCount: 0, velocity: 1, medianNQ: 100 * (i + 1), lastSaleMs: NOW })]),
    );
    expect(runEmptyShelf(snap, market, filt({ sort: 'suggestedPrice', limit: 2 }), NOW)).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/features/queries/runEmptyShelf.test.ts` → expect FAIL.

- [ ] **Step 4: Implement** `src/features/queries/runEmptyShelf.ts`:
```ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { EmptyShelfFilter, EmptyShelfRow, EmptyShelfSort, HqMode } from './types';

const DAY_MS = 86_400_000;

function pickTier(m: MarketItem, hq: HqMode): { price: number; isHq: boolean } | null {
  const nq = m.medianNQ ?? m.averagePriceNQ;
  const hqp = m.medianHQ ?? m.averagePriceHQ;
  const nqTier = nq != null && nq > 0 ? { price: nq, isHq: false } : null;
  const hqTier = hqp != null && hqp > 0 ? { price: hqp, isHq: true } : null;
  if (hq === 'nq') return nqTier;
  if (hq === 'hq') return hqTier;
  if (nqTier && hqTier) return m.recentSalesHQ > m.recentSalesNQ ? hqTier : nqTier;
  return nqTier ?? hqTier;
}

function compare(a: EmptyShelfRow, b: EmptyShelfRow, sort: EmptyShelfSort): number {
  switch (sort) {
    case 'freshness': {
      const ad = a.daysSinceLastSale, bd = b.daysSinceLastSale;
      if (ad == null && bd == null) return 0;
      if (ad == null) return 1;
      if (bd == null) return -1;
      return ad - bd;
    }
    case 'velocity':       return b.velocity - a.velocity;
    case 'estGilPerDay':   return b.estGilPerDay - a.estGilPerDay;
    case 'suggestedPrice': return b.suggestedPrice - a.suggestedPrice;
  }
}

export function runEmptyShelf(
  snapshot: SnapshotItem[],
  market: MarketData,
  filter: EmptyShelfFilter,
  nowMs: number,
): EmptyShelfRow[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: EmptyShelfRow[] = [];

  for (const it of snapshot) {
    if (catSet && !catSet.has(it.sc)) continue;
    if (filter.hq === 'hq' && !it.canHq) continue;
    const m = market[it.id];
    if (!m) continue;
    if (m.listingCount > filter.maxListings) continue;
    if (m.velocity < filter.minVelocity) continue;
    const tier = pickTier(m, filter.hq);
    if (!tier) continue;

    const daysSinceLastSale = m.lastSaleMs != null ? (nowMs - m.lastSaleMs) / DAY_MS : null;
    if (filter.maxDaysSinceSale != null && daysSinceLastSale != null && daysSinceLastSale > filter.maxDaysSinceSale) continue;

    out.push({
      id: it.id, name: it.name, sc: it.sc, hq: tier.isHq,
      suggestedPrice: Math.round(tier.price),
      velocity: m.velocity,
      lastSaleMs: m.lastSaleMs,
      daysSinceLastSale,
      estGilPerDay: Math.round(tier.price * m.velocity),
    });
  }

  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
```

- [ ] **Step 5: Run** `npx vitest run src/features/queries/runEmptyShelf.test.ts` → expect PASS.

- [ ] **Step 6: Commit**
```bash
git add src/features/queries/types.ts src/features/queries/runEmptyShelf.ts src/features/queries/runEmptyShelf.test.ts
git commit -m "feat(queries): runEmptyShelf restock-opportunity runner"
```

---

### Task 3: `EmptyShelfResults` table

**Files:**
- Create: `src/features/queries/EmptyShelfResults.tsx`
- Test: `src/features/queries/EmptyShelfResults.test.tsx`

- [ ] **Step 1: Write the failing test** `src/features/queries/EmptyShelfResults.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EmptyShelfResults } from './EmptyShelfResults';
import type { EmptyShelfRow } from './types';

const row = (over: Partial<EmptyShelfRow> = {}): EmptyShelfRow => ({
  id: 100, name: 'Grade 8 Tincture', sc: 43, hq: true,
  suggestedPrice: 18400, velocity: 0.9, lastSaleMs: 1, daysSinceLastSale: 2, estGilPerDay: 16560, ...over,
});

const renderResults = (rows: EmptyShelfRow[], onSortChange = vi.fn()) =>
  render(
    <MemoryRouter>
      <EmptyShelfResults rows={rows} totalCandidates={rows.length} skippedChunks={0} sort="freshness" onSortChange={onSortChange} />
    </MemoryRouter>,
  );

describe('EmptyShelfResults', () => {
  it('renders a row with last-sold, suggested price and est gil/day', () => {
    renderResults([row()]);
    expect(screen.getByText('Grade 8 Tincture')).toBeInTheDocument();
    expect(screen.getByText('2d ago')).toBeInTheDocument();
  });

  it('shows an em-dash when recency is unknown', () => {
    renderResults([row({ daysSinceLastSale: null, lastSaleMs: null })]);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('fires onSortChange when a sortable header is clicked', async () => {
    const onSortChange = vi.fn();
    renderResults([row()], onSortChange);
    await userEvent.click(screen.getByText(/Vel/i));
    expect(onSortChange).toHaveBeenCalledWith('velocity');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/queries/EmptyShelfResults.test.tsx` → expect FAIL.

- [ ] **Step 3: Implement** `src/features/queries/EmptyShelfResults.tsx`:
```tsx
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from './ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { EmptyShelfRow, EmptyShelfSort } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: EmptyShelfRow[];
  totalCandidates: number;
  skippedChunks: number;
  sort: EmptyShelfSort;
  onSortChange: (next: EmptyShelfSort) => void;
}

const CSV_COLUMNS: CsvColumn<EmptyShelfRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'hq', label: 'HQ' },
  { key: 'daysSinceLastSale', label: 'Days since last sale', value: (r) => r.daysSinceLastSale == null ? '' : Math.round(r.daysSinceLastSale) },
  { key: 'velocity', label: 'Velocity (sales/day)' },
  { key: 'suggestedPrice', label: 'Suggested price' },
  { key: 'estGilPerDay', label: 'Est gil/day' },
];

function lastSold(r: EmptyShelfRow): string {
  if (r.daysSinceLastSale == null) return '—';
  const d = Math.round(r.daysSinceLastSale);
  return d <= 0 ? 'today' : `${d}d ago`;
}

function SortableHeader({ active, onClick, children, hideOnMobile = false }: {
  active: boolean; onClick: () => void; children: React.ReactNode; hideOnMobile?: boolean;
}) {
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none text-right ${hideOnMobile ? 'hidden md:table-cell' : ''} ${active ? 'text-gold' : 'text-text-dim hover:text-aether'}`}
      onClick={onClick}
      aria-sort={active ? 'descending' : 'none'}
    >
      {children}{active ? ' ▼' : ''}
    </th>
  );
}

export function EmptyShelfResults({ rows, totalCandidates, skippedChunks, sort, onSortChange }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={<EmptyResults>No empty shelves match these filters. Try lowering Min sales/day, widening Sold within, or raising the empty threshold.</EmptyResults>}
      csvColumns={CSV_COLUMNS}
      csvFilename={`empty-shelf-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2 text-text-dim">#</th>
              <th className="text-left px-3 py-2 text-text-dim">Item</th>
              <SortableHeader active={sort === 'freshness'} onClick={() => onSortChange('freshness')}>Last sold</SortableHeader>
              <SortableHeader active={sort === 'velocity'} onClick={() => onSortChange('velocity')} hideOnMobile>Vel</SortableHeader>
              <SortableHeader active={sort === 'suggestedPrice'} onClick={() => onSortChange('suggestedPrice')}>Suggested</SortableHeader>
              <SortableHeader active={sort === 'estGilPerDay'} onClick={() => onSortChange('estGilPerDay')}>Est gil/day</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}><ItemNameLinks id={r.id} name={r.name} /></td>
                <td className={`px-3 ${rowY} font-mono text-right text-text-low`}>{lastSold(r)}</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>
                  {fmtGil(r.suggestedPrice)}
                  {r.hq && <span className="text-gold ml-1 inline-flex items-baseline"><HqStar /></span>}
                </td>
                <td className={`px-3 ${rowY} font-mono text-right text-jade`}>{fmtGil(r.estGilPerDay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
```

- [ ] **Step 4: Run** `npx vitest run src/features/queries/EmptyShelfResults.test.tsx` → expect PASS. (If `getByText(/Vel/i)` is ambiguous, scope to the header `th`; it should be unique.)

- [ ] **Step 5: Commit**
```bash
git add src/features/queries/EmptyShelfResults.tsx src/features/queries/EmptyShelfResults.test.tsx
git commit -m "feat(queries): EmptyShelfResults table"
```

---

### Task 4: `EmptyShelfView` + route + nav

**Files:**
- Create: `src/features/insights/EmptyShelfView.tsx`
- Create: `src/routes/EmptyShelf.tsx`
- Modify: `src/App.tsx`, `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create the view** `src/features/insights/EmptyShelfView.tsx` (mirrors `VendorFlipView`, no catalog):
```tsx
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { runEmptyShelf } from '../queries/runEmptyShelf';
import { EmptyShelfResults } from '../queries/EmptyShelfResults';
import { defaultEmptyShelfFilter, type EmptyShelfFilter, type EmptyShelfSort, type HqMode } from '../queries/types';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';
import { Spinner, SpinGlyph } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { useInitialScan } from '../queries/useInitialScan';

interface RunResult { saleMap: MarketData; skipped: number; filterAtRun: EmptyShelfFilter; }

function scanParamsChanged(a: EmptyShelfFilter, b: EmptyShelfFilter): boolean {
  return a.minVelocity !== b.minVelocity || a.maxListings !== b.maxListings
    || a.maxDaysSinceSale !== b.maxDaysSinceSale || a.hq !== b.hq;
}

export function EmptyShelfView() {
  const { world, hideCrystals } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const [filter, setFilter] = useState<EmptyShelfFilter>(defaultEmptyShelfFilter());
  const [sort, setSort] = useState<EmptyShelfSort>(defaultEmptyShelfFilter().sort);

  const candidateIds = useMemo(() => {
    if (!snapshot.data) return [];
    const out: number[] = [];
    for (const item of snapshot.data.items) {
      if (hideCrystals && item.sc === CRYSTALS_SEARCH_CATEGORY) continue;
      if (filter.hq === 'hq' && !item.canHq) continue;
      out.push(item.id);
    }
    return out;
  }, [snapshot.data, filter.hq, hideCrystals]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Snapshot not ready');
      const sale = await fetchInBatches<MarketData[string]>(
        candidateIds,
        (chunk) => fetchMarketData(world, chunk),
        { chunkSize: 100, concurrency: 4 },
      );
      return { saleMap: sale.data, skipped: sale.errors.length, filterAtRun: filter };
    },
  });

  const rows = useMemo(() => {
    if (!snapshot.data || !run.data) return [];
    return runEmptyShelf(snapshot.data.items, run.data.saleMap, { ...run.data.filterAtRun, sort }, Date.now());
  }, [snapshot.data, run.data, sort]);

  const ready = snapshot.data != null;
  const stale = run.data != null && scanParamsChanged(run.data.filterAtRun, filter);
  useInitialScan(ready, () => { run.reset(); run.mutate(); });

  return (
    <div className="space-y-4">
      <FilterBar value={filter} onChange={setFilter} onRun={() => { run.reset(); run.mutate(); }} busy={run.isPending} notReady={!ready} stale={stale} />

      <div className="font-mono text-[10px] text-text-low">
        {snapshot.isLoading ? 'Loading item catalog…' : `${candidateIds.length.toLocaleString()} candidate items`}
        {run.data && <> · {rows.length.toLocaleString()} results</>}
      </div>

      {run.isPending && <Spinner label={`Scanning ${world} for empty shelves…`} />}
      {run.isError && <StatusBanner kind="error">Scan failed: {(run.error as Error).message}</StatusBanner>}

      {!run.data && !run.isPending && (
        <EmptyState icon="❖" message={ready ? 'Scan for sold-out items that still sell — list into the gap.' : 'Loading item catalog…'} />
      )}

      {run.data && (
        <EmptyShelfResults rows={rows} totalCandidates={candidateIds.length} skippedChunks={run.data.skipped} sort={sort} onSortChange={setSort} />
      )}
    </div>
  );
}

function FilterBar({ value, onChange, onRun, busy, notReady, stale }: {
  value: EmptyShelfFilter; onChange: (f: EmptyShelfFilter) => void; onRun: () => void; busy: boolean; notReady: boolean; stale: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card justify-between">
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min sales/day</span>
        <input type="number" inputMode="decimal" min={0} step={0.1} value={value.minVelocity}
          onChange={(e) => onChange({ ...value, minVelocity: Math.max(0, Number(e.target.value) || 0) })}
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Sold within (days)</span>
        <input type="number" inputMode="decimal" min={1} step={1} value={value.maxDaysSinceSale ?? ''}
          onChange={(e) => { const n = Number(e.target.value); onChange({ ...value, maxDaysSinceSale: Number.isFinite(n) && n > 0 ? n : null }); }}
          placeholder="∞"
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Empty threshold</span>
        <input type="number" inputMode="decimal" min={0} step={1} value={value.maxListings}
          onChange={(e) => onChange({ ...value, maxListings: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">HQ mode</span>
        <div className="flex gap-2">
          {(['nq', 'hq', 'either'] as HqMode[]).map((mode) => (
            <button key={mode} type="button" onClick={() => onChange({ ...value, hq: mode })}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${value.hq === mode ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'}`}>
              {mode === 'either' ? 'Either' : mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-stretch gap-1 w-full sm:w-auto sm:ml-auto order-last">
        {stale && !busy && (
          <span className="font-mono text-[10px] tracking-widest uppercase text-gold/80 text-right">Filters changed — Run scan to refresh</span>
        )}
        <button type="button" onClick={onRun} disabled={busy || notReady}
          className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
          {busy ? <>Running…<SpinGlyph /></> : 'Run scan'}
        </button>
      </div>
    </div>
  );
}
```
NOTE: before implementing, confirm the exports `CRYSTALS_SEARCH_CATEGORY` (from `../queries/commonFilters`), `fetchInBatches` (from `../../lib/universalisBulk`), `Spinner`/`SpinGlyph`, `StatusBanner`, `EmptyState`, and `useItemSnapshot` exist with these import paths — they are all used identically by `src/features/insights/VendorFlipView.tsx`, so copy that file's import lines if anything differs.

- [ ] **Step 2: Create the route** `src/routes/EmptyShelf.tsx`:
```tsx
import { EmptyShelfView } from '../features/insights/EmptyShelfView';

export default function EmptyShelf() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Empty Shelf</h2>
        <p className="font-mono text-[13px] text-text-low max-w-prose">
          Restock opportunities — items sold out on your home world that still sell. List into the gap.
        </p>
      </div>
      <EmptyShelfView />
    </div>
  );
}
```

- [ ] **Step 3: Wire the route** in `src/App.tsx`:
  Add the import next to the other route imports (e.g. after `import VendorFlip from './routes/VendorFlip';`):
```ts
import EmptyShelf from './routes/EmptyShelf';
```
  Add the route next to the other scan routes (after the `/vendor-flip` route line):
```tsx
                      <Route path="/empty-shelf" element={<EmptyShelf />} />
```

- [ ] **Step 4: Wire the nav** in `src/components/layout/Sidebar.tsx`:
  In the nav group that contains `{ label: 'Vendor Flip', path: '/vendor-flip' }`, add right after it:
```ts
      { label: 'Empty Shelf', path: '/empty-shelf' },
```

- [ ] **Step 5: Verify**
  Run: `npx tsc --noEmit` → expect exit 0. (If `useItemSnapshot`/`commonFilters`/`universalisBulk` import paths differ, align them with `VendorFlipView.tsx`.)
  Run: `npx vitest run` → expect full suite green.

- [ ] **Step 6: Commit**
```bash
git add src/features/insights/EmptyShelfView.tsx src/routes/EmptyShelf.tsx src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(insights): Empty Shelf scan page + route + nav"
```

---

### Task 5: Regenerate API bundles

**Files:**
- Modify (generated): `api/*.mjs` (the bundles that inline `parseMarketResponse`).

The bot's hourly cache refresh runs from the bundled `api/*.mjs`. Until rebuilt, the deployed `market-cache.json` won't include `lastSaleMs` and the Last-sold column shows "—" in production.

- [ ] **Step 1: Rebuild.** Run `npm run build:api` → esbuild writes the `api/*.mjs` files with no errors.
- [ ] **Step 2: Confirm.** Run `git diff --stat api/` → expect `api/discord.mjs` + `api/refresh-cache.mjs` (and any other bundle importing universalis) changed. If a bundle shows only line-ending churn with no content change, `git checkout` it so the commit stays clean.
- [ ] **Step 3: Commit**
```bash
git add api/
git commit -m "build(api): regenerate bundles with lastSaleMs parser"
```

---

## Verification Checklist

- [ ] `npx vitest run` — full suite green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `/empty-shelf` is reachable from the sidebar, auto-runs its default scan, and lists sold-out items ranked freshest-first with Last sold / Vel / Suggested / Est gil/day; the sortable headers re-rank.
- [ ] Before the next cache refresh, rows show "—" for Last sold (graceful) rather than breaking.

## Notes / Deferred

- Home-world scope only; no category picker (parity with the sibling flip views — `searchCategories` stays available in the type for future presets).
- The existing Out-of-Stock preset is left untouched; this page supersedes it for recency-aware use.
