# Verdict Scoring Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the item detail page's first-match verdict cascade with a tax-aware, confidence-weighted model that scores competing plays and surfaces the genuinely best one plus a runner-up.

**Architecture:** Extract verdict logic from `VerdictCard.tsx` into a pure `src/features/items/verdict/` module: shared numeric helpers (`pricing.ts`), candidate-play generators (`plays.ts`), and an orchestrator (`computeVerdict.ts`) that scores/normalizes candidates within the item's own set. `VerdictCard.tsx` becomes presentation only.

**Tech Stack:** React + Vite + TypeScript + Vitest + Tailwind. Market data from `src/lib/universalis.ts` (`MarketItem`).

**Spec:** `docs/superpowers/specs/2026-05-29-verdict-scoring-design.md`

**Test command:** `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`.

**Key facts the implementer must rely on:**
- `MarketItem` fields: `minNQ, minHQ, avgNQ, avgHQ, recentSalesNQ, recentSalesHQ, velocity, lastUploadTime, listingCount, worldListings: { world, price, hq }[]`. `lastUploadTime` is epoch **milliseconds** (0 = unknown).
- `Recipe` has `classJob`, `recipeLevel`, `ingredients`, `itemResultId`.
- Current `VerdictCard` props (in `src/routes/Item.tsx` ~line 167): `phantom, region, recipe, vendorPrice, materialCost, homeWorld, canHq`. We will add a `now` prop.
- `fmtGil` is exported from `src/lib/format.ts`.

---

### Task 1: Constants, types, and core pricing helpers

**Files:**
- Create: `src/features/items/verdict/types.ts`
- Create: `src/features/items/verdict/pricing.ts`
- Test: `src/features/items/verdict/pricing.test.ts`

- [ ] **Step 1: Write the failing test** `src/features/items/verdict/pricing.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  applyTax, captureShare, effectiveUnitsPerDay, robustSellPrice, MB_TAX,
} from './pricing';
import type { MarketItem } from '../../../lib/universalis';

function mkt(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: 0,
    listingCount: 0, worldListings: [], ...over,
  } as MarketItem;
}

describe('applyTax', () => {
  it('subtracts the 5% marketboard tax', () => {
    expect(MB_TAX).toBe(0.05);
    expect(applyTax(1000)).toBe(950);
  });
});

describe('captureShare', () => {
  it('is full with no competition and a fair share otherwise', () => {
    expect(captureShare(0)).toBe(1);
    expect(captureShare(3)).toBe(0.25);
  });
  it('clamps negative listing counts to full share', () => {
    expect(captureShare(-5)).toBe(1);
  });
});

describe('effectiveUnitsPerDay', () => {
  it('is velocity times capture share', () => {
    expect(effectiveUnitsPerDay(8, 3)).toBe(2);
  });
});

describe('robustSellPrice', () => {
  it('anchors on recent-sale average, undercutting to the lowest listing', () => {
    const m = mkt({ minNQ: 90, avgNQ: 100, recentSalesNQ: 5 });
    expect(robustSellPrice(m, 'NQ')).toBe(90);
  });
  it('caps at the average when the lowest listing is above it', () => {
    const m = mkt({ minNQ: 130, avgNQ: 100, recentSalesNQ: 5 });
    expect(robustSellPrice(m, 'NQ')).toBe(100);
  });
  it('falls back to the lowest listing when there are no recent sales', () => {
    const m = mkt({ minHQ: 200, avgHQ: 180, recentSalesHQ: 0 });
    expect(robustSellPrice(m, 'HQ')).toBe(200);
  });
  it('returns null when neither a listing nor an average exists', () => {
    expect(robustSellPrice(mkt({}), 'NQ')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/items/verdict/pricing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `types.ts`**

```ts
// src/features/items/verdict/types.ts
export type PlayKind = 'list' | 'craft' | 'arb' | 'vendor' | 'untraded';
export type Quality = 'NQ' | 'HQ';
export type Tone = 'gold' | 'good' | 'aether' | 'warn' | 'bad' | 'mute';

export interface Play {
  kind: PlayKind;
  quality: Quality;
  sellPrice: number;
  cost: number;
  netPerUnit: number;
  effectiveUnitsPerDay: number;
  gilPerDay: number;
  roi: number | null;
  confidence: number;
  score: number;
  headline: string;
  rationale: string;
  bestPlay: string;
  bestPlayDetail: string;
  risk: string;
  tone: Tone;
}

export interface VerdictResult {
  best: Play;
  runnerUp: Play | null;
}
```

- [ ] **Step 4: Implement core helpers in `pricing.ts`**

```ts
// src/features/items/verdict/pricing.ts
import type { MarketItem } from '../../../lib/universalis';
import type { Quality } from './types';

// ── Tunable constants (centralized for easy adjustment) ──
export const MB_TAX = 0.05;
export const FRESH_HOURS = 24;
export const STALE_DAYS = 14;
export const FULL_LIQUIDITY_SALES = 10;
export const HEALTHY_VELOCITY = 5;
export const CONFIDENCE_LOW = 0.35;
export const BLEND_GIL = 0.5;
export const BLEND_ROI = 0.5;
export const RUNNER_UP_MIN_SCORE = 0.05;
export const ARB_DISCOUNT = 0.7;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export function applyTax(price: number): number {
  return price * (1 - MB_TAX);
}

export function captureShare(listingCount: number): number {
  const n = listingCount > 0 ? listingCount : 0;
  return 1 / (1 + n);
}

export function effectiveUnitsPerDay(velocity: number, listingCount: number): number {
  return velocity * captureShare(listingCount);
}

export function robustSellPrice(m: MarketItem, quality: Quality): number | null {
  const lowest = quality === 'HQ' ? m.minHQ : m.minNQ;
  const avg = quality === 'HQ' ? m.avgHQ : m.avgNQ;
  const recent = quality === 'HQ' ? m.recentSalesHQ : m.recentSalesNQ;
  if (recent > 0 && avg != null) {
    return lowest != null ? Math.min(lowest, avg) : avg;
  }
  if (lowest != null) return lowest;
  return null;
}

// exported for reuse / testing in later tasks
export { clamp01 };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/items/verdict/pricing.test.ts`
Expected: PASS. Then `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/items/verdict/types.ts src/features/items/verdict/pricing.ts src/features/items/verdict/pricing.test.ts
git commit -m "feat: add verdict pricing constants and core helpers"
```

---

### Task 2: Confidence, risk label, and play metrics

**Files:**
- Modify: `src/features/items/verdict/pricing.ts`
- Modify: `src/features/items/verdict/pricing.test.ts`

- [ ] **Step 1: Append failing tests** to `src/features/items/verdict/pricing.test.ts`

```ts
import { confidence, riskLabel, playMetrics } from './pricing';

const DAY = 86_400_000;
const NOW = 1_000 * DAY; // arbitrary fixed "now" in ms

describe('confidence', () => {
  it('is high for fresh data with healthy sales', () => {
    const m = mkt({ lastUploadTime: NOW - 2 * 3_600_000, recentSalesNQ: 10, velocity: 6 });
    expect(confidence(m, 'NQ', NOW)).toBeCloseTo(1, 5);
  });
  it('is zero when the upload time is unknown', () => {
    const m = mkt({ lastUploadTime: 0, recentSalesNQ: 10, velocity: 6 });
    expect(confidence(m, 'NQ', NOW)).toBe(0);
  });
  it('decays toward zero as data ages past the stale window', () => {
    const m = mkt({ lastUploadTime: NOW - 14 * DAY, recentSalesNQ: 10, velocity: 6 });
    expect(confidence(m, 'NQ', NOW)).toBeCloseTo(0, 5);
  });
  it('is low when there are no real sales even if data is fresh', () => {
    const m = mkt({ lastUploadTime: NOW - 1_000, recentSalesNQ: 0, velocity: 0 });
    expect(confidence(m, 'NQ', NOW)).toBe(0);
  });
});

describe('riskLabel', () => {
  it('flags low-confidence data regardless of velocity', () => {
    expect(riskLabel(0.2, 10)).toMatch(/Low confidence/);
  });
  it('labels strong movers', () => {
    expect(riskLabel(0.9, 6)).toMatch(/Strong/);
  });
  it('labels steady and slow sellers', () => {
    expect(riskLabel(0.9, 2)).toMatch(/Steady/);
    expect(riskLabel(0.9, 0.2)).toMatch(/Slow/);
  });
});

describe('playMetrics', () => {
  it('computes tax-aware net, throughput, gil/day, and roi', () => {
    const m = mkt({ lastUploadTime: NOW - 1_000, recentSalesNQ: 10, velocity: 8, listingCount: 3 });
    const r = playMetrics(1000, 400, m, 'NQ', NOW);
    expect(r.netPerUnit).toBe(550);            // 1000*0.95 - 400
    expect(r.effectiveUnitsPerDay).toBe(2);    // 8 * 1/(1+3)
    expect(r.gilPerDay).toBe(1100);            // 550 * 2
    expect(r.roi).toBeCloseTo(1.375, 5);       // 550 / 400
  });
  it('returns null roi when cost is zero', () => {
    const m = mkt({ lastUploadTime: NOW - 1_000, recentSalesNQ: 10, velocity: 8 });
    expect(playMetrics(1000, 0, m, 'NQ', NOW).roi).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/items/verdict/pricing.test.ts`
Expected: FAIL — `confidence`/`riskLabel`/`playMetrics` not exported.

- [ ] **Step 3: Implement in `src/features/items/verdict/pricing.ts`** (append below the existing helpers)

```ts
export interface PlayMetrics {
  netPerUnit: number;
  effectiveUnitsPerDay: number;
  gilPerDay: number;
  roi: number | null;
  confidence: number;
}

function ageScore(lastUploadTime: number, now: number): number {
  if (lastUploadTime <= 0) return 0;
  const ageHours = (now - lastUploadTime) / 3_600_000;
  const staleHours = STALE_DAYS * 24;
  if (ageHours <= FRESH_HOURS) return 1;
  if (ageHours >= staleHours) return 0;
  return 1 - (ageHours - FRESH_HOURS) / (staleHours - FRESH_HOURS);
}

function liquidityScore(m: MarketItem, quality: Quality): number {
  const recent = quality === 'HQ' ? m.recentSalesHQ : m.recentSalesNQ;
  const bySales = recent / FULL_LIQUIDITY_SALES;
  const byVelocity = m.velocity / HEALTHY_VELOCITY;
  return clamp01(Math.max(bySales, byVelocity));
}

export function confidence(m: MarketItem, quality: Quality, now: number): number {
  return ageScore(m.lastUploadTime, now) * liquidityScore(m, quality);
}

export function riskLabel(conf: number, velocity: number): string {
  if (conf < CONFIDENCE_LOW) return 'Low confidence — stale or thin data';
  if (velocity >= HEALTHY_VELOCITY) return 'Strong — moves daily';
  if (velocity >= 1) return 'Steady';
  return 'Slow seller';
}

export function playMetrics(
  sellPrice: number, cost: number, m: MarketItem, quality: Quality, now: number,
): PlayMetrics {
  const netPerUnit = applyTax(sellPrice) - cost;
  const units = effectiveUnitsPerDay(m.velocity, m.listingCount);
  return {
    netPerUnit,
    effectiveUnitsPerDay: units,
    gilPerDay: netPerUnit * units,
    roi: cost > 0 ? netPerUnit / cost : null,
    confidence: confidence(m, quality, now),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/items/verdict/pricing.test.ts`
Expected: PASS (all Task 1 + Task 2 tests). Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/features/items/verdict/pricing.ts src/features/items/verdict/pricing.test.ts
git commit -m "feat: add verdict confidence, risk label, and play metrics"
```

---

### Task 3: Candidate play generators

**Files:**
- Create: `src/features/items/verdict/plays.ts`
- Test: `src/features/items/verdict/plays.test.ts`

- [ ] **Step 1: Write the failing test** `src/features/items/verdict/plays.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { listPlay, craftPlay, arbPlay, vendorPlay } from './plays';
import type { MarketItem } from '../../../lib/universalis';
import type { Recipe } from '../../../lib/recipes';

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

function mkt(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: NOW - 1_000,
    listingCount: 0, worldListings: [], ...over,
  } as MarketItem;
}

const recipe = { itemResultId: 1, classJob: 'CRP', recipeLevel: 50, ingredients: [] } as unknown as Recipe;

describe('listPlay', () => {
  it('produces a baseline list play with zero cost and null roi', () => {
    const p = listPlay(mkt({ minNQ: 100, avgNQ: 110, recentSalesNQ: 5, velocity: 4 }), NOW);
    expect(p).not.toBeNull();
    expect(p!.kind).toBe('list');
    expect(p!.cost).toBe(0);
    expect(p!.roi).toBeNull();
  });
  it('returns null when there is no usable home price', () => {
    expect(listPlay(mkt({}), NOW)).toBeNull();
  });
});

describe('craftPlay', () => {
  it('produces an HQ craft play priced at the HQ market', () => {
    const m = mkt({ minHQ: 1000, avgHQ: 1000, recentSalesHQ: 10, velocity: 5, listingCount: 0 });
    const p = craftPlay(m, recipe, 400, 'HQ', NOW);
    expect(p!.quality).toBe('HQ');
    expect(p!.cost).toBe(400);
    expect(p!.netPerUnit).toBe(550); // 1000*0.95 - 400
  });
  it('returns null when not profitable after tax', () => {
    const m = mkt({ minNQ: 100, avgNQ: 100, recentSalesNQ: 10, velocity: 5 });
    expect(craftPlay(m, recipe, 400, 'NQ', NOW)).toBeNull();
  });
});

describe('arbPlay', () => {
  it('fires when a foreign listing is well below home', () => {
    const m = mkt({
      minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5,
      worldListings: [{ world: 'Lich', price: 500, hq: false }, { world: 'Home', price: 1000, hq: false }],
    });
    const p = arbPlay(m, m, 'Home', false, NOW);
    expect(p!.kind).toBe('arb');
    expect(p!.cost).toBe(500);
  });
  it('returns null when foreign is not cheap enough', () => {
    const m = mkt({
      minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5,
      worldListings: [{ world: 'Lich', price: 900, hq: false }],
    });
    expect(arbPlay(m, m, 'Home', false, NOW)).toBeNull();
  });
});

describe('vendorPlay', () => {
  it('fires when the NPC price beats the taxed market', () => {
    const m = mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5 });
    const p = vendorPlay(m, 200, false, NOW);
    expect(p!.kind).toBe('vendor');
    expect(p!.cost).toBe(200);
    expect(p!.netPerUnit).toBe(750); // 1000*0.95 - 200
  });
  it('returns null without a vendor price', () => {
    expect(vendorPlay(mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 5 }), undefined, false, NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/items/verdict/plays.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/features/items/verdict/plays.ts`**

```ts
import { fmtGil } from '../../../lib/format';
import type { MarketItem, WorldListing } from '../../../lib/universalis';
import type { Recipe } from '../../../lib/recipes';
import type { Play, Quality } from './types';
import { robustSellPrice, playMetrics, riskLabel, ARB_DISCOUNT } from './pricing';

function homeQuality(canHq: boolean): Quality {
  return canHq ? 'HQ' : 'NQ';
}

function bestForeignListing(
  m: MarketItem | undefined, homeWorld: string, canHq: boolean,
): WorldListing | null {
  if (!m) return null;
  const candidates = m.worldListings
    .filter((l) => l.world !== homeWorld && (canHq ? true : !l.hq))
    .sort((a, b) => a.price - b.price);
  return candidates[0] ?? null;
}

export function listPlay(phantom: MarketItem, now: number): Play | null {
  const quality: Quality = phantom.recentSalesHQ > phantom.recentSalesNQ ? 'HQ' : 'NQ';
  const sellPrice = robustSellPrice(phantom, quality);
  if (sellPrice == null) return null;
  const mtr = playMetrics(sellPrice, 0, phantom, quality, now);
  const thin = mtr.confidence < 0.35 && phantom.velocity < 1;
  return {
    kind: 'list',
    quality,
    sellPrice,
    cost: 0,
    ...mtr,
    score: 0,
    headline: thin ? "Don't trust the home price" : 'Normal marketboard listing',
    rationale: thin
      ? `Only ${phantom.listingCount} listing(s) and ${phantom.velocity.toFixed(1)} sales/day — the listed price likely isn't backed by real trades.`
      : `Sells around ${fmtGil(sellPrice)} at ${phantom.velocity.toFixed(1)}/day. No obvious arb or craft edge.`,
    bestPlay: 'List on MB',
    bestPlayDetail: `~ ${fmtGil(sellPrice)} per unit (${quality})`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: thin ? 'bad' : phantom.velocity >= 1 ? 'gold' : 'mute',
  };
}

export function craftPlay(
  phantom: MarketItem, recipe: Recipe, materialCost: number, quality: Quality, now: number,
): Play | null {
  if (materialCost <= 0) return null;
  const sellPrice = robustSellPrice(phantom, quality);
  if (sellPrice == null) return null;
  const mtr = playMetrics(sellPrice, materialCost, phantom, quality, now);
  if (mtr.netPerUnit <= 0) return null;
  return {
    kind: 'craft',
    quality,
    sellPrice,
    cost: materialCost,
    ...mtr,
    score: 0,
    headline: `Craft and sell (${quality})`,
    rationale: `Materials cost about ${fmtGil(materialCost)}; ${quality} sells around ${fmtGil(sellPrice)} at ${phantom.velocity.toFixed(1)}/day.`,
    bestPlay: 'Craft-flip',
    bestPlayDetail: `${recipe.classJob} · Lv ${recipe.recipeLevel} · ${quality}`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: 'gold',
  };
}

export function arbPlay(
  phantom: MarketItem, region: MarketItem | undefined, homeWorld: string, canHq: boolean, now: number,
): Play | null {
  const quality = homeQuality(canHq);
  const homePrice = robustSellPrice(phantom, quality);
  if (homePrice == null) return null;
  const foreign = bestForeignListing(region, homeWorld, canHq);
  if (!foreign || foreign.price <= 0 || foreign.price >= homePrice * ARB_DISCOUNT) return null;
  const mtr = playMetrics(homePrice, foreign.price, phantom, quality, now);
  if (mtr.netPerUnit <= 0) return null;
  return {
    kind: 'arb',
    quality,
    sellPrice: homePrice,
    cost: foreign.price,
    ...mtr,
    score: 0,
    headline: `Cheaper on ${foreign.world}`,
    rationale: `Buy on ${foreign.world} for ${fmtGil(foreign.price)}, resell home around ${fmtGil(homePrice)}.`,
    bestPlay: 'Cross-world arb',
    bestPlayDetail: `Buy on ${foreign.world} · resell home`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: 'good',
  };
}

export function vendorPlay(
  phantom: MarketItem, vendorPrice: number | undefined, canHq: boolean, now: number,
): Play | null {
  if (!vendorPrice || vendorPrice <= 0) return null;
  const quality = homeQuality(canHq);
  const homePrice = robustSellPrice(phantom, quality);
  if (homePrice == null) return null;
  const mtr = playMetrics(homePrice, vendorPrice, phantom, quality, now);
  if (mtr.netPerUnit <= 0) return null;
  return {
    kind: 'vendor',
    quality,
    sellPrice: homePrice,
    cost: vendorPrice,
    ...mtr,
    score: 0,
    headline: 'Buy from NPC, sell on MB',
    rationale: `Vendor sells for ${fmtGil(vendorPrice)}, MB sells around ${fmtGil(homePrice)}.`,
    bestPlay: 'Vendor flip',
    bestPlayDetail: `Buy ${fmtGil(vendorPrice)} → sell ${fmtGil(homePrice)}`,
    risk: riskLabel(mtr.confidence, phantom.velocity),
    tone: 'gold',
  };
}
```

NOTE on imports: confirm `WorldListing` is exported from `src/lib/universalis.ts` (it is: `export interface WorldListing`). If `Recipe`'s `classJob`/`recipeLevel` property names differ, read `src/lib/recipes.ts` and adjust the `bestPlayDetail` string accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/items/verdict/plays.test.ts`
Expected: PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/features/items/verdict/plays.ts src/features/items/verdict/plays.test.ts
git commit -m "feat: add verdict candidate play generators"
```

---

### Task 4: Orchestrator — scoring, normalization, selection

**Files:**
- Create: `src/features/items/verdict/computeVerdict.ts`
- Test: `src/features/items/verdict/computeVerdict.test.ts`

- [ ] **Step 1: Write the failing test** `src/features/items/verdict/computeVerdict.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { computeVerdict } from './computeVerdict';
import type { MarketItem } from '../../../lib/universalis';
import type { Recipe } from '../../../lib/recipes';

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

function mkt(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: NOW - 1_000,
    listingCount: 0, worldListings: [], ...over,
  } as MarketItem;
}
const recipe = { itemResultId: 1, classJob: 'CRP', recipeLevel: 50, ingredients: [] } as unknown as Recipe;

function base(over: Partial<Parameters<typeof computeVerdict>[0]> = {}) {
  return {
    phantom: mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5, listingCount: 1 }),
    region: undefined, recipe: undefined, vendorPrice: undefined,
    materialCost: 0, homeWorld: 'Home', canHq: false, now: NOW, ...over,
  };
}

describe('computeVerdict', () => {
  it('returns an untraded verdict when there is no home price', () => {
    const r = computeVerdict(base({ phantom: mkt({}) }));
    expect(r.best.kind).toBe('untraded');
    expect(r.runnerUp).toBeNull();
  });

  it('falls back to a list verdict with no runner-up when nothing else qualifies', () => {
    const r = computeVerdict(base());
    expect(r.best.kind).toBe('list');
    expect(r.runnerUp).toBeNull();
  });

  it('ranks a profitable craft above a plain list', () => {
    const r = computeVerdict(base({ recipe, materialCost: 200 }));
    expect(r.best.kind).toBe('craft');
    expect(r.runnerUp?.kind).toBe('list');
  });

  it('does not surface NQ craft as the runner-up to HQ craft (same play)', () => {
    const phantom = mkt({
      minNQ: 800, avgNQ: 800, recentSalesNQ: 10,
      minHQ: 1000, avgHQ: 1000, recentSalesHQ: 10, velocity: 5, listingCount: 1,
    });
    const r = computeVerdict(base({ phantom, recipe, materialCost: 200, canHq: true }));
    expect(r.best.kind).toBe('craft');
    // runner-up, if any, must not be the other craft quality
    if (r.runnerUp) expect(r.runnerUp.kind).not.toBe('craft');
  });

  it('demotes a nominal winner when its data is stale', () => {
    const fresh = computeVerdict(base({ recipe, materialCost: 200 }));
    const stale = computeVerdict(base({
      phantom: mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5, listingCount: 1, lastUploadTime: NOW - 30 * DAY }),
      recipe, materialCost: 200,
    }));
    expect(stale.best.score).toBeLessThan(fresh.best.score);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/items/verdict/computeVerdict.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/features/items/verdict/computeVerdict.ts`**

```ts
import type { MarketItem } from '../../../lib/universalis';
import type { Recipe } from '../../../lib/recipes';
import type { Play, VerdictResult } from './types';
import { robustSellPrice, BLEND_GIL, BLEND_ROI, RUNNER_UP_MIN_SCORE } from './pricing';
import { listPlay, craftPlay, arbPlay, vendorPlay } from './plays';

export interface VerdictInput {
  phantom: MarketItem | undefined;
  region: MarketItem | undefined;
  recipe: Recipe | undefined;
  vendorPrice: number | undefined;
  materialCost: number;
  homeWorld: string;
  canHq: boolean;
  now: number;
}

function untradedVerdict(): VerdictResult {
  return {
    best: {
      kind: 'untraded', quality: 'NQ', sellPrice: 0, cost: 0, netPerUnit: 0,
      effectiveUnitsPerDay: 0, gilPerDay: 0, roi: null, confidence: 0, score: 0,
      headline: 'Not enough data',
      rationale: 'No marketboard activity on the home world. Check Garland or Universalis, or wait for a listing.',
      bestPlay: 'Wait or check externally',
      bestPlayDetail: 'No play yet',
      risk: 'n/a',
      tone: 'mute',
    },
    runnerUp: null,
  };
}

export function computeVerdict(input: VerdictInput): VerdictResult {
  const { phantom, region, recipe, vendorPrice, materialCost, homeWorld, canHq, now } = input;

  // Untraded — no usable home price for either quality.
  if (!phantom || (robustSellPrice(phantom, 'NQ') == null && robustSellPrice(phantom, 'HQ') == null)) {
    return untradedVerdict();
  }

  const candidates: Play[] = [];
  const push = (p: Play | null) => { if (p) candidates.push(p); };

  push(listPlay(phantom, now));
  if (recipe) {
    push(craftPlay(phantom, recipe, materialCost, 'NQ', now));
    if (canHq) push(craftPlay(phantom, recipe, materialCost, 'HQ', now));
  }
  push(arbPlay(phantom, region, homeWorld, canHq, now));
  push(vendorPlay(phantom, vendorPrice, canHq, now));

  // Score each candidate by confidence * balanced blend, normalized within this item's set.
  const maxGil = Math.max(1, ...candidates.map((c) => c.gilPerDay));
  const roiVals = candidates.filter((c) => c.roi != null).map((c) => c.roi as number);
  const maxRoi = roiVals.length ? Math.max(1, ...roiVals) : 1;
  const costBearingRNorms = candidates
    .filter((c) => c.roi != null)
    .map((c) => (c.roi as number) / maxRoi);
  const meanRoiNorm = costBearingRNorms.length
    ? costBearingRNorms.reduce((a, b) => a + b, 0) / costBearingRNorms.length
    : 0;

  for (const c of candidates) {
    const gNorm = c.gilPerDay / maxGil;
    const rNorm = c.roi != null ? c.roi / maxRoi : meanRoiNorm;
    c.score = c.confidence * (BLEND_GIL * gNorm + BLEND_ROI * rNorm);
  }

  candidates.sort((a, b) => b.score - a.score);

  // Active plays (craft/arb/vendor) win over the passive `list` fallback: a zero-cost list has a
  // structurally higher per-unit net than crafting/buying, so it must not outrank a real edge.
  // `best` = highest-scoring active play if any exists; otherwise the list fallback.
  const best = candidates.find((c) => c.kind !== 'list') ?? candidates[0];

  // Runner-up: highest-scoring play of a DIFFERENT kind than best (so NQ-craft is never the
  // runner-up to HQ-craft), above the score floor. `list` is eligible here.
  const runnerUp = candidates.find(
    (c) => c !== best && c.kind !== best.kind && c.score >= RUNNER_UP_MIN_SCORE,
  ) ?? null;

  return { best, runnerUp };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/items/verdict/computeVerdict.test.ts`
Expected: PASS. Then `npx tsc --noEmit`.

Note: `best` is selected deterministically as the top *active* play (craft/arb/vendor) when one
exists, so "craft beats plain list" holds by construction, not by score margin. If any ranking test
fails, do NOT tweak the test to pass — report it as DONE_WITH_CONCERNS for review.

- [ ] **Step 5: Commit**

```bash
git add src/features/items/verdict/computeVerdict.ts src/features/items/verdict/computeVerdict.test.ts
git commit -m "feat: add verdict orchestrator with scoring and selection"
```

---

### Task 5: Rewire `VerdictCard` to presentation-only + render runner-up

**Files:**
- Modify: `src/features/items/VerdictCard.tsx`
- Modify: `src/routes/Item.tsx`
- Test: `src/features/items/VerdictCard.test.tsx`

- [ ] **Step 1: Write the failing render test** `src/features/items/VerdictCard.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictCard } from './VerdictCard';
import type { MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';

const DAY = 86_400_000;
const NOW = 1_000 * DAY;
function mkt(over: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0, lastUploadTime: NOW - 1_000,
    listingCount: 0, worldListings: [], ...over,
  } as MarketItem;
}
const recipe = { itemResultId: 1, classJob: 'CRP', recipeLevel: 50, ingredients: [] } as unknown as Recipe;

describe('VerdictCard', () => {
  it('renders the verdict headline and best play', () => {
    render(
      <VerdictCard
        phantom={mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5, listingCount: 1 })}
        region={undefined} recipe={undefined} vendorPrice={undefined}
        materialCost={0} homeWorld="Home" canHq={false} now={NOW}
      />,
    );
    expect(screen.getByText('✦ Verdict')).toBeInTheDocument();
    expect(screen.getByText('List on MB')).toBeInTheDocument();
  });

  it('surfaces a runner-up line when a second play qualifies', () => {
    render(
      <VerdictCard
        phantom={mkt({ minNQ: 1000, avgNQ: 1000, recentSalesNQ: 10, velocity: 5, listingCount: 1 })}
        region={undefined} recipe={recipe} vendorPrice={undefined}
        materialCost={200} homeWorld="Home" canHq={false} now={NOW}
      />,
    );
    expect(screen.getByText(/also viable/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/items/VerdictCard.test.tsx`
Expected: FAIL — current `VerdictCard` has no `now` prop / no "also viable" line.

- [ ] **Step 3: Rewrite `src/features/items/VerdictCard.tsx`** as presentation-only

```tsx
import { fmtGil } from '../../lib/format';
import type { MarketItem } from '../../lib/universalis';
import type { Recipe } from '../../lib/recipes';
import type { Play, Tone } from './verdict/types';
import { computeVerdict } from './verdict/computeVerdict';

const TONE_BORDER: Record<Tone, string> = {
  gold: 'border-l-gold', good: 'border-l-jade', aether: 'border-l-aether',
  warn: 'border-l-gold', bad: 'border-l-crimson', mute: 'border-l-border-base',
};
const TONE_TEXT: Record<Tone, string> = {
  gold: 'text-gold', good: 'text-jade', aether: 'text-aether',
  warn: 'text-gold', bad: 'text-crimson', mute: 'text-text-low',
};
const TONE_FRAME: Record<Tone, string> = {
  gold: 'border-gold/40', good: 'border-jade/40', aether: 'border-aether/40',
  warn: 'border-gold/40', bad: 'border-crimson/40', mute: 'border-border-base',
};

interface Props {
  phantom: MarketItem | undefined;
  region: MarketItem | undefined;
  recipe: Recipe | undefined;
  vendorPrice: number | undefined;
  materialCost: number;
  homeWorld: string;
  canHq: boolean;
  now?: number;
}

export function VerdictCard(props: Props) {
  const now = props.now ?? Date.now();
  const { best, runnerUp } = computeVerdict({ ...props, now });
  const v = best;

  return (
    <section
      className={`bg-bg-card border ${TONE_FRAME[v.tone]} border-l-[3px] ${TONE_BORDER[v.tone]} p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] gap-5 md:gap-7`}
    >
      <div>
        <div className={`font-mono text-[10px] tracking-widest uppercase mb-1.5 ${TONE_TEXT[v.tone]}`}>
          ✦ Verdict
        </div>
        <div className={`font-display text-xl tracking-wide mb-1.5 ${v.tone === 'bad' ? 'text-crimson' : v.tone === 'good' ? 'text-jade' : 'text-text-cream'}`}>
          {v.headline}
        </div>
        <p className="text-[12.5px] text-text-dim leading-snug">{v.rationale}</p>
        {runnerUp && (
          <p className="font-mono text-[11px] text-text-low mt-2">
            also viable: {runnerUp.bestPlay} · + {fmtGil(runnerUp.gilPerDay)}/day
          </p>
        )}
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">Best play</div>
        <div className="font-display text-base text-gold tracking-wide mb-1">{v.bestPlay}</div>
        <p className="text-[12.5px] text-text-dim leading-snug">{v.bestPlayDetail}</p>
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">Margin</div>
        {v.netPerUnit > 0 ? (
          <>
            <div className="font-mono text-2xl text-jade tabular-nums leading-none">+ {fmtGil(v.netPerUnit)}</div>
            <p className="font-mono text-[11px] text-text-dim mt-1.5">
              ~ + {fmtGil(v.gilPerDay)}/day{v.roi != null ? ` · ${Math.round(v.roi * 100)}% ROI` : ''}
            </p>
          </>
        ) : (
          <div className="font-mono text-2xl text-text-low tabular-nums leading-none">—</div>
        )}
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-widest uppercase text-text-low mb-1">Risk</div>
        <div className="font-display text-base text-text-cream tracking-wide mb-1">{v.risk}</div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Pass `now` from `src/routes/Item.tsx`**

The current `<VerdictCard ... canHq={canHq} />` (around line 167-175) needs a `now` prop. Add it as the last prop:

```tsx
          canHq={canHq}
          now={Date.now()}
```

(Locate the existing `<VerdictCard` element and add the `now={Date.now()}` line before its closing `/>`. Leave all other props unchanged.)

- [ ] **Step 5: Run tests + typecheck + full suite**

Run: `npx vitest run src/features/items/VerdictCard.test.tsx` → PASS.
Run: `npx tsc --noEmit` → no errors.
Run: `npx vitest run` → full suite green (no regressions; the old `computeVerdict`/`riskFromVelocity`/`bestForeignListing` helpers now live in the verdict module — confirm nothing else imported them from `VerdictCard.tsx`; grep `from '.*VerdictCard'` and `riskFromVelocity` to be sure).

- [ ] **Step 6: Commit**

```bash
git add src/features/items/VerdictCard.tsx src/routes/Item.tsx src/features/items/VerdictCard.test.tsx
git commit -m "feat: render scored verdict with runner-up on item page"
```

---

## Self-Review Notes

- **Spec coverage:** module split (Tasks 1–5), robust pricing + tax (Task 1), confidence + risk + metrics (Task 2), candidate generators incl. craft NQ/HQ (Task 3), within-set normalized balanced-blend scoring + best/runner-up selection + untraded short-circuit (Task 4), presentation with gil/day + runner-up line + `now` wiring (Task 5). Material-cost stays the existing input (Task 3 uses `materialCost` as-is) per the spec's scope boundary.
- **Type consistency:** `Play`/`Quality`/`Tone`/`VerdictResult` defined once in `types.ts`; `playMetrics` returns the metric subset spread into each `Play`; `computeVerdict` consumes `Play[]` and fills `score`. `VerdictInput` matches `VerdictCard` props + `now`.
- **Pre-verified:** `MarketItem`/`WorldListing` field names and `lastUploadTime` being epoch-ms; jest-dom matchers global via `src/test/setup.ts`; `VerdictCard` props/anchor in `Item.tsx`.
- **Guardrail:** Task 4 Step 4 explicitly forbids editing tests to force a pass; scoring surprises must be escalated for review.
