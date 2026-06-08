# Crafts Page — Competitor Listing Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface competitor listing-safety signals (price gap to next tier, seller concentration, time-to-clear, capture rate, and a composite RISK label) directly in the Crafts scan results, plus a Max-risk post-scan filter — reusing the item detail page's existing market-analysis logic.

**Architecture:** This is an additive, mostly-UI change. The Crafts scan already loads each item's full `worldListings[]` (up to 50 listings *with seller names*) into `priceMap` from the shared market cache — the same data the item detail page uses for its Supply Depth / Seller Concentration panels. We compute the new signals during `runCraftFlip()` by calling existing pure helpers (`concentrationHHI`, `supplyDepth`, `captureShare`, `depthBuckets`) plus one new gap helper and one composite-risk classifier, store them on `CraftFlipRow`, and render them in `CraftFlipResults`. The Max-risk filter is a live, post-scan client-side re-filter that does **not** trigger a re-scan.

**Tech Stack:** TypeScript, React, Vite, Vitest, TailwindCSS. No backend/lambda changes (no new network calls).

---

## Key facts established during investigation (read before starting)

- **Data is already present at scan time.** `priceMap[id]` is a `MarketItem` (`src/lib/universalis.ts:8-29`) whose `worldListings: WorldListing[]` (`{ world, price, hq, quantity?, seller? }`) carries up to 50 cheapest listings **with `seller` populated** (the cache writer at `src/lib/universalis.ts:55-61` always serializes `seller: l.retainerName ?? ''`). The Crafts scan and the item detail page read the **same** cached `worldListings`. → **No extra fetch, no lambda change.**
- **Reusable pure helpers (call, do not reimplement):**
  - `concentrationHHI(listings: WorldListing[], hq: boolean): Concentration | null` — `src/features/items/concentration.ts:16`. Returns `{ hhi, topSellerShare /*0..1*/, sellerCount, risk: 'thin'|'moderate'|'deep' }`. Filters to one quality tier and to listings with a truthy `seller`.
  - `supplyDepth(listings: number, velocity: number): { days: number | null; note: string }` — `src/features/items/ActivityCard.tsx:21`. `days = listings / velocity` (the "~Xd to clear" value). `days` is `null` when velocity ≤ 0.
  - `captureShare(listingCount: number): number` — `src/features/items/verdict/pricing.ts:22`. `1/(1+N)`. **This is the value the item page shows as "~X% capture"** (e.g. 10 listings → 1/11 ≈ 9%). The PRD's prose ("% of DC volume") is a misnomer; we reuse the app's existing definition and matching number.
  - `depthBuckets(listings: WorldListing[], hq: boolean): DepthBucket[]` — `src/features/items/depth.ts:14`. 8 equal-width price buckets, each `{ priceLow, priceHigh, units, sellers, listings }`. Used by the FR-6 popover to mirror the item page's Supply Depth panel.
- **Sale tier:** `runCraftFlip` already picks the quality tier via `pickFirstTrustedTier(m, filter.hq, item.canHq)` → `tier.unit` (sale price) and `tier.isHq` (which quality). Use `tier.isHq` as the `hq` argument for gap/concentration/depth so the analysis matches the sale price's quality.
- **Clear/capture inputs:** mirror the item page — use `m.listingCount` and `m.velocity` (NOT a per-tier count) for `supplyDepth` and `captureShare`.
- **Post-scan re-filter mechanics:** `derived` in `QueriesView.tsx:118-140` computes rows from `run.data.filterAtRun` (the filter captured at scan time), and `stale` (`:114`) is currently `run.data.filterAtRun !== filter` (object identity) — so today *any* live filter edit marks results stale and needs a re-scan. To make Max-risk a true immediate re-filter without a re-scan, we (a) keep `maxRisk` **out of** `filterHash`, (b) switch `stale` to compare `filterHash(filterAtRun) !== filterHash(filter)` so a `maxRisk`-only change is not "stale", and (c) apply `maxRisk` live in a dedicated memo keyed on the current `filter.maxRisk`.
- **Avoid construction-site churn:** `QueryFilter` literals are built in ~15 files (presets, bot tools, tests). Add `maxRisk` as an **optional** field (`maxRisk?: MaxRisk`) and default it at read sites with `?? 'any'`. No preset/bot/test edits required.
- **Color tokens in use:** `text-jade` (profit green), `text-gold-hi`, `text-aether`, `text-text-low`, `text-text-dim`. For the four risk tiers use Tailwind arbitrary values matching the PRD palette: OPEN `text-[#a0e080]`, HEALTHY `text-[#60c060]`, CROWDED `text-[#c0a030]`, DOMINATED `text-[#c04040]`, EMPTY `text-[#a0e080]`. Centralize these in one map (Task 7) so they're consistent.
- **Density:** `useUiStore((s)=>s.density)` → `'comfy' | 'compact'`; `rowPadClass(density)` for row padding. COMPACT must show only the colored dot + RISK label text, no secondary lines (per acceptance criteria).
- **Test fixtures:** follow `src/features/items/concentration.test.ts` (the `l(price, qty, seller, hq?)` helper) and `src/features/queries/runCraftFlip.test.ts` (the `mkPrice(partial)` + `baseFilter` helpers).

---

## File structure

**New files**
- `src/features/queries/craftListingAnalysis.ts` — pure helpers: `listingGap`, `CraftRisk` type, `classifyCraftRisk`, `analyzeCraftListings`, `MaxRisk` type, `passesMaxRisk`, `RISK_ORDER`.
- `src/features/queries/craftListingAnalysis.test.ts` — unit tests for the above.
- `src/features/queries/craftRiskBadges.tsx` — presentational `RiskBadge` (label + dot) and `SellersBadge` (count + dot) components + the shared color/label maps.
- `src/features/queries/CompetitorPopover.tsx` — FR-6 read-only listing-depth + concentration popover content.

**Modified files**
- `src/features/queries/types.ts` — extend `CraftFlipRow`; add `MaxRisk` type + optional `QueryFilter.maxRisk`; add `'risk'` to `QuerySort`. Leave `filterHash` unchanged (no `maxRisk`).
- `src/features/queries/runCraftFlip.ts` — populate the new `CraftFlipRow` fields via `analyzeCraftListings`; add `'risk'` sort to `compare()`.
- `src/lib/queryUrlParams.ts` — round-trip `mr` (maxRisk) param; accept `'risk'` in the `s` (sort) validation.
- `src/features/queries/QueriesView.tsx` — hash-based `stale`; live `maxRisk` re-filter memo; pass `scope` to `CraftFlipResults`.
- `src/features/queries/QueryBuilder.tsx` — add "Max risk" dropdown; add "Risk" to the Sort options.
- `src/features/queries/CraftFlipResults.tsx` — new RISK column, SALE-cell gap + clears lines, sellers badge on item name, popover, COMFY/COMPACT handling, scope-aware hiding, CSV columns.

---

### Task 1: Pure listing-analysis helpers

**Files:**
- Create: `src/features/queries/craftListingAnalysis.ts`
- Test: `src/features/queries/craftListingAnalysis.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/queries/craftListingAnalysis.test.ts
import { describe, it, expect } from 'vitest';
import {
  listingGap, classifyCraftRisk, passesMaxRisk, RISK_ORDER,
} from './craftListingAnalysis';
import type { WorldListing } from '../../lib/universalis';

const l = (price: number, quantity: number, seller: string, hq = false): WorldListing =>
  ({ world: 'Phantom', price, hq, quantity, seller });

describe('listingGap', () => {
  it('reports no second tier and onlyListing for a single listing', () => {
    const g = listingGap([l(100, 1, 'A')], false);
    expect(g.onlyListing).toBe(true);
    expect(g.hasSecondTier).toBe(false);
    expect(g.gap).toBe(0);
    expect(g.gapPct).toBe(Infinity);
  });

  it('reports a 0 gap (tied) when many listings share the cheapest price', () => {
    const g = listingGap([l(100, 1, 'A'), l(100, 1, 'B'), l(100, 1, 'C')], false);
    expect(g.onlyListing).toBe(false);
    expect(g.hasSecondTier).toBe(false);
    expect(g.gap).toBe(0);
    expect(g.gapPct).toBe(0);
  });

  it('computes gap to the next distinct price tier', () => {
    const g = listingGap([l(70_000, 1, 'A'), l(70_000, 1, 'A'), l(200_000, 1, 'B')], false);
    expect(g.hasSecondTier).toBe(true);
    expect(g.secondTier).toBe(200_000);
    expect(g.gap).toBe(130_000);
    expect(g.gapPct).toBeCloseTo(130_000 / 70_000, 5);
  });

  it('ignores the other quality tier', () => {
    const g = listingGap([l(100, 1, 'A', true), l(150, 1, 'B', true), l(50, 1, 'C', false)], true);
    expect(g.cheapest).toBe(100);
    expect(g.secondTier).toBe(150);
  });

  it('returns empty (no listings) for an empty/other-tier list', () => {
    const g = listingGap([l(100, 1, 'A', false)], true);
    expect(g.empty).toBe(true);
    expect(g.onlyListing).toBe(false);
  });
});

describe('classifyCraftRisk', () => {
  const base = {
    empty: false, onlyListing: false, gapPct: 0.1,
    sellerCount: 5, topSellerShare: 0.3, clearDays: 2 as number | null,
  };
  it('EMPTY when there are no listings', () => {
    expect(classifyCraftRisk({ ...base, empty: true })).toBe('EMPTY');
  });
  it('OPEN when a single seller holds the market (one listing)', () => {
    expect(classifyCraftRisk({ ...base, onlyListing: true, sellerCount: 1, topSellerShare: 1, gapPct: Infinity })).toBe('OPEN');
  });
  it('DOMINATED when the top seller holds >60% (and >1 seller)', () => {
    expect(classifyCraftRisk({ ...base, sellerCount: 4, topSellerShare: 0.76 })).toBe('DOMINATED');
  });
  it('DOMINATED when prices are jammed (<2% gap) with a crowd (>5 sellers)', () => {
    expect(classifyCraftRisk({ ...base, sellerCount: 7, topSellerShare: 0.2, gapPct: 0.01 })).toBe('DOMINATED');
  });
  it('OPEN with big gap, few/non-dominant sellers, fast clear', () => {
    expect(classifyCraftRisk({ ...base, gapPct: 0.25, sellerCount: 2, clearDays: 2 })).toBe('OPEN');
  });
  it('CROWDED when stock just sits (>5d to clear)', () => {
    expect(classifyCraftRisk({ ...base, gapPct: 0.1, sellerCount: 4, clearDays: 8 })).toBe('CROWDED');
  });
  it('CROWDED when a large crowd of sellers (>=8)', () => {
    expect(classifyCraftRisk({ ...base, sellerCount: 9, topSellerShare: 0.2, clearDays: 2 })).toBe('CROWDED');
  });
  it('HEALTHY for tied prices when only a few sellers (PRD edge case)', () => {
    expect(classifyCraftRisk({ ...base, gapPct: 0, sellerCount: 3, topSellerShare: 0.4, clearDays: 2 })).toBe('HEALTHY');
  });
  it('defaults to HEALTHY when no rule fires', () => {
    expect(classifyCraftRisk({ ...base, gapPct: 0.1, sellerCount: 4, topSellerShare: 0.5, clearDays: 4 })).toBe('HEALTHY');
  });
});

describe('passesMaxRisk', () => {
  it('any allows everything', () => {
    for (const r of RISK_ORDER) expect(passesMaxRisk(r, 'any')).toBe(true);
  });
  it('healthy excludes CROWDED and DOMINATED', () => {
    expect(passesMaxRisk('OPEN', 'healthy')).toBe(true);
    expect(passesMaxRisk('HEALTHY', 'healthy')).toBe(true);
    expect(passesMaxRisk('EMPTY', 'healthy')).toBe(true);
    expect(passesMaxRisk('CROWDED', 'healthy')).toBe(false);
    expect(passesMaxRisk('DOMINATED', 'healthy')).toBe(false);
  });
  it('open only allows OPEN and EMPTY', () => {
    expect(passesMaxRisk('OPEN', 'open')).toBe(true);
    expect(passesMaxRisk('EMPTY', 'open')).toBe(true);
    expect(passesMaxRisk('HEALTHY', 'open')).toBe(false);
    expect(passesMaxRisk('CROWDED', 'open')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/queries/craftListingAnalysis.test.ts`
Expected: FAIL — `Failed to resolve import './craftListingAnalysis'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/queries/craftListingAnalysis.ts
import type { MarketItem, WorldListing } from '../../lib/universalis';
import { concentrationHHI, type RiskLevel } from '../items/concentration';
import { supplyDepth } from '../items/ActivityCard';
import { captureShare } from '../items/verdict/pricing';
import { depthBuckets, type DepthBucket } from '../items/depth';

/** Composite competitive-safety label for entering a market as a new lister. */
export type CraftRisk = 'EMPTY' | 'OPEN' | 'HEALTHY' | 'CROWDED' | 'DOMINATED';

/** Worst-first ordering, used for the optional RISK sort and for filtering. */
export const RISK_ORDER: CraftRisk[] = ['DOMINATED', 'CROWDED', 'HEALTHY', 'OPEN', 'EMPTY'];

export type MaxRisk = 'any' | 'healthy' | 'open';

// Gap color thresholds (fraction of sale price). Shared with the SALE-cell gap line.
export const GAP_GREEN = 0.20;
export const GAP_AMBER = 0.05;

export interface ListingGap {
  cheapest: number;
  secondTier: number | null;
  gap: number;        // gil from cheapest to the next distinct price tier (0 when none)
  gapPct: number;     // gap / cheapest; Infinity when onlyListing; 0 when tied
  hasSecondTier: boolean;
  onlyListing: boolean; // <=1 listing in this tier — empty above you
  empty: boolean;       // 0 listings in this tier
}

/** Gap from the cheapest listing to the next strictly-higher price, for one quality tier. */
export function listingGap(listings: WorldListing[], hq: boolean): ListingGap {
  const prices = listings
    .filter((x) => x.hq === hq && x.price > 0)
    .map((x) => x.price)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return { cheapest: 0, secondTier: null, gap: 0, gapPct: 0, hasSecondTier: false, onlyListing: false, empty: true };
  }
  const cheapest = prices[0];
  const onlyListing = prices.length <= 1;
  const second = prices.find((p) => p > cheapest) ?? null;
  if (second == null) {
    // No higher tier. Either a single listing (open above you) or everything tied at one price.
    return {
      cheapest, secondTier: null, gap: 0,
      gapPct: onlyListing ? Infinity : 0,
      hasSecondTier: false, onlyListing, empty: false,
    };
  }
  const gap = second - cheapest;
  return {
    cheapest, secondTier: second, gap,
    gapPct: cheapest > 0 ? gap / cheapest : 0,
    hasSecondTier: true, onlyListing: false, empty: false,
  };
}

export interface CraftRiskInput {
  empty: boolean;
  onlyListing: boolean;
  gapPct: number;
  sellerCount: number;
  topSellerShare: number; // 0..1
  clearDays: number | null;
}

/**
 * Composite risk, applied in priority order (honors the PRD edge cases):
 *  1. No listings → EMPTY (best case for a new lister).
 *  2. A market held by ≤1 seller is wide open regardless of share.
 *  3. DOMINATED: one seller controls supply, or jammed prices with a crowd.
 *  4. OPEN: big breathing room, few/non-dominant sellers, sells through fast.
 *  5. CROWDED: jammed-with-a-crowd, a large seller crowd, or stock that just sits.
 *  6. Otherwise HEALTHY.
 */
export function classifyCraftRisk(a: CraftRiskInput): CraftRisk {
  if (a.empty) return 'EMPTY';
  if (a.onlyListing || a.sellerCount <= 1) return 'OPEN';

  if (a.topSellerShare > 0.60) return 'DOMINATED';
  if (a.gapPct < 0.02 && a.sellerCount > 5) return 'DOMINATED';

  if (a.gapPct >= GAP_GREEN && (a.sellerCount <= 3 || a.topSellerShare < 0.40)
      && a.clearDays !== null && a.clearDays < 3) return 'OPEN';

  // Tied/near-tied prices only count as crowded when there's an actual crowd;
  // a couple of sellers stacked at one price can still be HEALTHY (PRD edge case).
  if (a.gapPct < GAP_AMBER && a.sellerCount > 3) return 'CROWDED';
  if (a.sellerCount >= 8) return 'CROWDED';
  if (a.clearDays !== null && a.clearDays > 5) return 'CROWDED';

  return 'HEALTHY';
}

export function passesMaxRisk(risk: CraftRisk, max: MaxRisk): boolean {
  if (max === 'any') return true;
  if (max === 'open') return risk === 'OPEN' || risk === 'EMPTY';
  // 'healthy or better' — exclude CROWDED and DOMINATED.
  return risk !== 'CROWDED' && risk !== 'DOMINATED';
}

/** Everything the scan row + popover need about an item's competitive listing picture. */
export interface CraftListingAnalysis {
  risk: CraftRisk;
  gap: ListingGap;
  sellerCount: number;
  topSellerShare: number;       // 0..1
  concentrationRisk: RiskLevel; // 'thin' | 'moderate' | 'deep'
  clearDays: number | null;
  clearNote: string;
  captureRate: number;          // 0..1
  totalUnits: number;
  totalSellers: number;
  depth: DepthBucket[];
}

/** Analyze one item's listings for the chosen quality tier. */
export function analyzeCraftListings(m: MarketItem, hq: boolean): CraftListingAnalysis {
  const gap = listingGap(m.worldListings, hq);
  const conc = concentrationHHI(m.worldListings, hq);
  const { days, note } = supplyDepth(m.listingCount, m.velocity);
  const depth = depthBuckets(m.worldListings, hq);

  const sellerCount = conc?.sellerCount ?? 0;
  const topSellerShare = conc?.topSellerShare ?? 0;
  const totalUnits = depth.reduce((s, b) => s + b.units, 0);
  const totalSellers = depth.reduce((s, b) => s + b.sellers, 0); // bucket sellers may double-count across tiers; display-only

  const risk = classifyCraftRisk({
    empty: gap.empty,
    onlyListing: gap.onlyListing,
    gapPct: gap.gapPct,
    sellerCount,
    topSellerShare,
    clearDays: days,
  });

  return {
    risk, gap, sellerCount, topSellerShare,
    concentrationRisk: conc?.risk ?? 'deep',
    clearDays: days, clearNote: note,
    captureRate: captureShare(m.listingCount),
    totalUnits, totalSellers: sellerCount, // prefer concentration's unique-seller count
    depth,
  };
}
```

Note: `totalSellers` is set to `sellerCount` (concentration's unique-seller count) since bucket sellers can double-count a seller appearing in multiple price buckets. The `totalSellers` const computed from buckets is dropped — remove that line when implementing; it's shown here only to flag the pitfall. Final field uses `sellerCount`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/queries/craftListingAnalysis.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/features/queries/craftListingAnalysis.ts src/features/queries/craftListingAnalysis.test.ts
git commit -m "feat(crafts): pure listing-analysis helpers (gap, composite risk, max-risk filter)"
```

---

### Task 2: Extend types — CraftFlipRow, QueryFilter.maxRisk, risk sort

**Files:**
- Modify: `src/features/queries/types.ts:5` (QuerySort), `:9-23` (QueryFilter), `:45-55` (CraftFlipRow)

- [ ] **Step 1: Add `'risk'` to the `QuerySort` union**

In `src/features/queries/types.ts`, change line 5 from:

```ts
export type QuerySort = 'discount' | 'gilFlow' | 'velocity' | 'unitPrice';
```

to:

```ts
export type QuerySort = 'discount' | 'gilFlow' | 'velocity' | 'unitPrice' | 'risk';
```

- [ ] **Step 2: Add the `MaxRisk` re-export and the optional `maxRisk` field**

In `src/features/queries/types.ts`, add after the `QueryMode` type (around line 6):

```ts
export type { MaxRisk } from './craftListingAnalysis';
```

Then, inside `interface QueryFilter` (after `trainedEye: boolean;`, line 22), add:

```ts
  /** Post-scan competitor-risk ceiling. Optional; absent ⇒ 'any'. Not part of filterHash (display-only re-filter). */
  maxRisk?: import('./craftListingAnalysis').MaxRisk;
```

(Using an inline import type keeps the field optional without forcing every `QueryFilter` literal to set it.)

- [ ] **Step 3: Extend `CraftFlipRow` with the analysis fields**

In `src/features/queries/types.ts`, replace the `CraftFlipRow` interface (lines 45-55) with:

```ts
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

  // Competitor listing analysis (see craftListingAnalysis.ts)
  risk: import('./craftListingAnalysis').CraftRisk;
  gap: number;            // gil to next distinct price tier (0 when tied/only listing)
  gapPct: number;         // gap / unitPrice; Infinity when only listing
  hasSecondTier: boolean;
  onlyListing: boolean;
  sellerCount: number;
  topSellerShare: number; // 0..1
  clearDays: number | null;
  clearNote: string;
  captureRate: number;    // 0..1
  totalUnits: number;
  depth: import('./craftListingAnalysis').DepthBucket[];
}
```

- [ ] **Step 4: Re-export `DepthBucket` and `CraftRisk` from craftListingAnalysis for the inline imports above**

The inline `import('./craftListingAnalysis').DepthBucket` requires `DepthBucket` to be exported from that module. In `src/features/queries/craftListingAnalysis.ts`, add this re-export near the top (after the existing imports):

```ts
export type { DepthBucket } from '../items/depth';
```

(`CraftRisk` and `MaxRisk` are already exported in Task 1.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no errors. (`CraftFlipRow` now requires new fields, which `runCraftFlip` will populate in Task 3; `tsc` will flag `runCraftFlip.ts` as missing those fields. That is expected and fixed in Task 3 — if you run tsc now it will error on `runCraftFlip.ts:72`. Proceed to Task 3; do not "fix" it here.)

- [ ] **Step 6: Commit**

```bash
git add src/features/queries/types.ts src/features/queries/craftListingAnalysis.ts
git commit -m "feat(crafts): extend CraftFlipRow + QueryFilter.maxRisk + risk sort type"
```

---

### Task 3: Populate analysis fields in runCraftFlip + risk sort

**Files:**
- Modify: `src/features/queries/runCraftFlip.ts:1-8` (imports), `:29-37` (compare), `:72-80` (row push)
- Test: `src/features/queries/runCraftFlip.test.ts` (add cases; update `mkPrice` fixtures if needed)

- [ ] **Step 1: Add failing tests for the new behavior**

Append to `src/features/queries/runCraftFlip.test.ts` inside the existing `describe('runCraftFlip', ...)` block (the `mkPrice`/`snapshot`/`recipeMap` helpers are already defined at the top of that file):

```ts
  it('populates competitor-listing fields on the row', () => {
    const priceMap: MarketData = {
      1: mkPrice({
        minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8, velocity: 4, listingCount: 3,
        worldListings: [
          { world: 'Phantom', price: 1000, hq: true, quantity: 2, seller: 'A' },
          { world: 'Phantom', price: 1300, hq: true, quantity: 1, seller: 'B' },
          { world: 'Phantom', price: 1400, hq: true, quantity: 1, seller: 'C' },
        ],
      }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8, listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap, { ...baseFilter, minVelocity: 1 });
    expect(out).toHaveLength(1);
    const r = out[0];
    expect(r.gap).toBe(300);                 // 1300 - 1000
    expect(r.gapPct).toBeCloseTo(0.3, 5);
    expect(r.hasSecondTier).toBe(true);
    expect(r.sellerCount).toBe(3);
    expect(r.clearDays).toBeCloseTo(3 / 4, 5); // listingCount/velocity
    expect(['OPEN', 'HEALTHY', 'CROWDED', 'DOMINATED', 'EMPTY']).toContain(r.risk);
  });

  it("sort 'risk' orders worst-first (DOMINATED before OPEN)", () => {
    const recipe2: Recipe = { itemResultId: 2, classJob: 'WVR', recipeLevel: 50, ingredients: [{ itemId: 99, amount: 1 }] };
    const rm = new Map<number, Recipe | null>([[1, recipe1], [2, recipe2]]);
    const priceMap: MarketData = {
      // item 1: dominated (one seller >60%)
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8, velocity: 4, listingCount: 4,
        worldListings: [
          { world: 'Phantom', price: 1000, hq: true, quantity: 9, seller: 'A' },
          { world: 'Phantom', price: 1001, hq: true, quantity: 1, seller: 'B' },
          { world: 'Phantom', price: 1002, hq: true, quantity: 1, seller: 'C' },
        ] }),
      // item 2: open (single listing/seller)
      2: mkPrice({ minNQ: 5000, medianNQ: 6000, recentSalesNQ: 8, velocity: 1, listingCount: 1,
        worldListings: [{ world: 'Phantom', price: 5000, hq: false, quantity: 1, seller: 'Z' }] }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8, listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, rm, { ...baseFilter, minVelocity: 1, sort: 'risk' });
    expect(out.map((r) => r.risk)).toEqual(['DOMINATED', 'OPEN']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/queries/runCraftFlip.test.ts`
Expected: FAIL — rows lack `gap`/`risk`/etc. (type + runtime), and `'risk'` sort is unhandled.

- [ ] **Step 3: Implement — imports**

In `src/features/queries/runCraftFlip.ts`, add after line 8 (`import type { CraftFlipRow, QueryFilter, QuerySort } from './types';`):

```ts
import { analyzeCraftListings, RISK_ORDER } from './craftListingAnalysis';
```

- [ ] **Step 4: Implement — risk sort in `compare()`**

Replace the `compare` function (lines 29-37) with:

```ts
function compare(a: CraftFlipRow, b: CraftFlipRow, sort: QuerySort): number {
  switch (sort) {
    case 'gilFlow':   return b.gilPerDay - a.gilPerDay;
    case 'velocity':  return b.velocity - a.velocity;
    case 'unitPrice': return b.unitPrice - a.unitPrice;
    case 'risk':      return RISK_ORDER.indexOf(a.risk) - RISK_ORDER.indexOf(b.risk); // worst (DOMINATED) first
    case 'discount':
      return (b.profit / Math.max(1, b.unitPrice)) - (a.profit / Math.max(1, a.unitPrice));
  }
}
```

- [ ] **Step 5: Implement — populate the row**

Replace the `out.push({ ... })` block (lines 72-80) with:

```ts
    const analysis = analyzeCraftListings(m, tier.isHq);
    out.push({
      id: item.id, name: item.name, sc: item.sc,
      unitPrice: tier.unit,
      materialCost,
      profit,
      velocity: m.velocity,
      gilPerDay: profit * m.velocity,
      hq: tier.isHq,
      risk: analysis.risk,
      gap: analysis.gap.gap,
      gapPct: analysis.gap.gapPct,
      hasSecondTier: analysis.gap.hasSecondTier,
      onlyListing: analysis.gap.onlyListing,
      sellerCount: analysis.sellerCount,
      topSellerShare: analysis.topSellerShare,
      clearDays: analysis.clearDays,
      clearNote: analysis.clearNote,
      captureRate: analysis.captureRate,
      totalUnits: analysis.totalUnits,
      depth: analysis.depth,
    });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/features/queries/runCraftFlip.test.ts`
Expected: PASS (existing cases + the two new ones).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — `runCraftFlip` now satisfies the extended `CraftFlipRow`.

- [ ] **Step 8: Commit**

```bash
git add src/features/queries/runCraftFlip.ts src/features/queries/runCraftFlip.test.ts
git commit -m "feat(crafts): compute competitor-listing analysis per craft-flip row + risk sort"
```

---

### Task 4: URL params — round-trip maxRisk (`mr`) + accept risk sort

**Files:**
- Modify: `src/lib/queryUrlParams.ts:3-13` (DEFAULTS), `:53` (sort write), `:78` (maxRisk write), `:146-149` (sort read), `:188` (maxRisk read)
- Test: `src/lib/queryUrlParams.test.ts` (add cases)

- [ ] **Step 1: Add failing tests**

Append to `src/lib/queryUrlParams.test.ts` (it already imports `filterToParams`/`paramsToFilter` and has a base filter helper — match the existing fixture style in that file):

```ts
import { describe, it, expect } from 'vitest';
import { filterToParams, paramsToFilter } from './queryUrlParams';
import type { QueryFilter } from '../features/queries/types';

const base: QueryFilter = {
  searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 0,
  minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
  scope: 'home', maxListings: null, mode: 'craft', minGap: null, trainedEye: false,
};

describe('queryUrlParams — maxRisk', () => {
  it('omits mr when maxRisk is absent or "any"', () => {
    expect(filterToParams({ ...base }).has('mr')).toBe(false);
    expect(filterToParams({ ...base, maxRisk: 'any' }).has('mr')).toBe(false);
  });
  it('round-trips maxRisk=healthy', () => {
    const p = filterToParams({ ...base, maxRisk: 'healthy' });
    expect(p.get('mr')).toBe('healthy');
    expect(paramsToFilter(p, base).maxRisk).toBe('healthy');
  });
  it('round-trips maxRisk=open', () => {
    const p = filterToParams({ ...base, maxRisk: 'open' });
    expect(paramsToFilter(p, base).maxRisk).toBe('open');
  });
  it('ignores an invalid mr value', () => {
    const p = new URLSearchParams('mr=bogus');
    expect(paramsToFilter(p, base).maxRisk).toBeUndefined();
  });
  it('round-trips sort=risk', () => {
    const p = filterToParams({ ...base, sort: 'risk' });
    expect(p.get('s')).toBe('risk');
    expect(paramsToFilter(p, base).sort).toBe('risk');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/queryUrlParams.test.ts`
Expected: FAIL — `mr` not written/read; `sort=risk` rejected by the validation guard.

- [ ] **Step 3: Implement — write `mr`**

In `src/lib/queryUrlParams.ts`, inside `filterToParams`, add just before `return params;` (line 78):

```ts
  // maxRisk: only add when set to a non-default value
  if (f.maxRisk && f.maxRisk !== 'any') {
    params.set('mr', f.maxRisk);
  }
```

- [ ] **Step 4: Implement — read `mr`**

In `paramsToFilter`, add just before `return result;` (line 190):

```ts
  // maxRisk
  const mrStr = params.get('mr');
  if (mrStr === 'healthy' || mrStr === 'open' || mrStr === 'any') {
    result.maxRisk = mrStr;
  }
```

- [ ] **Step 5: Implement — accept `'risk'` sort**

In `paramsToFilter`, change the sort guard (line 147) from:

```ts
  if (sStr === 'discount' || sStr === 'gilFlow' || sStr === 'velocity' || sStr === 'unitPrice') {
```

to:

```ts
  if (sStr === 'discount' || sStr === 'gilFlow' || sStr === 'velocity' || sStr === 'unitPrice' || sStr === 'risk') {
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/lib/queryUrlParams.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/queryUrlParams.ts src/lib/queryUrlParams.test.ts
git commit -m "feat(crafts): persist maxRisk + risk sort in query URL params"
```

---

### Task 5: QueriesView — hash-based stale + live maxRisk re-filter + pass scope

**Files:**
- Modify: `src/features/queries/QueriesView.tsx:25` (import filterHash), `:114` (stale), `:118-140` (derived), add a filtered-rows memo, `:249-257` (CraftFlipResults props)

- [ ] **Step 1: Import `filterHash`**

In `src/features/queries/QueriesView.tsx`, the file imports from `'./types'` indirectly; add `filterHash` import. Change line 25 area — add after the existing `queryUrlParams` import (line 25):

```ts
import { filterHash } from './types';
import { passesMaxRisk } from './craftListingAnalysis';
```

- [ ] **Step 2: Switch `stale` to a hash comparison**

Replace line 114:

```ts
  const stale = run.data != null && run.data.filterAtRun !== filter;
```

with:

```ts
  // Stale only when a *scan-affecting* input changed. maxRisk is a display-only
  // post-scan filter and is intentionally excluded from filterHash, so changing
  // it never marks results stale.
  const stale = run.data != null && filterHash(run.data.filterAtRun) !== filterHash(filter);
```

- [ ] **Step 3: Apply maxRisk live to craft rows**

After the `derived` memo (ends at line 140), add a new memo that applies the live `maxRisk` to craft rows only:

```ts
  const visibleCraftRows = useMemo(() => {
    if (derived?.kind !== 'craft') return [];
    const max = filter.maxRisk ?? 'any';
    if (max === 'any') return derived.rows;
    return derived.rows.filter((r) => passesMaxRisk(r.risk, max));
  }, [derived, filter.maxRisk]);
```

- [ ] **Step 4: Render the filtered rows + pass scope**

Replace the `derived?.kind === 'craft'` block (lines 249-257) with:

```ts
          {derived?.kind === 'craft' && (
            <CraftFlipResults
              rows={visibleCraftRows}
              totalCandidates={run.data?.narrowedIds.length ?? 0}
              skippedChunks={run.data?.skipped ?? 0}
              scope={run.data?.filterAtRun.scope ?? 'home'}
              sparklineMap={showSparklines ? sparklineHistory.data : undefined}
              sparklineLoading={sparklineHistory.isLoading}
            />
          )}
```

Note: `sparklineIds` (line 144-145) maps over `derived.rows` for craft — leave it as-is (sparklines for all scanned rows is fine; filtering them is unnecessary work and harmless).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL only on `CraftFlipResults` not yet accepting a `scope` prop (fixed in Task 9). All QueriesView-local code typechecks. Proceed.

- [ ] **Step 6: Commit**

```bash
git add src/features/queries/QueriesView.tsx
git commit -m "feat(crafts): live maxRisk re-filter (no re-scan) + hash-based staleness"
```

---

### Task 6: QueryBuilder — Max risk dropdown + Risk sort option

**Files:**
- Modify: `src/features/queries/QueryBuilder.tsx:4` (type import), `:17-22` (SORTS), `:130-152` (insert Max-risk control near Run Scan)

- [ ] **Step 1: Import the `MaxRisk` type**

Change `QueryBuilder.tsx` line 4 from:

```ts
import type { HqMode, QueryFilter, QueryMode, QueryScope, QuerySort } from './types';
```

to:

```ts
import type { HqMode, MaxRisk, QueryFilter, QueryMode, QueryScope, QuerySort } from './types';
```

- [ ] **Step 2: Add "Risk" to the sort options (craft-relevant)**

Replace the `SORTS` array (lines 17-22) with:

```ts
const SORTS: { id: QuerySort; label: string }[] = [
  { id: 'discount',  label: 'Discount %' },
  { id: 'gilFlow',   label: 'Gil/day' },
  { id: 'velocity',  label: 'Velocity' },
  { id: 'unitPrice', label: 'Unit price' },
  { id: 'risk',      label: 'Risk (worst first)' },
];
```

- [ ] **Step 3: Add the Max-risk dropdown**

The Run-scan/Copy-link block sits in a `<div className="flex items-end gap-2">` at lines 130-152. Insert a new Max-risk `<label>` immediately **before** that div (after the Limit label closes at line 128, before line 130). It only applies in craft mode:

```tsx
        {value.mode === 'craft' && (
          <label className="block">
            <span className="font-mono text-[13px] tracking-widest text-text-low">Max risk</span>
            <select
              value={value.maxRisk ?? 'any'}
              onChange={(e) => patch({ maxRisk: e.target.value as MaxRisk })}
              className="mt-1 block w-full bg-bg-deep border border-border-hi focus:border-aether focus:outline-none px-3 py-2 font-mono text-sm transition-colors"
              title="Hide markets that are crowded or dominated. Re-filters instantly without re-scanning."
            >
              <option value="any">Any</option>
              <option value="healthy">Healthy or better</option>
              <option value="open">Open only</option>
            </select>
          </label>
        )}
```

- [ ] **Step 4: Verify in the dev server (visual)**

Run: `npm run dev` and open `/crafts`. Select Mode = Craft-flip. Confirm "Max risk" dropdown and the "Risk (worst first)" sort option appear. (You will fully verify behavior in Task 10.)

- [ ] **Step 5: Typecheck + lint the file**

Run: `npx tsc --noEmit` (expect the same Task-9 `CraftFlipResults` scope error only) and `npx eslint src/features/queries/QueryBuilder.tsx`.
Expected: lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/queries/QueryBuilder.tsx
git commit -m "feat(crafts): Max-risk dropdown + Risk sort option in the scan filter panel"
```

---

### Task 7: Risk + Sellers badge components

**Files:**
- Create: `src/features/queries/craftRiskBadges.tsx`

- [ ] **Step 1: Implement the shared maps + badges**

```tsx
// src/features/queries/craftRiskBadges.tsx
import type { CraftRisk } from './craftListingAnalysis';
import type { RiskLevel } from '../items/concentration';

// PRD palette. Centralized so the table, mobile cards, and popover stay consistent.
export const RISK_TEXT: Record<CraftRisk, string> = {
  EMPTY:     'text-[#a0e080]',
  OPEN:      'text-[#a0e080]',
  HEALTHY:   'text-[#60c060]',
  CROWDED:   'text-[#c0a030]',
  DOMINATED: 'text-[#c04040]',
};

export const RISK_DOT: Record<CraftRisk, string> = {
  EMPTY:     'bg-[#a0e080]',
  OPEN:      'bg-[#a0e080]',
  HEALTHY:   'bg-[#60c060]',
  CROWDED:   'bg-[#c0a030]',
  DOMINATED: 'bg-[#c04040]',
};

/** One-line explanation shown under the label in COMFY mode. */
export function riskExplanation(r: {
  risk: CraftRisk; sellerCount: number; topSellerShare: number; clearDays: number | null;
}): string {
  switch (r.risk) {
    case 'EMPTY':     return 'no listings — list at your price';
    case 'DOMINATED': return `1 seller holds ${Math.round(r.topSellerShare * 100)}%`;
    case 'CROWDED':   return r.clearDays != null && r.clearDays > 5 ? 'listings sitting — slow to clear' : `${r.sellerCount} sellers competing`;
    case 'OPEN':      return r.sellerCount <= 1 ? 'open market — no competition' : 'room to undercut';
    case 'HEALTHY':   return 'workable market';
  }
}

export function RiskBadge({ risk, compact }: { risk: CraftRisk; compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${RISK_DOT[risk]}`} />
        <span className={`font-mono text-[10px] tracking-widest uppercase ${RISK_TEXT[risk]}`}>{risk}</span>
      </span>
    );
  }
  return <span className={`font-mono text-[11px] tracking-widest uppercase ${RISK_TEXT[risk]}`}>{risk}</span>;
}

// Seller-concentration dot color (FR-2): >60% red, 40–60% amber, else green.
function sellerDot(topSellerShare: number, sellerCount: number): string {
  if (sellerCount <= 1) return 'bg-[#a0e080]';
  if (topSellerShare > 0.60) return 'bg-[#c04040]';
  if (topSellerShare >= 0.40) return 'bg-[#c0a030]';
  return 'bg-[#60c060]';
}

export function SellersBadge({
  sellerCount, topSellerShare, concentrationRisk, dotOnly,
}: {
  sellerCount: number; topSellerShare: number; concentrationRisk: RiskLevel; dotOnly?: boolean;
}) {
  if (sellerCount === 0) return null;
  const dot = sellerDot(topSellerShare, sellerCount);
  const label =
    concentrationRisk === 'thin' ? 'Concentrated, risky'
    : concentrationRisk === 'moderate' ? 'Watch'
    : 'Healthy';
  const title = `${sellerCount} seller${sellerCount === 1 ? '' : 's'} · top holds ${Math.round(topSellerShare * 100)}% — ${label}.`;
  if (dotOnly) {
    return <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} title={title} />;
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-text-low" title={title}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
      {sellerCount} seller{sellerCount === 1 ? '' : 's'}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` (same pending Task-9 error only) and `npx eslint src/features/queries/craftRiskBadges.tsx`.
Expected: lint clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/craftRiskBadges.tsx
git commit -m "feat(crafts): RiskBadge + SellersBadge presentational components"
```

---

### Task 8: Competitor listing popover (FR-6)

**Files:**
- Create: `src/features/queries/CompetitorPopover.tsx`

This renders the read-only listing-depth + concentration breakdown shown on hover. It reuses `InfoTooltip` (`src/components/InfoTooltip.tsx`) as the hover/dismiss wrapper — the same pattern the SALE sparkline uses (`CraftFlipResults.tsx:128`). The popover content is built entirely from fields already on the row (`depth`, `totalUnits`, `sellerCount`, `clearNote`, `captureRate`, `topSellerShare`, `concentrationRisk`).

- [ ] **Step 1: Implement the popover content**

```tsx
// src/features/queries/CompetitorPopover.tsx
import { fmtGil } from '../../lib/format';
import type { CraftFlipRow } from './types';

interface Props {
  row: CraftFlipRow;
  /** Home-world scope shows clear/capture; DC scope hides them (less meaningful). */
  homeScope: boolean;
}

const BAR_WIDTH = 16;

/** Read-only listing-depth + seller-concentration breakdown for the hover popover. */
export function CompetitorPopover({ row, homeScope }: Props) {
  const maxUnits = row.depth.reduce((m, b) => Math.max(m, b.units), 0) || 1;
  const concLabel =
    row.concentrationRisk === 'thin' ? 'CONCENTRATED · RISKY'
    : row.concentrationRisk === 'moderate' ? 'WATCH'
    : 'HEALTHY';

  return (
    <div className="font-mono text-[10px] leading-relaxed text-text-cream min-w-[260px]">
      <div className="tracking-widest uppercase text-text-low mb-1">Listing depth</div>
      <div className="border-t border-border-base pt-1">
        {row.depth.length === 0 && <div className="text-text-low italic">no listings</div>}
        {row.depth.map((b, i) => {
          const filled = Math.max(1, Math.round((b.units / maxUnits) * BAR_WIDTH));
          return (
            <div key={i} className="flex items-center gap-2 whitespace-pre">
              <span className="text-text-dim w-24">{fmtGil(b.priceLow)}–{fmtGil(b.priceHigh)}</span>
              <span className="text-aether">{'█'.repeat(filled)}{' '.repeat(BAR_WIDTH - filled)}</span>
              <span className="text-text-low">{b.units}u · {b.sellers} seller{b.sellers === 1 ? '' : 's'}</span>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border-base mt-1 pt-1 text-text-low">
        Total: {row.totalUnits} units · {row.sellerCount} seller{row.sellerCount === 1 ? '' : 's'}
        {homeScope && row.clearDays != null && (
          <> · {row.clearNote} · ~{Math.round(row.captureRate * 100)}% capture</>
        )}
        {!homeScope && <> · clear/capture: home-world scope only</>}
      </div>
      <div className="mt-2">
        <span className="tracking-widest uppercase text-text-low">Seller concentration</span>
        <div className="mt-0.5">
          Top seller: {Math.round(row.topSellerShare * 100)}% of supply
          <span className="ml-2 text-text-dim">[{concLabel}]</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` (same pending Task-9 error only) and `npx eslint src/features/queries/CompetitorPopover.tsx`.
Expected: lint clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/queries/CompetitorPopover.tsx
git commit -m "feat(crafts): read-only competitor listing-depth popover"
```

---

### Task 9: CraftFlipResults — render new columns, modes, scope, CSV

**Files:**
- Modify: `src/features/queries/CraftFlipResults.tsx` (imports, Props, CSV columns, mobile cards, desktop table header + rows)

This is the central UI task. Column order becomes **# · ITEM · SALE · MATERIALS · PROFIT · VELOCITY · RISK · GIL/DAY** (RISK inserted between VELOCITY and GIL/DAY).

- [ ] **Step 1: Add imports + `scope` prop**

In `src/features/queries/CraftFlipResults.tsx`, add to the import block (after line 13):

```ts
import { RiskBadge, SellersBadge, riskExplanation } from './craftRiskBadges';
import { CompetitorPopover } from './CompetitorPopover';
import { GAP_GREEN, GAP_AMBER } from './craftListingAnalysis';
import type { QueryScope } from './types';
```

Extend `Props` (lines 15-21) to add `scope`:

```ts
interface Props {
  rows: CraftFlipRow[];
  totalCandidates: number;
  skippedChunks: number;
  scope: QueryScope;
  sparklineMap?: Map<number, (number | null)[]>;
  sparklineLoading?: boolean;
}
```

Destructure it (line 35):

```ts
export function CraftFlipResults({ rows, totalCandidates, skippedChunks, scope, sparklineMap, sparklineLoading }: Props) {
  const density = useUiStore((s) => s.density);
  const rowY = rowPadClass(density);
  const compact = density === 'compact';
  const homeScope = scope === 'home';
  const showSparkline = sparklineMap != null;
```

- [ ] **Step 2: Add a small gap-line helper inside the file**

Add this module-level helper near `MobileMetric` (bottom of the file):

```tsx
function gapColor(gapPct: number): string {
  if (gapPct >= GAP_GREEN) return 'text-[#a0e080]';
  if (gapPct >= GAP_AMBER) return 'text-[#c0a030]';
  return 'text-[#c04040]';
}

/** "+Xk gap" / "+0 gap" / "only listing" line under the sale price. */
function GapLine({ row }: { row: CraftFlipRow }) {
  if (row.onlyListing || !row.hasSecondTier && row.gap === 0 && row.gapPct === Infinity) {
    return <span className="font-mono text-[10px] text-[#60c060]">only listing</span>;
  }
  if (!row.hasSecondTier) {
    return <span className="font-mono text-[10px] text-[#c04040]">+0 gap</span>;
  }
  return <span className={`font-mono text-[10px] ${gapColor(row.gapPct)}`}>+{fmtGil(row.gap)} gap</span>;
}

/** "~2d to clear · 9% capture" line (home scope only). */
function ClearsLine({ row, homeScope }: { row: CraftFlipRow; homeScope: boolean }) {
  if (!homeScope) {
    return (
      <span className="font-mono text-[10px] text-text-low" title="Capture rate only available for home world scope.">
        clear/capture: home only
      </span>
    );
  }
  if (row.clearDays == null) return null;
  const color = row.clearDays < 1 ? 'text-[#a0e080]' : row.clearDays <= 5 ? 'text-[#c0a030]' : 'text-[#c04040]';
  return (
    <span className={`font-mono text-[10px] ${color}`}>
      {row.clearNote} · {Math.round(row.captureRate * 100)}% cap
    </span>
  );
}
```

- [ ] **Step 3: CSV columns — add the new analysis fields**

Replace `CSV_COLUMNS` (lines 23-33) with:

```ts
const CSV_COLUMNS: CsvColumn<CraftFlipRow>[] = [
  { key: 'id', label: 'Item ID' },
  { key: 'name', label: 'Item' },
  { key: 'sc', label: 'Category' },
  { key: 'unitPrice', label: 'Sale Price' },
  { key: 'materialCost', label: 'Material Cost' },
  { key: 'profit', label: 'Profit' },
  { key: 'velocity', label: 'Velocity (sales/day)' },
  { key: 'gilPerDay', label: 'Gil/day' },
  { key: 'risk', label: 'Risk' },
  { key: 'gap', label: 'Gap to next tier' },
  { key: 'sellerCount', label: 'Sellers' },
  { key: 'topSellerShare', label: 'Top seller share' },
  { key: 'clearDays', label: 'Days to clear' },
  { key: 'hq', label: 'HQ' },
];
```

- [ ] **Step 4: Mobile cards — sellers badge on name line + gap/risk metrics**

Replace the `renderMobile` block (lines 51-74) with:

```tsx
      renderMobile={(visible) => (
        <>
          {visible.map((r, i) => (
            <div key={r.id} className="p-3 active:bg-bg-card-hi transition-colors">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-text-low w-6 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <ItemNameLinks
                    id={r.id}
                    name={r.name}
                    suffix={r.hq && <HqStar leading />}
                    sub={categoryLabel(r.sc)}
                  />
                  <div className="mt-0.5 flex items-center gap-3">
                    <SellersBadge
                      sellerCount={r.sellerCount}
                      topSellerShare={r.topSellerShare}
                      concentrationRisk={/* derived in row */ (r as CraftFlipRow & { concentrationRisk?: never }) && undefined as never}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 pl-8 font-mono text-[12px]">
                <MobileMetric label="Sale">{fmtGil(r.unitPrice)}</MobileMetric>
                <MobileMetric label="Profit"><span className="text-jade">+{fmtGil(r.profit)}</span></MobileMetric>
                <MobileMetric label="Gil/day"><span className="text-gold-hi">{fmtGil(Math.round(r.gilPerDay))}</span></MobileMetric>
                <MobileMetric label="Gap"><GapLine row={r} /></MobileMetric>
                <MobileMetric label="Risk"><RiskBadge risk={r.risk} compact /></MobileMetric>
                <MobileMetric label="Clears"><ClearsLine row={r} homeScope={homeScope} /></MobileMetric>
              </div>
            </div>
          ))}
        </>
      )}
```

**IMPORTANT FIX:** `SellersBadge` requires `concentrationRisk` (a `RiskLevel`), but the row stores no `concentrationRisk` field — Task 3 dropped it from `CraftFlipRow`. Resolve this cleanly by **adding `concentrationRisk` to the row**: in Task 3's row push, add `concentrationRisk: analysis.concentrationRisk,` and in Task 2's `CraftFlipRow` add `concentrationRisk: import('./craftListingAnalysis').RiskLevel;` plus re-export `RiskLevel` from `craftListingAnalysis.ts` (`export type { RiskLevel } from '../items/concentration';`). Then the mobile `SellersBadge` is simply:

```tsx
                    <SellersBadge
                      sellerCount={r.sellerCount}
                      topSellerShare={r.topSellerShare}
                      concentrationRisk={r.concentrationRisk}
                    />
```

> When implementing, apply the `concentrationRisk` additions in Tasks 2 and 3 first (they are small and listed here so this task is self-contained), then write the clean `SellersBadge` usage above — do **not** ship the `undefined as never` placeholder.

- [ ] **Step 5: Desktop header — add RISK column, sellers tooltip note**

In `renderTable`'s `<thead>` (lines 78-107), add the sellers hint to the Item header is optional; the required change is inserting a RISK `<th>` between the VELOCITY `<th>` (lines 97-101) and the GIL/DAY `<th>` (lines 102-106):

```tsx
              <th className="text-right px-3 py-2 hidden md:table-cell">
                <InfoTooltip label="Sales per day on the home world.">
                  Velocity
                </InfoTooltip>
              </th>
              <th className="text-left px-3 py-2">
                <InfoTooltip label="Competitive safety of entering this market: gap to the next listing, seller concentration, and how fast stock clears.">
                  Risk
                </InfoTooltip>
              </th>
              <th className="text-right px-3 py-2 whitespace-nowrap">
                <InfoTooltip label="Profit × velocity. Expected daily gil from crafting this item at current prices.">
                  Gil/day
                </InfoTooltip>
              </th>
```

- [ ] **Step 6: Desktop rows — sellers badge, SALE gap/clears lines, RISK cell with popover**

Replace the `<tbody>` row map (lines 110-140) with:

```tsx
            {visible.map((r, i) => (
              <tr key={r.id} className="border-t border-border-base hover:bg-bg-card-hi active:bg-bg-card-hi transition-colors">
                <td className={`px-3 ${rowY} font-mono text-text-low`}>{i + 1}</td>
                <td className={`px-3 ${rowY}`}>
                  <ItemNameLinks
                    id={r.id}
                    name={r.name}
                    suffix={r.hq && <HqStar leading />}
                    sub={categoryLabel(r.sc)}
                  />
                  <div className="mt-0.5">
                    <SellersBadge
                      sellerCount={r.sellerCount}
                      topSellerShare={r.topSellerShare}
                      concentrationRisk={r.concentrationRisk}
                      dotOnly={compact}
                    />
                  </div>
                </td>
                <td className={`px-3 ${rowY} text-right font-mono align-top`}>
                  <InfoTooltip label={<CompetitorPopover row={r} homeScope={homeScope} />}>
                    <span className="cursor-help">{fmtGil(r.unitPrice)}</span>
                  </InfoTooltip>
                  {!compact && (
                    <div className="mt-0.5 flex flex-col items-end">
                      <GapLine row={r} />
                      <ClearsLine row={r} homeScope={homeScope} />
                    </div>
                  )}
                </td>
                {showSparkline && (
                  <td className={`px-3 ${rowY} hidden md:table-cell`}>
                    {(() => {
                      const buckets = sparklineMap!.get(r.id);
                      if (!buckets) return sparklineLoading ? <SparklineShimmer /> : null;
                      return (
                        <InfoTooltip label={<pre className="font-mono text-[10px] whitespace-pre">{formatSparklineTooltip(buckets)}</pre>}>
                          <Sparkline points={buckets} color={colorFromPoints(buckets)} />
                        </InfoTooltip>
                      );
                    })()}
                  </td>
                )}
                <td className={`px-3 ${rowY} text-right font-mono text-text-low hidden md:table-cell`}>{fmtGil(r.materialCost)}</td>
                <td className={`px-3 ${rowY} text-right font-mono text-jade`}>+{fmtGil(r.profit)}</td>
                <td className={`px-3 ${rowY} text-right font-mono hidden md:table-cell`}>{r.velocity.toFixed(1)}</td>
                <td className={`px-3 ${rowY} align-top`}>
                  <InfoTooltip label={<CompetitorPopover row={r} homeScope={homeScope} />}>
                    <span className="cursor-help"><RiskBadge risk={r.risk} compact={compact} /></span>
                  </InfoTooltip>
                  {!compact && (
                    <div className="mt-0.5 font-mono text-[10px] text-text-low max-w-[14rem]">
                      {riskExplanation(r)}
                    </div>
                  )}
                </td>
                <td className={`px-3 ${rowY} text-right font-mono text-gold-hi`}>{fmtGil(Math.round(r.gilPerDay))}</td>
              </tr>
            ))}
```

- [ ] **Step 7: Typecheck + lint the whole feature**

Run: `npx tsc --noEmit`
Expected: PASS (no errors anywhere now — Task 5's pending `scope` prop is satisfied).
Run: `npx eslint src/features/queries/CraftFlipResults.tsx src/features/queries/craftRiskBadges.tsx src/features/queries/CompetitorPopover.tsx`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/features/queries/CraftFlipResults.tsx src/features/queries/types.ts src/features/queries/runCraftFlip.ts src/features/queries/craftListingAnalysis.ts
git commit -m "feat(crafts): surface gap/sellers/clears/RISK in scan results + hover popover"
```

---

### Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS — all tests, including the new `craftListingAnalysis`, updated `runCraftFlip`, and `queryUrlParams` cases. Investigate any failure before proceeding.

- [ ] **Step 2: Typecheck + lint (repo-wide)**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm run lint`
Expected: exits 0 (`--max-warnings 0`).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `tsc && vite build && npm run build:api` all succeed.

- [ ] **Step 4: Manual smoke (dev server) — acceptance criteria**

Run: `npm run dev`, open `/crafts`, set Mode = Craft-flip, Run scan. Verify against the PRD acceptance criteria:
  - COMFY rows show: a colored gap line under SALE, a sellers badge (dot + count) on the item name line, and a RISK label in the new RISK column (between VELOCITY and GIL/DAY).
  - An item with one listing shows "only listing" and RISK = OPEN.
  - An item whose top seller holds >60% shows RISK = DOMINATED (red) with "1 seller holds X%".
  - A ≥20% gap renders the gap line green.
  - Switch density to COMPACT: only the colored dot + RISK label text show; no gap/clears/explanation lines.
  - Set Max risk = "Healthy or better": CROWDED/DOMINATED rows disappear immediately, no "Run scan to refresh" hint, no re-scan/network. Set "Open only": only OPEN/EMPTY remain.
  - Set Sort by = "Risk (worst first)": DOMINATED rows sort to the top.
  - Hover the RISK label or the SALE price: the popover shows price tiers (bars), units, sellers, totals, clear time, capture, and top-seller %.
  - Set Scope = DC, Run scan: clear/capture are hidden (gap line shows "clear/capture: home only" with the tooltip note).
  - Click "Copy link" after setting Max risk = healthy and Sort = risk; paste into a new tab and confirm `mr=healthy` and `s=risk` are present and rehydrate the controls.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(crafts): verification fixes for competitor listing analysis"
```

(If Step 4 reveals behavior bugs, fix them with a failing-test-first loop where the bug is in pure logic, or directly in the component for render-only issues, then re-run Steps 1–3.)

---

## Self-review notes (spec coverage)

- **FR-1 (gap in SALE column):** Task 1 `listingGap` + Task 9 `GapLine` (green ≥20%, amber 5–20%, red <5%, "only listing", "+0 gap").
- **FR-2 (sellers badge):** Task 7 `SellersBadge` (dot color by top-seller share; dot-only in COMPACT; tooltip) + Task 9 placement on the item name line.
- **FR-3 (time-to-clear + capture):** Task 1 `analyzeCraftListings` (reuses `supplyDepth` + `captureShare`) + Task 9 `ClearsLine` (color by days; hidden/noted in DC scope; COMFY-only).
- **FR-4 (composite RISK):** Task 1 `classifyCraftRisk` + Task 3 row population + Task 9 RISK column with COMFY explanation / COMPACT label.
- **FR-5 (Max-risk filter):** Task 1 `passesMaxRisk` + Task 5 live re-filter (no re-scan, hash-based staleness) + Task 6 dropdown + Task 4 URL persistence.
- **FR-6 (hover popover):** Task 8 `CompetitorPopover` + Task 9 wiring on RISK + SALE cells; built from row data (no network).
- **Edge cases:** EMPTY/only-listing/all-tied handled in `classifyCraftRisk` + `GapLine`; DC scope hides clears/capture; Max-listings interaction unaffected (orthogonal); Max-risk re-filter immediate.
- **Open Question #4 (sortable RISK):** Implemented — `'risk'` sort with `RISK_ORDER` (DOMINATED > CROWDED > HEALTHY > OPEN > EMPTY), exposed in the Sort dropdown and URL.
- **Design decisions flagged for the user:**
  - "Capture rate" reuses the app's existing `captureShare = 1/(1+listings)` (matches the item page's "~X% capture" number); the PRD's "% of DC volume" prose is treated as a misnomer, not a new calculation.
  - `maxRisk` is an optional `QueryFilter` field (defaults to `'any'`) to avoid editing ~15 unrelated filter-construction sites.
  - Composite-risk precedence: EMPTY → single-seller OPEN → DOMINATED → OPEN → CROWDED → HEALTHY (honors the PRD's "one listing → OPEN" and "tied prices can still be HEALTHY with few sellers" edge cases, which would otherwise conflict with the >60%-share DOMINATED rule).
