# Supply Depth + Market Concentration — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorm)
**Routes touched:** `/item/:id`

## Goal

Add two market-microstructure views to the item detail page:

1. **Supply Depth (#5)** — a histogram of how the current order book is distributed across price tiers, so a user can see whether the bottom of the book is thin (price about to break) or thick (supply capping upside).
2. **Market Concentration (#8)** — a seller-concentration index (HHI) that surfaces a **new, orthogonal risk dimension**: is the cheap supply controlled by one or two retainers (a single resetter can crash it) or spread across many sellers (stable)? The existing `VerdictCard` "Risk" field is a *liquidity* signal (`riskLabel(confidence, velocity)` in `verdict/pricing.ts`); concentration is a *supply-structure* signal that liquidity doesn't capture. This round renders it as its own block; folding it into the verdict's risk string is a deferred follow-up.

Both features are currently blocked on the same missing data. One small data-layer enrichment unlocks both at full fidelity.

## The data constraint (and the fix)

Today:
- `buildMarketUrl` fetches only `listings=10` per item.
- `parseMarketResponse` keeps `WorldListing = { world, price, hq }` — **quantity and retainer/seller name are dropped**.
- `LISTINGS_KEPT = 10` — only the cheapest 10 rows are cached; the full book is represented solely by the scalar `listingCount` (capped at 50).

This makes a true depth chart and a true seller-HHI impossible. The fix is one contained data-layer change:

- `buildMarketUrl`: `listings=10` → `listings=50`.
- `RawListing`: also read `quantity` and `retainerName`.
- `WorldListing`: add `quantity: number` and `seller: string`.
- `LISTINGS_KEPT`: `10` → `50` so the full book (up to the cap) is cached for both views.

### Graceful degradation

The bot's hourly `market-cache.json` will only carry the new fields after its next refresh. Until then (and for any item whose blob is stale), listings will lack `quantity`/`seller`:
- Missing `quantity` → default to `1`.
- Missing `seller` → default to `''`.
- When **all** listings for an item lack seller data, the Concentration block renders a "limited data — refreshing" note instead of a misleading HHI. The Depth block still renders (price/units work with the quantity default).

### Trade-off accepted

`market-cache.json` grows: up to 50 listing rows (was 10) plus a short seller string per row, across 3 scopes (home / DC / region). Accepted — it is a public hourly blob, not a hot path.

## Pure compute (new, no I/O, fully unit-tested)

Location: `src/features/items/` (alongside `crossWorld.ts`).

### `depthBuckets(listings: WorldListing[], hq: boolean): DepthBucket[]`
- Filters to the requested HQ tier.
- Buckets listings by price into tiers (bucket width derived from the observed min/max range; a small fixed bucket count, e.g. 8–10, so the chart stays readable).
- Each `DepthBucket = { priceLow, priceHigh, units, sellers, listings }` where `units` sums `quantity` and `sellers` counts distinct non-empty seller names in the bucket.
- Empty input → `[]`.

### `concentrationHHI(listings: WorldListing[], hq: boolean): Concentration | null`
- Filters to the requested HQ tier.
- Returns `null` when no listing in the tier has a non-empty seller (→ degraded-data note).
- Aggregates **units per seller** (sum of `quantity`), computes each seller's share of total units, then `hhi = Σ(share²)` (range `1/N`…`1`).
- Returns `{ hhi, topSellerShare, sellerCount, risk }` where `risk: RiskLevel`.
- `RiskLevel = 'deep' | 'moderate' | 'thin'` derived from `hhi` + `sellerCount` (thresholds chosen in the plan; e.g. `sellerCount <= 2 || hhi >= 0.5` → `'thin'` = risky; broad/low-HHI → `'deep'`).

## UI on `/item/:id`

Both blocks slot near the existing `CrossWorldListingsBlock`, following its section/table idiom and the page's existing HQ/NQ toggle convention.

### Supply Depth block
- recharts bar histogram: x = price tier, y = units; tooltip shows units + distinct sellers in the tier.
- HQ/NQ toggle consistent with `SaleHistoryBlock`/page convention.
- Hidden (renders `null`) when there are no listings.

### Concentration block
- Compact indicator: an HHI bar (or equivalent visual) + a one-line summary "top seller holds **X%** across **N** sellers".
- A `RiskBadge` reflecting `RiskLevel` (supply-structure risk), labelled to distinguish it from the verdict's liquidity Risk.
- Degraded-data state: "limited data — refreshing" note when `concentrationHHI` returns `null`.

## Testing

- `depthBuckets` unit tests: normal distribution, single-tier, empty, missing-quantity default.
- `concentrationHHI` unit tests: single seller (hhi=1), even spread (hhi≈1/N), missing-seller → `null`, risk-level boundaries.
- Render tests for both blocks following `CrossWorldListingsBlock.test` / `SaleHistoryBlock` patterns, including the degraded-data note.

## Non-goals (this round)

- Historical depth/concentration over time (only the current snapshot).
- Extending depth/HHI to the cross-world flip runners or scan tables — item page only.
- Per-seller drill-down or naming individual retainers in the UI (HHI is aggregate).
- Any change to the EV/Opportunity score (#3) — concentration's `RiskLevel` is designed to feed it later, but that wiring is out of scope here.
- Folding the concentration `RiskLevel` into the verdict pipeline's `Play.risk` string (`verdict/pricing.ts`) — deferred; the new block stands alone this round.

## Files

**Modify:**
- `src/lib/universalis.ts` — `buildMarketUrl`, `RawListing`, `WorldListing`, parser, `LISTINGS_KEPT`.
- `src/lib/universalis.test.ts` — update parser/url expectations for the new fields + `listings=50`.
- `src/routes/Item.tsx` — mount the two new blocks (no change to the verdict pipeline).

**Add:**
- `src/features/items/depth.ts` (+ `.test.ts`) — `depthBuckets`.
- `src/features/items/concentration.ts` (+ `.test.ts`) — `concentrationHHI`, `RiskLevel`.
- `src/features/items/SupplyDepthBlock.tsx` (+ `.test.tsx`).
- `src/features/items/ConcentrationBlock.tsx` (+ `.test.tsx`).
