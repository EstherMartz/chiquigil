# Travel Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/travel` page where the user picks a destination world they can travel to and gets a budget-aware shopping list of items to buy there and resell on their home world.

**Architecture:** A pure allocation engine (`planTravel`) does absorption-aware, marginal-listing knapsack math over two per-world Universalis fetches (destination listings + home sell/velocity). A view (fetch + filters) and a results table reuse the existing `ResultTableScaffold` / `useInitialScan` house pattern. A small world catalog adds the Oceania DC.

**Tech Stack:** React + TypeScript, Zustand (settings), @tanstack/react-query (`useMutation`), Vitest, Universalis bulk fetch helpers.

**Branch:** Create a fresh branch off `main` before Task 1: `git switch main && git pull && git switch -c feature/travel-planner`. (Do not build on `feature/glamour-demand` — it has unrelated in-progress work.)

**Reference spec:** `docs/superpowers/specs/2026-06-06-travel-planner-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/travelWorlds.ts` (create) | Destination world catalog: Chaos + Light (reused) + Oceania; `dcOfTravel`. |
| `src/lib/travelWorlds.test.ts` (create) | Unit tests for the catalog. |
| `src/features/travel/types.ts` (create) | `TravelMetric`, `TravelOpts`, `TravelRow`, `TravelPlan`. |
| `src/features/travel/planTravel.ts` (create) | Pure allocation engine. |
| `src/features/travel/planTravel.test.ts` (create) | Unit tests for the engine. |
| `src/features/travel/TravelResults.tsx` (create) | Results table via `ResultTableScaffold`. |
| `src/features/travel/TravelResults.test.tsx` (create) | Render test. |
| `src/features/travel/TravelPlannerView.tsx` (create) | Fetch + state + FilterBar + SummaryBand. |
| `src/routes/Travel.tsx` (create) | Route wrapper (heading + view). |
| `src/App.tsx` (modify) | Import + `<Route>` + page-title map entry. |
| `src/components/layout/Sidebar.tsx` (modify) | Gil-Making nav entry. |
| `src/components/layout/Header.tsx` (modify) | Gil-Making nav entry. |

---

## Task 1: Travel world catalog

**Files:**
- Create: `src/lib/travelWorlds.ts`
- Test: `src/lib/travelWorlds.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/travelWorlds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TRAVEL_WORLDS, OCEANIA_WORLDS, dcOfTravel } from './travelWorlds';

describe('travelWorlds', () => {
  it('classifies worlds by data center', () => {
    expect(dcOfTravel('Phantom')).toBe('Chaos');
    expect(dcOfTravel('Lich')).toBe('Light');
    expect(dcOfTravel('Ravana')).toBe('Oceania');
    expect(dcOfTravel('Gilgamesh')).toBeNull();
  });

  it('includes Chaos, Light and Oceania worlds in the travel set', () => {
    expect(TRAVEL_WORLDS.has('Phantom')).toBe(true);
    expect(TRAVEL_WORLDS.has('Shiva')).toBe(true);
    expect(TRAVEL_WORLDS.has('Sephirot')).toBe(true);
    expect(OCEANIA_WORLDS.has('Zurvan')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/travelWorlds.test.ts`
Expected: FAIL — `Failed to resolve import './travelWorlds'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/travelWorlds.ts`:

```ts
import { CHAOS_WORLDS, LIGHT_WORLDS } from './europeWorlds';

/** Oceania data center (Materia). */
export const OCEANIA_WORLDS: ReadonlySet<string> = new Set([
  'Bismarck', 'Ravana', 'Sephirot', 'Sophia', 'Zurvan',
]);

export type TravelDc = 'Chaos' | 'Light' | 'Oceania';

/** Every world a Chaos/Light player can DC-travel to. */
export const TRAVEL_WORLDS: ReadonlySet<string> = new Set([
  ...CHAOS_WORLDS, ...LIGHT_WORLDS, ...OCEANIA_WORLDS,
]);

export function dcOfTravel(world: string): TravelDc | null {
  if (CHAOS_WORLDS.has(world)) return 'Chaos';
  if (LIGHT_WORLDS.has(world)) return 'Light';
  if (OCEANIA_WORLDS.has(world)) return 'Oceania';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/travelWorlds.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/travelWorlds.ts src/lib/travelWorlds.test.ts
git commit -m "feat(travel): destination world catalog with Oceania DC"
```

---

## Task 2: Types

**Files:**
- Create: `src/features/travel/types.ts`

No test (type-only module; exercised by Task 3's tests).

- [ ] **Step 1: Write the types**

Create `src/features/travel/types.ts`:

```ts
import type { HqMode } from '../../lib/priceTrust';

export type { HqMode };

export type TravelMetric = 'profit' | 'roi' | 'spread';

export interface TravelOpts {
  /** The user's home world (where items are resold). */
  homeWorld: string;
  /** Spend cap in gil. null or 0 = unlimited. */
  budget: number | null;
  /** Which metric orders the greedy allocation (and the resulting table). */
  metric: TravelMetric;
  hq: HqMode;
  /** Skip items whose home velocity is below this (sales/day). */
  minVelocity: number;
  /** How many days of home sales we assume we can offload. Sets the per-item cap. */
  horizonDays: number;
  applyMarketTax: boolean;
}

export interface TravelRow {
  id: number;
  name: string;
  sc: number;
  /** Units to buy on the destination world. */
  units: number;
  avgBuyPrice: number;
  /** Net-of-tax home sell price per unit. */
  homeSell: number;
  /** Total gil spent buying the allocated units. */
  cost: number;
  /** Projected net profit (revenue − cost). */
  profit: number;
  /** profit / cost. */
  roi: number;
  velocity: number;
  /** Whether the chosen home sell tier was HQ. */
  hq: boolean;
}

export interface TravelPlan {
  rows: TravelRow[];
  totalCost: number;
  totalProfit: number;
  totalUnits: number;
  /** totalProfit / totalCost, 0 when nothing allocated. */
  blendedRoi: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/travel/types.ts
git commit -m "feat(travel): plan types"
```

---

## Task 3: Allocation engine (`planTravel`)

**Files:**
- Create: `src/features/travel/planTravel.ts`
- Test: `src/features/travel/planTravel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/travel/planTravel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planTravel } from './planTravel';
import type { MarketData, MarketItem, WorldListing } from '../../lib/universalis';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { TravelOpts } from './types';

function mkMarket(p: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0,
    velocity: 0, lastUploadTime: 0, listingCount: 0, worldListings: [],
    averagePriceNQ: null, averagePriceHQ: null, lastSaleMs: null,
    ...p,
  };
}

/** A home-world item that passes pickHighestTrustedTier at `unit` gil NQ. */
function homeSell(unit: number, velocity: number): MarketItem {
  return mkMarket({ minNQ: unit, medianNQ: unit, recentSalesNQ: 10, velocity });
}

function listing(price: number, quantity: number, hq = false): WorldListing {
  return { world: 'Lich', price, hq, quantity };
}

const items: SnapshotItem[] = [
  { id: 1, name: 'Widget', sc: 5, ui: 0, ilvl: 100, canHq: true },
  { id: 2, name: 'Gadget', sc: 5, ui: 0, ilvl: 100, canHq: true },
];

const baseOpts: TravelOpts = {
  homeWorld: 'Phantom', budget: null, metric: 'profit',
  hq: 'nq', minVelocity: 0, horizonDays: 7, applyMarketTax: false,
};

describe('planTravel', () => {
  it('buys every profitable unit when budget is unlimited', () => {
    const home: MarketData = { 1: homeSell(1000, 5) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(600, 3)] }) };
    const plan = planTravel([items[0]], dest, home, baseOpts);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].units).toBe(3);
    expect(plan.rows[0].cost).toBe(1800);
    expect(plan.rows[0].profit).toBe(1200); // 3 × (1000 − 600)
    expect(plan.totalProfit).toBe(1200);
  });

  it('respects the budget cap', () => {
    const home: MarketData = { 1: homeSell(1000, 5) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(600, 3)] }) };
    const plan = planTravel([items[0]], dest, home, { ...baseOpts, budget: 1200 });
    expect(plan.rows[0].units).toBe(2); // 2 × 600 = 1200 fits, 3rd would overflow
    expect(plan.totalCost).toBe(1200);
    expect(plan.totalProfit).toBe(800);
  });

  it('applies the 5% market tax to home revenue when enabled', () => {
    const home: MarketData = { 1: homeSell(1000, 5) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(600, 2)] }) };
    const plan = planTravel([items[0]], dest, home, { ...baseOpts, applyMarketTax: true });
    expect(plan.rows[0].homeSell).toBe(950); // 1000 × 0.95
    expect(plan.rows[0].profit).toBe(700);   // 2 × (950 − 600)
  });

  it('drops items whose cheapest listing is not profitable', () => {
    const home: MarketData = { 1: homeSell(1000, 5) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(1100, 5)] }) };
    const plan = planTravel([items[0]], dest, home, baseOpts);
    expect(plan.rows).toHaveLength(0);
  });

  it('caps units at home absorption (velocity × horizon)', () => {
    const home: MarketData = { 1: homeSell(1000, 0.1) }; // ceil(0.1 × 7) = 1
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(600, 9)] }) };
    const plan = planTravel([items[0]], dest, home, baseOpts);
    expect(plan.rows[0].units).toBe(1);
  });

  it('skips items below the velocity floor', () => {
    const home: MarketData = { 1: homeSell(1000, 0.2) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [listing(600, 3)] }) };
    const plan = planTravel([items[0]], dest, home, { ...baseOpts, minVelocity: 1 });
    expect(plan.rows).toHaveLength(0);
  });

  it('treats missing listing quantity as 1', () => {
    const home: MarketData = { 1: homeSell(1000, 5) };
    const dest: MarketData = { 1: mkMarket({ worldListings: [{ world: 'Lich', price: 600, hq: false }] }) };
    const plan = planTravel([items[0]], dest, home, baseOpts);
    expect(plan.rows[0].units).toBe(1);
  });

  it('ROI ordering fills the higher-return item first under a tight budget', () => {
    // Item 1: buy 900 → sell 1000 (profit 100, roi 0.11). Item 2: buy 100 → sell 200 (profit 100, roi 1.0).
    const home: MarketData = { 1: homeSell(1000, 5), 2: homeSell(200, 5) };
    const dest: MarketData = {
      1: mkMarket({ worldListings: [listing(900, 1)] }),
      2: mkMarket({ worldListings: [listing(100, 1)] }),
    };
    const roiPlan = planTravel(items, dest, home, { ...baseOpts, metric: 'roi', budget: 100 });
    expect(roiPlan.rows).toHaveLength(1);
    expect(roiPlan.rows[0].id).toBe(2); // high-ROI item wins the limited budget
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/travel/planTravel.test.ts`
Expected: FAIL — `Failed to resolve import './planTravel'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/travel/planTravel.ts`:

```ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import { pickHighestTrustedTier } from '../../lib/priceTrust';
import { applyTax } from '../items/verdict/pricing';
import type { TravelMetric, TravelOpts, TravelPlan, TravelRow } from './types';

interface Unit {
  id: number;
  buyPrice: number;
  netRevenue: number;   // net-of-tax home sell per unit
  grossRevenue: number; // pre-tax home sell per unit (for the 'spread' metric)
  isHq: boolean;
}

function metricKey(u: Unit, metric: TravelMetric): number {
  if (metric === 'roi') return u.buyPrice > 0 ? (u.netRevenue - u.buyPrice) / u.buyPrice : 0;
  if (metric === 'spread') return u.grossRevenue - u.buyPrice;
  return u.netRevenue - u.buyPrice; // 'profit'
}

export function planTravel(
  items: SnapshotItem[],
  destMarket: MarketData,
  homeMarket: MarketData,
  opts: TravelOpts,
): TravelPlan {
  const byId = new Map<number, SnapshotItem>();
  for (const it of items) byId.set(it.id, it);

  // 1. Expand each item into marginal buy-units, cheapest-listing-first, capped by absorption.
  const pool: Unit[] = [];
  for (const it of items) {
    const home = homeMarket[it.id];
    const dest = destMarket[it.id];
    if (!home || !dest) continue;
    if (home.velocity < opts.minVelocity) continue;

    const tier = pickHighestTrustedTier(home, opts.hq, it.canHq);
    if (!tier) continue;
    const grossRevenue = tier.unit;
    const netRevenue = opts.applyMarketTax ? applyTax(grossRevenue) : grossRevenue;

    const cap = Math.max(1, Math.ceil(home.velocity * opts.horizonDays));

    const listings = dest.worldListings
      .filter((l) => (opts.hq === 'hq' ? l.hq : opts.hq === 'nq' ? !l.hq : true))
      .slice()
      .sort((a, b) => a.price - b.price);

    let emitted = 0;
    for (const l of listings) {
      if (emitted >= cap) break;
      if (netRevenue - l.price <= 0) break; // listings only get pricier from here
      const qty = Math.max(1, l.quantity ?? 1);
      const take = Math.min(qty, cap - emitted);
      for (let q = 0; q < take; q++) {
        pool.push({ id: it.id, buyPrice: l.price, netRevenue, grossRevenue, isHq: tier.isHq });
      }
      emitted += take;
    }
  }

  // 2. Greedy fill by the chosen metric, honoring the budget.
  pool.sort((a, b) => metricKey(b, opts.metric) - metricKey(a, opts.metric));
  const budget = opts.budget && opts.budget > 0 ? opts.budget : Infinity;

  interface Agg { units: number; cost: number; netRevenue: number; grossRevenue: number; isHq: boolean }
  const agg = new Map<number, Agg>();
  let spent = 0;
  for (const u of pool) {
    if (spent + u.buyPrice > budget) continue; // a cheaper later unit may still fit
    spent += u.buyPrice;
    const a = agg.get(u.id) ?? { units: 0, cost: 0, netRevenue: u.netRevenue, grossRevenue: u.grossRevenue, isHq: u.isHq };
    a.units += 1;
    a.cost += u.buyPrice;
    agg.set(u.id, a);
  }

  // 3. Aggregate into rows.
  const rows: TravelRow[] = [];
  let totalCost = 0, totalProfit = 0, totalUnits = 0;
  for (const [id, a] of agg) {
    const it = byId.get(id)!;
    const home = homeMarket[id]!;
    const profit = a.netRevenue * a.units - a.cost;
    rows.push({
      id, name: it.name, sc: it.sc,
      units: a.units,
      avgBuyPrice: Math.round(a.cost / a.units),
      homeSell: Math.round(a.netRevenue),
      cost: Math.round(a.cost),
      profit: Math.round(profit),
      roi: a.cost > 0 ? profit / a.cost : 0,
      velocity: home.velocity,
      hq: a.isHq,
    });
    totalCost += a.cost;
    totalProfit += profit;
    totalUnits += a.units;
  }

  rows.sort((a, b) => {
    if (opts.metric === 'roi') return b.roi - a.roi;
    if (opts.metric === 'spread') return (b.homeSell - b.avgBuyPrice) - (a.homeSell - a.avgBuyPrice);
    return b.profit - a.profit;
  });

  return {
    rows,
    totalCost: Math.round(totalCost),
    totalProfit: Math.round(totalProfit),
    totalUnits,
    blendedRoi: totalCost > 0 ? totalProfit / totalCost : 0,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/travel/planTravel.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/travel/planTravel.ts src/features/travel/planTravel.test.ts
git commit -m "feat(travel): absorption-aware budget allocation engine"
```

---

## Task 4: Results table

**Files:**
- Create: `src/features/travel/TravelResults.tsx`
- Test: `src/features/travel/TravelResults.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/travel/TravelResults.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TravelResults } from './TravelResults';
import type { TravelRow } from './types';

const rows: TravelRow[] = [
  { id: 1, name: 'Widget', sc: 5, units: 3, avgBuyPrice: 600, homeSell: 1000, cost: 1800, profit: 1200, roi: 0.6667, velocity: 5, hq: false },
];

function renderRows(r: TravelRow[]) {
  return render(<MemoryRouter><TravelResults rows={r} totalCandidates={500} skippedChunks={0} /></MemoryRouter>);
}

describe('TravelResults', () => {
  it('renders a row with its item name, units and ROI', () => {
    renderRows(rows);
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('shows the empty state when there are no rows', () => {
    renderRows([]);
    expect(screen.getByText(/Nothing profitable to haul back/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/travel/TravelResults.test.tsx`
Expected: FAIL — `Failed to resolve import './TravelResults'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/travel/TravelResults.tsx`:

```tsx
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { HqStar } from '../../components/HqStar';
import { ResultTableScaffold, EmptyResults } from '../queries/ResultTableScaffold';
import { useUiStore, rowPadClass } from '../ui/uiStore';
import type { TravelRow } from './types';
import type { CsvColumn } from '../../lib/csv';

interface Props {
  rows: TravelRow[];
  totalCandidates: number;
  skippedChunks: number;
}

const CSV_COLUMNS: CsvColumn<TravelRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'units', label: 'Units' },
  { key: 'avgBuyPrice', label: 'Avg buy' },
  { key: 'homeSell', label: 'Home sell (net)' },
  { key: 'cost', label: 'Cost' },
  { key: 'profit', label: 'Profit' },
  { key: 'roi', label: 'ROI %', value: (r) => Math.round(r.roi * 100) },
  { key: 'velocity', label: 'Velocity (sales/day)' },
];

export function TravelResults({ rows, totalCandidates, skippedChunks }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  return (
    <ResultTableScaffold
      rows={rows}
      totalCandidates={totalCandidates}
      skippedChunks={skippedChunks}
      emptyState={<EmptyResults>Nothing profitable to haul back under these settings. Try a different destination, raise the budget, or lower Min sales/day.</EmptyResults>}
      csvColumns={CSV_COLUMNS}
      csvFilename={`travel-${new Date().toISOString().slice(0, 10)}.csv`}
      renderTable={(visible) => (
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Units</th>
              <th className="text-right px-3 py-2">Avg buy</th>
              <th className="text-right px-3 py-2">Home sell</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Cost</th>
              <th className="text-right px-3 py-2">Profit</th>
              <th className="text-right px-3 py-2">ROI</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Vel</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                <td className={`px-3 ${rowY} text-text-low font-mono text-xs`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <span className="inline-flex items-center gap-1">
                    <ItemNameLinks id={r.id} name={r.name} />
                    {r.hq && <span className="text-gold"><HqStar /></span>}
                  </span>
                </td>
                <td className={`px-3 ${rowY} font-mono text-right tabular-nums`}>{r.units}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{fmtGil(r.avgBuyPrice)}</td>
                <td className={`px-3 ${rowY} font-mono text-right`}>{fmtGil(r.homeSell)}</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell text-text-low`}>{fmtGil(r.cost)}</td>
                <td className={`px-3 ${rowY} font-mono text-right text-jade`}>+{fmtGil(r.profit)}</td>
                <td className={`px-3 ${rowY} font-mono text-right text-aether`}>{Math.round(r.roi * 100)}%</td>
                <td className={`px-3 ${rowY} font-mono text-right hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/travel/TravelResults.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/travel/TravelResults.tsx src/features/travel/TravelResults.test.tsx
git commit -m "feat(travel): results table"
```

---

## Task 5: Planner view (fetch + filters + summary)

**Files:**
- Create: `src/features/travel/TravelPlannerView.tsx`

No new automated test (it composes already-tested units behind data fetching, mirroring `EmptyShelfView` which is likewise untested). Verified manually in Task 6.

- [ ] **Step 1: Write the implementation**

Create `src/features/travel/TravelPlannerView.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useSelectedItems } from '../items/useSelectedItems';
import { fetchInBatches } from '../../lib/universalisBulk';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { useInitialScan } from '../queries/useInitialScan';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';
import { TRAVEL_WORLDS, dcOfTravel } from '../../lib/travelWorlds';
import { planTravel } from './planTravel';
import { TravelResults } from './TravelResults';
import type { HqMode, TravelMetric, TravelPlan } from './types';
import { fmtGil } from '../../lib/format';
import { Spinner, SpinGlyph } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';

const MAX_CANDIDATES = 500;

interface RunResult {
  destMarket: MarketData;
  homeMarket: MarketData;
  skipped: number;
  destWorld: string;
}

export function TravelPlannerView() {
  const { world, hideCrystals, applyMarketTax } = useSettingsStore();
  const snapshot = useItemSnapshot();
  const watchlistItems = useSelectedItems();

  const destChoices = useMemo(
    () => [...TRAVEL_WORLDS]
      .filter((w) => w !== world)
      .sort((a, b) => {
        const da = dcOfTravel(a)!, db = dcOfTravel(b)!;
        return da === db ? a.localeCompare(b) : da.localeCompare(db);
      }),
    [world],
  );

  const [dest, setDest] = useState(() => destChoices[0] ?? '');
  const [budget, setBudget] = useState<number | null>(null);
  const [metric, setMetric] = useState<TravelMetric>('profit');
  const [hq, setHq] = useState<HqMode>('either');
  const [minVelocity, setMinVelocity] = useState(1);
  const [horizonDays, setHorizonDays] = useState(7);

  const candidateIds = useMemo(() => {
    if (!snapshot.data) return [];
    const ids = new Set<number>();
    for (const it of watchlistItems) ids.add(it.id);
    const catalog = [...snapshot.data.items]
      .filter((i) => i.sc > 0)
      .filter((i) => !(hideCrystals && i.sc === CRYSTALS_SEARCH_CATEGORY))
      .filter((i) => (hq === 'hq' ? i.canHq : true))
      .sort((a, b) => b.ilvl - a.ilvl);
    for (const it of catalog) {
      if (ids.size >= MAX_CANDIDATES) break;
      ids.add(it.id);
    }
    return [...ids];
  }, [snapshot.data, watchlistItems, hideCrystals, hq]);

  const run = useMutation<RunResult>({
    mutationFn: async () => {
      if (!snapshot.data) throw new Error('Item snapshot not ready');
      if (!dest) throw new Error('Pick a destination world');
      const [destRes, homeRes] = await Promise.all([
        fetchInBatches<MarketData[string]>(candidateIds, (chunk) => fetchMarketData(dest, chunk), { chunkSize: 100, concurrency: 4 }),
        fetchInBatches<MarketData[string]>(candidateIds, (chunk) => fetchMarketData(world, chunk), { chunkSize: 100, concurrency: 4 }),
      ]);
      return {
        destMarket: destRes.data,
        homeMarket: homeRes.data,
        skipped: destRes.errors.length + homeRes.errors.length,
        destWorld: dest,
      };
    },
  });

  const plan = useMemo<TravelPlan | null>(() => {
    if (!snapshot.data || !run.data) return null;
    return planTravel(snapshot.data.items, run.data.destMarket, run.data.homeMarket, {
      homeWorld: world, budget, metric, hq, minVelocity, horizonDays, applyMarketTax,
    });
  }, [snapshot.data, run.data, world, budget, metric, hq, minVelocity, horizonDays, applyMarketTax]);

  const ready = snapshot.data != null && dest !== '';
  useInitialScan(ready, () => { run.reset(); run.mutate(); });

  return (
    <div className="space-y-4">
      <FilterBar
        dest={dest} destChoices={destChoices} onDest={setDest}
        budget={budget} onBudget={setBudget}
        metric={metric} onMetric={setMetric}
        hq={hq} onHq={setHq}
        minVelocity={minVelocity} onMinVelocity={setMinVelocity}
        horizonDays={horizonDays} onHorizon={setHorizonDays}
        onRun={() => { run.reset(); run.mutate(); }}
        busy={run.isPending} notReady={!snapshot.data}
      />

      {run.isPending && <Spinner label={`Pricing ${candidateIds.length} items on ${dest} and ${world}…`} />}
      {run.isError && <StatusBanner kind="error">Scan failed: {(run.error as Error).message}</StatusBanner>}

      {!run.data && !run.isPending && (
        <EmptyState icon="✈" message={snapshot.data ? `Plan a buying trip to ${dest || 'another world'} and sell back on ${world}.` : 'Loading item catalog…'} />
      )}

      {plan && run.data && (
        <>
          <SummaryBand plan={plan} dest={run.data.destWorld} home={world} budget={budget} />
          <TravelResults rows={plan.rows} totalCandidates={candidateIds.length} skippedChunks={run.data.skipped} />
        </>
      )}
    </div>
  );
}

function SummaryBand({ plan, dest, home, budget }: {
  plan: TravelPlan; dest: string; home: string; budget: number | null;
}) {
  const spend = budget && budget > 0 ? `${fmtGil(plan.totalCost)} / ${fmtGil(budget)}` : fmtGil(plan.totalCost);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border border-border-base bg-bg-card font-mono">
      <Stat label={`Buy on ${dest}`} value={`${plan.rows.length} items · ${plan.totalUnits} units`} tone="text-aether" />
      <Stat label="Spend" value={spend} tone="text-gold" />
      <Stat label={`Profit on ${home}`} value={`+${fmtGil(plan.totalProfit)}`} tone="text-jade" />
      <Stat label="Blended ROI" value={`${Math.round(plan.blendedRoi * 100)}%`} tone="text-text-cream" />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div className="text-[9px] tracking-widest uppercase text-text-low">{label}</div>
      <div className={`mt-0.5 text-sm tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function FilterBar(props: {
  dest: string; destChoices: string[]; onDest: (w: string) => void;
  budget: number | null; onBudget: (n: number | null) => void;
  metric: TravelMetric; onMetric: (m: TravelMetric) => void;
  hq: HqMode; onHq: (m: HqMode) => void;
  minVelocity: number; onMinVelocity: (n: number) => void;
  horizonDays: number; onHorizon: (n: number) => void;
  onRun: () => void; busy: boolean; notReady: boolean;
}) {
  const metrics: { id: TravelMetric; label: string }[] = [
    { id: 'profit', label: 'Profit' },
    { id: 'roi', label: 'ROI %' },
    { id: 'spread', label: 'Spread' },
  ];
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card justify-between">
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Destination</span>
        <select
          value={props.dest}
          onChange={(e) => props.onDest(e.target.value)}
          className="mt-1 block w-44 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
        >
          {props.destChoices.map((w) => (
            <option key={w} value={w}>{w} ({dcOfTravel(w)})</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Budget (gil)</span>
        <input
          type="number" inputMode="decimal" min={0} step={10000}
          value={props.budget ?? ''}
          placeholder="∞"
          onChange={(e) => { const n = Number(e.target.value); props.onBudget(Number.isFinite(n) && n > 0 ? n : null); }}
          className="mt-1 block w-32 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Rank by</span>
        <div className="flex gap-2">
          {metrics.map((m) => (
            <button key={m.id} type="button" onClick={() => props.onMetric(m.id)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${props.metric === m.id ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">HQ mode</span>
        <div className="flex gap-2">
          {(['nq', 'hq', 'either'] as HqMode[]).map((mode) => (
            <button key={mode} type="button" onClick={() => props.onHq(mode)}
              className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${props.hq === mode ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'}`}>
              {mode === 'either' ? 'Either' : mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Min sales/day</span>
        <input type="number" inputMode="decimal" min={0} step={0.1} value={props.minVelocity}
          onChange={(e) => props.onMinVelocity(Math.max(0, Number(e.target.value) || 0))}
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <label className="block">
        <span className="font-mono text-[13px] tracking-widest text-text-low uppercase">Sell horizon (days)</span>
        <input type="number" inputMode="decimal" min={1} step={1} value={props.horizonDays}
          onChange={(e) => props.onHorizon(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
          className="mt-1 block w-28 bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors" />
      </label>
      <div className="flex flex-col items-stretch gap-1 w-full sm:w-auto sm:ml-auto order-last">
        <button type="button" onClick={props.onRun} disabled={props.busy || props.notReady}
          className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
          {props.busy ? <>Running…<SpinGlyph /></> : 'Run scan'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Vitest uses esbuild and does **not** type-check — always run `tsc` after adding new modules.)

- [ ] **Step 3: Commit**

```bash
git add src/features/travel/TravelPlannerView.tsx
git commit -m "feat(travel): planner view with destination, budget and rank filters"
```

---

## Task 6: Route + navigation wiring

**Files:**
- Create: `src/routes/Travel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: Create the route wrapper**

Create `src/routes/Travel.tsx`:

```tsx
import { TravelPlannerView } from '../features/travel/TravelPlannerView';

export default function Travel() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg text-gold tracking-wide">Travel Planner</h2>
        <p className="font-mono text-[13px] text-text-low max-w-prose">
          Pick a world you can travel to and get a budget-aware shopping list — items to buy
          there and resell on your home world.
        </p>
      </div>
      <TravelPlannerView />
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `src/App.tsx`**

Add the import next to the other route imports (after the `GlamourDemand` import at line 35):

```tsx
import Travel from './routes/Travel';
```

Add a page-title entry in the title map (next to the `'/glamour'` entry near line 69):

```tsx
  '/travel': 'Travel Planner',
```

Add the `<Route>` next to the others (after the `/glamour` route near line 143):

```tsx
                        <Route path="/travel" element={<Travel />} />
```

- [ ] **Step 3: Add the Sidebar nav entry**

In `src/components/layout/Sidebar.tsx`, inside the `Gil-Making` group's `items` array (after the `Glamour Demand` entry, ~line 35):

```tsx
      { label: 'Travel Planner', path: '/travel' },
```

- [ ] **Step 4: Add the Header nav entry**

In `src/components/layout/Header.tsx`, after the Glamour `NavLink` in the gil-making nav row (the same row that contains `/empty-shelf` near line 37 — place it alongside the other gil-making links):

```tsx
            <NavLink to="/travel" className={navClass}>Travel</NavLink>
```

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass, including the new `travelWorlds`, `planTravel`, and `TravelResults` tests.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build succeeds with no type or bundler errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/Travel.tsx src/App.tsx src/components/layout/Sidebar.tsx src/components/layout/Header.tsx
git commit -m "feat(travel): wire /travel route + Gil-Making nav entry"
```

---

## Task 7: Manual smoke test

- [ ] **Step 1: Run the dev server and verify**

Run: `npm run dev`

Check:
1. The **Travel Planner** entry appears in the Gil-Making nav (sidebar + header) and `/travel` loads.
2. On load the default scan auto-runs (spinner → summary band + table) without clicking Run.
3. Changing **Destination** then clicking **Run scan** refetches; changing **Rank by**, **Budget**, **HQ**, **Min sales/day**, or **Sell horizon** re-ranks instantly (no refetch needed — it's pure recompute).
4. Setting a small **Budget** shrinks the basket; the summary's Spend stays at/under budget.
5. CSV export and the density toggle work (inherited from `ResultTableScaffold`).

- [ ] **Step 2: Note any issues**

If anything is off, fix it, re-run `npx tsc --noEmit` + `npx vitest run`, and commit.

---

## Self-Review

**Spec coverage:**
- New standalone `/travel` page — Task 6. ✓
- Destination scope = Chaos + Light + Oceania — Task 1 (`TRAVEL_WORLDS`, `OCEANIA_WORLDS`). ✓
- Smart budget allocation (basket) — Task 3 (`planTravel` greedy fill + absorption cap). ✓
- User-selectable ranking (profit / ROI / spread) — Task 3 (`metricKey`) + Task 5 (Rank-by buttons). ✓
- House-style UI (ResultTableScaffold, ItemNameLinks, useInitialScan, FilterBar) — Tasks 4 & 5. ✓
- Tax via `applyMarketTax` — Task 3. ✓
- Edge cases (dest=home excluded, missing quantity→1, zero velocity filtered, no-budget=unlimited) — Tasks 3 & 5. ✓
- Both nav surfaces wired — Task 6 (Sidebar **and** Header). ✓
- Testing: `planTravel` heavy unit coverage, `travelWorlds`, results render — Tasks 1, 3, 4. ✓

**Type consistency:** `TravelOpts` / `TravelRow` / `TravelPlan` defined in Task 2 are used unchanged in Tasks 3–5. `planTravel(items, destMarket, homeMarket, opts)` signature matches its callers in the test (Task 3) and the view (Task 5). `pickHighestTrustedTier(m, hq, canHq)` and `applyTax(price)` match their real signatures.

**Placeholder scan:** No TBD/TODO; every code step is complete and copy-pasteable.
