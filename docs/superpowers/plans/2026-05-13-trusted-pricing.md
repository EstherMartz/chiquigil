# Trusted Pricing & Data Confidence (Craft-Flip) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make craft-flip suggestions ignore items with manipulated/sparse market data — outlier listings (e.g. a single 2.5M HQ on a 15k item), poisoned-history averages, and items with too few real sales to evaluate.

**Architecture:** New pure-utility module `priceTrust.ts` exports the trimmed-median primitive and the trust constants. `parseMarketResponse` in `universalis.ts` is extended to compute and store per-tier `median*` and `recentSales*` fields on every `MarketItem`. `narrowForCraftFlip` then routes through a new `pickTrustedTier` helper that applies three rejection rules (sales-count floor, missing median, listing-vs-median outlier ratio) and emits a tier price capped at the trusted median.

**Tech Stack:** TypeScript, Vitest, React (no UI changes in this plan), no new runtime deps.

**Spec:** [docs/superpowers/specs/2026-05-13-trusted-pricing-design.md](../specs/2026-05-13-trusted-pricing-design.md)

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/priceTrust.ts` | NEW | Pure helpers: trim constants + `trimmedMedian(prices)` |
| `src/lib/priceTrust.test.ts` | NEW | Unit-test `trimmedMedian` edge cases |
| `src/lib/universalis.ts` | MODIFY | Extend `MarketItem` with `medianNQ`/`medianHQ`/`recentSalesNQ`/`recentSalesHQ`; populate them in `parseMarketResponse` |
| `src/lib/universalis.test.ts` | MODIFY | Update `parseMarketResponse` expected output; add multi-entry median case |
| `src/features/queries/runCraftFlip.ts` | MODIFY | Add `pickTrustedTier`; delete `pickTier`/`safeUnit`/`hasUsableTier`; use new helper in `narrowForCraftFlip` and `runCraftFlip` |
| `src/features/queries/runCraftFlip.test.ts` | MODIFY | Update `mkPrice` defaults; rework existing tests to include median + recentSales; add new rejection-path tests |
| `src/features/queries/presets.ts` | MODIFY | Bump `craft-flip` preset `minVelocity: 1 → 3` |

---

## Task 1: `priceTrust.ts` — trimmed-median utility + constants

**Files:**
- Create: `src/lib/priceTrust.ts`
- Test: `src/lib/priceTrust.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/priceTrust.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { trimmedMedian, MIN_RECENT_SALES, MAX_LISTING_RATIO, TRIM_FRACTION } from './priceTrust';

describe('priceTrust constants', () => {
  it('exports the documented constants', () => {
    expect(MIN_RECENT_SALES).toBe(5);
    expect(MAX_LISTING_RATIO).toBe(5);
    expect(TRIM_FRACTION).toBe(0.1);
  });
});

describe('trimmedMedian', () => {
  it('returns null for an empty array', () => {
    expect(trimmedMedian([])).toBeNull();
  });

  it('returns the only value for a single-element array', () => {
    expect(trimmedMedian([100])).toBe(100);
  });

  it('returns the mean of two values (no trim possible)', () => {
    expect(trimmedMedian([100, 200])).toBe(150);
  });

  it('returns the middle value for 3 entries (no trim — floor(0.3) = 0)', () => {
    expect(trimmedMedian([100, 200, 300])).toBe(200);
  });

  it('ignores input order (sorts internally)', () => {
    expect(trimmedMedian([300, 100, 200])).toBe(200);
  });

  it('does not trim with 5 entries (floor(0.5) = 0); median of all 5', () => {
    // Sorted: [1, 100, 100, 100, 1_000_000] — outliers stay, but median is still 100.
    expect(trimmedMedian([1, 100, 100, 100, 1_000_000])).toBe(100);
  });

  it('trims 1 from each side with 10 entries; outliers removed', () => {
    // Sorted: [1, 100, 100, 100, 100, 100, 100, 100, 100, 1_000_000]
    // After trim of 1 each side: [100, 100, 100, 100, 100, 100, 100, 100] → median 100.
    expect(
      trimmedMedian([1, 100, 100, 100, 100, 100, 100, 100, 100, 1_000_000]),
    ).toBe(100);
  });

  it('with 15 entries trims floor(1.5) = 1 from each side', () => {
    const prices = [1, 50, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 200, 9_999_999];
    // After trim of 1 each side both 1 and 9_999_999 are removed; median of the rest = 100.
    expect(trimmedMedian(prices)).toBe(100);
  });

  it('averages the two middles when the remainder has even length', () => {
    // Sorted: [10, 20, 30, 40]; no trim (floor(0.4) = 0); median = (20+30)/2 = 25.
    expect(trimmedMedian([10, 20, 30, 40])).toBe(25);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/priceTrust.test.ts`
Expected: FAIL — `Cannot find module './priceTrust'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/priceTrust.ts`:

```typescript
/** Trimmed-median + trust-check constants shared by the craft-flip pipeline. */

export const MIN_RECENT_SALES = 5;
export const MAX_LISTING_RATIO = 5;
export const TRIM_FRACTION = 0.1;

/**
 * Returns a robust central-tendency estimate of `prices`. Trims
 * `floor(TRIM_FRACTION * n)` entries from each end of the sorted input
 * (defusing outliers in both directions), then returns the median of the
 * remainder. With small inputs the trim is 0 and the function collapses
 * to a plain median. Returns `null` only for an empty array.
 */
export function trimmedMedian(prices: number[]): number | null {
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const k = Math.floor(sorted.length * TRIM_FRACTION);
  const sliced = k > 0 ? sorted.slice(k, sorted.length - k) : sorted;
  const arr = sliced.length > 0 ? sliced : sorted;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 1
    ? arr[mid]
    : (arr[mid - 1] + arr[mid]) / 2;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/priceTrust.test.ts`
Expected: PASS — all `trimmedMedian` + constants tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/priceTrust.ts src/lib/priceTrust.test.ts
git commit -m "feat(price-trust): add trimmedMedian + trust constants"
```

---

## Task 2: Extend `MarketItem` with per-tier median + sale count

**Files:**
- Modify: `src/lib/universalis.ts`
- Modify: `src/lib/universalis.test.ts`

- [ ] **Step 1: Update the existing `parseMarketResponse` expected output to require the new fields**

In `src/lib/universalis.test.ts`, replace the existing `'extracts min NQ, min HQ, …'` test's `expect(out['100']).toEqual({…})` block with the version below — adds four new fields (`medianNQ`, `medianHQ`, `recentSalesNQ`, `recentSalesHQ`):

```typescript
    expect(out['100']).toEqual({
      minNQ: 50,
      minHQ: 180,
      avgNQ: 60,
      avgHQ: 190,
      medianNQ: 60,        // only 1 NQ history entry, median is itself
      medianHQ: 190,       // only 1 HQ history entry
      recentSalesNQ: 1,
      recentSalesHQ: 1,
      velocity: 4.2,
      lastUploadTime: 1715000000000,
      listingCount: 3,
      worldListings: [
        { world: 'Phantom', price: 50, hq: false },
        { world: 'Phantom', price: 200, hq: true },
        { world: 'Lich', price: 180, hq: true },
      ],
      averagePriceNQ: 70,
      averagePriceHQ: 210,
    });
```

Also update the second test (`'returns null prices when no matching listings'`) to require the new fields default to null/0:

```typescript
    expect(out['7']).toEqual({
      minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
      medianNQ: null, medianHQ: null,
      recentSalesNQ: 0, recentSalesHQ: 0,
      velocity: 0, lastUploadTime: 0, listingCount: 0,
      worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    });
```

- [ ] **Step 2: Add a new test covering the trim/median behaviour on a multi-entry history**

Append to the `describe('parseMarketResponse', …)` block in `src/lib/universalis.test.ts`:

```typescript
  it('computes per-tier trimmed median + recent-sales count from recentHistory', () => {
    // 6 NQ entries, 6 HQ entries. With 6 entries the trim count is floor(0.6) = 0
    // (no trimming), so the median is the average of the two middle sorted values.
    const raw = {
      items: {
        '200': {
          listings: [],
          recentHistory: [
            { hq: false, pricePerUnit: 100 },
            { hq: false, pricePerUnit: 100 },
            { hq: false, pricePerUnit: 100 },
            { hq: false, pricePerUnit: 110 },
            { hq: false, pricePerUnit: 120 },
            { hq: false, pricePerUnit: 1_000_000 }, // RMT-shaped outlier — but no trim at n=6.
            { hq: true,  pricePerUnit: 500 },
            { hq: true,  pricePerUnit: 500 },
            { hq: true,  pricePerUnit: 600 },
            { hq: true,  pricePerUnit: 600 },
            { hq: true,  pricePerUnit: 700 },
            { hq: true,  pricePerUnit: 700 },
          ],
          regularSaleVelocity: 5,
          lastUploadTime: 1,
        },
      },
    };
    const out = parseMarketResponse(raw);
    expect(out['200'].recentSalesNQ).toBe(6);
    expect(out['200'].recentSalesHQ).toBe(6);
    // NQ sorted: [100, 100, 100, 110, 120, 1_000_000] → median of middle two = (100 + 110)/2 = 105.
    expect(out['200'].medianNQ).toBe(105);
    // HQ sorted: [500, 500, 600, 600, 700, 700] → median = (600 + 600)/2 = 600.
    expect(out['200'].medianHQ).toBe(600);
  });

  it('trims outliers from a 10-entry per-tier history', () => {
    // 10 HQ entries: trim count = floor(1.0) = 1 each side; one extreme outlier on each end.
    const hq = [1, 100, 100, 100, 100, 100, 100, 100, 100, 1_000_000];
    const raw = {
      items: {
        '201': {
          listings: [],
          recentHistory: hq.map((p) => ({ hq: true, pricePerUnit: p })),
          regularSaleVelocity: 5,
          lastUploadTime: 1,
        },
      },
    };
    const out = parseMarketResponse(raw);
    expect(out['201'].recentSalesHQ).toBe(10);
    // After trim of 1 each side: [100, 100, 100, 100, 100, 100, 100, 100] → median = 100.
    expect(out['201'].medianHQ).toBe(100);
    expect(out['201'].medianNQ).toBeNull();
    expect(out['201'].recentSalesNQ).toBe(0);
  });
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npx vitest run src/lib/universalis.test.ts`
Expected: FAIL — the existing test fails on missing fields; the new tests fail because `medianNQ`/etc. don't exist on the returned shape.

- [ ] **Step 4: Extend `MarketItem` and update `parseMarketResponse`**

In `src/lib/universalis.ts`:

(a) Add the import at the top of the file (under the existing `import { getCachedMarketScope, …}` line):

```typescript
import { trimmedMedian } from './priceTrust';
```

(b) Extend the `MarketItem` interface (around line 7) to include the new fields:

```typescript
export interface MarketItem {
  minNQ: number | null;
  minHQ: number | null;
  avgNQ: number | null;
  avgHQ: number | null;
  medianNQ: number | null;
  medianHQ: number | null;
  recentSalesNQ: number;
  recentSalesHQ: number;
  velocity: number;
  lastUploadTime: number;
  listingCount: number;
  worldListings: WorldListing[];
  averagePriceNQ: number | null;
  averagePriceHQ: number | null;
}
```

(c) Update `parseMarketResponse` (around line 49) to compute the new fields. Replace the whole `for (const [id, item] of Object.entries(items)) { … }` body with:

```typescript
  for (const [id, item] of Object.entries(items)) {
    const listings = item.listings ?? [];
    const history = item.recentHistory ?? [];
    const nqHist = history.filter((h) => !h.hq).map((h) => h.pricePerUnit);
    const hqHist = history.filter((h) => h.hq).map((h) => h.pricePerUnit);
    out[id] = {
      minNQ: minPrice(listings, false),
      minHQ: minPrice(listings, true),
      avgNQ: avgPrice(history, false),
      avgHQ: avgPrice(history, true),
      medianNQ: trimmedMedian(nqHist),
      medianHQ: trimmedMedian(hqHist),
      recentSalesNQ: nqHist.length,
      recentSalesHQ: hqHist.length,
      velocity: item.regularSaleVelocity ?? 0,
      lastUploadTime: item.lastUploadTime ?? 0,
      listingCount: listings.length,
      worldListings: listings.map((l) => ({
        world: l.worldName ?? '',
        price: l.pricePerUnit,
        hq: l.hq,
      })),
      averagePriceNQ: item.averagePriceNQ ?? null,
      averagePriceHQ: item.averagePriceHQ ?? null,
    };
  }
```

- [ ] **Step 5: Run universalis tests to verify pass**

Run: `npx vitest run src/lib/universalis.test.ts`
Expected: PASS — all tests in the file green.

- [ ] **Step 6: Run the full test suite to catch downstream breakage**

Run: `npx vitest run`
Expected: `universalis.test.ts` / `priceTrust.test.ts` pass. Other tests may now fail because they constructed `MarketItem` fixtures without the new fields — the most likely culprit is `runCraftFlip.test.ts` via its `mkPrice` helper, which Task 3 patches. Note any failures here; they get addressed in Task 3.

- [ ] **Step 7: Commit**

```bash
git add src/lib/universalis.ts src/lib/universalis.test.ts
git commit -m "feat(universalis): per-tier median + recent-sales count on MarketItem"
```

---

## Task 3: Refactor `narrowForCraftFlip` to use `pickTrustedTier`

**Files:**
- Modify: `src/features/queries/runCraftFlip.ts`
- Modify: `src/features/queries/runCraftFlip.test.ts`

- [ ] **Step 1: Extend the `mkPrice` defaults so existing tests construct valid `MarketItem` shapes**

In `src/features/queries/runCraftFlip.test.ts`, replace the existing `mkPrice` helper with:

```typescript
function mkPrice(p: Partial<MarketData[string]>): MarketData[string] {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0,
    velocity: 0, lastUploadTime: Date.now(), listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...p,
  };
}
```

- [ ] **Step 2: Rework the existing `narrowForCraftFlip` tests so they exercise the new trust rules**

In `src/features/queries/runCraftFlip.test.ts`, replace the entire `describe('narrowForCraftFlip', …)` block with:

```typescript
describe('narrowForCraftFlip', () => {
  it('keeps items that pass velocity, listingCount, tier, and trust checks', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      2: mkPrice({ minNQ: 100, medianNQ: 120, recentSalesNQ: 8,
                   velocity: 5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, minVelocity: 1, maxListings: 2 });
    expect(out.sort()).toEqual([1, 2]);
  });

  it('drops items with no price-map entry', () => {
    const out = narrowForCraftFlip(snapshot, {}, baseFilter);
    expect(out).toEqual([]);
  });

  it('drops items exceeding maxListings', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 100, medianHQ: 120, recentSalesHQ: 8,
                   velocity: 1, listingCount: 5 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, maxListings: 2 });
    expect(out).toEqual([]);
  });

  it('drops items below minVelocity', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 100, medianHQ: 120, recentSalesHQ: 8,
                   velocity: 0.5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('honors hq=hq by dropping items where item.canHq is false', () => {
    const priceMap: MarketData = {
      2: mkPrice({ minNQ: 100, medianNQ: 120, recentSalesNQ: 8,
                   velocity: 5, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, hq: 'hq' });
    expect(out).toEqual([]);
  });

  it('rejects items below MIN_RECENT_SALES (data-confidence floor)', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1000, recentSalesHQ: 4,  // 4 < 5
                   velocity: 1, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, hq: 'hq', minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('rejects items whose tier has no median (null)', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: null, recentSalesHQ: 0,
                   velocity: 1, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, hq: 'hq', minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('rejects items where minListing exceeds MAX_LISTING_RATIO × median', () => {
    // 2.5M HQ vs. 15k median = 166× — Leather Wristbands case.
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 2_500_000, medianHQ: 15_000, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, hq: 'hq', minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it("with hq='either', falls back to NQ when the HQ tier fails the trust check", () => {
    // HQ tier fails the outlier ratio, but NQ tier is healthy.
    const priceMap: MarketData = {
      1: mkPrice({
        minHQ: 2_500_000, medianHQ: 15_000, recentSalesHQ: 8,
        minNQ: 100, medianNQ: 120, recentSalesNQ: 8,
        velocity: 1, listingCount: 1,
      }),
    };
    const out = narrowForCraftFlip(snapshot, priceMap,
      { ...baseFilter, hq: 'either', minVelocity: 1 });
    expect(out).toEqual([1]); // kept via NQ tier
  });
});
```

- [ ] **Step 3: Rework the `runCraftFlip` tests for the new trust rules**

In `src/features/queries/runCraftFlip.test.ts`, replace the entire `describe('runCraftFlip', …)` block with:

```typescript
describe('runCraftFlip', () => {
  it('drops items with no recipe in recipeMap (undefined or null)', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      3: mkPrice({ minHQ:  500, medianHQ:  600, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('computes materialCost, profit, and gilPerDay using the trusted unit price', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 2, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out).toHaveLength(1);
    // Trusted tier picks min(minListing, median) = min(1000, 1200) = 1000.
    expect(out[0].unitPrice).toBe(1000);
    expect(out[0].materialCost).toBe(100); // 50 × 2
    expect(out[0].profit).toBe(900);
    expect(out[0].gilPerDay).toBe(1800);   // 900 × 2
    expect(out[0].hq).toBe(true);
  });

  it('drops items with profit ≤ 0', () => {
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 50, medianHQ: 60, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 100, medianNQ: 120, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('caps unit price at the trusted median when minListing exceeds it (but within ratio)', () => {
    // minHQ 4000 vs medianHQ 1500 → ratio 2.67 < 5, so kept. Unit price capped to 1500.
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 4000, medianHQ: 1500, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out).toHaveLength(1);
    expect(out[0].unitPrice).toBe(1500); // capped to median, NOT 4000
    expect(out[0].profit).toBe(1400);    // 1500 - 100
  });

  it('drops items with an outlier listing (minListing > MAX_LISTING_RATIO × median)', () => {
    // Leather Wristbands case: 10M listing on a 1500-median item.
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 10_000_000, medianHQ: 1500, recentSalesHQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    const out = runCraftFlip(snapshot, priceMap, recipeMap,
      { ...baseFilter, minVelocity: 1 });
    expect(out).toEqual([]);
  });

  it('sorts by gilFlow desc and slices to limit', () => {
    const recipe2: Recipe = {
      itemResultId: 2, classJob: 'WVR', recipeLevel: 50,
      ingredients: [{ itemId: 99, amount: 1 }],
    };
    const rm = new Map<number, Recipe | null>([[1, recipe1], [2, recipe2]]);
    const priceMap: MarketData = {
      1: mkPrice({ minHQ: 1000, medianHQ: 1200, recentSalesHQ: 8,
                   velocity: 2, listingCount: 1 }),
      2: mkPrice({ minNQ: 5000, medianNQ: 6000, recentSalesNQ: 8,
                   velocity: 1, listingCount: 1 }),
      99: mkPrice({ minNQ: 50, medianNQ: 60, recentSalesNQ: 8,
                    listingCount: 1 }),
    };
    // item 1: profit (1000 - 100) × 2 = 1800
    // item 2: profit (5000 -  50) × 1 = 4950
    const out = runCraftFlip(snapshot, priceMap, rm,
      { ...baseFilter, minVelocity: 1, limit: 2 });
    expect(out.map((r) => r.id)).toEqual([2, 1]);
  });
});
```

- [ ] **Step 4: Run tests to verify failure**

Run: `npx vitest run src/features/queries/runCraftFlip.test.ts`
Expected: FAIL — the existing `narrowForCraftFlip` / `runCraftFlip` implementations don't enforce the trust rules; multiple assertions in the reworked tests fail.

- [ ] **Step 5: Rewrite `runCraftFlip.ts` to use the new helper**

Replace the entire contents of `src/features/queries/runCraftFlip.ts` with:

```typescript
import type { SnapshotItem } from '../../lib/itemSnapshot';
import type { MarketData, MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
import { computeMaterialCost } from '../profit/computeProfit';
import type { CraftFlipRow, HqMode, QueryFilter, QuerySort } from './types';

interface TrustedTier { unit: number; isHq: boolean }

// Trust-checked tier selection. Returns the cheapest reliable tier price, or
// null when no tier passes the data-confidence floor, the missing-median check,
// or the listing-vs-median outlier ratio. The returned `unit` is already capped
// at the tier's trimmed-median price so callers can use it directly for profit
// math.
function pickTrustedTier(
  m: MarketItem,
  hq: HqMode,
  canHq: boolean,
): TrustedTier | null {
  const candidates: Array<{ rawMin: number | null; median: number | null; recent: number; isHq: boolean }> = [];
  if ((hq === 'hq' || hq === 'either') && canHq) {
    candidates.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  }
  if (hq === 'nq' || hq === 'either') {
    candidates.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  }
  for (const c of candidates) {
    if (c.rawMin == null) continue;
    if (c.recent < MIN_RECENT_SALES) continue;
    if (c.median == null) continue;
    if (c.rawMin > c.median * MAX_LISTING_RATIO) continue;
    return { unit: Math.min(c.rawMin, c.median), isHq: c.isHq };
  }
  return null;
}

export function narrowForCraftFlip(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  filter: QueryFilter,
): number[] {
  const catSet = filter.searchCategories.length ? new Set(filter.searchCategories) : null;
  const out: number[] = [];
  for (const item of snapshot) {
    if (catSet && !catSet.has(item.sc)) continue;
    if (filter.hq === 'hq' && !item.canHq) continue;
    const m = priceMap[item.id];
    if (!m) continue;
    if (m.velocity < filter.minVelocity) continue;
    if (filter.maxListings != null && m.listingCount > filter.maxListings) continue;
    if (pickTrustedTier(m, filter.hq, item.canHq) == null) continue;
    out.push(item.id);
  }
  return out;
}

function compare(a: CraftFlipRow, b: CraftFlipRow, sort: QuerySort): number {
  switch (sort) {
    case 'gilFlow':   return b.gilPerDay - a.gilPerDay;
    case 'velocity':  return b.velocity - a.velocity;
    case 'unitPrice': return b.unitPrice - a.unitPrice;
    case 'discount':
      return (b.profit / Math.max(1, b.unitPrice)) - (a.profit / Math.max(1, a.unitPrice));
  }
}

export function runCraftFlip(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  recipeMap: Map<number, Recipe | null>,
  filter: QueryFilter,
): CraftFlipRow[] {
  const narrowed = new Set(narrowForCraftFlip(snapshot, priceMap, filter));
  const out: CraftFlipRow[] = [];

  for (const item of snapshot) {
    if (!narrowed.has(item.id)) continue;
    const recipe = recipeMap.get(item.id);
    if (!recipe) continue;

    const m = priceMap[item.id];
    const tier = pickTrustedTier(m, filter.hq, item.canHq);
    if (!tier) continue;

    const materialCost = computeMaterialCost(recipe, recipeMap, priceMap, {});
    const profit = tier.unit - materialCost;
    if (profit <= 0) continue;
    if (filter.minPrice != null && tier.unit < filter.minPrice) continue;
    if (filter.maxPrice != null && tier.unit > filter.maxPrice) continue;

    out.push({
      id: item.id, name: item.name, sc: item.sc,
      unitPrice: tier.unit,
      materialCost,
      profit,
      velocity: m.velocity,
      gilPerDay: profit * m.velocity,
      hq: tier.isHq,
    });
  }

  out.sort((a, b) => compare(a, b, filter.sort));
  return out.slice(0, filter.limit);
}
```

- [ ] **Step 6: Run craft-flip tests to verify pass**

Run: `npx vitest run src/features/queries/runCraftFlip.test.ts`
Expected: PASS — both describe blocks green, including the three new rejection cases and the `either` fallback case.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. If a fixture in another test file (e.g. `Watchlist.test.tsx`, `SessionPlanner.test.tsx`, or `bestDeals.test.ts`) constructs `MarketItem` shapes inline and now fails type-checking on the missing fields, patch those fixtures the same way `mkPrice` was updated (set `medianNQ/medianHQ` to `null` and `recentSalesNQ/recentSalesHQ` to `0`).

- [ ] **Step 8: Commit**

```bash
git add src/features/queries/runCraftFlip.ts src/features/queries/runCraftFlip.test.ts
git commit -m "feat(craft-flip): trust-checked tier selection rejects manipulated listings"
```

---

## Task 4: Bump `craft-flip` preset `minVelocity` from 1 to 3

**Files:**
- Modify: `src/features/queries/presets.ts`

- [ ] **Step 1: Change the preset value**

In `src/features/queries/presets.ts`, find the `craft-flip` preset (around lines 43-48):

```typescript
  {
    id: 'craft-flip', label: 'Craft-flip Phantom', category: 'craft',
    desc: 'Craftable items ranked by home-world (sale − material cost) × velocity.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 1,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: null, mode: 'craft', minGap: null },
  },
```

Replace it with:

```typescript
  {
    id: 'craft-flip', label: 'Craft-flip Phantom', category: 'craft',
    desc: 'Craftable items with ≥3 sales/day on the home world, ranked by (sale − material cost) × velocity.',
    filter: { searchCategories: [], hq: 'either', minDealPct: 0, minVelocity: 3,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100,
              scope: 'home', maxListings: null, mode: 'craft', minGap: null },
  },
```

- [ ] **Step 2: Run preset tests to verify pass**

Run: `npx vitest run src/features/queries/presets.test.ts`
Expected: PASS — none of the existing preset tests assert a specific numeric `minVelocity` for `craft-flip`.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — full suite green.

- [ ] **Step 4: Commit**

```bash
git add src/features/queries/presets.ts
git commit -m "chore(presets): bump craft-flip minVelocity 1 -> 3"
```

---

## Final Verification

- [ ] **Step 1: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All tests pass; no TypeScript errors. If `tsc` flags missing fields on `MarketItem` in a consumer (a fixture in `Watchlist.test.tsx`, `SessionPlanner.test.tsx`, etc.), patch those fixtures the same way `mkPrice` was patched in Task 3.

- [ ] **Step 2: Smoke test in the running app (manual)**

Start the dev server (`npm run dev`) and exercise the **Craft-flip Phantom** preset against live Universalis data:
- Confirm Leather Wristbands (item id 5057) does **not** appear in suggestions.
- Confirm the suggestion list is shorter than before but every suggestion has a believable price.
- Open the browser devtools and confirm no console errors.
