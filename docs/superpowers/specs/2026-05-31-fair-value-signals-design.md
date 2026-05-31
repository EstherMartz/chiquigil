# Fair-Value Signals — Design

**Date:** 2026-05-31
**Status:** Proposed

## Context

A user asked whether crypto-style chart-pattern analysis (head & shoulders,
triangles, candlesticks, RSI/MACD) fits the FFXIV marketboard. Verdict: the
**pattern-recognition** half doesn't — the boards are low-liquidity,
supply-anchored, undercut-driven, and non-reflexive (nobody trades our charts),
so classical TA mostly fits shapes to noise and emits false signals. But the
**statistical** half does transfer, and we've already started it:
`priceHistoryStats` computes VWAP, a 25–75 percentile band, and daily buckets;
`computeProfit` knows the crafting cost floor; the vendor snapshot knows the
price ceiling.

This plan adds a small **fair-value layer**: where does an item sit relative to
its own typical price (mean reversion), bounded by fundamental floor (craft
cost) and ceiling (vendor price), tagged by volatility and data confidence —
surfaced as a plain-language verdict and a "buy low" list. No pattern matching,
no persistence, all derived from data we already fetch.

## Goal

A per-item **fair-value signal** — *cheap / fair / rich now*, with a z-score vs
the item's own price distribution, fundamental floor/ceiling, a volatility tag,
and a confidence gate — shown on the item page (verdict + chart reference lines)
and aggregated into a Dashboard "Value plays" tile. Pure, tested, live-only.

## The model (what actually transfers from the deck)

| Concept | FFXIV-native form | Source |
|---|---|---|
| **Mean reversion** | z = (current − mean) / stdev of recent daily prices; percentile vs the VWAP band | history entries |
| **Support** | crafting **material cost = floor** ("can't profitably craft below this") | `computeProfit.materialCost` |
| **Resistance** | **vendor price = ceiling** ("upside capped — buyers go to the NPC") | vendor snapshot |
| **Volatility / risk** | coefficient of variation = stdev / mean → low / med / high | daily buckets |
| **Confidence** | gate on sale count + freshness; below a threshold → "insufficient data" | sales count, `confidence()` in `verdict/pricing.ts` |

Deliberately **out of scope:** candlestick/H&S/triangle recognition, RSI/MACD,
Fibonacci — low ROI and false confidence in this market.

## Part A — Pure core

**Extend `priceHistoryStats` (`src/features/items/PriceHistoryCard.tsx`)** to also
return `meanDaily` and `stdevDaily` (computed from the daily-mean array it already
builds — same place `bandLo/bandHi` come from). Add to the existing test.

**New `src/features/fairvalue/fairValue.ts` (+ test):**
- `summarizeHistory(entries: HistoryEntry[], nowMs?)` → `{ mean, stdev, vwap, count, median }` — a pure rollup over raw sale entries, so callers that have history (the watchlist hook) can get distribution stats without the full chart machinery.
- `classifyValue(input)` → `FairValueSignal`:
  ```ts
  interface FairValueSignal {
    valuation: 'cheap' | 'fair' | 'rich' | 'unknown';
    zScore: number | null;          // (current − mean) / stdev
    pctVsFair: number | null;       // (current − mean) / mean, signed
    volatility: 'low' | 'med' | 'high' | null;  // cv = stdev/mean
    floor: number | null;           // craft material cost
    ceiling: number | null;         // vendor price
    belowFloor: boolean;            // current < craft cost
    nearCeiling: boolean;           // current within ~5% of vendor price
    confident: boolean;             // count >= MIN_SALES (e.g. 8) && fresh
    verdict: string;                // one-line plain-language summary
  }
  ```
  Thresholds (tunable, centralized): `cheap` when `zScore <= -0.7` or `current < bandLo`; `rich` when `zScore >= 0.7` or `current > bandHi`; else `fair`. `unknown`/not-confident when `count < MIN_SALES`. Volatility cv bands ~ `<0.15 low`, `<0.4 med`, else `high`. Verdict string composes the pieces ("20% under fair value · low volatility · accumulate").

## Part B — Item page

- **`FairValueCard`** (new, `src/features/items/FairValueCard.tsx`): renders the verdict + z-score, fair (VWAP/mean), floor, ceiling, volatility, and a confidence caveat when thin. Mount near `PriceHistoryCard`. **Read `VerdictCard.tsx` first** — it already gives a buy/craft/gather/flip recommendation; fair-value is the *timing* layer (cheap/rich now) and should compose with it, not duplicate. Prefer folding the one-liner into the existing verdict area if it reads cleanly.
- **Chart reference lines:** extend `PriceHistoryCard` with optional `floor?`/`ceiling?` props → draw dashed `ReferenceLine`s (it already draws the VWAP line + band, so this is the same pattern). Fair value is already the VWAP line.

## Part C — Dashboard "Value plays" tile

The watchlist history hook already fetches per-item sale history to compute the
week delta — we get distribution stats from the **same fetch, no new requests**.

- **Extend `useWatchlistHistory`** (`src/features/watchlist/useWatchlistHistory.ts`)
  to return, per id, a small summary `{ delta, mean, stdev, count }` via
  `summarizeHistory` (instead of only `delta`). Update its callers (Watchlist
  route maps `delta` today — keep that working).
- **New `ValuePlays` tile** (`src/features/dashboard/tiles/ValuePlays.tsx`):
  ranks watched items by how far **below** fair value they trade (most negative
  z-score), liquidity-gated (`count >= MIN_SALES`), excluding below-floor noise.
  A flipper's "buy low" list. Aggregation goes in `dashboard/aggregate.ts`
  (`valuePlays(rows, summaryById)`), unit-tested like the others.

## Part D — Watchlist tag (optional, last)

A compact valuation chip (cheap/fair/rich) on watchlist rows, gated behind the
same confidence rule. Lowest priority; ship if the rest lands cleanly.

## Phasing

1. Core: `priceHistoryStats` mean/stdev + `fairValue.ts` (`summarizeHistory`, `classifyValue`) + tests.
2. Item page: `FairValueCard` + floor/ceiling chart lines (compose with `VerdictCard`).
3. Dashboard: extend `useWatchlistHistory` summary + `ValuePlays` tile + `aggregate.valuePlays`.
4. (optional) Watchlist valuation chip.

## Verification

- **Vitest** for the pure core: `summarizeHistory` (mean/stdev/vwap/count, empty input), `classifyValue` (cheap/fair/rich, unknown when thin, below-floor and near-ceiling flags, volatility bands), `aggregate.valuePlays` (z-sort, liquidity gate). Mirror the existing `priceHistoryStats`/`aggregate` test style.
- **Manual** (`npm run dev`): open a liquid item — confirm the verdict matches the chart (cheap when the line sits under the band, rich above), floor/ceiling lines render; open a thin item — confirm "insufficient data" rather than a confident call; check the Dashboard "Value plays" list ranks the most-underpriced liquid items and excludes thin/below-floor noise.
- Run full `npm test` + typecheck; confirm the `useWatchlistHistory` return-shape change is handled by all callers.

## Files at a glance

**Create:** `src/features/fairvalue/fairValue.ts` (+ test); `src/features/items/FairValueCard.tsx`; `src/features/dashboard/tiles/ValuePlays.tsx`.

**Modify:** `src/features/items/PriceHistoryCard.tsx` (mean/stdev in `priceHistoryStats`; `floor`/`ceiling` props + lines); `src/features/watchlist/useWatchlistHistory.ts` (per-item summary) + its callers; `src/features/dashboard/aggregate.ts` (+ test) and `DashboardView.tsx`; the item page (`src/routes/Item.tsx`) to mount the card.

**Reuse:** `priceHistoryStats`, `computeProfit` (floor), vendor snapshot (ceiling), `confidence()` in `verdict/pricing.ts`, `fmtGil`, the existing `ReferenceLine`/band rendering, and the `VerdictCard` it composes with.
