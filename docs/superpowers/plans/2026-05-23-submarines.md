# Submarines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-tab Submarines page (Route Valuator + Loot Pricer) that lets players evaluate submarine voyage profitability using static sector data + live Universalis prices.

**Architecture:** Static sector/loot data is loaded from `src/data/submarineSectors.json`. Each tab fetches live prices via `fetchMarketData` with the standard batch/progress pattern. Route Valuator lets users pick sectors or auto-suggest optimal routes; Loot Pricer lists all loot with SELL/HOLD/SKIP indicators. Two new settings (`submarineRank`, `submarineSlots`) are stored in the existing Zustand settings store.

**Tech Stack:** React 18, Zustand (persist), TanStack React Query (useMutation), Universalis API, Tailwind CSS (existing custom theme tokens)

---

### Task 1: Types & Drop Rate Constants

**Files:**
- Create: `src/features/submarines/submarineTypes.ts`
- Create: `src/features/submarines/dropRates.ts`

- [ ] **Step 1: Write the failing test for drop rates**

Create `src/features/submarines/dropRates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DROP_RATES, expectedGil } from './dropRates';

describe('DROP_RATES', () => {
  it('maps all three tiers', () => {
    expect(DROP_RATES.common).toBe(0.30);
    expect(DROP_RATES.uncommon).toBe(0.15);
    expect(DROP_RATES.rare).toBe(0.05);
  });
});

describe('expectedGil', () => {
  it('computes expected value for a loot item', () => {
    // common item worth 500 gil → 0.30 × 500 = 150
    expect(expectedGil('common', 500)).toBe(150);
  });

  it('returns 0 when price is null', () => {
    expect(expectedGil('rare', null)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/submarines/dropRates.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the types file**

Create `src/features/submarines/submarineTypes.ts`:

```ts
export type Tier = 'common' | 'uncommon' | 'rare';

export interface LootItem {
  itemId: number;
  name: string;
  tier: Tier;
}

export interface Sector {
  id: number;
  name: string;
  letter: string;
  zone: string;
  rankReq: number;
  durationMin: number;
  loot: LootItem[];
}

export interface SectorData {
  sectors: Sector[];
}

/** Result row for the Route Valuator per-sector breakdown. */
export interface SectorValueRow {
  sectorId: number;
  sectorName: string;
  sectorLetter: string;
  itemId: number;
  itemName: string;
  tier: Tier;
  dropRate: number;
  price: number | null;
  expected: number;
}

/** Aggregated route summary. */
export interface RouteSummary {
  sectors: { id: number; letter: string; name: string; subtotal: number }[];
  totalGilPerVoyage: number;
  totalDurationMin: number;
  gilPerHour: number;
}

/** Result row for the Loot Pricer table. */
export type Indicator = 'SELL' | 'HOLD' | 'SKIP';

export interface LootPricerRow {
  itemId: number;
  name: string;
  zones: string[];
  tier: Tier;
  minPrice: number | null;
  avgPrice: number | null;
  velocity: number;
  indicator: Indicator;
}
```

- [ ] **Step 4: Write the drop rates module**

Create `src/features/submarines/dropRates.ts`:

```ts
import type { Tier } from './submarineTypes';

export const DROP_RATES: Record<Tier, number> = {
  common: 0.30,
  uncommon: 0.15,
  rare: 0.05,
};

export const DROP_RATE_DISCLAIMER =
  'Drop rates are rough estimates based on community data tiers. Actual rates vary by submarine stats and RNG.';

/** Expected gil for a single loot item given its tier and market price. */
export function expectedGil(tier: Tier, price: number | null): number {
  if (price == null) return 0;
  return DROP_RATES[tier] * price;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/submarines/dropRates.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/submarines/submarineTypes.ts src/features/submarines/dropRates.ts src/features/submarines/dropRates.test.ts
git commit -m "feat(submarines): add types and drop rate constants"
```

---

### Task 2: Suggest Route Optimizer

**Files:**
- Create: `src/features/submarines/suggestRoute.ts`
- Create: `src/features/submarines/suggestRoute.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/submarines/suggestRoute.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { suggestRoute } from './suggestRoute';
import type { Sector } from './submarineTypes';
import type { MarketData } from '../../lib/universalis';

const makeSector = (id: number, letter: string, zone: string, rankReq: number, loot: { itemId: number; name: string; tier: 'common' | 'uncommon' | 'rare' }[]): Sector => ({
  id,
  name: `Sector ${letter}`,
  letter,
  zone,
  rankReq,
  durationMin: 180,
  loot,
});

describe('suggestRoute', () => {
  const sectors: Sector[] = [
    makeSector(1, 'A', 'Deep-sea Site', 1, [{ itemId: 100, name: 'Item A', tier: 'common' }]),
    makeSector(2, 'B', 'Deep-sea Site', 1, [{ itemId: 200, name: 'Item B', tier: 'common' }]),
    makeSector(3, 'C', 'Deep-sea Site', 1, [{ itemId: 300, name: 'Item C', tier: 'rare' }]),
    makeSector(4, 'D', 'Sea of Ash', 1, [{ itemId: 400, name: 'Item D', tier: 'common' }]),
  ];

  const market: MarketData = {
    '100': { minNQ: 500, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
    '200': { minNQ: 1000, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
    '300': { minNQ: 50000, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
    '400': { minNQ: 200, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
  };

  it('picks top N sectors from specified zone by expected value', () => {
    const result = suggestRoute(sectors, market, { rank: 1, slots: 2, zone: 'Deep-sea Site' });
    expect(result.map((s) => s.letter)).toEqual(['C', 'B']);
  });

  it('respects rank filter', () => {
    const highRankSectors = [
      ...sectors,
      makeSector(5, 'E', 'Deep-sea Site', 50, [{ itemId: 500, name: 'Item E', tier: 'common' }]),
    ];
    const result = suggestRoute(highRankSectors, market, { rank: 1, slots: 5, zone: 'Deep-sea Site' });
    expect(result.find((s) => s.letter === 'E')).toBeUndefined();
  });

  it('picks best zone when zone is null', () => {
    const result = suggestRoute(sectors, market, { rank: 1, slots: 1, zone: null });
    // C has highest expected value (rare × 50000 = 2500), so Deep-sea Site wins
    expect(result[0].letter).toBe('C');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/submarines/suggestRoute.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the optimizer**

Create `src/features/submarines/suggestRoute.ts`:

```ts
import type { Sector } from './submarineTypes';
import type { MarketData } from '../../lib/universalis';
import { expectedGil } from './dropRates';

interface SuggestOpts {
  rank: number;
  slots: number;
  /** If null, auto-pick the best zone. */
  zone: string | null;
}

/** Score a sector by summing expected gil across its loot using cached market prices. */
function scoreSector(sector: Sector, market: MarketData): number {
  return sector.loot.reduce((sum, item) => {
    const m = market[String(item.itemId)];
    return sum + expectedGil(item.tier, m?.minNQ ?? null);
  }, 0);
}

/**
 * Zone-constrained greedy optimizer. Filters sectors by rank within a zone
 * (or finds the best zone if none specified), scores each sector individually,
 * and picks the top N by score descending.
 */
export function suggestRoute(
  sectors: Sector[],
  market: MarketData,
  opts: SuggestOpts,
): Sector[] {
  const eligible = sectors.filter((s) => s.rankReq <= opts.rank);

  if (opts.zone) {
    const zoneSectors = eligible.filter((s) => s.zone === opts.zone);
    return topN(zoneSectors, market, opts.slots);
  }

  // No zone specified — find the best zone by total top-N score
  const zones = [...new Set(eligible.map((s) => s.zone))];
  let bestZone = '';
  let bestScore = -1;

  for (const zone of zones) {
    const zoneSectors = eligible.filter((s) => s.zone === zone);
    const top = topN(zoneSectors, market, opts.slots);
    const score = top.reduce((sum, s) => sum + scoreSector(s, market), 0);
    if (score > bestScore) {
      bestScore = score;
      bestZone = zone;
    }
  }

  return topN(eligible.filter((s) => s.zone === bestZone), market, opts.slots);
}

function topN(sectors: Sector[], market: MarketData, n: number): Sector[] {
  return [...sectors]
    .map((s) => ({ sector: s, score: scoreSector(s, market) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.sector);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/submarines/suggestRoute.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/submarines/suggestRoute.ts src/features/submarines/suggestRoute.test.ts
git commit -m "feat(submarines): add zone-constrained route optimizer"
```

---

### Task 3: Settings — Submarine Rank & Slots

**Files:**
- Modify: `src/features/settings/store.ts`

- [ ] **Step 1: Add submarine fields to SettingsState interface**

In `src/features/settings/store.ts`, add to the `SettingsState` interface (after `showSparklines: boolean;`):

```ts
  submarineRank: number;
  submarineSlots: number;
  setSubmarineRank: (n: number) => void;
  setSubmarineSlots: (n: number) => void;
```

- [ ] **Step 2: Add defaults to defaultSettings()**

In the `defaultSettings()` function return object, add after `showSparklines: true,`:

```ts
    submarineRank: 1,
    submarineSlots: 1,
```

Also update the `Pick` type on `defaultSettings` — add `'submarineRank' | 'submarineSlots'` to the union.

- [ ] **Step 3: Add setters to the store**

In the `create<SettingsState>()` persist callback, after `setShowSparklines`:

```ts
      setSubmarineRank: (submarineRank) => set({ submarineRank }),
      setSubmarineSlots: (submarineSlots) => set({ submarineSlots }),
```

- [ ] **Step 4: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/store.ts
git commit -m "feat(submarines): add submarineRank and submarineSlots to settings store"
```

---

### Task 4: Sector Grid Component

**Files:**
- Create: `src/features/submarines/SectorGrid.tsx`

- [ ] **Step 1: Create the sector grid component**

Create `src/features/submarines/SectorGrid.tsx`:

```tsx
import { useMemo } from 'react';
import type { Sector } from './submarineTypes';

interface Props {
  sectors: Sector[];
  rank: number;
  zone: string | null;
  selected: Set<number>;
  maxSlots: number;
  onToggle: (sectorId: number) => void;
}

type SortKey = 'letter' | 'name' | 'zone' | 'rankReq' | 'durationMin';

export function SectorGrid({ sectors, rank, zone, selected, maxSlots, onToggle }: Props) {
  const filtered = useMemo(() => {
    let s = sectors.filter((s) => s.rankReq <= rank);
    if (zone) s = s.filter((s) => s.zone === zone);
    return s;
  }, [sectors, rank, zone]);

  const isFull = selected.size >= maxSlots;

  return (
    <div className="border border-border-base bg-bg-card overflow-x-auto max-h-[420px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-bg-card z-10">
          <tr className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
            <th className="px-3 py-2 text-left">Letter</th>
            <th className="px-3 py-2 text-left">Name</th>
            <th className="px-3 py-2 text-left hidden sm:table-cell">Zone</th>
            <th className="px-3 py-2 text-right">Rank</th>
            <th className="px-3 py-2 text-right">Duration</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => {
            const isSelected = selected.has(s.id);
            const disabled = !isSelected && isFull;
            return (
              <tr
                key={s.id}
                onClick={() => !disabled && onToggle(s.id)}
                className={`border-t border-border-base transition-colors ${
                  isSelected
                    ? 'bg-gold/10 border-l-2 border-l-gold'
                    : disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-bg-card-hi cursor-pointer'
                }`}
              >
                <td className="px-3 py-1.5 font-mono text-gold">{s.letter}</td>
                <td className="px-3 py-1.5">{s.name}</td>
                <td className="px-3 py-1.5 text-text-low hidden sm:table-cell">{s.zone}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{s.rankReq}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {Math.floor(s.durationMin / 60)}h {s.durationMin % 60}m
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-text-low text-sm">
                No sectors available at rank {rank}{zone ? ` in ${zone}` : ''}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/features/submarines/SectorGrid.tsx
git commit -m "feat(submarines): add SectorGrid component"
```

---

### Task 5: Route Summary Component

**Files:**
- Create: `src/features/submarines/RouteSummary.tsx`

- [ ] **Step 1: Write the failing test for route summary computation**

Create `src/features/submarines/RouteSummary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeRouteSummary } from './RouteSummary';
import type { Sector } from './submarineTypes';
import type { MarketData } from '../../lib/universalis';

const makeSector = (id: number, letter: string, loot: { itemId: number; name: string; tier: 'common' | 'uncommon' | 'rare' }[]): Sector => ({
  id,
  name: `Sector ${letter}`,
  letter,
  zone: 'Deep-sea Site',
  rankReq: 1,
  durationMin: 180,
  loot,
});

describe('computeRouteSummary', () => {
  it('computes totals and gil per hour', () => {
    const sectors: Sector[] = [
      makeSector(1, 'A', [
        { itemId: 100, name: 'Item A', tier: 'common' },
        { itemId: 200, name: 'Item B', tier: 'rare' },
      ]),
      makeSector(2, 'B', [
        { itemId: 300, name: 'Item C', tier: 'uncommon' },
      ]),
    ];

    const market: MarketData = {
      '100': { minNQ: 1000, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
      '200': { minNQ: 50000, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
      '300': { minNQ: 2000, minHQ: null, avgNQ: null, avgHQ: null, medianNQ: null, medianHQ: null, recentSalesNQ: 0, recentSalesHQ: 0, velocity: 1, lastUploadTime: 0, listingCount: 1, worldListings: [], averagePriceNQ: null, averagePriceHQ: null },
    };

    const result = computeRouteSummary(sectors, market);

    // Sector A: common 1000×0.30 + rare 50000×0.05 = 300 + 2500 = 2800
    // Sector B: uncommon 2000×0.15 = 300
    expect(result.sectors[0].subtotal).toBe(2800);
    expect(result.sectors[1].subtotal).toBe(300);
    expect(result.totalGilPerVoyage).toBe(3100);
    expect(result.totalDurationMin).toBe(360); // 180 + 180
    expect(result.gilPerHour).toBeCloseTo(3100 / 6, 1); // 360 min = 6 hours
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/submarines/RouteSummary.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the RouteSummary component with exported compute function**

Create `src/features/submarines/RouteSummary.tsx`:

```tsx
import type { Sector, RouteSummary as RouteSummaryType, SectorValueRow } from './submarineTypes';
import type { MarketData } from '../../lib/universalis';
import { DROP_RATES, DROP_RATE_DISCLAIMER, expectedGil } from './dropRates';
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { InfoTooltip } from '../../components/InfoTooltip';

/** Pure computation — exported for testing. */
export function computeRouteSummary(sectors: Sector[], market: MarketData): RouteSummaryType {
  const sectorSummaries = sectors.map((s) => {
    const subtotal = s.loot.reduce((sum, item) => {
      const m = market[String(item.itemId)];
      return sum + expectedGil(item.tier, m?.minNQ ?? null);
    }, 0);
    return { id: s.id, letter: s.letter, name: s.name, subtotal };
  });

  const totalGilPerVoyage = sectorSummaries.reduce((sum, s) => sum + s.subtotal, 0);
  const totalDurationMin = sectors.reduce((sum, s) => sum + s.durationMin, 0);
  const gilPerHour = totalDurationMin > 0 ? totalGilPerVoyage / (totalDurationMin / 60) : 0;

  return { sectors: sectorSummaries, totalGilPerVoyage, totalDurationMin, gilPerHour };
}

/** Build detailed per-item rows for the breakdown table. */
function buildDetailRows(sectors: Sector[], market: MarketData): SectorValueRow[] {
  const rows: SectorValueRow[] = [];
  for (const s of sectors) {
    for (const item of s.loot) {
      const m = market[String(item.itemId)];
      const price = m?.minNQ ?? null;
      rows.push({
        sectorId: s.id,
        sectorName: s.name,
        sectorLetter: s.letter,
        itemId: item.itemId,
        itemName: item.name,
        tier: item.tier,
        dropRate: DROP_RATES[item.tier],
        price,
        expected: expectedGil(item.tier, price),
      });
    }
  }
  return rows;
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface Props {
  sectors: Sector[];
  market: MarketData;
}

export function RouteSummary({ sectors, market }: Props) {
  const summary = computeRouteSummary(sectors, market);
  const detailRows = buildDetailRows(sectors, market);

  return (
    <div className="space-y-4">
      {/* Totals banner */}
      <div className="flex flex-wrap items-center gap-6 p-4 border border-border-base bg-bg-card">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Voyage duration</div>
          <div className="font-mono text-sm text-text-cream">{fmtDuration(summary.totalDurationMin)}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">Expected gil / voyage</div>
          <div className="font-mono text-sm text-gold">{fmtGil(Math.round(summary.totalGilPerVoyage))}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low flex items-center gap-1">
            Expected gil / hour
            <InfoTooltip label={DROP_RATE_DISCLAIMER}>
              <span className="text-text-low cursor-help">(?)</span>
            </InfoTooltip>
          </div>
          <div className="font-display text-lg text-gold">{fmtGil(Math.round(summary.gilPerHour))}</div>
        </div>
      </div>

      {/* Per-sector breakdown */}
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase text-text-dim">
              <th className="px-3 py-2 text-left">Sector</th>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-right hidden sm:table-cell">Tier</th>
              <th className="px-3 py-2 text-right hidden sm:table-cell">Drop rate</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Expected</th>
            </tr>
          </thead>
          <tbody>
            {summary.sectors.map((sec) => {
              const sectorRows = detailRows.filter((r) => r.sectorId === sec.id);
              return sectorRows.map((r, i) => (
                <tr key={`${r.sectorId}-${r.itemId}`} className="border-t border-border-base">
                  {i === 0 && (
                    <td
                      className="px-3 py-1.5 font-mono text-gold align-top"
                      rowSpan={sectorRows.length}
                    >
                      {r.sectorLetter}
                    </td>
                  )}
                  <td className="px-3 py-1.5">
                    <ItemNameLinks id={r.itemId} name={r.itemName} />
                  </td>
                  <td className="px-3 py-1.5 text-right text-text-low capitalize hidden sm:table-cell">{r.tier}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums hidden sm:table-cell">
                    {(r.dropRate * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtGil(r.price)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gold">{fmtGil(Math.round(r.expected))}</td>
                </tr>
              ));
            })}
            {/* Sector subtotal rows */}
            {summary.sectors.map((sec) => (
              <tr key={`total-${sec.id}`} className="border-t-2 border-border-base bg-bg-card-hi">
                <td className="px-3 py-1.5 font-mono text-gold">{sec.letter}</td>
                <td className="px-3 py-1.5 font-mono text-[10px] tracking-widest uppercase text-text-low" colSpan={3}>
                  Sector total
                </td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-gold font-semibold">
                  {fmtGil(Math.round(sec.subtotal))}
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/submarines/RouteSummary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/submarines/RouteSummary.tsx src/features/submarines/RouteSummary.test.ts
git commit -m "feat(submarines): add RouteSummary component with breakdown table"
```

---

### Task 6: Route Valuator Tab

**Files:**
- Create: `src/features/submarines/RouteValuator.tsx`

- [ ] **Step 1: Create the Route Valuator view**

Create `src/features/submarines/RouteValuator.tsx`:

```tsx
import { useState, useMemo, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { fetchInBatches } from '../../lib/universalisBulk';
import sectorData from '../../data/submarineSectors.json';
import type { Sector } from './submarineTypes';
import { SectorGrid } from './SectorGrid';
import { RouteSummary } from './RouteSummary';
import { suggestRoute } from './suggestRoute';
import { ProgressBar } from '../../components/ProgressBar';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';

const sectors = (sectorData as { sectors: Sector[] }).sectors;

const ZONES = [...new Set(sectors.map((s) => s.zone))];

export function RouteValuator() {
  const { world, submarineRank, submarineSlots } = useSettingsStore();

  const [zone, setZone] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [marketCache, setMarketCache] = useState<MarketData>({});

  const selectedSectors = useMemo(
    () => sectors.filter((s) => selected.has(s.id)),
    [selected],
  );

  // Collect unique loot item IDs across selected sectors
  const lootIds = useMemo(() => {
    const ids = new Set<number>();
    for (const s of selectedSectors) {
      for (const item of s.loot) ids.add(item.itemId);
    }
    return [...ids];
  }, [selectedSectors]);

  const scan = useMutation({
    mutationFn: async () => {
      setProgress({ current: 0, total: lootIds.length });
      const result = await fetchInBatches<MarketData[string]>(
        lootIds,
        (chunk) => fetchMarketData(world, chunk),
        {
          chunkSize: 100,
          concurrency: 4,
          onProgress: (done) =>
            setProgress({ current: Math.min(done * 100, lootIds.length), total: lootIds.length }),
        },
      );
      setProgress(null);
      const merged = { ...marketCache, ...result.data };
      setMarketCache(merged);
      return { market: merged, skipped: result.errors.length };
    },
  });

  const handleToggle = useCallback((sectorId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sectorId)) {
        next.delete(sectorId);
      } else {
        next.add(sectorId);
      }
      return next;
    });
  }, []);

  const handleSuggest = useCallback(async () => {
    // Fetch prices for all sectors in the target zone (or all if no zone)
    const targetSectors = zone
      ? sectors.filter((s) => s.rankReq <= submarineRank && s.zone === zone)
      : sectors.filter((s) => s.rankReq <= submarineRank);

    const allLootIds = [...new Set(targetSectors.flatMap((s) => s.loot.map((l) => l.itemId)))];

    setProgress({ current: 0, total: allLootIds.length });
    const result = await fetchInBatches<MarketData[string]>(
      allLootIds,
      (chunk) => fetchMarketData(world, chunk),
      {
        chunkSize: 100,
        concurrency: 4,
        onProgress: (done) =>
          setProgress({ current: Math.min(done * 100, allLootIds.length), total: allLootIds.length }),
      },
    );
    setProgress(null);

    const merged = { ...marketCache, ...result.data };
    setMarketCache(merged);

    const suggested = suggestRoute(sectors, merged, {
      rank: submarineRank,
      slots: submarineSlots,
      zone,
    });
    setSelected(new Set(suggested.map((s) => s.id)));
  }, [zone, submarineRank, submarineSlots, world, marketCache]);

  const hasMarketData = scan.data != null || Object.keys(marketCache).length > 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low">Zone</span>
          <select
            value={zone ?? ''}
            onChange={(e) => setZone(e.target.value || null)}
            className="mt-1 block w-44 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          >
            <option value="">All zones</option>
            {ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={handleSuggest}
          disabled={scan.isPending}
          className="font-mono text-[10px] tracking-widest uppercase border border-aether text-aether px-4 py-2 hover:bg-aether hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Suggest best route
        </button>

        <button
          type="button"
          onClick={() => { scan.reset(); scan.mutate(); }}
          disabled={scan.isPending || selected.size === 0}
          className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {scan.isPending ? 'Scanning...' : 'Run scan'}
        </button>
      </div>

      {/* Selected sectors as pills */}
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSectors.map((s) => (
            <button
              key={s.id}
              onClick={() => handleToggle(s.id)}
              className="inline-flex items-center gap-1 font-mono text-[10px] tracking-widest border border-gold text-gold px-2 py-1 hover:bg-gold/10 transition-colors"
            >
              {s.letter} — {s.name}
              <span className="text-text-low ml-1">×</span>
            </button>
          ))}
          <span className="font-mono text-[10px] text-text-low self-center">
            {selected.size}/{submarineSlots} slots
          </span>
        </div>
      )}

      {/* Progress / errors */}
      {scan.isPending && progress && (
        <ProgressBar current={progress.current} total={progress.total} label="Fetching prices..." />
      )}
      {!scan.isPending && progress && (
        <ProgressBar current={progress.current} total={progress.total} label="Fetching prices for suggestion..." />
      )}
      {scan.isError && <StatusBanner kind="error">Scan failed: {(scan.error as Error).message}</StatusBanner>}
      {scan.data && scan.data.skipped > 0 && (
        <StatusBanner kind="error">{scan.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {/* Sector grid */}
      <SectorGrid
        sectors={sectors}
        rank={submarineRank}
        zone={zone}
        selected={selected}
        maxSlots={submarineSlots}
        onToggle={handleToggle}
      />

      {/* Route summary (after scan) */}
      {hasMarketData && selectedSectors.length > 0 && (
        <RouteSummary sectors={selectedSectors} market={marketCache} />
      )}

      {/* Pre-scan empty state */}
      {!hasMarketData && selected.size === 0 && (
        <EmptyState
          icon="🚢"
          message="Select sectors from the grid above to build a submarine route, or use Suggest to auto-pick the best one."
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/features/submarines/RouteValuator.tsx
git commit -m "feat(submarines): add RouteValuator tab view"
```

---

### Task 7: Loot Pricer Tab

**Files:**
- Create: `src/features/submarines/LootPricer.tsx`

- [ ] **Step 1: Write the failing test for indicator logic**

Create `src/features/submarines/LootPricer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeIndicator } from './LootPricer';

describe('computeIndicator', () => {
  it('returns SELL when velocity >= 1 and price >= 100', () => {
    expect(computeIndicator(500, 400, 2)).toBe('SELL');
  });

  it('returns HOLD when velocity >= 1 and price is depressed below 80% of average', () => {
    expect(computeIndicator(100, 200, 2)).toBe('HOLD');
  });

  it('returns SKIP when velocity < 1', () => {
    expect(computeIndicator(500, 400, 0.5)).toBe('SKIP');
  });

  it('returns SKIP when price < 100', () => {
    expect(computeIndicator(50, 40, 5)).toBe('SKIP');
  });

  it('returns SKIP when price is null', () => {
    expect(computeIndicator(null, null, 0)).toBe('SKIP');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/submarines/LootPricer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the Loot Pricer component**

Create `src/features/submarines/LootPricer.tsx`:

```tsx
import { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { fetchMarketData, type MarketData } from '../../lib/universalis';
import { fetchInBatches } from '../../lib/universalisBulk';
import sectorData from '../../data/submarineSectors.json';
import type { Sector, Indicator, LootPricerRow } from './submarineTypes';
import { fmtGil } from '../../lib/format';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusBanner } from '../../components/StatusBanner';
import { EmptyState } from '../../components/EmptyState';
import { LoadMoreFooter } from '../../components/LoadMoreFooter';
import { useLoadMore } from '../../lib/useLoadMore';

const sectors = (sectorData as { sectors: Sector[] }).sectors;

const ZONES = [...new Set(sectors.map((s) => s.zone))];

/** Exported for testing. */
export function computeIndicator(
  minPrice: number | null,
  avgPrice: number | null,
  velocity: number,
): Indicator {
  if (minPrice == null || minPrice < 100 || velocity < 1) return 'SKIP';
  if (avgPrice != null && minPrice < avgPrice * 0.8) return 'HOLD';
  return 'SELL';
}

const INDICATOR_CLASS: Record<Indicator, string> = {
  SELL: 'text-jade',
  HOLD: 'text-gold',
  SKIP: 'text-text-low',
};

type SortKey = 'name' | 'tier' | 'minPrice' | 'avgPrice' | 'velocity' | 'indicator';
type SortDir = 'asc' | 'desc';

export function LootPricer() {
  const { world } = useSettingsStore();
  const [zone, setZone] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('minPrice');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Unique loot items with zone associations
  const lootItems = useMemo(() => {
    const filtered = zone ? sectors.filter((s) => s.zone === zone) : sectors;
    const map = new Map<number, { name: string; zones: Set<string>; tier: 'common' | 'uncommon' | 'rare' }>();
    for (const s of filtered) {
      for (const item of s.loot) {
        const existing = map.get(item.itemId);
        if (existing) {
          existing.zones.add(s.zone);
        } else {
          map.set(item.itemId, { name: item.name, zones: new Set([s.zone]), tier: item.tier });
        }
      }
    }
    return map;
  }, [zone]);

  const lootIds = useMemo(() => [...lootItems.keys()], [lootItems]);

  const scan = useMutation({
    mutationFn: async () => {
      setProgress({ current: 0, total: lootIds.length });
      const result = await fetchInBatches<MarketData[string]>(
        lootIds,
        (chunk) => fetchMarketData(world, chunk),
        {
          chunkSize: 100,
          concurrency: 4,
          onProgress: (done) =>
            setProgress({ current: Math.min(done * 100, lootIds.length), total: lootIds.length }),
        },
      );
      setProgress(null);
      return { market: result.data, skipped: result.errors.length };
    },
  });

  const rows = useMemo((): LootPricerRow[] => {
    if (!scan.data) return [];
    const market = scan.data.market;
    const out: LootPricerRow[] = [];
    for (const [itemId, info] of lootItems) {
      const m = market[String(itemId)];
      const minPrice = m?.minNQ ?? null;
      const avgPrice = m?.avgNQ ?? null;
      const velocity = m?.velocity ?? 0;
      out.push({
        itemId,
        name: info.name,
        zones: [...info.zones],
        tier: info.tier,
        minPrice,
        avgPrice,
        velocity,
        indicator: computeIndicator(minPrice, avgPrice, velocity),
      });
    }
    return out;
  }, [scan.data, lootItems]);

  const sortedRows = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * mul;
      if (sortKey === 'tier') return a.tier.localeCompare(b.tier) * mul;
      if (sortKey === 'indicator') return a.indicator.localeCompare(b.indicator) * mul;
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      return (av - bv) * mul;
    });
  }, [rows, sortKey, sortDir]);

  const lm = useLoadMore(sortedRows, 25);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'tier' || key === 'indicator' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 p-3 border border-border-base bg-bg-card">
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low">Zone</span>
          <select
            value={zone ?? ''}
            onChange={(e) => setZone(e.target.value || null)}
            className="mt-1 block w-44 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          >
            <option value="">All zones</option>
            {ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => { scan.reset(); scan.mutate(); }}
          disabled={scan.isPending || lootIds.length === 0}
          className="font-mono text-[10px] tracking-widest uppercase border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-bg-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {scan.isPending ? 'Scanning...' : `Run scan · ${lootIds.length} items`}
        </button>
      </div>

      {/* Progress / errors */}
      {scan.isPending && progress && (
        <ProgressBar current={progress.current} total={progress.total} label="Fetching loot prices..." />
      )}
      {scan.isError && <StatusBanner kind="error">Scan failed: {(scan.error as Error).message}</StatusBanner>}
      {scan.data && scan.data.skipped > 0 && (
        <StatusBanner kind="error">{scan.data.skipped} batch(es) skipped (Universalis error)</StatusBanner>
      )}

      {/* Pre-scan empty state */}
      {!scan.data && !scan.isPending && (
        <EmptyState icon="📦" message="Scan to see live prices and sell/hold/skip indicators for all submarine loot." />
      )}

      {/* Results table */}
      {scan.data && sortedRows.length > 0 && (
        <div className="border border-border-base bg-bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono text-[10px] tracking-widest uppercase">
                {([
                  { key: 'name' as SortKey, label: 'Item', align: 'left' },
                  { key: 'tier' as SortKey, label: 'Tier', align: 'left', hide: true },
                  { key: 'minPrice' as SortKey, label: 'Price', align: 'right' },
                  { key: 'avgPrice' as SortKey, label: 'Avg', align: 'right', hide: true },
                  { key: 'velocity' as SortKey, label: 'Velocity', align: 'right' },
                  { key: 'indicator' as SortKey, label: 'Action', align: 'left' },
                ] as const).map((c) => {
                  const sorted = sortKey === c.key;
                  const arrow = sorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`px-3 py-2 cursor-pointer select-none ${
                        c.align === 'right' ? 'text-right' : 'text-left'
                      } ${sorted ? 'text-gold' : 'text-text-dim hover:text-aether'} ${
                        'hide' in c && c.hide ? 'hidden md:table-cell' : ''
                      }`}
                    >
                      {c.label}{arrow}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lm.visible.map((r) => (
                <tr key={r.itemId} className="border-t border-border-base hover:bg-bg-card-hi">
                  <td className="px-3 py-1.5">
                    <ItemNameLinks id={r.itemId} name={r.name} sub={r.zones.join(', ')} />
                  </td>
                  <td className="px-3 py-1.5 capitalize text-text-low hidden md:table-cell">{r.tier}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtGil(r.minPrice)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-text-low hidden md:table-cell">{fmtGil(r.avgPrice)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{r.velocity.toFixed(1)}/day</td>
                  <td className={`px-3 py-1.5 font-mono text-[10px] tracking-widest uppercase font-semibold ${INDICATOR_CLASS[r.indicator]}`}>
                    {r.indicator}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <LoadMoreFooter
            hasMore={lm.hasMore}
            total={lm.total}
            shown={lm.shown}
            onLoadMore={lm.loadMore}
          />
        </div>
      )}

      {scan.data && sortedRows.length === 0 && (
        <EmptyState icon="📦" message="No loot items found for the selected zone." />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/submarines/LootPricer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/submarines/LootPricer.tsx src/features/submarines/LootPricer.test.ts
git commit -m "feat(submarines): add LootPricer tab with SELL/HOLD/SKIP indicators"
```

---

### Task 8: Page Shell, Routing & Navigation

**Files:**
- Create: `src/routes/Submarines.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create the Submarines page shell**

Create `src/routes/Submarines.tsx`:

```tsx
import { useState } from 'react';
import { useSettingsStore } from '../features/settings/store';
import { SectionHeader } from '../components/SectionHeader';
import { RouteValuator } from '../features/submarines/RouteValuator';
import { LootPricer } from '../features/submarines/LootPricer';

type Tab = 'route' | 'loot';

const TABS: { id: Tab; label: string }[] = [
  { id: 'route', label: 'Route valuator' },
  { id: 'loot', label: 'Loot pricer' },
];

export default function Submarines() {
  const [tab, setTab] = useState<Tab>('route');
  const { submarineRank, submarineSlots, setSubmarineRank, setSubmarineSlots } = useSettingsStore();

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <SectionHeader label="Submarines" />
        <div className="flex items-end gap-3">
          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low">Rank</span>
            <input
              type="number"
              min={1}
              max={125}
              value={submarineRank}
              onChange={(e) => setSubmarineRank(Math.max(1, Math.min(125, Number(e.target.value) || 1)))}
              className="mt-1 block w-20 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-text-low">Slots</span>
            <input
              type="number"
              min={1}
              max={5}
              value={submarineSlots}
              onChange={(e) => setSubmarineSlots(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
              className="mt-1 block w-20 bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>
      </div>

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

      {tab === 'route' && <RouteValuator />}
      {tab === 'loot' && <LootPricer />}
    </div>
  );
}
```

- [ ] **Step 2: Add the route to App.tsx**

In `src/App.tsx`, add the import after the other route imports (line 23):

```ts
import Submarines from './routes/Submarines';
```

Add the route inside `<Routes>`, after the `/settings` route (line 60):

```tsx
            <Route path="/submarines" element={<Submarines />} />
```

- [ ] **Step 3: Add nav item to Sidebar**

In `src/components/layout/Sidebar.tsx`, add to the Gil-Making group items array, after `{ label: 'Currencies', path: '/currency-flip' }` (line 26):

```ts
      { label: 'Submarines', path: '/submarines' },
```

- [ ] **Step 4: Verify the app compiles and renders**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vite build`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/routes/Submarines.tsx src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(submarines): add Submarines page with routing and nav entry"
```

---

### Task 9: Integration Test & Final Verification

**Files:**
- Create: `src/features/submarines/Submarines.test.tsx`

- [ ] **Step 1: Write an integration smoke test**

Create `src/features/submarines/Submarines.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Submarines from '../../routes/Submarines';

function renderWithProviders() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Submarines />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Submarines page', () => {
  it('renders both tabs', () => {
    renderWithProviders();
    expect(screen.getByText('Route valuator')).toBeDefined();
    expect(screen.getByText('Loot pricer')).toBeDefined();
  });

  it('renders rank and slots inputs', () => {
    renderWithProviders();
    const rankInput = screen.getByDisplayValue('1');
    expect(rankInput).toBeDefined();
  });

  it('shows route valuator empty state by default', () => {
    renderWithProviders();
    expect(screen.getByText(/Select sectors/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run all submarine tests**

Run: `npx vitest run src/features/submarines/`
Expected: all tests PASS

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 4: Verify production build**

Run: `npx vite build`
Expected: build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add src/features/submarines/Submarines.test.tsx
git commit -m "test(submarines): add integration smoke tests"
```
