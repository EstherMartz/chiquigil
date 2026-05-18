# priceTrust Shared Util Refactor — Design Spec

**Status:** Approved 2026-05-18
**Phase:** Pure cleanup / deferred follow-up from 5+ prior features
**Depends on:** Nothing functional — purely consolidates existing duplication

---

## Goal

Extract the `pickTrustedSaleTier` helper (currently inlined in 6 callers across the codebase) into `src/lib/priceTrust.ts` as two distinct named functions (`pickHighestTrustedTier` and `pickFirstTrustedTier`), and migrate all callers to use the shared util. Zero user-visible change; faster future maintenance.

## Non-goals

- No behavioral changes to any caller — every existing test passes unchanged.
- No new features.
- No reorganization of `HqMode` or other types beyond what the refactor requires.
- No refactor of `trimmedMedian` or the constants in `priceTrust.ts` — they stay as-is.

## The duplication being consolidated

Six call sites currently inline near-identical helpers:

| File | Local name | Variant | Args |
|---|---|---|---|
| `src/features/queries/runVendorFlip.ts` | `pickTrustedSaleTier` | A: highest-wins | `(m, hq, canHq)` |
| `src/features/queries/runCurrencyFlip.ts` | `pickTrustedSaleTier` | A: highest-wins | `(m, hq, canHq)` |
| `src/features/queries/runMaterialFlip.ts` | `pickTrustedSaleTier` | B: first-match | `(m, hq, canHq)` |
| `src/features/queries/runCraftFlip.ts` | `pickTrustedTier` | B: first-match | `(m, hq, canHq)` |
| `src/features/items/VendorSourceCard.tsx` | `pickHigherTrustedTier` | A: highest-wins | `(m, canHq)` (always 'either') |
| `src/features/items/CurrencySourceCard.tsx` | `pickHigherTrustedTier` | A: highest-wins | `(m, canHq)` (always 'either') |

**Shared trust-filter chain** (all variants):
1. Skip candidate if `rawMin == null`
2. Skip if `recent < MIN_RECENT_SALES` (5)
3. Skip if `median == null`
4. Skip if `rawMin > median × MAX_LISTING_RATIO` (5×)
5. Compute `unit = Math.min(rawMin, median)`

**Variant A (highest-wins):** iterate ALL candidates that pass filters, return the one with the highest `unit`.

**Variant B (first-match):** return the FIRST candidate that passes filters. Candidate order matters — HQ is pushed first when `canHq && (hq==='hq'||hq==='either')`, then NQ when `hq==='nq'||hq==='either'`.

Both candidate-build steps are identical; only the post-filter selection differs.

## Architecture

Add to `src/lib/priceTrust.ts`:

```ts
import type { MarketItem } from './universalis';
import type { HqMode } from '../features/queries/types';

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
  // `passesTrustFilter` guarantees rawMin/median non-null when reached.
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

`HqMode` lives in `src/features/queries/types.ts` today. The import is upward-pointing (lib → features), which violates layering. To avoid that, we could:
- (a) Inline the `'hq' | 'nq' | 'either'` literal union in priceTrust.ts, or
- (b) Move `HqMode` down to `priceTrust.ts` (forcing types.ts to re-export from there).

This spec chooses **(a)** — duplicate the literal union as `type HqMode = 'hq' | 'nq' | 'either'` in `priceTrust.ts`. Both modules's `HqMode` are structurally identical so callers can mix them freely. Moving the canonical definition (option b) creates a wider ripple than the refactor warrants.

## Migration

Each migrated file:
1. Delete the inline helper function body.
2. Delete the local `interface SaleTier { unit: number; isHq: boolean }` (or `TrustedTier`) — replace usages with `TrustedSaleTier` imported from `priceTrust`.
3. Replace the local function call:
   - **Variant A callers** → `pickHighestTrustedTier(m, hq, canHq)` (or `pickHighestTrustedTier(m, 'either', canHq)` for the two source cards)
   - **Variant B callers** → `pickFirstTrustedTier(m, hq, canHq)`
4. Add `import { pickHighestTrustedTier, type TrustedSaleTier } from '../../lib/priceTrust';` (or both/either as needed).

Per-file migration:

- **`runVendorFlip.ts`**: import `pickHighestTrustedTier`, delete lines 6 (SaleTier) and 8–27 (function); replace `pickTrustedSaleTier(...)` calls with `pickHighestTrustedTier(...)`.
- **`runCurrencyFlip.ts`**: same as runVendorFlip — `pickHighestTrustedTier`.
- **`runMaterialFlip.ts`**: import `pickFirstTrustedTier`, delete the SaleTier interface and `pickTrustedSaleTier` function; replace calls with `pickFirstTrustedTier(...)`.
- **`runCraftFlip.ts`**: import `pickFirstTrustedTier`, delete the TrustedTier interface and `pickTrustedTier` function; replace calls with `pickFirstTrustedTier(...)`.
- **`VendorSourceCard.tsx`**: import `pickHighestTrustedTier`, delete `pickHigherTrustedTier` function; replace the call `pickHigherTrustedTier(homeMarket, canHq)` with `pickHighestTrustedTier(homeMarket, 'either', canHq)`.
- **`CurrencySourceCard.tsx`**: same as VendorSourceCard.

## Edge cases (preserved unchanged)

- `hq='nq'` + `canHq=true`: HQ candidate is NOT added (the `(hq === 'hq' || hq === 'either')` gate excludes 'nq'). NQ-only.
- `hq='hq'` + `canHq=false`: HQ candidate is NOT added (the `&& canHq` gate). No candidates → returns null.
- `hq='either'` + `canHq=false`: only NQ candidate added.
- All trust filter rejections (null rawMin/median, low recent, outlier rawMin): candidate skipped, function may return null if all candidates skipped.

## Testing

**New `src/lib/priceTrust.test.ts` (~10 tests):**

Helper:
```ts
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
```

`pickHighestTrustedTier`:
1. `hq:'nq'` + only NQ trusted → returns NQ tier
2. `hq:'hq'` + canHq=true + only HQ trusted → returns HQ tier
3. `hq:'hq'` + canHq=false → returns null (HQ candidate excluded)
4. `hq:'either'` + canHq + both trusted, minHQ > minNQ → returns HQ (higher unit wins)
5. `hq:'either'` + canHq + both trusted, minNQ > minHQ → returns NQ (higher unit wins)
6. `hq:'either'` + canHq + HQ rejected by `recent < MIN_RECENT_SALES` → returns NQ
7. Outlier filter: rawMin > median × MAX_LISTING_RATIO → candidate rejected
8. Returns null when neither candidate trusted

`pickFirstTrustedTier`:
9. `hq:'either'` + canHq + both trusted → returns HQ (first in candidate order, regardless of which has higher unit)
10. `hq:'either'` + canHq + HQ rejected (low recent) → falls through to NQ

**Existing tests** in `runVendorFlip.test.ts`, `runCurrencyFlip.test.ts`, `runMaterialFlip.test.ts`, `runCraftFlip.test.ts`, `VendorSourceCard.test.tsx`, `CurrencySourceCard.test.tsx` all continue passing with **zero edits**. Any failure during migration = regression — stop and investigate.

**Total new tests:** ~10. Suite: 615 → ~625.

## File list

**Modify:**
- `src/lib/priceTrust.ts` (add types + 2 exports; constants unchanged)
- `src/features/queries/runVendorFlip.ts`
- `src/features/queries/runCurrencyFlip.ts`
- `src/features/queries/runMaterialFlip.ts`
- `src/features/queries/runCraftFlip.ts`
- `src/features/items/VendorSourceCard.tsx`
- `src/features/items/CurrencySourceCard.tsx`

**Create:**
- `src/lib/priceTrust.test.ts`

No changes to `types.ts`, hook files, snapshot helpers, or any other module.

## Phased delivery (single PR, 3 commits)

1. **Add shared util + tests** — `priceTrust.ts` gains `TrustedSaleTier` + `pickHighestTrustedTier` + `pickFirstTrustedTier`. New `priceTrust.test.ts` with 10 tests. No migrations yet; all 6 callers still inline. Suite goes 615 → 625.
2. **Migrate all 6 callers in one commit** — delete inline helpers, import shared util, swap calls. Suite stays 625 green; no test edits.
3. **Final verification** — typecheck + full suite (no commit if everything passes).

Each commit ships independently with passing tests + tsc clean.

## Known follow-ups out of scope

- The `HqMode` literal union now exists in two places (priceTrust.ts and types.ts). If this becomes annoying, a future cleanup can move the canonical type to a shared lower-level module — but the duplication is structurally identical so callers don't care today.
- `runCraftFlip.ts`'s local `interface TrustedTier` will be deleted but the same shape is exported as `TrustedSaleTier` — no shape change.
