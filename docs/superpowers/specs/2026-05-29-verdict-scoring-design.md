# Verdict Scoring Redesign — item detail page "best play" logic

**Date:** 2026-05-29
**Status:** Approved design, ready for implementation plan

## Goal

Replace the item detail page's verdict logic (the `VerdictCard` "best play / margin / risk" panel)
with a model that ranks competing money-making plays honestly instead of picking the first match in
a fixed cascade. The verdict should reflect the genuinely best play for an item, account for the
marketboard tax, resist lowball listings, and weight its conclusion by data confidence.

## Current state and its flaws

`computeVerdict` in `src/features/items/VerdictCard.tsx` is a fixed priority cascade
(arb → vendor → craft → thin → list); the first branch that matches wins. Flaws:

1. **No comparison between plays** — first match wins, not the best play. If craft and arb are both
   viable, arb always wins because it is checked first.
2. **No marketboard tax** — every margin ignores the ~5% MB transaction tax, overstating profit.
3. **Trusts the single cheapest listing** (`minNQ`/`minHQ`) — exactly the number a lone lowball/troll
   listing poisons. The recent-sale averages (`avgNQ`/`avgHQ`) and `recentSales*` counts already
   fetched are more robust.
4. **Per-unit margin only** — ignores throughput (a +272k item that sells monthly looks better than
   +4k×30/day) and ignores data freshness (`lastUploadTime` never enters the decision).

## Available data (already on `MarketItem`, `src/lib/universalis.ts`)

`minNQ`, `minHQ`, `avgNQ`, `avgHQ`, `recentSalesNQ`, `recentSalesHQ`, `velocity`,
`lastUploadTime`, `listingCount`, `worldListings: { world, price, hq }[]`. No per-listing
quantities are available — throughput must be modeled, not read.

## Architecture

Two-stage pipeline, with the logic extracted from `VerdictCard.tsx` into a new pure, testable
module `src/features/items/verdict/`:

- `types.ts` — `PlayKind`, `Tone`, `Play`, `VerdictResult`.
- `pricing.ts` — shared pure helpers: `robustSellPrice`, `applyTax`, `captureShare`,
  `effectiveUnitsPerDay`, `confidence`, `riskLabel`. Houses the tunable constants.
- `plays.ts` — candidate generators, each pure `(...) => Play | null`: `listPlay`, `craftPlay`
  (invoked for NQ and HQ), `arbPlay`, `vendorPlay`.
- `computeVerdict.ts` — orchestrates: build candidates, score, normalize within the candidate set,
  return `{ best, runnerUp }`. Also owns the untraded short-circuit.
- `VerdictCard.tsx` — presentation only: calls `computeVerdict`, renders best play + runner-up line.
  Keeps the existing tone/border/frame maps.

### `Play` contract

```ts
type PlayKind = 'list' | 'craft' | 'arb' | 'vendor' | 'thin' | 'untraded';
type Quality = 'NQ' | 'HQ';

interface Play {
  kind: PlayKind;
  quality: Quality;
  sellPrice: number;            // robust achievable per-unit sale price
  cost: number;                 // per-unit acquisition cost (0 for pure list)
  netPerUnit: number;           // sellPrice*(1-MB_TAX) - cost
  effectiveUnitsPerDay: number; // velocity * captureShare
  gilPerDay: number;            // netPerUnit * effectiveUnitsPerDay
  roi: number | null;           // netPerUnit / cost; null when cost === 0
  confidence: number;           // 0..1
  score: number;                // confidence * blend (filled in stage 2)
  // display
  headline: string;
  rationale: string;
  bestPlay: string;
  bestPlayDetail: string;
  risk: string;
  tone: Tone;
}

interface VerdictResult {
  best: Play;
  runnerUp: Play | null;
}
```

## Numeric model

All constants live in `pricing.ts` and are named/centralized for tuning.

### Robust sell price — `robustSellPrice(m, quality)`
- `lowestListing = min{quality} (minHQ / minNQ)`, `avg = avg{quality}`, `recentSales = recentSales{quality}`.
- If `recentSales > 0` and `avg != null`: `sellPrice = min(lowestListing ?? avg, avg)` — anchor on
  what actually sells, assume you undercut to the cheapest competing listing.
- Else if `lowestListing != null`: `sellPrice = lowestListing` (low confidence applied separately).
- Else: no price → caller treats item as untraded for that quality.

### Tax — `applyTax(price)`
`MB_TAX = 0.05`; `applyTax(price) = price * (1 - MB_TAX)`.

### Throughput — competition-adjusted fair share
`captureShare(listingCount) = 1 / (1 + listingCount)`;
`effectiveUnitsPerDay = velocity * captureShare`. (You are one of `listingCount + 1` sellers.)

### Confidence — `confidence(m)` ∈ [0,1], multiplicative
`confidence = ageScore * liquidityScore`
- `ageScore` from `lastUploadTime`: `1.0` if data age < `FRESH_HOURS` (24h), decaying linearly to
  `0` at `STALE_DAYS` (14d). `lastUploadTime === 0` (unknown) → `0`.
- `liquidityScore` from `recentSales` (for the relevant quality) and `velocity`: ramps from `0` (no
  real sales) to `1.0` at `FULL_LIQUIDITY_SALES` (10 recent sales), with a floor when `velocity`
  is healthy. Exact ramp specified in the plan.

Time "now" is passed in (parameter) so the functions stay pure and testable (no `Date.now()` inside).

### Score — balanced blend, normalized within the candidate set
After all candidate `Play`s are built:
- `maxGil = max(gilPerDay over candidates)` (guard 0 → 1).
- `maxRoi = max(roi over candidates with roi != null)` (guard 0/none → 1).
- For each play: `gNorm = gilPerDay / maxGil`; `rNorm = roi != null ? roi / maxRoi : meanRoiNorm`
  where `meanRoiNorm` is the mean `rNorm` of the cost-bearing plays (so a pure `list` play is
  neither rewarded nor punished for lacking ROI; if there are no cost-bearing plays, `rNorm = 0`
  for all and ranking falls back to gil/day).
- `score = confidence * (BLEND_GIL * gNorm + BLEND_ROI * rNorm)`, with
  `BLEND_GIL = BLEND_ROI = 0.5`.

Sort candidates by `score` descending.

**`best` selection — active plays win over the passive list.** The `list` play has no acquisition
cost, so its per-unit net (and gil/day) is structurally higher than crafting/buying the same item;
left to compete on raw gil/day it would always beat a profitable craft. That is the wrong advice
when there is a genuine acquisition edge. So `best` is the **highest-scoring *active* play**
(`craft` / `arb` / `vendor`) when any active play qualifies; `list` becomes `best` only when no
active play exists (the "just sell it" fallback).

**`runnerUp`** = the highest-scoring remaining play of a **different `kind`** than `best`, with
`score >= RUNNER_UP_MIN_SCORE` (a small floor, e.g. 0.05); otherwise `null`. Distinctness is by
`kind` so NQ-craft is never surfaced as the runner-up to HQ-craft (they are the same play). The
`list` play is eligible as a runner-up — e.g. "best play: craft-flip; also viable: just list it."

### Risk label — `riskLabel(confidence, velocity)`
Replaces `riskFromVelocity`. Combines confidence band and velocity band, e.g.:
- low confidence → `"Low confidence — stale or thin data"`
- high confidence + `velocity >= 5` → `"Strong — moves daily"`
- high confidence + mid velocity → `"Steady"`
- high confidence + low velocity → `"Slow seller"`
Exact thresholds in the plan.

## Candidate generators (`plays.ts`)

Each returns `Play | null`. They compute `sellPrice`, `cost`, `netPerUnit`,
`effectiveUnitsPerDay`, `gilPerDay`, `roi`, `confidence`, and display strings; `score` is filled in
stage 2.

- **`listPlay(phantom, canHq, now)`** — baseline resale of what you already have/gather.
  `cost = 0`, `roi = null`. Quality = the better-liquidity quality. Always produced when home has a
  usable price (it is the fallback "best").
- **`craftPlay(phantom, recipe, materialCost, quality, now)`** — produced once per quality when
  `recipe` exists and `materialCost > 0`. `cost = materialCost` (NOTE: existing approximate
  material cost; see Scope). `sellPrice = robustSellPrice(phantom, quality)`. HQ play uses HQ price;
  NQ uses NQ price. Null if no sell price for that quality or `netPerUnit <= 0`.
- **`arbPlay(phantom, region, homeWorld, canHq, now)`** — best foreign listing materially below
  home (reuse the existing `bestForeignListing` + a threshold). `cost = foreign.price`,
  `sellPrice = home robust price`. Null if no qualifying foreign listing.
- **`vendorPlay(phantom, vendorPrice, canHq, now)`** — NPC sells below MB. `cost = vendorPrice`,
  `sellPrice = home robust price`. Null unless `netPerUnit > 0` by a meaningful margin.

A **thin/untraded** condition is handled in `computeVerdict`, not as a scored play: if there is no
home price at all → `untraded` result; if the only viable play is `list` but the market is thin
(very low confidence) the `list` play's display copy reflects "don't trust the price" (tone `bad`).

## Data flow

`VerdictCard` receives the same props it does today (`phantom`, `region`, `recipe`, `vendorPrice`,
`materialCost`, `homeWorld`, `canHq`) plus a `now` timestamp (from the component, passed into the
pure layer). It calls `computeVerdict(props)` → `VerdictResult`, renders `best` into the existing
four columns and `runnerUp` (when present) as a one-line "also viable" beneath the verdict.

## Card output

Same four-column layout (Verdict / Best play / Margin / Risk). Changes:
- **Margin** column shows per-unit net **and** gil/day (e.g. `+ 4.2k` with `~ +38k/day` beneath).
- A single "also viable: `<runnerUp.bestPlay>` · `+<gil/day>`" line under the verdict block when
  `runnerUp` is present.
- **Risk** uses `riskLabel(confidence, velocity)`.

## Scope boundaries (YAGNI)

- **Material cost stays the existing `materialCost` input.** The craft-to-HQ play reuses it and sells
  at the HQ price. Deeper material sourcing (HQ mats, vendor/gather-aware, intermediate crafts) is a
  separate follow-up, explicitly out of scope here.
- No new play types beyond the current four plus the craft NQ/HQ split.
- Tunable constants (`MB_TAX`, `FRESH_HOURS`, `STALE_DAYS`, `FULL_LIQUIDITY_SALES`, blend weights,
  arb/vendor thresholds, `RUNNER_UP_MIN_SCORE`) are named and centralized in `pricing.ts`.

## Error handling / edge cases

- No home price → `untraded` result (unchanged behavior/copy).
- `cost === 0` → `roi = null`; division guards on `maxGil`/`maxRoi`.
- `velocity === 0` → `gilPerDay = 0`; play can still be the fallback `list` with low confidence.
- `lastUploadTime === 0` (unknown) → `ageScore = 0` → low confidence, honest risk label.
- Only one viable candidate → `runnerUp = null`.

## Testing

Pure functions, table-tested with Vitest:
- `pricing.ts`: `robustSellPrice` blending (recent-sales anchor, undercut, no-sales fallback);
  `applyTax`; `captureShare` vs `listingCount`; `confidence` vs data age and sales; `riskLabel`
  bands.
- `plays.ts`: each generator's null vs non-null conditions and computed fields.
- `computeVerdict.ts`: ranking scenarios — craft beats list, arb beats craft, HQ-craft beats
  NQ-craft, stale data demotes a nominal winner, untraded short-circuit, runner-up selection and
  suppression.
- `VerdictCard.tsx`: light render test that best + runner-up surface correctly (jest-dom matchers
  are global via `src/test/setup.ts`).
