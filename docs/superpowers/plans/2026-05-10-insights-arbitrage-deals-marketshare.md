# Insights — Arbitrage, Best Deals, Marketshare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/insights` route with three tabs that reuse existing Universalis data to surface (a) cross-world arbitrage opportunities within the DC, (b) items currently underpriced vs their average, and (c) a marketshare ranking sorted by gil/day with an optional toggle to include all starter packs (even disabled ones).

**Architecture:** Extend the Universalis parser to keep per-world listings + average prices. Three pure helpers (arbitrage, deals, marketshare) take the existing `MarketBundle` + settings and produce ranked views. Three small view components, one router page with tab state.

**Tech Stack:** Same as today. No new deps. No new API endpoints (Universalis already returns world per listing + averages).

**Approval:** Design approved in conversation.

---

## Conventions

- TDD for pure helpers.
- One commit per task.
- `npm test -- --run` + `npm run build` stay green.
- Run from `c:/Users/esthe/Documents/Dev/ffxiv-helper`.

---

## Task 1: Extend Universalis parser

**Files:**
- Modify: `src/lib/universalis.ts`
- Modify: `src/lib/universalis.test.ts`

Add `worldListings`, `averagePriceNQ`, `averagePriceHQ` to `MarketItem`. The Universalis response includes `worldName` per listing (when querying a DC) and top-level `averagePriceNQ`/`averagePriceHQ` per item.

- [ ] **Step 1: Update tests**

Edit `src/lib/universalis.test.ts`. Update the `parseMarketResponse` "extracts ..." test fixture to include `worldName` on listings and the average price fields:
```ts
const raw = {
  items: {
    '100': {
      listings: [
        { hq: false, pricePerUnit: 50, worldName: 'Phantom' },
        { hq: true,  pricePerUnit: 200, worldName: 'Phantom' },
        { hq: true,  pricePerUnit: 180, worldName: 'Lich' },
      ],
      recentHistory: [
        { hq: false, pricePerUnit: 60 },
        { hq: true,  pricePerUnit: 190 },
      ],
      regularSaleVelocity: 4.2,
      lastUploadTime: 1715000000000,
      averagePriceNQ: 70,
      averagePriceHQ: 210,
    },
  },
};
```
Update the assertion to include:
```ts
expect(out['100'].averagePriceNQ).toBe(70);
expect(out['100'].averagePriceHQ).toBe(210);
expect(out['100'].worldListings).toEqual([
  { world: 'Phantom', price: 50,  hq: false },
  { world: 'Phantom', price: 200, hq: true },
  { world: 'Lich',    price: 180, hq: true },
]);
```

Also update the "returns null prices when no matching listings" test to expect `worldListings: []`, `averagePriceNQ: null`, `averagePriceHQ: null` on the empty item.

- [ ] **Step 2: Update `src/lib/universalis.ts`**

Extend the `MarketItem` interface:
```ts
export interface WorldListing { world: string; price: number; hq: boolean }

export interface MarketItem {
  minNQ: number | null;
  minHQ: number | null;
  avgNQ: number | null;
  avgHQ: number | null;
  velocity: number;
  lastUploadTime: number;
  listingCount: number;
  worldListings: WorldListing[];
  averagePriceNQ: number | null;
  averagePriceHQ: number | null;
}
```

Extend `RawListing`:
```ts
interface RawListing { hq: boolean; pricePerUnit: number; worldName?: string }
```

Extend `RawItem`:
```ts
interface RawItem {
  listings?: RawListing[];
  recentHistory?: RawHistory[];
  regularSaleVelocity?: number;
  lastUploadTime?: number;
  averagePriceNQ?: number;
  averagePriceHQ?: number;
}
```

In `parseMarketResponse`, add to each output item:
```ts
worldListings: listings.map((l) => ({
  world: l.worldName ?? '',
  price: l.pricePerUnit,
  hq: l.hq,
})),
averagePriceNQ: item.averagePriceNQ ?? null,
averagePriceHQ: item.averagePriceHQ ?? null,
```

- [ ] **Step 3: Other tests may break**

`buildRows.test.ts` and `filterSort.test.ts` may construct `MarketItem` fixtures inline. They'll fail to compile if the new fields are missing. Update those fixtures to include `worldListings: []`, `averagePriceNQ: null`, `averagePriceHQ: null`.

Search for `listingCount:` across `src/` — any inline `MarketItem` construction needs the new fields too.

- [ ] **Step 4: Run + pass + commit**

```
git add -A
git commit -m "feat(universalis): parser keeps per-world listings + average prices"
```

---

## Task 2: Arbitrage helper (pure)

**Files:**
- Create: `src/features/insights/arbitrage.ts`
- Create: `src/features/insights/arbitrage.test.ts`

Given a `MarketBundle` (phantom + dc data), the user's home world, and a min-spread threshold, return ranked arbitrage opportunities.

- [ ] **Step 1: Failing test**

Write `src/features/insights/arbitrage.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { findArbitrage } from './arbitrage';
import type { MarketData } from '../../lib/universalis';
import type { TrackedItem } from '../items/types';

const items: TrackedItem[] = [
  { id: 1, name: 'A', crafter: 'LTW', lvl: 100, cat: 'Raid' },
  { id: 2, name: 'B', crafter: 'LTW', lvl: 100, cat: 'Raid' },
];

function dcWith(listings: Record<number, { world: string; price: number; hq: boolean }[]>): MarketData {
  const out: MarketData = {};
  for (const [id, ls] of Object.entries(listings)) {
    out[id] = {
      minNQ: ls.find((l) => !l.hq)?.price ?? null,
      minHQ: ls.find((l) => l.hq)?.price ?? null,
      avgNQ: null, avgHQ: null,
      velocity: 0, lastUploadTime: Date.now(), listingCount: ls.length,
      worldListings: ls.map((l) => ({ world: l.world, price: l.price, hq: l.hq })),
      averagePriceNQ: null, averagePriceHQ: null,
    };
  }
  return out;
}

describe('findArbitrage', () => {
  it('finds items where another world is cheaper than home by the threshold', () => {
    const dc = dcWith({
      1: [
        { world: 'Phantom', price: 100_000, hq: false },
        { world: 'Lich',    price: 50_000, hq: false },
      ],
      2: [
        { world: 'Phantom', price: 10_000, hq: false },
        { world: 'Lich',    price: 9_500, hq: false },
      ],
    });
    const out = findArbitrage(items, dc, { homeWorld: 'Phantom', minSpread: 10_000 });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
    expect(out[0].homePrice).toBe(100_000);
    expect(out[0].cheapestOther.world).toBe('Lich');
    expect(out[0].cheapestOther.price).toBe(50_000);
    expect(out[0].spread).toBe(50_000);
  });

  it('returns empty when no item meets the threshold', () => {
    const dc = dcWith({
      1: [{ world: 'Phantom', price: 100, hq: false }],
    });
    expect(findArbitrage(items, dc, { homeWorld: 'Phantom', minSpread: 1000 })).toEqual([]);
  });

  it('skips items with no home listing', () => {
    const dc = dcWith({
      1: [{ world: 'Lich', price: 100, hq: false }],
    });
    expect(findArbitrage(items, dc, { homeWorld: 'Phantom', minSpread: 0 })).toEqual([]);
  });

  it('uses NQ-only price by default', () => {
    const dc = dcWith({
      1: [
        { world: 'Phantom', price: 100, hq: false },
        { world: 'Lich',    price: 50,  hq: true },  // HQ on Lich shouldn't count vs Phantom NQ
      ],
    });
    expect(findArbitrage(items, dc, { homeWorld: 'Phantom', minSpread: 1 })).toEqual([]);
  });

  it('sorts results by spread descending', () => {
    const dc = dcWith({
      1: [{ world: 'Phantom', price: 1_000, hq: false }, { world: 'Lich', price: 500, hq: false }],
      2: [{ world: 'Phantom', price: 5_000, hq: false }, { world: 'Lich', price: 1_000, hq: false }],
    });
    const out = findArbitrage(items, dc, { homeWorld: 'Phantom', minSpread: 100 });
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: Implement**

Write `src/features/insights/arbitrage.ts`:
```ts
import type { TrackedItem } from '../items/types';
import type { MarketData } from '../../lib/universalis';

export interface ArbitrageRow {
  id: number;
  name: string;
  crafter: TrackedItem['crafter'];
  homePrice: number;
  cheapestOther: { world: string; price: number };
  spread: number;
  spreadPct: number;
}

export interface ArbitrageOpts {
  homeWorld: string;
  minSpread: number;
  hq?: boolean;  // default false (NQ)
}

export function findArbitrage(items: TrackedItem[], dc: MarketData, opts: ArbitrageOpts): ArbitrageRow[] {
  const hq = opts.hq ?? false;
  const out: ArbitrageRow[] = [];
  for (const item of items) {
    const m = dc[item.id];
    if (!m) continue;
    const candidates = m.worldListings.filter((l) => l.hq === hq);
    const home = candidates.find((l) => l.world === opts.homeWorld);
    if (!home) continue;
    const others = candidates.filter((l) => l.world !== opts.homeWorld);
    if (others.length === 0) continue;
    const cheapest = others.reduce((a, b) => (a.price <= b.price ? a : b));
    const spread = home.price - cheapest.price;
    if (spread < opts.minSpread) continue;
    out.push({
      id: item.id,
      name: item.name,
      crafter: item.crafter,
      homePrice: home.price,
      cheapestOther: { world: cheapest.world, price: cheapest.price },
      spread,
      spreadPct: Math.round((spread / home.price) * 100),
    });
  }
  return out.sort((a, b) => b.spread - a.spread);
}
```

- [ ] **Step 3: Pass + commit**

```
git add -A
git commit -m "feat(insights): pure arbitrage finder using per-world listings"
```

---

## Task 3: Best Deals helper (pure)

**Files:**
- Create: `src/features/insights/bestDeals.ts`
- Create: `src/features/insights/bestDeals.test.ts`

Given items + DC market data + threshold, return items where `current_min < averagePrice` by the threshold percentage.

- [ ] **Step 1: Failing test**

Write `src/features/insights/bestDeals.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { findBestDeals } from './bestDeals';
import type { MarketData } from '../../lib/universalis';
import type { TrackedItem } from '../items/types';

const items: TrackedItem[] = [
  { id: 1, name: 'A', crafter: 'LTW', lvl: 100, cat: 'Raid' },
  { id: 2, name: 'B', crafter: 'LTW', lvl: 100, cat: 'Raid' },
];

function dcWith(per: Record<number, { minNQ: number | null; avgNQ: number | null }>): MarketData {
  const out: MarketData = {};
  for (const [id, p] of Object.entries(per)) {
    out[id] = {
      minNQ: p.minNQ, minHQ: null, avgNQ: null, avgHQ: null,
      velocity: 0, lastUploadTime: Date.now(), listingCount: 0,
      worldListings: [], averagePriceNQ: p.avgNQ, averagePriceHQ: null,
    };
  }
  return out;
}

describe('findBestDeals', () => {
  it('returns items where current min < avg by minDealPct', () => {
    const dc = dcWith({
      1: { minNQ: 60, avgNQ: 100 },   // 40% off
      2: { minNQ: 95, avgNQ: 100 },   //  5% off
    });
    const out = findBestDeals(items, dc, { minDealPct: 20 });
    expect(out.map((r) => r.id)).toEqual([1]);
    expect(out[0].dealPct).toBe(40);
  });

  it('skips items without average price', () => {
    const dc = dcWith({ 1: { minNQ: 60, avgNQ: null } });
    expect(findBestDeals(items, dc, { minDealPct: 0 })).toEqual([]);
  });

  it('skips items without current min price', () => {
    const dc = dcWith({ 1: { minNQ: null, avgNQ: 100 } });
    expect(findBestDeals(items, dc, { minDealPct: 0 })).toEqual([]);
  });

  it('sorts by dealPct descending', () => {
    const dc = dcWith({
      1: { minNQ: 70, avgNQ: 100 },   // 30% off
      2: { minNQ: 50, avgNQ: 100 },   // 50% off
    });
    const out = findBestDeals(items, dc, { minDealPct: 20 });
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: Implement**

Write `src/features/insights/bestDeals.ts`:
```ts
import type { TrackedItem } from '../items/types';
import type { MarketData } from '../../lib/universalis';

export interface BestDealRow {
  id: number;
  name: string;
  crafter: TrackedItem['crafter'];
  currentMin: number;
  averagePrice: number;
  dealPct: number;
}

export interface BestDealsOpts {
  minDealPct: number;
}

export function findBestDeals(items: TrackedItem[], dc: MarketData, opts: BestDealsOpts): BestDealRow[] {
  const out: BestDealRow[] = [];
  for (const item of items) {
    const m = dc[item.id];
    if (!m || m.minNQ == null || m.averagePriceNQ == null || m.averagePriceNQ <= 0) continue;
    const dealPct = Math.round(((m.averagePriceNQ - m.minNQ) / m.averagePriceNQ) * 100);
    if (dealPct < opts.minDealPct) continue;
    out.push({
      id: item.id,
      name: item.name,
      crafter: item.crafter,
      currentMin: m.minNQ,
      averagePrice: m.averagePriceNQ,
      dealPct,
    });
  }
  return out.sort((a, b) => b.dealPct - a.dealPct);
}
```

- [ ] **Step 3: Pass + commit**

```
git add -A
git commit -m "feat(insights): pure best-deals finder via avg-vs-current"
```

---

## Task 4: Marketshare ranker (pure)

**Files:**
- Create: `src/features/insights/marketshare.ts`
- Create: `src/features/insights/marketshare.test.ts`

Take `WatchlistRow[]` (already enriched with profit + gilPerDay) and rank by:
- `gilPerDay` if craftable AND `gilPerDay > 0`
- `dc_min × velocity` if sale-only (no recipe profit, but still gil flow)

Drop items with no velocity (nothing sells).

- [ ] **Step 1: Failing test**

Write `src/features/insights/marketshare.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { rankMarketshare } from './marketshare';
import type { WatchlistRow } from '../watchlist/buildRows';

const base: WatchlistRow = {
  id: 0, name: '', crafter: 'LTW', lvl: 100, cat: 'Raid',
  pMinNQ: null, pMinHQ: null, pAvgNQ: null, pAvgHQ: null, pSpd: 0, pListings: 0,
  dcMinNQ: null, dcMinHQ: null, dcSpd: 0,
  refPrice: 0, rawScore: 0, score: 0, staleDays: null, craftStatus: 'ok',
  craftable: null, materialCost: null, salePrice: null, profit: null, gilPerDay: null,
};

describe('rankMarketshare', () => {
  it('ranks craftable items by gilPerDay desc', () => {
    const rows: WatchlistRow[] = [
      { ...base, id: 1, craftable: true,  gilPerDay: 100 },
      { ...base, id: 2, craftable: true,  gilPerDay: 500 },
      { ...base, id: 3, craftable: true,  gilPerDay: 250 },
    ];
    const out = rankMarketshare(rows);
    expect(out.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('uses dcMin × velocity for sale-only items', () => {
    const rows: WatchlistRow[] = [
      { ...base, id: 1, craftable: false, dcMinNQ: 50_000, dcSpd: 2 },  // 100k flow
      { ...base, id: 2, craftable: true,  gilPerDay: 80_000 },
    ];
    const out = rankMarketshare(rows);
    expect(out.map((r) => r.id)).toEqual([1, 2]);
    expect(out[0].gilFlow).toBe(100_000);
  });

  it('drops items with zero velocity', () => {
    const rows: WatchlistRow[] = [
      { ...base, id: 1, craftable: false, dcMinNQ: 50_000, dcSpd: 0 },
      { ...base, id: 2, craftable: true,  gilPerDay: 0 },
      { ...base, id: 3, craftable: true,  gilPerDay: 50 },
    ];
    const out = rankMarketshare(rows);
    expect(out.map((r) => r.id)).toEqual([3]);
  });

  it('skips unresolved items', () => {
    const rows: WatchlistRow[] = [
      { ...base, id: 1, craftable: null, dcMinNQ: 50_000, dcSpd: 2 },
    ];
    expect(rankMarketshare(rows)).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement**

Write `src/features/insights/marketshare.ts`:
```ts
import type { WatchlistRow } from '../watchlist/buildRows';

export interface MarketshareRow {
  id: number;
  name: string;
  crafter: WatchlistRow['crafter'];
  cat: WatchlistRow['cat'];
  craftable: boolean;
  gilFlow: number;       // gil/day (profit*vel for craftable, price*vel for sale-only)
  velocity: number;
  unitValue: number;     // profit per craft OR sale price
}

export function rankMarketshare(rows: WatchlistRow[]): MarketshareRow[] {
  const out: MarketshareRow[] = [];
  for (const r of rows) {
    if (r.craftable === null) continue;
    if (r.dcSpd <= 0) continue;
    if (r.craftable && (r.gilPerDay == null || r.gilPerDay <= 0)) continue;

    if (r.craftable && r.gilPerDay && r.profit) {
      out.push({
        id: r.id, name: r.name, crafter: r.crafter, cat: r.cat,
        craftable: true, gilFlow: r.gilPerDay, velocity: r.dcSpd, unitValue: r.profit,
      });
    } else if (!r.craftable) {
      const unit = r.dcMinHQ ?? r.dcMinNQ ?? 0;
      if (unit <= 0) continue;
      out.push({
        id: r.id, name: r.name, crafter: r.crafter, cat: r.cat,
        craftable: false, gilFlow: unit * r.dcSpd, velocity: r.dcSpd, unitValue: unit,
      });
    }
  }
  return out.sort((a, b) => b.gilFlow - a.gilFlow);
}
```

- [ ] **Step 3: Pass + commit**

```
git add -A
git commit -m "feat(insights): pure marketshare ranker (gil flow)"
```

---

## Task 5: Insights route + tab shell

**Files:**
- Create: `src/routes/Insights.tsx`
- Modify: `src/App.tsx` (add the route)
- Modify: `src/components/layout/Header.tsx` (add nav link)

- [ ] **Step 1: Create the route shell**

Write `src/routes/Insights.tsx`:
```tsx
import { useState } from 'react';
import { ArbitrageView } from '../features/insights/ArbitrageView';
import { BestDealsView } from '../features/insights/BestDealsView';
import { MarketshareView } from '../features/insights/MarketshareView';

type Tab = 'arbitrage' | 'deals' | 'marketshare';

const TABS: { id: Tab; label: string }[] = [
  { id: 'arbitrage',   label: 'Arbitrage' },
  { id: 'deals',       label: 'Best deals' },
  { id: 'marketshare', label: 'Marketshare' },
];

export default function Insights() {
  const [tab, setTab] = useState<Tab>('arbitrage');
  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <nav className="flex border-b border-border-base">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`font-mono text-[11px] tracking-widest uppercase px-4 py-3 border-b-2 transition-colors -mb-[1px] ${
              tab === t.id ? 'border-gold text-gold' : 'border-transparent text-text-dim hover:text-aether'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'arbitrage' && <ArbitrageView />}
      {tab === 'deals' && <BestDealsView />}
      {tab === 'marketshare' && <MarketshareView />}
    </div>
  );
}
```

- [ ] **Step 2: Add route in `src/App.tsx`**

Read first. Add:
```tsx
import Insights from './routes/Insights';

// ... inside Routes:
<Route path="/insights" element={<Insights />} />
```

- [ ] **Step 3: Add nav link in `src/components/layout/Header.tsx`**

Add `<NavLink to="/insights" className={navClass}>Insights</NavLink>` between Watchlist and Settings.

- [ ] **Step 4: Stub view components**

To avoid build errors before Tasks 6-8, create empty stub files:

`src/features/insights/ArbitrageView.tsx`:
```tsx
export function ArbitrageView() { return <div className="text-text-low">Arbitrage view (next task)</div>; }
```

Same for `BestDealsView.tsx` and `MarketshareView.tsx`.

- [ ] **Step 5: Build clean. Commit:**

```
git add -A
git commit -m "feat(insights): /insights route + tab shell + nav link"
```

---

## Task 6: ArbitrageView component

**Files:**
- Modify: `src/features/insights/ArbitrageView.tsx`

A table of arbitrage opportunities. Reuses the same item-set and `useMarketData` hook as Home/Watchlist. Has a threshold input that defaults to 10k.

- [ ] **Step 1: Implement**

```tsx
import { useMemo, useState } from 'react';
import { useSettingsStore } from '../settings/store';
import { useWatchlistStore } from '../items/watchlistStore';
import { useMarketData } from '../watchlist/useMarketData';
import { allItemsFromEnabledPacks } from '../items/starterPacks';
import { findArbitrage } from './arbitrage';
import { fmtGil } from '../../lib/format';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

export function ArbitrageView() {
  const { world, dc } = useSettingsStore();
  const { starterPacks, customItems, excludedItems } = useWatchlistStore();
  const [minSpread, setMinSpread] = useState(10_000);

  const items = useMemo(() => {
    const fromPacks = allItemsFromEnabledPacks(starterPacks, new Set(excludedItems));
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id) && !excludedItems.includes(i.id))];
  }, [starterPacks, customItems, excludedItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, world, dc);

  const rows = useMemo(() => {
    if (!market.data) return [];
    return findArbitrage(items, market.data.dc, { homeWorld: world, minSpread });
  }, [items, market.data, world, minSpread]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min spread (gil)</span>
          <input
            type="number" min={0} step={1000}
            value={minSpread}
            onChange={(e) => setMinSpread(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 block w-40 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>
        <span className="font-mono text-[10px] text-text-low">
          Home world: <span className="text-gold">{world}</span>
        </span>
      </div>

      {market.isError && <StatusBanner kind="error">Universalis fetch failed: {(market.error as Error).message}</StatusBanner>}
      {market.isLoading && <Spinner label="Fetching DC market data…" />}

      {!market.isLoading && rows.length === 0 && (
        <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
          No arbitrage opportunities at this threshold.
        </div>
      )}

      {!market.isLoading && rows.length > 0 && (
        <div className="border border-border-base bg-bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">{world} price</th>
                <th className="text-left px-3 py-2">Cheapest other</th>
                <th className="text-right px-3 py-2">Their price</th>
                <th className="text-right px-3 py-2">Spread</th>
                <th className="text-right px-3 py-2 hidden md:table-cell">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                  <td className="px-3 py-2.5">
                    <div className="text-text-cream">{r.name}</div>
                    <div className="font-mono text-[10px] text-text-low">{r.crafter}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.homePrice)}</td>
                  <td className="px-3 py-2.5 text-aether">{r.cheapestOther.world}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.cheapestOther.price)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-jade">+{fmtGil(r.spread)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">{r.spreadPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build + commit:**

```
git add -A
git commit -m "feat(insights): arbitrage view with home-world spread threshold"
```

---

## Task 7: BestDealsView component

**Files:**
- Modify: `src/features/insights/BestDealsView.tsx`

Same pattern as Arbitrage. Threshold input is a percentage.

- [ ] **Step 1: Implement**

```tsx
import { useMemo, useState } from 'react';
import { useSettingsStore } from '../settings/store';
import { useWatchlistStore } from '../items/watchlistStore';
import { useMarketData } from '../watchlist/useMarketData';
import { allItemsFromEnabledPacks } from '../items/starterPacks';
import { findBestDeals } from './bestDeals';
import { fmtGil } from '../../lib/format';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

export function BestDealsView() {
  const { world, dc } = useSettingsStore();
  const { starterPacks, customItems, excludedItems } = useWatchlistStore();
  const [minDealPct, setMinDealPct] = useState(20);

  const items = useMemo(() => {
    const fromPacks = allItemsFromEnabledPacks(starterPacks, new Set(excludedItems));
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id) && !excludedItems.includes(i.id))];
  }, [starterPacks, customItems, excludedItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, world, dc);

  const rows = useMemo(() => {
    if (!market.data) return [];
    return findBestDeals(items, market.data.dc, { minDealPct });
  }, [items, market.data, minDealPct]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min discount (%)</span>
          <input
            type="number" min={0} max={99}
            value={minDealPct}
            onChange={(e) => setMinDealPct(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
            className="mt-1 block w-32 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          />
        </label>
        <span className="font-mono text-[10px] text-text-low">
          Compares current DC min vs Universalis average price.
        </span>
      </div>

      {market.isError && <StatusBanner kind="error">Universalis fetch failed: {(market.error as Error).message}</StatusBanner>}
      {market.isLoading && <Spinner label="Fetching DC market data…" />}

      {!market.isLoading && rows.length === 0 && (
        <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
          No items below the discount threshold right now.
        </div>
      )}

      {!market.isLoading && rows.length > 0 && (
        <div className="border border-border-base bg-bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Current</th>
                <th className="text-right px-3 py-2 hidden md:table-cell">Average</th>
                <th className="text-right px-3 py-2">Discount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                  <td className="px-3 py-2.5">
                    <div className="text-text-cream">{r.name}</div>
                    <div className="font-mono text-[10px] text-text-low">{r.crafter}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.currentMin)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">{fmtGil(r.averagePrice)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-jade">-{r.dealPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build + commit:**

```
git add -A
git commit -m "feat(insights): best deals view with min-discount threshold"
```

---

## Task 8: MarketshareView component

**Files:**
- Modify: `src/features/insights/MarketshareView.tsx`

Marketshare needs `WatchlistRow` data (gilPerDay etc.) → must call `buildRows` AND `useRecipes`. Has a toggle "include all starter packs" that expands the item set beyond the user's current toggles.

- [ ] **Step 1: Implement**

```tsx
import { useMemo, useState } from 'react';
import { useSettingsStore } from '../settings/store';
import { useWatchlistStore } from '../items/watchlistStore';
import { useMarketData } from '../watchlist/useMarketData';
import { useRecipes } from '../profit/useRecipes';
import { STARTER_PACKS, allItemsFromEnabledPacks } from '../items/starterPacks';
import { buildRows } from '../watchlist/buildRows';
import { rankMarketshare } from './marketshare';
import { fmtGil } from '../../lib/format';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';

export function MarketshareView() {
  const settings = useSettingsStore();
  const { starterPacks, customItems, excludedItems, perItemFlags } = useWatchlistStore();
  const [expandAll, setExpandAll] = useState(false);

  const items = useMemo(() => {
    if (expandAll) {
      // Union of every pack's items + custom items, no exclusions applied.
      // This is intentionally broader than the watchlist view.
      const seen = new Set<number>();
      const out: typeof customItems = [];
      for (const pack of STARTER_PACKS) {
        for (const i of pack.items) {
          if (seen.has(i.id)) continue;
          seen.add(i.id);
          out.push(i);
        }
      }
      for (const i of customItems) {
        if (seen.has(i.id)) continue;
        seen.add(i.id);
        out.push(i);
      }
      return out;
    }
    const fromPacks = allItemsFromEnabledPacks(starterPacks, new Set(excludedItems));
    const seen = new Set(fromPacks.map((i) => i.id));
    return [...fromPacks, ...customItems.filter((i) => !seen.has(i.id) && !excludedItems.includes(i.id))];
  }, [expandAll, starterPacks, customItems, excludedItems]);

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const market = useMarketData(ids, settings.world, settings.dc);
  const recipes = useRecipes(ids);

  const rows = useMemo(() => {
    if (!market.data || !recipes.data) return [];
    const watchlistRows = buildRows(
      items, market.data.phantom, market.data.dc,
      settings.retainerLevels, recipes.data, perItemFlags, Date.now(),
    );
    return rankMarketshare(watchlistRows);
  }, [items, market.data, recipes.data, settings.retainerLevels, perItemFlags]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={expandAll}
            onChange={(e) => setExpandAll(e.target.checked)}
          />
          <span>Include all starter packs (even disabled)</span>
        </label>
        <span className="font-mono text-[10px] text-text-low">
          {items.length} items in pool
        </span>
      </div>

      {(market.isLoading || recipes.isLoading) && <Spinner label="Loading market + recipe data…" />}
      {market.isError && <StatusBanner kind="error">Universalis fetch failed.</StatusBanner>}
      {recipes.isError && <StatusBanner kind="error">XIVAPI fetch failed.</StatusBanner>}

      {!market.isLoading && !recipes.isLoading && rows.length === 0 && (
        <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
          Nothing has any velocity in the current pool.
        </div>
      )}

      {!market.isLoading && !recipes.isLoading && rows.length > 0 && (
        <div className="border border-border-base bg-bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2 hidden md:table-cell">Unit value</th>
                <th className="text-right px-3 py-2 hidden md:table-cell">Velocity</th>
                <th className="text-right px-3 py-2">Gil/day</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">Mode</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                  <td className="px-3 py-2.5 font-mono text-text-low">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="text-text-cream">{r.name}</div>
                    <div className="font-mono text-[10px] text-text-low">{r.crafter} · {r.cat}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">{fmtGil(r.unitValue)}</td>
                  <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">{r.velocity.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gold-hi">{fmtGil(Math.round(r.gilFlow))}</td>
                  <td className="px-3 py-2.5 text-[10px] font-mono uppercase tracking-widest text-text-low hidden md:table-cell">
                    {r.craftable ? 'profit' : 'sale-only'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build + commit:**

```
git add -A
git commit -m "feat(insights): marketshare view with expand-all-packs toggle"
```

---

## Task 9: Smoke tests + README

**Files:**
- Create: `src/routes/Insights.test.tsx`
- Modify: `README.md`

A minimal render test for the route + nav. Then README append.

- [ ] **Step 1: Test `src/routes/Insights.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Insights from './Insights';
import { useSettingsStore, defaultSettings } from '../features/settings/store';
import { useWatchlistStore, defaultWatchlist } from '../features/items/watchlistStore';
import { clearRecipeCache } from '../lib/recipeCache';

beforeEach(async () => {
  localStorage.clear();
  useSettingsStore.setState(defaultSettings());
  useWatchlistStore.setState(defaultWatchlist());
  await clearRecipeCache();
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: {}, results: [] }),
  }));
});

function withProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Insights route', () => {
  it('renders three tabs with Arbitrage active by default', () => {
    render(withProviders(<Insights />));
    expect(screen.getByRole('button', { name: /arbitrage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /best deals/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marketshare/i })).toBeInTheDocument();
  });

  it('switches to Best deals when its tab is clicked', () => {
    render(withProviders(<Insights />));
    fireEvent.click(screen.getByRole('button', { name: /best deals/i }));
    expect(screen.getByText(/Min discount/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: README append**

```markdown

## Insights

A new top-level tab with three views — all reuse existing Universalis data, no new API calls:

- **Arbitrage:** items where another Chaos world is cheaper than your home world by ≥ a threshold (default 10k). Computed from per-world listings already in the DC response.
- **Best deals:** items where the current DC min is below the Universalis average price by ≥ a percentage (default 20%). Surfaces undervalued items in your tracked pool.
- **Marketshare:** your items ranked by gil/day (`profit × velocity` for craftable, `price × velocity` for sale-only). Optional toggle to include every starter pack (even disabled ones) for a wider view.
```

- [ ] **Step 3: Run + pass + commit:**

```
git add -A
git commit -m "test+docs: Insights smoke test + README section"
```

---

## Done when

- `npm test -- --run` green (~140 tests).
- `npm run build` clean.
- `/insights` shows three tabs, switching works, each shows data from the existing watchlist pool.
- Arbitrage threshold defaults to 10k, surfaces items where another Chaos world undercuts Phantom.
- Best deals threshold defaults to 20%, surfaces items below avg by that much.
- Marketshare default view = watchlist sorted by gil/day desc; toggling "include all packs" expands to every pack item.
