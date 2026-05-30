# Housing Spike Tracker — lottery-cycle clock + craft-ahead market page

**Date:** 2026-05-30
**Status:** Approved design, ready for implementation plan

## Goal

Help the user profit from the FFXIV housing lottery: when players win plots and move in, demand for
housing/furniture items (and the materials to craft them) spikes. Build a `/housing` insight page
that (a) shows where we are in the repeating lottery cycle and how long until the next transition,
and (b) ranks housing/furniture items across three lenses so the user can craft ahead and sell into
the move-in demand.

This is a **forward-looking timing tool**, not a statistical backtest (see Non-goals).

## The lottery cycle

The FFXIV housing lottery is a fixed, continuously-repeating **9-day cycle**: 5 "entry" days
(place bids) followed by 4 "results" days (winners finalize purchases and move in). The cycle is
globally synchronized and repeats forever, so the schedule is fully derivable from a single anchor
timestamp — no per-period hardcoding.

Calibration anchor (from the user's known 2026 schedule, where an entry period began Apr 26):
`LOTTERY_ANCHOR_UTC = Date.UTC(2026, 3, 26, 8, 0, 0)` (April 26 2026, 08:00 UTC).
`CYCLE_DAYS = 9`, `ENTRY_DAYS = 5`, `RESULTS_DAYS = 4`.

> **Open calibration point (confirm during review):** the exact transition *time-of-day*. The math
> is robust regardless; an imprecise hour only affects which side of a boundary day we report for a
> few hours. Day-level precision is the UX target. The anchor time-of-day is a single constant to
> tweak once confirmed.

## Architecture

A new `/housing` page = a **lottery clock banner** + a **3-tab ranked table**, reusing the existing
insight scaffolding (`ResultTableScaffold`, `CategorySelect`/`FilterBar`, `SortableHeader`,
`ItemNameLinks`) and the verdict pricing helpers from `src/features/items/verdict/`.

### Pure modules (no network, unit-tested)

- **`src/lib/housingLottery.ts`** — the cycle clock.
  ```ts
  export type LotteryPhase = 'entry' | 'results';
  export interface LotteryStatus {
    phase: LotteryPhase;
    dayInCycle: number;        // 0..8
    currentEndsAt: number;     // epoch ms of the next transition
    nextPhase: LotteryPhase;
    nextStartsAt: number;      // === currentEndsAt
    msRemaining: number;       // until the current phase ends
    daysRemaining: number;     // ceil(msRemaining / day)
  }
  export function lotteryStatus(now: number): LotteryStatus;
  ```
  Computed by `((now - LOTTERY_ANCHOR_UTC) mod 9d)`; days 0–4 = entry, 5–8 = results. `now` is a
  parameter (no `Date.now()` inside) so it is pure and testable. Negative-modulo safe for `now`
  before the anchor.

- **`src/lib/housingItems.ts`** — candidate derivation.
  - `housingCategoryIds(): number[]` — wraps `categoriesByGroup('Housing')` from
    `itemSearchCategories.ts` (ids 56, 65–72, 81, 82).
  - `isHousingItem(sc: number): boolean`.
  - `furnishingCandidates(items: SnapshotItem[], recipes: RecipeMap): number[]` — housing-category
    items that have a recipe.
  - `materialCandidates(recipes: RecipeMap, furnishingIds: number[]): number[]` — the distinct
    ingredient item ids consumed by the furnishing recipes.
  - `allHousingCandidates(items: SnapshotItem[]): number[]` — all housing-category items.

- **`src/features/housing/spikeSignal.ts`** — per-row signal/derivation (pure).
  ```ts
  export interface HousingRow {
    itemId: number;
    name: string;
    price: number | null;          // robust home price (reuse verdict robustSellPrice)
    velocity: number;
    momentumPct: number | null;    // 7d vs prior-week delta; null until history fetched
    craftMargin: number | null;    // net/unit after tax; null if no recipe
    craftGilPerDay: number | null; // craftMargin * effectiveUnitsPerDay; null if no recipe
  }
  export function buildHousingRow(input: {
    item: SnapshotItem;
    market: MarketItem | undefined;     // current Universalis data (price/velocity/listingCount)
    canHq: boolean;
    recipe: Recipe | undefined;         // present only for craftable items
    materialCost: number;               // 0 when no recipe
    history: HistoryEntry[] | undefined; // undefined until lazily fetched → momentumPct null
  }): HousingRow;
  ```
  Reuses `robustSellPrice`, `applyTax`, `effectiveUnitsPerDay` from the verdict module, and
  `computeWeekDelta` from `universalisHistory.ts` for `momentumPct` (null when `history` is
  undefined or has too few points).

### Components

- **`src/features/housing/LotteryClockBanner.tsx`** — renders `lotteryStatus(Date.now())`: phase
  label (Entry/Results) with tone, a 9-day cycle strip, countdown to the next transition, and
  gil-making copy keyed to the phase (entry → "craft ahead now"; results → "people are moving in —
  list now"). Pure-data driven; works offline.
- **`src/features/insights/HousingMarketView.tsx`** — tab switcher (`Furnishings` / `Materials` /
  `All housing`) + the per-tab table via `ResultTableScaffold`. Owns tab state, sort state, and the
  market/history fetch orchestration.
- **`src/routes/Housing.tsx`** — thin route wrapper composing banner + view.

### Wiring

- `src/App.tsx`: add `<Route path="/housing" element={<Housing />} />` and a `PAGE_TITLES['/housing']
  = 'Housing'` entry.
- `src/components/layout/Sidebar.tsx`: add a "Housing" link to the "Gil-Making" `NAV_GROUPS` entry.

## The three tabs

| Tab | Candidate set | Default sort | Columns |
|---|---|---|---|
| **Furnishings** | `furnishingCandidates` (housing items with a recipe) | `craftGilPerDay` desc | item, price, velocity, momentum, craft margin, gil/day |
| **Materials** | `materialCandidates` (ingredients of furnishing recipes) | `momentumPct` desc | item, price, velocity, momentum, (craft margin if intermediate craftable) |
| **All housing** | `allHousingCandidates` | `momentumPct` desc | item, price, velocity, momentum |

The "spike ranking" is simply the default sort key per tab using the existing `SortableHeader`; the
user can re-sort by any column. No opaque composite score.

## Data flow & rate-limit strategy

Universalis history is per-item and rate-limited (the app treats CORS failures as a rate-limit
signal). The design must never fetch 30-day history for the whole catalog.

1. **On tab activation**, batch-fetch **current** market data (price + velocity) for that tab's
   candidate set using the existing `fetchInBatches` + `fetchMarketData` pattern. This drives the
   price/velocity columns and the initial ranking (Furnishings ranks by craft gil/day from current
   data; Materials/All rank by velocity until momentum loads).
2. **Momentum** (the 7d-vs-prior delta, which needs the history endpoint) is fetched **lazily, only
   for the rows currently displayed** — the 25-row page `ResultTableScaffold` renders — and expands
   as the user loads more. History results are cached via React Query (per-item key, matching the
   existing `SaleHistoryBlock` fetch). Bounded to on-screen rows.
3. **"All housing"** is the largest set, so it is **filter-gated** with `CategorySelect` (pick
   sub-categories like Chairs/Tables/Rugs) and the candidate set is **capped** at a constant
   (e.g. `MAX_HOUSING_CANDIDATES = 400`) with a visible "showing N of M — narrow the filter" notice
   (no silent truncation).

## Error handling

- The clock banner is pure and offline; it always renders, independent of any fetch.
- Market fetch failure → table shows a `StatusBanner` error but the page (and banner) stay usable;
  rows already loaded remain.
- History/momentum fetch failure for a row → that row's momentum shows "—"; never blocks the table.
- Empty candidate set (e.g. a filter excludes everything) → ResultTableScaffold empty state.

## Testing

Pure functions, table-tested with Vitest:
- `housingLottery.lotteryStatus`: entry-day, results-day, exact boundaries (day 4→5, day 8→0),
  mid-period countdowns, a `now` far in the future (many cycles later), and a `now` before the
  anchor (negative modulo). Assert phase, `dayInCycle`, `daysRemaining`, `nextPhase`.
- `housingItems`: category membership; furnishing/material/all candidate derivation from sample
  items + recipes (incl. dedup of materials, exclusion of non-recipe items from Furnishings).
- `spikeSignal.buildHousingRow`: price/velocity passthrough, craft margin/gil-day when a recipe is
  present vs null when absent, `momentumPct` from sample history vs null when history missing.
- `LotteryClockBanner`: renders the correct phase label and countdown for an injected status (the
  banner should accept an optional `now`/status for test injection).
- `HousingMarketView`: light render — tabs switch the visible candidate set; table renders rows;
  momentum column shows "—" before history loads.

## Non-goals (YAGNI)

- **No statistical backtest / proven historical correlation** — Universalis' ~30-day rate-limited
  history can't support it cheaply. This tool is forward-looking.
- **No alerts/notifications** when a results period approaches — a natural follow-up, not v1.
- **No catalog-wide history fetch** — momentum is lazy and bounded to displayed rows.
- **No new bundled snapshot** — housing items are filtered on-demand from the existing item
  snapshot; no `bake-snapshots` change.
