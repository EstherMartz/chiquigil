# Reposts (Camp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reposts (camp)" preset to `/queries` that surfaces items where the cheapest home-world listing sits well below the next-distinct price — buy-and-relist opportunities the user can act on without travel.

**Architecture:** Migrate `QueryFilter.craftableOnly: boolean` → `QueryFilter.mode: 'standard' | 'craft' | 'repost'` (atomic refactor; covers 7 files). Add `QueryFilter.minGap: number | null`. Implement a new pure `runRepost(snapshot, priceMap, filter)` that scans `worldListings` per tier, finds the cheapest-to-wall gap, applies tax, and ranks by gil/day. New `RepostResults` table component. Route's `derived` switches on `filter.mode`.

**Tech Stack:** Same as today. No new deps.

**Approval:** Design approved in conversation. Spec: `docs/superpowers/specs/2026-05-11-reposts-camp-design.md`.

---

## Conventions

- TDD for the pure helper.
- One commit per task.
- `npm test -- --run` + `npm run build` stay green at every commit.
- Run from `c:/Users/esthe/Documents/Dev/ffxiv-helper`.

---

## Task 1: Migrate `craftableOnly` → `mode`, add `minGap`

This is the foundation. Atomic refactor: a single commit covering type, presets, builder UI, route, and the two `baseFilter` test fixtures. The behavior at HEAD after this task is identical to before — only the field name changed and a new (unused) field was added.

**Files:**
- Modify: `src/features/queries/types.ts`
- Modify: `src/features/queries/presets.ts`
- Modify: `src/features/queries/presets.test.ts`
- Modify: `src/features/queries/QueryBuilder.tsx`
- Modify: `src/routes/Queries.tsx`
- Modify: `src/features/queries/runQuery.test.ts`
- Modify: `src/features/queries/runCraftFlip.test.ts`

### Step 1: Update types

Replace `src/features/queries/types.ts` contents with:

```ts
export type HqMode = 'hq' | 'nq' | 'either';
export type QuerySort = 'discount' | 'gilFlow' | 'velocity' | 'unitPrice';
export type QueryScope = 'home' | 'dc';
export type QueryMode = 'standard' | 'craft' | 'repost';

export interface QueryFilter {
  searchCategories: number[];
  hq: HqMode;
  minDealPct: number;
  minVelocity: number;
  minPrice: number | null;
  maxPrice: number | null;
  sort: QuerySort;
  limit: number;
  scope: QueryScope;
  maxListings: number | null;
  mode: QueryMode;
  minGap: number | null;
}

export interface QueryPreset {
  id: string;
  label: string;
  desc: string;
  filter: QueryFilter;
}

export interface QueryResultRow {
  id: number;
  name: string;
  sc: number;
  unitPrice: number;
  averagePrice: number;
  dealPct: number;
  velocity: number;
  gilFlow: number;
  hq: boolean;
}

export interface CraftFlipRow {
  id: number;
  name: string;
  sc: number;
  unitPrice: number;
  materialCost: number;
  profit: number;
  velocity: number;
  gilPerDay: number;
  hq: boolean;
}

export interface RepostRow {
  id: number;
  name: string;
  sc: number;
  cheapest: number;
  wall: number;
  gap: number;
  gapPct: number;
  taxedProfit: number;
  velocity: number;
  gilPerDay: number;
  hq: boolean;
}

export function filterHash(f: QueryFilter): string {
  return JSON.stringify({
    sc: [...f.searchCategories].sort((a, b) => a - b),
    hq: f.hq,
    d: f.minDealPct,
    v: f.minVelocity,
    p: [f.minPrice, f.maxPrice],
    s: f.sort,
    l: f.limit,
    scope: f.scope,
    ml: f.maxListings,
    m: f.mode,
    g: f.minGap,
  });
}
```

### Step 2: Update presets

Edit `src/features/queries/presets.ts`. Translate every preset's filter:

- Replace `craftableOnly: false` with `mode: 'standard'`.
- Replace `craftableOnly: true` with `mode: 'craft'`.
- Add `minGap: null` to every preset's filter.

After edit, the 6 existing presets should have their filters look like (showing only the changed/new parts; keep all other fields as-is):

```ts
// mega-value-hq, fast-sellers-hq, food-potions, furnishings:
// ...existing fields, scope: 'dc', maxListings: null,
mode: 'standard', minGap: null

// undersupply, craft-flip:
// ...existing fields, scope: 'home', maxListings: 2 (or null),
mode: 'craft', minGap: null
```

DO NOT add the new Reposts preset in this task (that's Task 3).

### Step 3: Update presets.test.ts

Open `src/features/queries/presets.test.ts`. Find the three tests that reference `craftableOnly` and translate:

- `existing four presets default to dc scope, no list cap, non-craftable mode` test: replace `expect(p.filter.craftableOnly).toBe(false);` with `expect(p.filter.mode).toBe('standard');`.
- `undersupply preset is home-scope, maxListings 2, craftable-only` test: replace `expect(p.filter.craftableOnly).toBe(true);` with `expect(p.filter.mode).toBe('craft');`.
- `craft-flip preset is home-scope, no list cap, craftable-only` test: same translation.

### Step 4: Update QueryBuilder

Open `src/features/queries/QueryBuilder.tsx`. Two changes:

1. **Update imports:** change
```ts
import type { HqMode, QueryFilter, QueryScope, QuerySort } from './types';
```
to:
```ts
import type { HqMode, QueryFilter, QueryMode, QueryScope, QuerySort } from './types';
```

2. **Replace the "Craftable only" checkbox** with a Mode select. Find the existing `<label className="flex items-center gap-2 mt-5 text-sm">` cell (the one with `craftableOnly` checkbox). Replace it with:
```tsx
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Mode</span>
          <select
            value={value.mode}
            onChange={(e) => patch({ mode: e.target.value as QueryMode })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
          >
            <option value="standard">Standard</option>
            <option value="craft">Craft-flip</option>
            <option value="repost">Reposts</option>
          </select>
        </label>
```

DO NOT add the Min gap input in this task (that's Task 5).

### Step 5: Update Queries.tsx

Open `src/routes/Queries.tsx`. Translate every `craftableOnly` reference to `mode === 'craft'`:

- In `mutationFn`, `filter.craftableOnly ? narrowForCraftFlip(...) : []` becomes `filter.mode === 'craft' ? narrowForCraftFlip(...) : []`.
- In `derived` useMemo, `if (f.craftableOnly) { ... }` becomes `if (f.mode === 'craft') { ... }`.
- In QueryBuilder `busy` prop: `run.isPending || (filter.craftableOnly && recipes.isLoading)` becomes `run.isPending || (filter.mode === 'craft' && recipes.isLoading)`.
- In the narrowed-count hint: `run.data?.filterAtRun.craftableOnly` becomes `run.data?.filterAtRun.mode === 'craft'`.
- In the Spinner conditional: `run.data?.filterAtRun.craftableOnly && recipes.isLoading` becomes `run.data?.filterAtRun.mode === 'craft' && recipes.isLoading`.

(Five occurrences total. Verify with: `grep -n craftableOnly src/routes/Queries.tsx` — should return zero hits after the edit.)

### Step 6: Update runQuery.test.ts baseFilter

Open `src/features/queries/runQuery.test.ts`. Find `baseFilter` and replace `craftableOnly: false` with `mode: 'standard', minGap: null`. (Two new keys, one removed.)

### Step 7: Update runCraftFlip.test.ts baseFilter

Open `src/features/queries/runCraftFlip.test.ts`. Find `baseFilter` and replace `craftableOnly: true` with `mode: 'craft', minGap: null`.

### Step 8: Verify build + tests

```bash
npm run build
npm test -- --run
```

Expected: clean build, all 189 tests pass. Behavior unchanged.

Sanity check: `grep -rn craftableOnly src/ --include='*.ts' --include='*.tsx'` should return zero hits.

### Step 9: Commit

```bash
git add src/features/queries/types.ts src/features/queries/presets.ts src/features/queries/presets.test.ts src/features/queries/QueryBuilder.tsx src/routes/Queries.tsx src/features/queries/runQuery.test.ts src/features/queries/runCraftFlip.test.ts
git commit -m "refactor(queries): craftableOnly -> mode + add minGap field"
```

---

## Task 2: `runRepost` pure helper

**Files:**
- Create: `src/features/queries/runRepost.ts`
- Create: `src/features/queries/runRepost.test.ts`

### Step 1: Write failing tests

Write `src/features/queries/runRepost.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runRepost } from './runRepost';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData } from '../../lib/universalis';
import type { QueryFilter } from './types';

const snapshot: SnapshotItem[] = [
  { id: 1, name: 'Pixie Cotton',  sc: 50, ui: 30, ilvl: 90, canHq: true },
  { id: 2, name: 'Tied Sellers',  sc: 50, ui: 30, ilvl: 90, canHq: true },
  { id: 3, name: 'NQ Only',       sc: 50, ui: 30, ilvl: 1,  canHq: false },
];

function mkPrice(args: { velocity?: number; listingCount?: number; listings: Array<{ price: number; hq: boolean }> }): MarketData[string] {
  const listings = args.listings;
  const nq = listings.filter((l) => !l.hq).map((l) => l.price).sort((a, b) => a - b);
  const hq = listings.filter((l) => l.hq).map((l) => l.price).sort((a, b) => a - b);
  return {
    minNQ: nq[0] ?? null,
    minHQ: hq[0] ?? null,
    avgNQ: null, avgHQ: null,
    velocity: args.velocity ?? 1,
    lastUploadTime: Date.now(),
    listingCount: args.listingCount ?? listings.length,
    worldListings: listings.map((l) => ({ world: 'Phantom', price: l.price, hq: l.hq })),
    averagePriceNQ: null, averagePriceHQ: null,
  };
}

const baseFilter: QueryFilter = {
  searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0,
  minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
  scope: 'home', maxListings: null, mode: 'repost', minGap: null,
};

describe('runRepost', () => {
  it('finds gap between cheapest and next strictly-higher price, taxed at 5%', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        listings: [{ price: 100, hq: false }, { price: 200, hq: false }, { price: 300, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, baseFilter);
    expect(out).toHaveLength(1);
    expect(out[0].cheapest).toBe(100);
    expect(out[0].wall).toBe(200);
    expect(out[0].gap).toBe(100);
    expect(out[0].gapPct).toBe(50); // round(100/200 * 100)
    expect(out[0].taxedProfit).toBe(90); // round(200 * 0.95 - 100)
    expect(out[0].hq).toBe(false);
  });

  it('skips items with all listings tied at the bottom (no wall)', () => {
    const priceMap: MarketData = {
      2: mkPrice({
        listings: [{ price: 100, hq: false }, { price: 100, hq: false }, { price: 100, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, baseFilter);
    expect(out).toEqual([]);
  });

  it('skips items with fewer than 2 listings on the relevant tier', () => {
    const priceMap: MarketData = {
      1: mkPrice({ listings: [{ price: 100, hq: false }] }),
    };
    const out = runRepost(snapshot, priceMap, baseFilter);
    expect(out).toEqual([]);
  });

  it('drops items below minVelocity', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        velocity: 0.5,
        listings: [{ price: 100, hq: false }, { price: 200, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('drops items below minGap (absolute gil)', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        listings: [{ price: 100, hq: false }, { price: 105, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, minGap: 50 });
    expect(out).toEqual([]); // gap is 5, below 50
  });

  it('drops items below minDealPct (gap %)', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        // gap 5, gapPct = round(5/105*100) = 5
        listings: [{ price: 100, hq: false }, { price: 105, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, minDealPct: 30 });
    expect(out).toEqual([]);
  });

  it('picks the larger-gap tier when both NQ and HQ qualify (either mode)', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        listings: [
          { price: 100, hq: false }, { price: 110, hq: false },  // NQ gap 10
          { price: 1000, hq: true }, { price: 1500, hq: true },  // HQ gap 500
        ],
      }),
    };
    const out = runRepost(snapshot, priceMap, baseFilter);
    expect(out).toHaveLength(1);
    expect(out[0].hq).toBe(true);
    expect(out[0].cheapest).toBe(1000);
    expect(out[0].wall).toBe(1500);
  });

  it('respects filter.hq=hq by considering only HQ tier', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        listings: [
          { price: 100, hq: false }, { price: 1000, hq: false },  // NQ gap 900 (would win)
          { price: 200, hq: true }, { price: 300, hq: true },      // HQ gap 100
        ],
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, hq: 'hq' });
    expect(out).toHaveLength(1);
    expect(out[0].hq).toBe(true);
    expect(out[0].cheapest).toBe(200);
  });

  it('respects filter.hq=hq by dropping non-canHq items', () => {
    const priceMap: MarketData = {
      3: mkPrice({  // canHq=false
        listings: [{ price: 100, hq: false }, { price: 200, hq: false }],
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, hq: 'hq' });
    expect(out).toEqual([]);
  });

  it('sorts by gilFlow desc and slices to limit', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        velocity: 2,
        listings: [{ price: 100, hq: false }, { price: 200, hq: false }],
        // taxedProfit = 90, gilPerDay = 180
      }),
      2: mkPrice({
        velocity: 10,
        listings: [{ price: 50, hq: false }, { price: 100, hq: false }],
        // taxedProfit = round(95 - 50) = 45, gilPerDay = 450
      }),
    };
    const out = runRepost(snapshot, priceMap, { ...baseFilter, limit: 2 });
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
});
```

### Step 2: Run tests, expect failure

```bash
npx vitest --run src/features/queries/runRepost.test.ts
```

Expected: FAIL — module not defined.

### Step 3: Implement

Write `src/features/queries/runRepost.ts`:

```ts
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, WorldListing } from '../../lib/universalis';
import type { HqMode, QueryFilter, QuerySort, RepostRow } from './types';

interface TierCandidate {
  cheapest: number;
  wall: number;
  isHq: boolean;
}

function findGapForTier(listings: WorldListing[], isHq: boolean): TierCandidate | null {
  const prices = listings.filter((l) => l.hq === isHq).map((l) => l.price).sort((a, b) => a - b);
  if (prices.length < 2) return null;
  const cheapest = prices[0];
  const wall = prices.find((p) => p > cheapest);
  if (wall == null) return null;
  return { cheapest, wall, isHq };
}

function tiersToCheck(hq: HqMode, canHq: boolean): boolean[] {
  if (hq === 'nq') return [false];
  if (hq === 'hq') return canHq ? [true] : [];
  // 'either'
  return canHq ? [true, false] : [false];
}

function compare(a: RepostRow, b: RepostRow, sort: QuerySort): number {
  switch (sort) {
    case 'gilFlow':   return b.gilPerDay - a.gilPerDay;
    case 'discount':  return b.gapPct - a.gapPct;
    case 'unitPrice': return b.cheapest - a.cheapest;
    case 'velocity':  return b.velocity - a.velocity;
  }
}

export function runRepost(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  filter: QueryFilter,
): RepostRow[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: RepostRow[] = [];

  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    const m = priceMap[item.id];
    if (!m) continue;
    if (m.velocity < filter.minVelocity) continue;
    if (filter.maxListings != null && m.listingCount > filter.maxListings) continue;

    const tiers = tiersToCheck(filter.hq, item.canHq);
    const candidates: TierCandidate[] = [];
    for (const isHq of tiers) {
      const c = findGapForTier(m.worldListings, isHq);
      if (c) candidates.push(c);
    }
    if (candidates.length === 0) continue;

    const best = candidates.reduce((a, b) => ((a.wall - a.cheapest) >= (b.wall - b.cheapest) ? a : b));
    const gap = best.wall - best.cheapest;
    const gapPct = Math.round((gap / best.wall) * 100);
    const taxedProfit = Math.round(best.wall * 0.95 - best.cheapest);

    if (filter.minGap != null && gap < filter.minGap) continue;
    if (gapPct < filter.minDealPct) continue;
    if (taxedProfit <= 0) continue;
    if (filter.minPrice != null && best.cheapest < filter.minPrice) continue;
    if (filter.maxPrice != null && best.cheapest > filter.maxPrice) continue;

    out.push({
      id: item.id,
      name: item.name,
      sc: item.sc,
      cheapest: best.cheapest,
      wall: best.wall,
      gap,
      gapPct,
      taxedProfit,
      velocity: m.velocity,
      gilPerDay: taxedProfit * m.velocity,
      hq: best.isHq,
    });
  }

  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
```

### Step 4: Run tests, expect 10 passing

```bash
npx vitest --run src/features/queries/runRepost.test.ts
```

Expected: 10 passed.

### Step 5: Commit

```bash
git add src/features/queries/runRepost.ts src/features/queries/runRepost.test.ts
git commit -m "feat(queries): runRepost pure helper finds wall-gap opportunities"
```

---

## Task 3: Reposts preset

**Files:**
- Modify: `src/features/queries/presets.ts`
- Modify: `src/features/queries/presets.test.ts`

### Step 1: Add the preset

Open `src/features/queries/presets.ts`. After the existing `craft-flip` preset, add inside the `PRESETS` array:

```ts
  {
    id: 'reposts', label: 'Reposts (camp)',
    desc: 'Home-world items where the cheapest listing is ≥10k below the next price (gap ≥30%). Buy + relist for instant gil.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 30, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: null, mode: 'repost', minGap: 10_000 },
  },
```

### Step 2: Add a test assertion

Append inside the existing `describe('PRESETS', ...)` block in `src/features/queries/presets.test.ts`:

```ts
  it('reposts preset is home-scope mode=repost with minGap 10k', () => {
    const p = getPreset('reposts')!;
    expect(p.filter.mode).toBe('repost');
    expect(p.filter.scope).toBe('home');
    expect(p.filter.minGap).toBe(10_000);
    expect(p.filter.minDealPct).toBe(30);
  });
```

### Step 3: Run tests, expect 10 passing (9 old + 1 new)

```bash
npx vitest --run src/features/queries/presets.test.ts
```

### Step 4: Commit

```bash
git add src/features/queries/presets.ts src/features/queries/presets.test.ts
git commit -m "feat(queries): reposts (camp) preset"
```

---

## Task 4: `RepostResults` component

**Files:**
- Create: `src/features/queries/RepostResults.tsx`

### Step 1: Implement

Write `src/features/queries/RepostResults.tsx`:

```tsx
import { fmtGil } from '../../lib/format';
import { categoryLabel } from '../../lib/itemSearchCategories';
import type { RepostRow } from './types';

interface Props {
  rows: RepostRow[];
  totalCandidates: number;
  skippedChunks: number;
}

export function RepostResults({ rows, totalCandidates, skippedChunks }: Props) {
  if (rows.length === 0) {
    return (
      <div className="border border-border-base bg-bg-card p-6 text-text-low text-sm italic">
        No repost opportunities. Lower Min gap, lower Min discount %, or widen categories.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] text-text-low">
        Showing {rows.length} of {totalCandidates} candidates
        {skippedChunks > 0 && <span className="text-crimson"> · {skippedChunks} batch(es) skipped (Universalis error)</span>}
      </div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-dim font-mono text-[10px] tracking-widest uppercase">
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Cheapest</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Wall</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Gap</th>
              <th className="text-right px-3 py-2">%</th>
              <th className="text-right px-3 py-2">Profit (after tax)</th>
              <th className="text-right px-3 py-2 hidden md:table-cell">Vel</th>
              <th className="text-right px-3 py-2">Gil / day</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi">
                <td className="px-3 py-2.5 font-mono text-text-low">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="text-text-cream">{r.name} {r.hq && <span className="text-gold">★</span>}</div>
                  <div className="font-mono text-[10px] text-text-low">{categoryLabel(r.sc)}</div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono">{fmtGil(r.cheapest)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-text-low hidden md:table-cell">{fmtGil(r.wall)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-jade hidden md:table-cell">+{fmtGil(r.gap)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-jade">{r.gapPct}%</td>
                <td className="px-3 py-2.5 text-right font-mono text-jade">+{fmtGil(r.taxedProfit)}</td>
                <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">{r.velocity.toFixed(1)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gold-hi">{fmtGil(Math.round(r.gilPerDay))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Step 2: Build

```bash
npm run build
```

Expected: clean.

### Step 3: Commit

```bash
git add src/features/queries/RepostResults.tsx
git commit -m "feat(queries): RepostResults table component"
```

---

## Task 5: QueryBuilder — Min gap input

**Files:**
- Modify: `src/features/queries/QueryBuilder.tsx`

### Step 1: Add the input

Open `src/features/queries/QueryBuilder.tsx`. Find the existing `Max listings` `<label>` block (the cell that holds the maxListings number input). Immediately AFTER it (before the Mode select that Task 1 added), insert:

```tsx
        <label className="block">
          <span className="font-mono text-[10px] tracking-widest text-text-low uppercase">Min gap (gil)</span>
          <input
            type="number" min={0} step={1000}
            value={value.minGap ?? ''}
            onChange={(e) => patch({ minGap: nullableIntInput(e) })}
            className="mt-1 block w-full bg-bg-card border border-border-base px-3 py-2 font-mono text-sm"
            title="Absolute gil floor for repost gap"
          />
        </label>
```

### Step 2: Build

```bash
npm run build
```

Expected: clean.

### Step 3: Commit

```bash
git add src/features/queries/QueryBuilder.tsx
git commit -m "feat(queries): QueryBuilder Min gap input"
```

---

## Task 6: Queries route — repost branch in derived

**Files:**
- Modify: `src/routes/Queries.tsx`

### Step 1: Update imports

At the top of `src/routes/Queries.tsx`, add to the imports:

```tsx
import { runRepost } from '../features/queries/runRepost';
import { RepostResults } from '../features/queries/RepostResults';
import type { QueryFilter, QueryResultRow, CraftFlipRow, RepostRow } from '../features/queries/types';
```

(The `RepostRow` type joins the existing types import. Adjust the existing import statement.)

### Step 2: Refactor `derived` to a switch on `filter.mode`

Find the existing `derived` useMemo. Replace its body with:

```tsx
  const derived = useMemo(() => {
    if (!run.data || !snapshot.data) return null;
    const f = run.data.filterAtRun;
    switch (f.mode) {
      case 'craft': {
        if (run.data.narrowedIds.length === 0) {
          return { kind: 'craft' as const, rows: [] as CraftFlipRow[] };
        }
        if (!recipes.data) return null;
        const rows = runCraftFlip(snapshot.data.items, run.data.priceMap, recipes.data, f);
        return { kind: 'craft' as const, rows };
      }
      case 'repost': {
        const rows: RepostRow[] = runRepost(snapshot.data.items, run.data.priceMap, f);
        return { kind: 'repost' as const, rows };
      }
      case 'standard':
      default: {
        const rows: QueryResultRow[] = runQuery(snapshot.data.items, run.data.priceMap, f);
        return { kind: 'query' as const, rows };
      }
    }
  }, [run.data, recipes.data, snapshot.data]);
```

### Step 3: Add the RepostResults render case

In the JSX, after the existing `derived?.kind === 'craft'` block, add:

```tsx
          {derived?.kind === 'repost' && (
            <RepostResults
              rows={derived.rows}
              totalCandidates={candidateIds.length}
              skippedChunks={run.data?.skipped ?? 0}
            />
          )}
```

### Step 4: Verify build + tests

```bash
npm run build
npm test -- --run
```

Expected: clean build, ~199 tests pass (189 existing + 10 from runRepost in Task 2 + 1 from preset in Task 3 — minus any test that was actually counted differently; aim for green, exact number is approximate).

### Step 5: Commit

```bash
git add src/routes/Queries.tsx
git commit -m "feat(queries): route derives repost mode + renders RepostResults"
```

---

## Task 7: Smoke test for Reposts

**Files:**
- Modify: `src/routes/Queries.test.tsx`

### Step 1: Append the test

Inside the existing `describe('Queries route', ...)` block in `src/routes/Queries.test.tsx`, after the last test, append:

```tsx
  it('Reposts preset: surfaces wall-gap opportunities, drops tied-sellers', async () => {
    await putCachedItems([
      { id: 300, name: 'Pixie Cotton',  sc: 50, ui: 30, ilvl: 90, canHq: true },
      { id: 301, name: 'Tied Sellers',  sc: 50, ui: 30, ilvl: 90, canHq: true },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: {
          // Pixie Cotton: NQ listings 80k / 150k / 150k / 150k / 150k → gap 70k, gapPct 47%, taxedProfit 62500
          '300': {
            listings: [
              { hq: false, pricePerUnit: 80_000,  worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 150_000, worldName: 'Phantom' },
            ],
            recentHistory: [],
            regularSaleVelocity: 1.5,
            lastUploadTime: Date.now(),
            averagePriceNQ: 130_000,
            averagePriceHQ: null,
          },
          // Tied Sellers: all listings tied → no wall → filtered out
          '301': {
            listings: [
              { hq: false, pricePerUnit: 100_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 100_000, worldName: 'Phantom' },
              { hq: false, pricePerUnit: 100_000, worldName: 'Phantom' },
            ],
            recentHistory: [],
            regularSaleVelocity: 5,
            lastUploadTime: Date.now(),
            averagePriceNQ: 100_000,
            averagePriceHQ: null,
          },
        },
      }),
    }));

    render(withProviders(<Queries />));
    fireEvent.click(await screen.findByRole('button', { name: /reposts \(camp\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /run query/i }));

    await waitFor(
      () => expect(screen.getByText(/Pixie Cotton/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByText(/Tied Sellers/)).toBeNull();
  });
```

### Step 2: Run tests

```bash
npx vitest --run src/routes/Queries.test.tsx
```

Expected: 4 passed (3 existing + 1 new).

### Step 3: Commit

```bash
git add src/routes/Queries.test.tsx
git commit -m "test(queries): Reposts preset smoke test"
```

---

## Task 8: README + final verification

**Files:**
- Modify: `README.md`

### Step 1: Update the Best Deals Queries section

Open `README.md`. Find the existing "Best Deals Queries" section. Update the "Home-world presets (no travel)" sub-list to ADD a third bullet for Reposts. The whole sub-list should read:

```markdown
- **Home-world presets (no travel):**
  - *Undersupply (craft + list)* — items selling on your home world with ≤2 listings.
    Craft and list to fill a real supply gap.
  - *Craft-flip Phantom* — craftable items ranked by `(sale − material cost) × velocity`
    on your home world. Lazy recipe lookup over the narrowed candidate set.
  - *Reposts (camp)* — home-world items where the cheapest listing is ≥10k and ≥30%
    below the next-distinct price. Buy + relist for instant gil; profit is shown
    after the 5% Universalis tax.
```

Also update the **Builder** bullet — change `Craftable-only toggle that swaps in the craft-flip pipeline` to `Mode select (Standard / Craft-flip / Reposts) that swaps pipelines`.

### Step 2: Full test + build

```bash
npm test -- --run
npm run build
```

Expected: all tests pass (~200), clean build. If anything fails, stop and report BLOCKED — do not commit.

### Step 3: Commit

```bash
git add README.md
git commit -m "docs: Reposts (camp) preset in README"
```

---

## Done when

- `npm test -- --run` green.
- `npm run build` clean.
- `/queries` shows 7 preset chips.
- Clicking **Reposts (camp)** runs the new pipeline: home-world Universalis fetch → `runRepost` → `RepostResults` table with Cheapest / Wall / Gap / % / Profit (after tax) / Velocity / Gil/day columns.
- QueryBuilder shows a **Mode** select (Standard / Craft-flip / Reposts) + a **Min gap** input. Switching mode + clicking Run swaps pipelines.
- The four DC presets still produce the same results as before the migration (Standard mode).
- The two home craft presets (Undersupply, Craft-flip Phantom) still produce the same results (Craft mode).
- No regressions outside the `/queries` route.
