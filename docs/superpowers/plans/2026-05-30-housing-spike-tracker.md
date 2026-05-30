# Housing Spike Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/housing` page with a lottery-cycle clock banner and a 3-tab (Furnishings / Materials / All housing) ranked market table to help craft ahead of housing move-in demand.

**Architecture:** Pure, unit-tested logic modules (`housingLottery`, `housingItems`, `spikeSignal`) + a clock banner + an orchestration view that batch-fetches current market data then a bounded top-N momentum (history) fetch, reusing the verdict pricing helpers and the existing insight scaffolding.

**Tech Stack:** React + Vite + TypeScript + Vitest + Tailwind, `@tanstack/react-query`.

**Spec:** `docs/superpowers/specs/2026-05-30-housing-spike-tracker-design.md`

**Test command:** `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`.

**Verified facts the implementer relies on:**
- `categoriesByGroup('Housing')` → housing category ids (`src/lib/itemSearchCategories.ts`).
- `SnapshotItem` (`src/lib/itemSnapshot.ts`): `{ id, name, sc, ui, ilvl, canHq, rarity?, priceLow? }`.
- `Recipe` (`src/lib/recipes.ts`): `{ itemResultId, classJob, recipeLevel, ingredients: {itemId, amount}[], amountResult? }`. `useRecipeSnapshot().data` is `Map<number, Recipe>`.
- `MarketItem` (`src/lib/universalis.ts`): `{ minNQ, minHQ, avgNQ, avgHQ, recentSalesNQ, recentSalesHQ, velocity, lastUploadTime, listingCount, worldListings }`. `MarketData = Record<string, MarketItem>` (string item-id keys). `fetchMarketData(scope, ids)` and `fetchInBatches<T>(ids, fn, {chunkSize, concurrency})` → `{ data: Record<string,T>, errors }` (`src/lib/universalisBulk.ts`).
- History: `fetchHistoryWithin(scope, ids[], withinSeconds)` (multi-item, one request) → `Map<number, HistoryEntry[]>`; `computeWeekDelta(entries, nowMs)` → 7d-vs-prior % or null (`src/lib/universalisHistory.ts`).
- Verdict helpers (`src/features/items/verdict/pricing.ts`): `robustSellPrice(m, quality)`, `applyTax(price)`, `effectiveUnitsPerDay(velocity, listingCount)`.
- Settings store (`src/features/settings/store.ts`): `useSettingsStore()` exposes `world` and `dc`.
- `ResultTableScaffold<T extends {id:number}>` props: `rows, totalCandidates, skippedChunks, emptyState, renderTable(visible), renderMobile?, csvColumns?, csvFilename?`.

---

### Task 1: Lottery cycle clock (`housingLottery.ts`)

**Files:**
- Create: `src/lib/housingLottery.ts`
- Test: `src/lib/housingLottery.test.ts`

- [ ] **Step 1: Write the failing test** `src/lib/housingLottery.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { lotteryStatus, LOTTERY_ANCHOR_UTC } from './housingLottery';

const DAY = 86_400_000;

describe('lotteryStatus', () => {
  it('reports entry on day 0 with 5 days remaining', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC);
    expect(s.phase).toBe('entry');
    expect(s.dayInCycle).toBe(0);
    expect(s.daysRemaining).toBe(5);
    expect(s.nextPhase).toBe('results');
  });

  it('reports results on day 5 with 4 days remaining', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC + 5 * DAY);
    expect(s.phase).toBe('results');
    expect(s.dayInCycle).toBe(5);
    expect(s.daysRemaining).toBe(4);
    expect(s.nextPhase).toBe('entry');
  });

  it('rounds up partial days remaining', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC + 4 * DAY + DAY / 2); // mid day 4
    expect(s.phase).toBe('entry');
    expect(s.dayInCycle).toBe(4);
    expect(s.daysRemaining).toBe(1); // ~0.5 day → ceil 1
  });

  it('wraps across many future cycles', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC + 100 * 9 * DAY + 3 * DAY);
    expect(s.phase).toBe('entry');
    expect(s.dayInCycle).toBe(3);
  });

  it('handles times before the anchor (negative modulo)', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC - DAY); // 1 day before anchor = day 8 of prior cycle
    expect(s.dayInCycle).toBe(8);
    expect(s.phase).toBe('results');
  });

  it('currentEndsAt is the next phase boundary', () => {
    const s = lotteryStatus(LOTTERY_ANCHOR_UTC + DAY); // day 1 entry
    expect(s.currentEndsAt).toBe(LOTTERY_ANCHOR_UTC + 5 * DAY);
    expect(s.nextStartsAt).toBe(s.currentEndsAt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/housingLottery.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/housingLottery.ts`**

```ts
export type LotteryPhase = 'entry' | 'results';

export interface LotteryStatus {
  phase: LotteryPhase;
  dayInCycle: number;     // 0..8
  currentEndsAt: number;  // epoch ms of the next phase transition
  nextPhase: LotteryPhase;
  nextStartsAt: number;   // === currentEndsAt
  msRemaining: number;    // until current phase ends
  daysRemaining: number;  // ceil(msRemaining / day)
}

const DAY_MS = 86_400_000;
const CYCLE_DAYS = 9;
const ENTRY_DAYS = 5;

// Calibrated to the known 2026 schedule (an entry period began Apr 26 2026).
// Time-of-day is the single value to recalibrate if the exact transition hour differs.
export const LOTTERY_ANCHOR_UTC = Date.UTC(2026, 3, 26, 8, 0, 0);

export function lotteryStatus(now: number): LotteryStatus {
  const cycleMs = CYCLE_DAYS * DAY_MS;
  let offset = (now - LOTTERY_ANCHOR_UTC) % cycleMs;
  if (offset < 0) offset += cycleMs;
  const cycleStart = now - offset;
  const dayInCycle = Math.floor(offset / DAY_MS);
  const phase: LotteryPhase = dayInCycle < ENTRY_DAYS ? 'entry' : 'results';
  const boundaryDay = phase === 'entry' ? ENTRY_DAYS : CYCLE_DAYS;
  const currentEndsAt = cycleStart + boundaryDay * DAY_MS;
  const msRemaining = currentEndsAt - now;
  return {
    phase,
    dayInCycle,
    currentEndsAt,
    nextPhase: phase === 'entry' ? 'results' : 'entry',
    nextStartsAt: currentEndsAt,
    msRemaining,
    daysRemaining: Math.ceil(msRemaining / DAY_MS),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/housingLottery.test.ts` → PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/housingLottery.ts src/lib/housingLottery.test.ts
git commit -m "feat: add housing lottery cycle clock"
```

---

### Task 2: Housing candidate derivation (`housingItems.ts`)

**Files:**
- Create: `src/lib/housingItems.ts`
- Test: `src/lib/housingItems.test.ts`

- [ ] **Step 1: Write the failing test** `src/lib/housingItems.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  isHousingItem, furnishingCandidates, materialCandidates, allHousingCandidates,
} from './housingItems';
import type { SnapshotItem } from './itemSnapshot';
import type { Recipe } from './recipes';

// 56 = Furnishings, 65 = Exterior Fixtures (both in the Housing group); 54 = Materials (not housing)
function item(id: number, sc: number): SnapshotItem {
  return { id, name: `i${id}`, sc, ui: 0, ilvl: 1, canHq: true } as SnapshotItem;
}
function recipe(itemResultId: number, ingredientIds: number[]): Recipe {
  return {
    itemResultId, classJob: 'CRP', recipeLevel: 1,
    ingredients: ingredientIds.map((itemId) => ({ itemId, amount: 1 })),
  } as Recipe;
}

describe('isHousingItem', () => {
  it('recognizes housing search categories and rejects others', () => {
    expect(isHousingItem(56)).toBe(true);
    expect(isHousingItem(54)).toBe(false);
  });
});

describe('furnishingCandidates', () => {
  it('returns only housing items that have a recipe', () => {
    const items = [item(1, 56), item(2, 56), item(3, 54)];
    const recipes = new Map<number, Recipe>([[1, recipe(1, [10, 11])]]); // item 2 has no recipe, 3 not housing
    expect(furnishingCandidates(items, recipes)).toEqual([1]);
  });
});

describe('materialCandidates', () => {
  it('returns the deduped ingredient ids of the given furnishings', () => {
    const recipes = new Map<number, Recipe>([
      [1, recipe(1, [10, 11])],
      [2, recipe(2, [11, 12])],
    ]);
    expect(materialCandidates(recipes, [1, 2]).sort((a, b) => a - b)).toEqual([10, 11, 12]);
  });
});

describe('allHousingCandidates', () => {
  it('returns every housing-category item regardless of recipe', () => {
    const items = [item(1, 56), item(2, 65), item(3, 54)];
    expect(allHousingCandidates(items)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/housingItems.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/housingItems.ts`**

```ts
import { categoriesByGroup } from './itemSearchCategories';
import type { SnapshotItem } from './itemSnapshot';
import type { Recipe } from './recipes';

export function housingCategoryIds(): number[] {
  return categoriesByGroup('Housing');
}

const HOUSING_SET = new Set(housingCategoryIds());

export function isHousingItem(sc: number): boolean {
  return HOUSING_SET.has(sc);
}

export function furnishingCandidates(items: SnapshotItem[], recipes: Map<number, Recipe>): number[] {
  return items.filter((i) => isHousingItem(i.sc) && recipes.has(i.id)).map((i) => i.id);
}

export function materialCandidates(recipes: Map<number, Recipe>, furnishingIds: number[]): number[] {
  const out = new Set<number>();
  for (const id of furnishingIds) {
    const r = recipes.get(id);
    if (!r) continue;
    for (const ing of r.ingredients) out.add(ing.itemId);
  }
  return [...out];
}

export function allHousingCandidates(items: SnapshotItem[]): number[] {
  return items.filter((i) => isHousingItem(i.sc)).map((i) => i.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/housingItems.test.ts` → PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/housingItems.ts src/lib/housingItems.test.ts
git commit -m "feat: add housing item candidate derivation"
```

---

### Task 3: Row signal + material cost + sort (`spikeSignal.ts`)

**Files:**
- Create: `src/features/housing/spikeSignal.ts`
- Test: `src/features/housing/spikeSignal.test.ts`

- [ ] **Step 1: Write the failing test** `src/features/housing/spikeSignal.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildHousingRow, housingMaterialCost, sortHousingRows, type HousingRow } from './spikeSignal';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketItem, MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { HistoryEntry } from '../../lib/universalisHistory';

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

function mkt(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: NOW - 1_000,
    listingCount: 0, worldListings: [], ...over,
  } as MarketItem;
}
function item(id: number, canHq = true): SnapshotItem {
  return { id, name: `i${id}`, sc: 56, ui: 0, ilvl: 1, canHq } as SnapshotItem;
}
const recipe = { itemResultId: 1, classJob: 'CRP', recipeLevel: 1, ingredients: [{ itemId: 10, amount: 2 }] } as Recipe;

describe('housingMaterialCost', () => {
  it('sums lowest ingredient prices times amount', () => {
    const market: MarketData = { '10': mkt({ minNQ: 50 }) };
    expect(housingMaterialCost(recipe, market)).toBe(100); // 50 * 2
  });
  it('treats missing ingredient market as zero', () => {
    expect(housingMaterialCost(recipe, {})).toBe(0);
  });
});

describe('buildHousingRow', () => {
  it('computes craft margin and gil/day when a recipe is present', () => {
    const r = buildHousingRow({
      item: item(1), market: mkt({ minHQ: 1000, avgHQ: 1000, recentSalesHQ: 10, velocity: 8, listingCount: 3 }),
      recipe, materialCost: 400, history: undefined, now: NOW,
    });
    expect(r.price).toBe(1000);
    expect(r.craftMargin).toBe(550);       // 1000*0.95 - 400
    expect(r.craftGilPerDay).toBe(1100);   // 550 * (8 * 1/(1+3))
    expect(r.momentumPct).toBeNull();      // no history
  });
  it('leaves craft fields null with no recipe and computes momentum from history', () => {
    const history: HistoryEntry[] = [
      { pricePerUnit: 120, quantity: 1, timestamp: (NOW - 2 * DAY) / 1000, hq: false },
      { pricePerUnit: 100, quantity: 1, timestamp: (NOW - 9 * DAY) / 1000, hq: false },
    ];
    const r = buildHousingRow({
      item: item(2, false), market: mkt({ minNQ: 120, avgNQ: 120, recentSalesNQ: 5, velocity: 2 }),
      recipe: undefined, materialCost: 0, history, now: NOW,
    });
    expect(r.craftMargin).toBeNull();
    expect(r.craftGilPerDay).toBeNull();
    expect(r.momentumPct).toBeCloseTo(20, 5); // (120-100)/100 * 100
  });
});

describe('sortHousingRows', () => {
  const rows: HousingRow[] = [
    { id: 1, name: 'a', price: 1, velocity: 1, momentumPct: 5, craftMargin: null, craftGilPerDay: 100 },
    { id: 2, name: 'b', price: 1, velocity: 1, momentumPct: 50, craftMargin: null, craftGilPerDay: 10 },
    { id: 3, name: 'c', price: 1, velocity: 1, momentumPct: null, craftMargin: null, craftGilPerDay: null },
  ];
  it('sorts by a numeric key descending, nulls last', () => {
    expect(sortHousingRows(rows, 'momentumPct').map((r) => r.id)).toEqual([2, 1, 3]);
    expect(sortHousingRows(rows, 'craftGilPerDay').map((r) => r.id)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/housing/spikeSignal.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/features/housing/spikeSignal.ts`**

```ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketItem, MarketData } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { HistoryEntry } from '../../lib/universalisHistory';
import { computeWeekDelta } from '../../lib/universalisHistory';
import { robustSellPrice, applyTax, effectiveUnitsPerDay } from '../items/verdict/pricing';

export interface HousingRow {
  id: number;
  name: string;
  price: number | null;
  velocity: number;
  momentumPct: number | null;
  craftMargin: number | null;
  craftGilPerDay: number | null;
}

export type HousingSortKey = 'momentumPct' | 'craftGilPerDay' | 'craftMargin' | 'velocity' | 'price';

export function housingMaterialCost(recipe: Recipe, market: MarketData): number {
  let total = 0;
  for (const ing of recipe.ingredients) {
    const m = market[String(ing.itemId)];
    const px = m ? (m.minNQ ?? m.minHQ ?? 0) : 0;
    total += px * ing.amount;
  }
  return total;
}

export function buildHousingRow(input: {
  item: SnapshotItem;
  market: MarketItem | undefined;
  recipe: Recipe | undefined;
  materialCost: number;
  history: HistoryEntry[] | undefined;
  now: number;
}): HousingRow {
  const { item, market, recipe, materialCost, history, now } = input;
  const quality = item.canHq ? 'HQ' : 'NQ';
  const price = market ? robustSellPrice(market, quality) : null;
  const velocity = market?.velocity ?? 0;
  const momentumPct = history ? computeWeekDelta(history, now) : null;

  let craftMargin: number | null = null;
  let craftGilPerDay: number | null = null;
  if (recipe && materialCost > 0 && price != null) {
    craftMargin = applyTax(price) - materialCost;
    const units = market ? effectiveUnitsPerDay(market.velocity, market.listingCount) : 0;
    craftGilPerDay = craftMargin * units;
  }

  return { id: item.id, name: item.name, price, velocity, momentumPct, craftMargin, craftGilPerDay };
}

/** Sort rows by a numeric key descending, with null/undefined values always last. */
export function sortHousingRows(rows: HousingRow[], key: HousingSortKey): HousingRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/housing/spikeSignal.test.ts` → PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/features/housing/spikeSignal.ts src/features/housing/spikeSignal.test.ts
git commit -m "feat: add housing row signal, material cost, and sort"
```

---

### Task 4: Lottery clock banner (`LotteryClockBanner.tsx`)

**Files:**
- Create: `src/features/housing/LotteryClockBanner.tsx`
- Test: `src/features/housing/LotteryClockBanner.test.tsx`

- [ ] **Step 1: Write the failing test** `src/features/housing/LotteryClockBanner.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LotteryClockBanner } from './LotteryClockBanner';
import { LOTTERY_ANCHOR_UTC } from '../../lib/housingLottery';

const DAY = 86_400_000;

describe('LotteryClockBanner', () => {
  it('shows the entry phase and a craft-ahead nudge', () => {
    render(<LotteryClockBanner now={LOTTERY_ANCHOR_UTC + DAY} />);
    expect(screen.getByText(/Entry period/i)).toBeInTheDocument();
    expect(screen.getByText(/4 days/i)).toBeInTheDocument(); // day 1 → 4 days to results
  });

  it('shows the results phase when in the move-in window', () => {
    render(<LotteryClockBanner now={LOTTERY_ANCHOR_UTC + 6 * DAY} />);
    expect(screen.getByText(/Results period/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/housing/LotteryClockBanner.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/features/housing/LotteryClockBanner.tsx`**

```tsx
import { lotteryStatus } from '../../lib/housingLottery';
import { SectionHeader } from '../../components/SectionHeader';

interface Props {
  /** Injectable for tests; defaults to Date.now(). */
  now?: number;
}

export function LotteryClockBanner({ now }: Props) {
  const s = lotteryStatus(now ?? Date.now());
  const isEntry = s.phase === 'entry';
  const phaseLabel = isEntry ? 'Entry period' : 'Results period';
  const nudge = isEntry
    ? 'Players are placing bids — craft and stock furnishings now to sell into the move-in wave.'
    : 'Winners are moving in and decorating — list furnishings now while demand peaks.';
  const tone = isEntry ? 'text-aether' : 'text-gold';
  const dayLabel = `Day ${s.dayInCycle + 1} of 9`;
  const remaining = `${s.daysRemaining} day${s.daysRemaining === 1 ? '' : 's'} until ${s.nextPhase} period`;

  return (
    <section className="border border-border-base bg-bg-card border-l-[3px] border-l-aether p-5 md:p-6">
      <SectionHeader label="Housing Lottery" compact />
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className={`font-display text-xl tracking-wide ${tone}`}>{phaseLabel}</div>
          <p className="text-[12.5px] text-text-dim leading-snug mt-1 max-w-xl">{nudge}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-2xl text-text-cream tabular-nums leading-none">{s.daysRemaining}d</div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mt-1">{remaining}</div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-text-low">{dayLabel}</div>
        </div>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 ${
              i === s.dayInCycle
                ? 'bg-aether'
                : i < 5
                  ? 'bg-aether/30'
                  : 'bg-gold/30'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/housing/LotteryClockBanner.test.tsx` → PASS (jest-dom matchers are global via `src/test/setup.ts`). Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/features/housing/LotteryClockBanner.tsx src/features/housing/LotteryClockBanner.test.tsx
git commit -m "feat: add housing lottery clock banner"
```

---

### Task 5: Housing market view (tabs + scan + table)

**Files:**
- Create: `src/features/housing/HousingMarketView.tsx`

This is the integration task. Mirror the structure of `src/features/insights/VendorFlipView.tsx` (useMutation scan, `fetchInBatches`, candidate `useMemo`) and render with `ResultTableScaffold`. No new unit test (the pure logic is covered by Task 3); it is exercised by the full suite + manual smoke.

- [ ] **Step 1: Implement `src/features/housing/HousingMarketView.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSettingsStore } from '../settings/store';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { fetchInBatches } from '../../lib/universalisBulk';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { fetchMarketData, type MarketData, type MarketItem } from '../../lib/universalis';
import { fetchHistoryWithin, type HistoryEntry } from '../../lib/universalisHistory';
import { furnishingCandidates, materialCandidates, allHousingCandidates } from '../../lib/housingItems';
import { buildHousingRow, housingMaterialCost, sortHousingRows, type HousingRow, type HousingSortKey } from './spikeSignal';
import { ResultTableScaffold, EmptyResults } from '../queries/ResultTableScaffold';
import { ItemNameLinks } from '../../components/ItemNameLinks';
import { Spinner } from '../../components/Spinner';
import { StatusBanner } from '../../components/StatusBanner';
import { fmtGil } from '../../lib/format';

type Tab = 'furnishings' | 'materials' | 'all';
const TABS: { id: Tab; label: string; sort: HousingSortKey }[] = [
  { id: 'furnishings', label: 'Furnishings', sort: 'craftGilPerDay' },
  { id: 'materials', label: 'Materials', sort: 'momentumPct' },
  { id: 'all', label: 'All housing', sort: 'momentumPct' },
];

const MAX_CANDIDATES = 400;   // cap to bound the current-market fetch
const TOP_N_HISTORY = 100;    // bounded momentum fetch
const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;
const HISTORY_CHUNK = 100;

interface ScanResult {
  market: MarketData;
  history: Map<number, HistoryEntry[]>;
  skipped: number;
  cappedFrom: number; // original candidate count before MAX_CANDIDATES cap
}

export function HousingMarketView() {
  const { world, dc } = useSettingsStore();
  const items = useItemSnapshot();
  const recipes = useRecipeSnapshot();
  const [tab, setTab] = useState<Tab>('furnishings');
  const now = Date.now();

  const itemById = useMemo(() => {
    if (!items.data) return new Map<number, SnapshotItem>();
    return new Map<number, SnapshotItem>(items.data.items.map((i) => [i.id, i]));
  }, [items.data]);

  const candidateIds = useMemo(() => {
    if (!items.data || !recipes.data) return [];
    if (tab === 'furnishings') return furnishingCandidates(items.data.items, recipes.data);
    if (tab === 'materials') {
      const furn = furnishingCandidates(items.data.items, recipes.data);
      return materialCandidates(recipes.data, furn);
    }
    return allHousingCandidates(items.data.items);
  }, [items.data, recipes.data, tab]);

  const run = useMutation<ScanResult>({
    mutationFn: async () => {
      if (!items.data || !recipes.data) throw new Error('Snapshot not ready');
      const cappedFrom = candidateIds.length;
      const ids = candidateIds.slice(0, MAX_CANDIDATES);

      const market = await fetchInBatches<MarketItem>(
        ids, (chunk) => fetchMarketData(world, chunk), { chunkSize: 100, concurrency: 4 },
      );

      // Bounded momentum: pick the top-N by velocity, fetch their history in chunks.
      const topIds = [...ids]
        .sort((a, b) => (market.data[String(b)]?.velocity ?? 0) - (market.data[String(a)]?.velocity ?? 0))
        .slice(0, TOP_N_HISTORY);
      const history = new Map<number, HistoryEntry[]>();
      for (let i = 0; i < topIds.length; i += HISTORY_CHUNK) {
        const chunk = topIds.slice(i, i + HISTORY_CHUNK);
        const got = await fetchHistoryWithin(dc, chunk, THIRTY_DAYS_SEC);
        for (const [id, entries] of got) history.set(id, entries);
      }

      return { market: market.data, history, skipped: market.errors.length, cappedFrom };
    },
  });

  const rows = useMemo<HousingRow[]>(() => {
    if (!items.data || !recipes.data || !run.data) return [];
    const sortKey = TABS.find((t) => t.id === tab)!.sort;
    const built = candidateIds.slice(0, MAX_CANDIDATES).flatMap((id) => {
      const item = itemById.get(id);
      if (!item) return [];
      const market = run.data!.market[String(id)];
      const recipe = recipes.data!.get(id);
      const materialCost = recipe ? housingMaterialCost(recipe, run.data!.market) : 0;
      return [buildHousingRow({
        item, market, recipe, materialCost, history: run.data!.history.get(id), now,
      })];
    });
    return sortHousingRows(built, sortKey);
  }, [items.data, recipes.data, run.data, candidateIds, itemById, tab, now]);

  const notReady = !items.data || !recipes.data;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id} type="button"
            onClick={() => { setTab(t.id); run.reset(); }}
            className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${
              tab === t.id ? 'border-gold text-gold' : 'border-border-base text-text-dim hover:text-aether'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { run.reset(); run.mutate(); }}
          disabled={run.isPending || notReady}
          className="font-mono text-[10px] tracking-widest uppercase bg-gold text-bg-deep px-4 py-2 hover:opacity-90 disabled:opacity-50 sm:ml-auto"
        >
          {run.isPending ? 'Scanning…' : 'Scan prices'}
        </button>
      </div>

      <div className="font-mono text-[10px] text-text-low">
        {notReady ? 'Loading catalog…' : `${candidateIds.length.toLocaleString()} candidate items`}
        {candidateIds.length > MAX_CANDIDATES && <span className="text-gold"> · showing first {MAX_CANDIDATES} — narrow with the tab</span>}
      </div>

      {run.isPending && <Spinner label="Fetching prices & recent sales…" />}
      {run.isError && <StatusBanner kind="error">Universalis fetch failed: {(run.error as Error).message}</StatusBanner>}

      {run.data && (
        <ResultTableScaffold<HousingRow>
          rows={rows}
          totalCandidates={Math.min(candidateIds.length, MAX_CANDIDATES)}
          skippedChunks={run.data.skipped}
          emptyState={<EmptyResults>No housing items matched. Try another tab or scan again.</EmptyResults>}
          renderTable={(visible) => (
            <table className="w-full text-sm">
              <thead>
                <tr className="font-mono text-[10px] tracking-widest uppercase text-text-low text-left border-b border-border-base">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Sales/day</th>
                  <th className="px-3 py-2 text-right">Momentum</th>
                  <th className="px-3 py-2 text-right">Craft margin</th>
                  <th className="px-3 py-2 text-right">Gil/day</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-b border-border-base/50">
                    <td className="px-3 py-2"><ItemNameLinks id={r.id} name={r.name} /></td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.price != null ? fmtGil(r.price) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.velocity.toFixed(1)}</td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${r.momentumPct == null ? 'text-text-low' : r.momentumPct >= 0 ? 'text-jade' : 'text-crimson'}`}>
                      {r.momentumPct == null ? '—' : `${r.momentumPct >= 0 ? '+' : ''}${Math.round(r.momentumPct)}%`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.craftMargin != null ? fmtGil(r.craftMargin) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-gold">{r.craftGilPerDay != null ? fmtGil(r.craftGilPerDay) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        />
      )}

      {!run.data && !run.isPending && (
        <EmptyResults>Pick a tab and hit “Scan prices” to rank housing items by craft opportunity and recent momentum.</EmptyResults>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and fix any signature mismatches**

Run: `npx tsc --noEmit`.
Confirm these against the real files and fix the code if any differ (do NOT guess — read the file):
- `useItemSnapshot().data` shape is `{ items: SnapshotItem[] }` (used as `items.data.items`).
- `fetchInBatches` generic + return is `{ data: Record<string, MarketItem>, errors: unknown[] }` (see `VendorFlipView.tsx` usage).
- `useSettingsStore` exposes `world` and `dc` (strings).

If any differ, adapt the affected lines minimally and note what you changed.

- [ ] **Step 3: Run the full suite to confirm no regressions**

Run: `npx vitest run` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/features/housing/HousingMarketView.tsx
git commit -m "feat: add housing market view with tabs and momentum scan"
```

---

### Task 6: Route, page, and navigation wiring

**Files:**
- Create: `src/routes/Housing.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create the route page `src/routes/Housing.tsx`**

```tsx
import { LotteryClockBanner } from '../features/housing/LotteryClockBanner';
import { HousingMarketView } from '../features/housing/HousingMarketView';

export default function Housing() {
  return (
    <div className="max-w-5xl mx-auto px-4 space-y-6">
      <LotteryClockBanner />
      <HousingMarketView />
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `src/App.tsx`**

Add the import alongside the other route imports near the top of the file (match the existing default-import style, e.g. after `import QuestItems from './routes/QuestItems';`):
```tsx
import Housing from './routes/Housing';
```
Add the route inside `<Routes>` (next to the other Gil-Making routes like `/vendor-flip`):
```tsx
            <Route path="/housing" element={<Housing />} />
```
Add the page title to `PAGE_TITLES`:
```tsx
  '/housing': 'Housing',
```

- [ ] **Step 3: Add the nav link in `src/components/layout/Sidebar.tsx`**

In `NAV_GROUPS`, add to the `'Gil-Making'` group's `items` array:
```tsx
      { label: 'Housing', path: '/housing' },
```

- [ ] **Step 4: Typecheck, lint-free, full suite**

Run: `npx tsc --noEmit` → no errors.
Run: `npx vitest run` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Housing.tsx src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: wire up /housing route and nav"
```

---

## Self-Review Notes

- **Spec coverage:** lottery clock (Task 1 + banner Task 4), candidate derivation for 3 tabs (Task 2), row signal incl. craft margin/gil-day + momentum + material cost + sort (Task 3), the 3-tab page with rate-limit-aware scan (current market batched + bounded top-N history) and the `MAX_CANDIDATES` cap with a visible notice (Task 5), routing/nav (Task 6). Non-goals respected: no backtest, no alerts, no catalog-wide history (top-N bounded), no bundled snapshot.
- **Type consistency:** `HousingRow` (with `id` for ResultTableScaffold), `HousingSortKey`, `LotteryStatus` defined once and consumed by banner/view. `buildHousingRow`/`housingMaterialCost`/`sortHousingRows` signatures match their call sites in the view.
- **Pre-verified:** ResultTableScaffold props/`useLoadMore` pagination; `fetchHistoryWithin` multi-item single-request; verdict helper signatures; `categoriesByGroup('Housing')`; Sidebar `NAV_GROUPS` + App route/title patterns.
- **Flagged for implementer verification (Task 5 Step 2):** `useItemSnapshot().data.items` shape, `fetchInBatches` generic/return, and `useSettingsStore` field names — explicit fix-don't-guess instructions with the concrete `itemById` replacement provided.
- **Calibration:** `LOTTERY_ANCHOR_UTC` time-of-day is the single constant to confirm with the user post-implementation (does not block correctness at day granularity).
