# Trusted Pricing & Data Confidence (Craft-Flip) — Design Spec

**Date:** 2026-05-13
**Status:** Approved (in conversation)

## Goal

Stop the Craft-flip pipeline from suggesting items whose pricing data is unreliable: items with a single absurd listing (often left over from market manipulation or RMT laundering), items whose recent history is poisoned by laundered trades, or items with too little sales data to evaluate at all.

The trigger case: today the app suggested crafting **Leather Wristbands** (low-level accessory) because the only HQ listing was 2,500,000 gil on Cerberus. Actual HQ sales that week were 424–15,000 gil. The current `safeUnit` defense caps listing-min at Universalis's `averagePrice` aggregate, but `averagePrice` is itself contaminated by the same outlier trades, so the cap doesn't help.

## Non-goals

- Changing pricing in other modes (Standard query, Reposts) or other views (Watchlist, Best Deals, Arbitrage). Same logic could apply later but is out of scope here.
- Per-filter UI controls for the new constants. Hardcoded for now; can be promoted to user-tunable later if needed.
- Detecting RMT trades programmatically as a separate signal. The trimmed-median approach incidentally defeats them but doesn't flag them.
- Cross-world price triangulation. Pricing remains scoped to the world/DC the query targets.

## Architecture

Two changes:

1. **`universalis.ts`** — extend `MarketItem` with two new field pairs computed at parse time: trimmed-median price per tier (`medianNQ`, `medianHQ`) and recent-sale counts per tier (`recentSalesNQ`, `recentSalesHQ`).
2. **`runCraftFlip.ts`** — in `narrowForCraftFlip`, add a per-tier trust check that uses the new fields. Replace the existing `safeUnit` average-cap with a median-cap.

No new filter fields. No UI changes. Behavior is silent and always-on for craft-flip.

## Data flow

```
Universalis raw response
        │
        ▼ parseMarketResponse (existing path, extended)
MarketItem {
  minNQ, minHQ                 # existing — cheapest listing
  avgNQ, avgHQ                 # existing — simple mean of recentHistory
  averagePriceNQ, averagePriceHQ  # existing — Universalis aggregate
  medianNQ, medianHQ           # NEW — trimmed median per tier
  recentSalesNQ, recentSalesHQ # NEW — count of history entries per tier
  velocity, listingCount, ...  # existing
}
        │
        ▼ narrowForCraftFlip (existing call site, extended)
For each candidate:
  Pick the active tier (HQ or NQ) from filter.hq + item.canHq
  rawMin      = isHq ? minHQ : minNQ          # raw cheapest listing, pre-cap
  trusted     = isHq ? medianHQ : medianNQ    # trimmed median for that tier
  recentSales = isHq ? recentSalesHQ : recentSalesNQ

  if rawMin == null               → reject (no listings)
  if recentSales < MIN_RECENT_SALES → reject (data-confidence floor)
  if trusted == null              → reject (no usable history median)
  if rawMin > trusted * MAX_LISTING_RATIO → reject (listing is an outlier)

  unit = min(rawMin, trusted)    # cap minListing at trusted median → profit math
```

## Trimmed median algorithm

For a tier's history slice `prices: number[]`:

1. Sort ascending.
2. Let `k = floor(prices.length * TRIM_FRACTION)`. Drop `k` from each end.
3. If the remainder is empty, fall back to the median of the unsorted original (rare — only fires for very short histories).
4. Return the median of the remainder.

This trims both directions: the 1M laundering trade above and the 1-gil joke trade below are both excluded before computing the central value.

### Edge cases

| Tier history length | Trim count (k=floor(0.1·n)) | After trim | Behavior |
|---|---|---|---|
| 0 | — | — | `medianTier = null`, `recentSalesTier = 0` → rejected by confidence floor |
| 1–2 | 0 | 1–2 | `medianTier = median of all` (no trim possible). Still rejected by confidence floor (need ≥5) |
| 3–4 | 0 | 3–4 | Median of all. Rejected by confidence floor |
| 5–9 | 0 | 5–9 | Median of all. Passes confidence floor |
| 10–14 | 1 | 8–12 | Trims 1 each side. Median of remainder |
| 15+ | 1+ | 13+ | Trims floor(n/10) each side |

Universalis is called with `entries=15`, so per-tier history is realistically 0–15 entries depending on how the recent sales were split between HQ and NQ.

## Trust check in narrowing

The outlier ratio compares the *raw* `minHQ` / `minNQ` against the trusted median — capping it first (via the existing `safeUnit`) would mask the very signal we want to detect. So the trust check pulls the raw tier price directly, runs the three rejection rules, and only then computes the capped unit price for downstream math.

New helper in `runCraftFlip.ts`:

```typescript
interface TrustedTier { unit: number; isHq: boolean }

function pickTrustedTier(
  m: MarketItem,
  hq: HqMode,
  canHq: boolean,
): TrustedTier | null {
  // Resolve which tier to use (existing pickTier logic, but expose raw min + median).
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
```

In `narrowForCraftFlip`, replace the existing `if (!hasUsableTier(...)) continue;` with `if (pickTrustedTier(...) == null) continue;`.

In `runCraftFlip`, replace the existing `pickTier(...)` call (which returned the un-trusted price) with `pickTrustedTier(...)` so the same `unit` is used by both the filter and the profit math.

The existing `pickTier` and `safeUnit` helpers can be deleted — nothing else calls them. (If any other consumer is added later, they should pick their own trust policy explicitly.)

## Velocity tightening

Bump `craft-flip` preset's `minVelocity: 1 → 3` in [presets.ts](../../../src/features/queries/presets.ts). Other craft presets (`undersupply`, `housing-crafts`, `materials-crafts`) keep `minVelocity: 1` for now — `undersupply` specifically depends on lower-volume items to surface gaps, so bumping it would defeat the preset's purpose.

The data-confidence floor (`MIN_RECENT_SALES`) is the real safety net; the average-velocity bump is a secondary guard against items that happen to have a brief burst of recent sales but no sustained demand.

## Constants

Hardcoded in a new module `src/lib/priceTrust.ts` (or inline in `universalis.ts` if it stays small):

```typescript
export const MIN_RECENT_SALES = 5;    // per-tier recent sales floor
export const MAX_LISTING_RATIO = 5;   // listing-min vs trusted median
export const TRIM_FRACTION = 0.1;     // 10% each side
```

Rationale:
- **5 recent sales** — with `entries=15` and tiers split, this is a meaningful "actually sold recently" floor without being so strict it eliminates most candidates.
- **5× ratio** — the Leather Wristbands case is 167×, RMT manipulation typically pushes ≥10×. A 5× cap allows for normal price volatility (price doubled this week) without flagging it as suspicious.
- **10% trim** — standard "light winsorization." Removes the top/bottom 1-2 trades when history is 10-15 entries, kills laundering without distorting the central price.

## Components

| File | Change |
|---|---|
| `src/lib/universalis.ts` | Extend `MarketItem` with `medianNQ`, `medianHQ`, `recentSalesNQ`, `recentSalesHQ`. Update `parseMarketResponse` to compute them. |
| `src/lib/priceTrust.ts` | New. Exports constants + `trimmedMedian(prices: number[]): number \| null`. |
| `src/lib/universalis.test.ts` | New cases: trimmed median behavior, per-tier sale counts, edge cases (0/1/2/15 entries). |
| `src/lib/priceTrust.test.ts` | New. Unit-test `trimmedMedian` directly. |
| `src/features/queries/runCraftFlip.ts` | Add per-tier trust check in `narrowForCraftFlip`. Modify `safeUnit` to prefer median over avg. |
| `src/features/queries/runCraftFlip.test.ts` | New cases: outlier rejection, confidence-floor rejection, median-as-cap behavior. |
| `src/features/queries/presets.ts` | Bump `craft-flip` `minVelocity: 1 → 3`. |

## Testing

Unit-test boundaries:
- `trimmedMedian([])` → null
- `trimmedMedian([100])` → 100
- `trimmedMedian([100, 200])` → 150
- `trimmedMedian([100, 200, 300])` → 200
- `trimmedMedian([1, 100, 100, 100, 1_000_000])` (5 entries, trim 0) → 100
- `trimmedMedian([1, 100, 100, 100, 100, 100, 100, 100, 100, 1_000_000])` (10 entries, trim 1) → 100
- `parseMarketResponse` with a mixed HQ/NQ history → correct counts and medians per tier
- `narrowForCraftFlip`:
  - Item with `recentSalesHQ = 3` and HQ-only query → rejected (confidence floor)
  - Item with `minHQ = 100×medianHQ` → rejected (outlier ratio)
  - Item with `minHQ = 2×medianHQ` (normal price volatility) → kept, `tier.unit = medianHQ` (capped)
  - Item with `minHQ < medianHQ` → kept, `tier.unit = minHQ` (no cap needed)

## Risk

- **Smaller candidate pool on quiet worlds.** Worlds/DCs with sparse market activity will see more items dropped by the confidence floor. This is correct behavior (we shouldn't recommend items we can't reliably price) but worth a heads-up if the pool becomes noticeably empty.
- **Velocity bump may overshoot.** If 3 sales/day filters out too much, easy to tune the preset back to 2.
- **Trimmed median misses sophisticated manipulation.** If someone fakes 8+ "sales" in a short window, the median moves. The 5× ratio catches absurd listings but not slow-walked manipulation. Out of scope for this iteration.

## Out of scope (future work)

- Apply trusted pricing to Reposts (same trust risk applies to the cheapest-listing signal there).
- User-facing display of trusted vs. listed price (e.g., a "questionable data" warning badge in results).
- Cross-source pricing (Garland Tools, market manipulation databases).
- Promoting constants to filter parameters with UI controls.
