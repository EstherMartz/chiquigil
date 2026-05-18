# priceTrust Shared Util Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate 6 inline copies of the trust-tier helper into two named exports (`pickHighestTrustedTier` + `pickFirstTrustedTier`) in `src/lib/priceTrust.ts`, and migrate all callers. Zero user-visible change.

**Architecture:** Two new exports in `priceTrust.ts` share a private `buildCandidates` + `passesTrustFilter` + `toTier` chain. The highest-wins variant iterates all trusted candidates and returns max-`unit`; the first-match variant returns the first trusted candidate (HQ-preferred when canHq+either). All 6 callers swap inline helpers for an import.

**Tech Stack:** TypeScript, Vitest.

**IMPORTANT GIT SAFETY RULE for implementers:** Do NOT run `git checkout`, `git reset`, `git stash`, `git clean`, `git rebase`, `git restore`, `git switch`. Only `git add`, `git commit`, `git log`, `git diff`, `git show`, `git status`, `git cat-file`, `git fsck` are allowed. The repo has many unrelated modified files from prior session work — only stage the files each task touches.

**Commit trailer (every commit):**
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## File Structure

**Modify:**
- `src/lib/priceTrust.ts` — add `TrustedSaleTier` type + `HqMode` type-duplicate + `pickHighestTrustedTier` + `pickFirstTrustedTier` exports (existing constants and `trimmedMedian` unchanged)
- `src/features/queries/runVendorFlip.ts` — delete inline helper, import shared
- `src/features/queries/runCurrencyFlip.ts` — delete inline helper, import shared
- `src/features/queries/runMaterialFlip.ts` — delete inline helper, import shared
- `src/features/queries/runCraftFlip.ts` — delete inline helper, import shared
- `src/features/items/VendorSourceCard.tsx` — delete inline helper, import shared
- `src/features/items/CurrencySourceCard.tsx` — delete inline helper, import shared

**Create:**
- `src/lib/priceTrust.test.ts` — 10 tests covering both variants

---

## Task 1: Add shared util + tests

**Files:**
- Modify: `src/lib/priceTrust.ts`
- Create: `src/lib/priceTrust.test.ts`

Goal: ship the shared util in isolation. No call sites change yet; all 6 callers still have their inline helpers. Suite grows by 10.

- [ ] **Step 1: Write the failing test** at `src/lib/priceTrust.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  pickHighestTrustedTier,
  pickFirstTrustedTier,
  type TrustedSaleTier,
} from './priceTrust';
import type { MarketItem } from './universalis';

function mkMarket(opts: Partial<MarketItem>): MarketItem {
  return {
    minNQ: null, minHQ: null, avgNQ: null, avgHQ: null,
    medianNQ: null, medianHQ: null,
    recentSalesNQ: 0, recentSalesHQ: 0, velocity: 0,
    lastUploadTime: 0, listingCount: 0,
    worldListings: [], averagePriceNQ: null, averagePriceHQ: null,
    ...opts,
  };
}

describe('pickHighestTrustedTier', () => {
  it('hq=nq with only NQ trusted → returns NQ tier', () => {
    const m = mkMarket({ minNQ: 500, medianNQ: 500, recentSalesNQ: 20 });
    const tier = pickHighestTrustedTier(m, 'nq', false);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 500, isHq: false });
  });

  it('hq=hq + canHq + only HQ trusted → returns HQ tier', () => {
    const m = mkMarket({ minHQ: 2000, medianHQ: 2000, recentSalesHQ: 20 });
    const tier = pickHighestTrustedTier(m, 'hq', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 2000, isHq: true });
  });

  it('hq=hq + canHq=false → returns null (HQ candidate excluded)', () => {
    const m = mkMarket({ minHQ: 2000, medianHQ: 2000, recentSalesHQ: 20 });
    expect(pickHighestTrustedTier(m, 'hq', false)).toBeNull();
  });

  it('hq=either + canHq + both trusted, HQ higher → returns HQ', () => {
    const m = mkMarket({
      minNQ: 500, medianNQ: 500, recentSalesNQ: 20,
      minHQ: 2000, medianHQ: 2000, recentSalesHQ: 20,
    });
    const tier = pickHighestTrustedTier(m, 'either', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 2000, isHq: true });
  });

  it('hq=either + canHq + both trusted, NQ higher → returns NQ', () => {
    const m = mkMarket({
      minNQ: 5000, medianNQ: 5000, recentSalesNQ: 20,
      minHQ: 2000, medianHQ: 2000, recentSalesHQ: 20,
    });
    const tier = pickHighestTrustedTier(m, 'either', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 5000, isHq: false });
  });

  it('hq=either + canHq + HQ rejected by low recent → returns NQ', () => {
    const m = mkMarket({
      minNQ: 500, medianNQ: 500, recentSalesNQ: 20,
      minHQ: 2000, medianHQ: 2000, recentSalesHQ: 1,  // below MIN_RECENT_SALES=5
    });
    const tier = pickHighestTrustedTier(m, 'either', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 500, isHq: false });
  });

  it('rejects candidate where rawMin > median × MAX_LISTING_RATIO (outlier)', () => {
    const m = mkMarket({
      minNQ: 100000, medianNQ: 500, recentSalesNQ: 20,  // 100000 > 500*5 → outlier
    });
    expect(pickHighestTrustedTier(m, 'nq', false)).toBeNull();
  });

  it('returns null when neither candidate is trusted', () => {
    const m = mkMarket({});
    expect(pickHighestTrustedTier(m, 'either', true)).toBeNull();
  });
});

describe('pickFirstTrustedTier', () => {
  it('hq=either + canHq + both trusted → returns HQ (first in candidate order, regardless of which unit is higher)', () => {
    const m = mkMarket({
      minNQ: 5000, medianNQ: 5000, recentSalesNQ: 20,  // NQ unit is actually higher
      minHQ: 2000, medianHQ: 2000, recentSalesHQ: 20,
    });
    const tier = pickFirstTrustedTier(m, 'either', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 2000, isHq: true });
  });

  it('hq=either + canHq + HQ rejected (low recent) → falls through to NQ', () => {
    const m = mkMarket({
      minNQ: 500, medianNQ: 500, recentSalesNQ: 20,
      minHQ: 2000, medianHQ: 2000, recentSalesHQ: 1,
    });
    const tier = pickFirstTrustedTier(m, 'either', true);
    expect(tier).toEqual<TrustedSaleTier>({ unit: 500, isHq: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/priceTrust.test.ts`
Expected: FAIL — `pickHighestTrustedTier` / `pickFirstTrustedTier` / `TrustedSaleTier` not exported.

- [ ] **Step 3: Add the exports to `src/lib/priceTrust.ts`**

Append to the end of the existing file (after `trimmedMedian`):

```ts
import type { MarketItem } from './universalis';

export type HqMode = 'hq' | 'nq' | 'either';

export interface TrustedSaleTier { unit: number; isHq: boolean }

interface Candidate { rawMin: number | null; median: number | null; recent: number; isHq: boolean }

function buildCandidates(m: MarketItem, hq: HqMode, canHq: boolean): Candidate[] {
  const out: Candidate[] = [];
  if ((hq === 'hq' || hq === 'either') && canHq) {
    out.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  }
  if (hq === 'nq' || hq === 'either') {
    out.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  }
  return out;
}

function passesTrustFilter(c: Candidate): boolean {
  if (c.rawMin == null) return false;
  if (c.recent < MIN_RECENT_SALES) return false;
  if (c.median == null) return false;
  if (c.rawMin > c.median * MAX_LISTING_RATIO) return false;
  return true;
}

function toTier(c: Candidate): TrustedSaleTier {
  // passesTrustFilter guarantees rawMin/median non-null when reached.
  return { unit: Math.min(c.rawMin!, c.median!), isHq: c.isHq };
}

export function pickHighestTrustedTier(
  m: MarketItem,
  hq: HqMode,
  canHq: boolean,
): TrustedSaleTier | null {
  let best: TrustedSaleTier | null = null;
  for (const c of buildCandidates(m, hq, canHq)) {
    if (!passesTrustFilter(c)) continue;
    const tier = toTier(c);
    if (!best || tier.unit > best.unit) best = tier;
  }
  return best;
}

export function pickFirstTrustedTier(
  m: MarketItem,
  hq: HqMode,
  canHq: boolean,
): TrustedSaleTier | null {
  for (const c of buildCandidates(m, hq, canHq)) {
    if (!passesTrustFilter(c)) continue;
    return toTier(c);
  }
  return null;
}
```

The `import type { MarketItem }` should go at the top of the file alongside any other imports. The new `HqMode` type-duplicate is intentional — the canonical definition lives in `src/features/queries/types.ts` but importing from features → lib would be an upward layer violation. Both unions are structurally `'hq' | 'nq' | 'either'` so callers can freely mix.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/priceTrust.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; full suite still passes (no callers migrated yet, so baseline + 10 new = 625).

- [ ] **Step 6: Commit**

```bash
git add src/lib/priceTrust.ts src/lib/priceTrust.test.ts
git commit -m "feat(priceTrust): pickHighestTrustedTier + pickFirstTrustedTier shared exports

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migrate all 6 callers

**Files to modify (one commit, all 6 together):**
- `src/features/queries/runVendorFlip.ts`
- `src/features/queries/runCurrencyFlip.ts`
- `src/features/queries/runMaterialFlip.ts`
- `src/features/queries/runCraftFlip.ts`
- `src/features/items/VendorSourceCard.tsx`
- `src/features/items/CurrencySourceCard.tsx`

Each migration: delete inline helper + local `SaleTier`/`TrustedTier` interface, add import, swap call. **No test edits.** Every existing test for the migrated files must continue passing — that's the regression guard.

### Step 1: Migrate `src/features/queries/runVendorFlip.ts`

- [ ] **Step 1a**: Add import near the top (after the existing `priceTrust` import):

Current line 3:
```ts
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
```

Replace with:
```ts
import { pickHighestTrustedTier, type TrustedSaleTier } from '../../lib/priceTrust';
```

(The `MIN_RECENT_SALES` and `MAX_LISTING_RATIO` named imports are no longer used directly — they're consumed by the shared util. Verify no other reference to those constants exists in `runVendorFlip.ts` before deleting them.)

- [ ] **Step 1b**: Delete the local interface (line 6) and function (lines 8–27):

Current:
```ts
interface SaleTier { unit: number; isHq: boolean }

function pickTrustedSaleTier(m: MarketItem, hq: HqMode, canHq: boolean): SaleTier | null {
  const candidates: Array<{ rawMin: number | null; median: number | null; recent: number; isHq: boolean }> = [];
  if ((hq === 'hq' || hq === 'either') && canHq) {
    candidates.push({ rawMin: m.minHQ, median: m.medianHQ, recent: m.recentSalesHQ, isHq: true });
  }
  if (hq === 'nq' || hq === 'either') {
    candidates.push({ rawMin: m.minNQ, median: m.medianNQ, recent: m.recentSalesNQ, isHq: false });
  }
  // For 'either', score each candidate and pick the higher trusted price.
  let best: SaleTier | null = null;
  for (const c of candidates) {
    if (c.rawMin == null) continue;
    if (c.recent < MIN_RECENT_SALES) continue;
    if (c.median == null) continue;
    if (c.rawMin > c.median * MAX_LISTING_RATIO) continue;
    const unit = Math.min(c.rawMin, c.median);
    if (!best || unit > best.unit) best = { unit, isHq: c.isHq };
  }
  return best;
}
```

Delete entirely.

- [ ] **Step 1c**: Replace all `pickTrustedSaleTier(` call sites in the file with `pickHighestTrustedTier(`. Search for `pickTrustedSaleTier(` in the file body — likely 1–2 call sites in `runVendorFlip` function.

- [ ] **Step 1d**: Replace all usages of the local `SaleTier` type with `TrustedSaleTier` (if any annotations reference it).

### Step 2: Migrate `src/features/queries/runCurrencyFlip.ts`

Same pattern as runVendorFlip — same helper variant (highest-wins).

- [ ] **Step 2a**: Change the priceTrust import. Current line 4:
```ts
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
```
Replace with:
```ts
import { pickHighestTrustedTier, type TrustedSaleTier } from '../../lib/priceTrust';
```

- [ ] **Step 2b**: Delete the local `interface SaleTier` and `function pickTrustedSaleTier(...)`.

- [ ] **Step 2c**: Replace `pickTrustedSaleTier(` calls with `pickHighestTrustedTier(`.

- [ ] **Step 2d**: Replace local `SaleTier` type annotations with `TrustedSaleTier`.

### Step 3: Migrate `src/features/queries/runMaterialFlip.ts`

This uses **`pickFirstTrustedTier`** (first-match variant, NOT highest-wins).

- [ ] **Step 3a**: Change the priceTrust import. Current line 4:
```ts
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
```
Replace with:
```ts
import { pickFirstTrustedTier, type TrustedSaleTier } from '../../lib/priceTrust';
```

- [ ] **Step 3b**: Delete the local `interface SaleTier` and `function pickTrustedSaleTier(...)`.

- [ ] **Step 3c**: Replace `pickTrustedSaleTier(` calls with `pickFirstTrustedTier(`.

- [ ] **Step 3d**: Replace local `SaleTier` type annotations with `TrustedSaleTier`.

### Step 4: Migrate `src/features/queries/runCraftFlip.ts`

This uses **`pickFirstTrustedTier`**. The local function is named `pickTrustedTier` (not `pickTrustedSaleTier`) and the local interface is `TrustedTier` (not `SaleTier`).

- [ ] **Step 4a**: Change the priceTrust import. Current line 5:
```ts
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
```
Replace with:
```ts
import { pickFirstTrustedTier, type TrustedSaleTier } from '../../lib/priceTrust';
```

- [ ] **Step 4b**: Delete the local `interface TrustedTier` and `function pickTrustedTier(...)`.

- [ ] **Step 4c**: Replace `pickTrustedTier(` calls with `pickFirstTrustedTier(`.

- [ ] **Step 4d**: Replace local `TrustedTier` type annotations with `TrustedSaleTier`.

### Step 5: Migrate `src/features/items/VendorSourceCard.tsx`

Uses **`pickHighestTrustedTier`** with `'either'` hardcoded (the local function had no `hq` arg).

- [ ] **Step 5a**: Change the priceTrust import. Current line 2:
```ts
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
```
Replace with:
```ts
import { pickHighestTrustedTier } from '../../lib/priceTrust';
```

- [ ] **Step 5b**: Delete the local `function pickHigherTrustedTier(m, canHq) { ... }` (lines 13–27).

- [ ] **Step 5c**: Replace the call site on line 30:

Current:
```ts
const tier = homeMarket ? pickHigherTrustedTier(homeMarket, canHq) : null;
```

Replace with:
```ts
const tier = homeMarket ? pickHighestTrustedTier(homeMarket, 'either', canHq) : null;
```

### Step 6: Migrate `src/features/items/CurrencySourceCard.tsx`

Same pattern as VendorSourceCard.

- [ ] **Step 6a**: Change the priceTrust import (the existing import has both `MIN_RECENT_SALES` and `MAX_LISTING_RATIO` used by the local helper). Current:
```ts
import { MIN_RECENT_SALES, MAX_LISTING_RATIO } from '../../lib/priceTrust';
```
Replace with:
```ts
import { pickHighestTrustedTier } from '../../lib/priceTrust';
```

- [ ] **Step 6b**: Delete the local `function pickHigherTrustedTier(m, canHq) { ... }` (around lines 16–30).

- [ ] **Step 6c**: Replace the call site in `CurrencySourceCard`. Current (around line 52):
```ts
const tier = homeMarket ? pickHigherTrustedTier(homeMarket, canHq) : null;
```

Replace with:
```ts
const tier = homeMarket ? pickHighestTrustedTier(homeMarket, 'either', canHq) : null;
```

### Step 7: Verify no remaining inline helpers

- [ ] Run a grep across the codebase to confirm no inline copies remain:
```bash
grep -rn "function pickTrustedSaleTier\|function pickHigherTrustedTier\|function pickTrustedTier" src/
```
Expected: NO matches in `src/`. (Matches in `docs/superpowers/` are fine — those are historical plan/spec files.)

### Step 8: Typecheck

- [ ] Run: `npx tsc --noEmit`
Expected: clean.

### Step 9: Full test suite

- [ ] Run: `npx vitest run`
Expected: ALL existing tests pass with **zero edits**. Suite stays at 625 (10 new from Task 1; 0 net change in Task 2).

**If any test fails**, the migration introduced a regression in that specific file. STOP and investigate — the inline helper and the shared util should be behaviorally identical. Common bugs:
- Used `pickHighestTrustedTier` in a place that needed `pickFirstTrustedTier` (or vice versa) — re-check the variant table
- Forgot to delete the old inline function (causes "unused variable" tsc errors)
- Old call site uses 2-arg signature (`pickHigherTrustedTier(m, canHq)`) but new call needs 3-arg — make sure you added `'either'` for the source cards

### Step 10: Verify staging cleanliness BEFORE committing

```bash
git diff --cached --stat
```

You should see exactly 6 files staged. If unrelated files appear, unstage them with `git rm --cached <file>` (NOT `git restore --staged` — that's forbidden by the git safety rule).

### Step 11: Commit ALL 6 migrations in one commit:

```bash
git add src/features/queries/runVendorFlip.ts src/features/queries/runCurrencyFlip.ts src/features/queries/runMaterialFlip.ts src/features/queries/runCraftFlip.ts src/features/items/VendorSourceCard.tsx src/features/items/CurrencySourceCard.tsx
git commit -m "refactor(priceTrust): migrate 6 callers to shared trust-tier util

runVendorFlip, runCurrencyFlip, VendorSourceCard, CurrencySourceCard
now use pickHighestTrustedTier; runMaterialFlip and runCraftFlip use
pickFirstTrustedTier. Behavior unchanged; existing tests pass without
edits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Final verification

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: ALL tests pass. Baseline before this branch was 615; this plan adds 10 new tests (Task 1) and changes 0 tests (Task 2). Expected total ≈ 625.

- [ ] **Step 3: Grep verification**

```bash
grep -rn "function pickTrustedSaleTier\|function pickHigherTrustedTier\|function pickTrustedTier" src/
```
Expected: NO matches. The only remaining references in the whole repo to these names should be in `docs/superpowers/` (historical) and the new test file's import names (`pickHighestTrustedTier`, `pickFirstTrustedTier`).

- [ ] **Step 4: No commit for verification**

If everything passes, the refactor ships clean. No browser smoke test needed — this is a pure refactor with no UI change.

---

## Notes for the implementer

- **Behavioral guarantee:** every existing test in `runVendorFlip.test.ts`, `runCurrencyFlip.test.ts`, `runMaterialFlip.test.ts`, `runCraftFlip.test.ts`, `VendorSourceCard.test.tsx` (if it exists; may not), `CurrencySourceCard.test.tsx` must pass without edits. If you find yourself wanting to modify an existing test, STOP — the refactor has introduced a regression.

- **Variant assignment is critical:**
  - `runVendorFlip`, `runCurrencyFlip`, `VendorSourceCard`, `CurrencySourceCard` → **`pickHighestTrustedTier`**
  - `runMaterialFlip`, `runCraftFlip` → **`pickFirstTrustedTier`**

  The semantic difference: variant A picks the candidate with the highest `unit` (= max trustworthy price); variant B picks the first candidate that passes filters (HQ-preferred when canHq+either). Swapping these silently changes pricing math.

- **`MIN_RECENT_SALES` / `MAX_LISTING_RATIO` imports:** after migration, NONE of the 6 caller files import these directly anymore — the shared util uses them internally. If any caller had other code referencing these constants outside the now-deleted helper, KEEP those imports.

- **Source cards (`VendorSourceCard`, `CurrencySourceCard`):** had a 2-arg local helper; now call the 3-arg shared util with `'either'` hardcoded. Don't try to add an `hq` prop to the source cards — they always want either-mode semantics.

- **`HqMode` import in priceTrust.ts:** the spec calls for duplicating the literal union (`type HqMode = 'hq' | 'nq' | 'either'`) inline in `priceTrust.ts` rather than importing from `types.ts` (which would create an upward layer violation). Both unions are structurally identical so the 6 callers can pass their `HqMode` to the shared util seamlessly.

- **`MarketItem` import in priceTrust.ts:** the spec adds `import type { MarketItem } from './universalis'` — both files are in `src/lib/` so this is a same-layer import, no layering concern.
