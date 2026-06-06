# Travel Planner — design

**Date:** 2026-06-06
**Status:** Approved, ready for implementation plan

## Problem

The user wants a "travel planner": pick a server they intend to travel to, and get a
budget-aware shopping list of items that are cheap on that server and sell well back
on their home server.

This overlaps with the existing **DC Flip** page (`src/features/insights/DcFlipView.tsx`),
but flips the framing:

- **DC Flip** scans the whole data center and reports, per item, the single cheapest
  *other* world. The user does not choose where they go.
- **Travel Planner** pins a *destination the user has already decided on* and answers
  "what is my shopping list, and how do I best spend my budget there." The
  destination-pinned + budget-allocation angle is new.

DC Flip stays untouched; Travel Planner is a separate page.

## Decisions (from brainstorm)

- **New standalone page** at `/travel`, under the Gil-Making nav group.
- **Destination scope:** worlds the user can actually travel to — Chaos, Light, and
  Oceania (Materia) data centers. (`europeWorlds.ts` currently only knows Chaos + Light;
  Oceania must be added.)
- **Budget = smart allocation (basket):** given N gil, suggest an optimal basket of
  items + quantities, capped by what the home market can absorb, maximizing projected
  profit.
- **Ranking is user-selectable:** Projected profit · ROI % · Spread per unit. The chosen
  metric drives both allocation priority and the table sort.

## Architecture

Three isolated, independently-testable units plus thin wiring.

### 1. `src/lib/travelWorlds.ts` — destination catalog

- Reuse `CHAOS_WORLDS` and `LIGHT_WORLDS` from `europeWorlds.ts`.
- Add `OCEANIA_WORLDS` (Materia DC): `Bismarck`, `Ravana`, `Sephirot`, `Sophia`, `Zurvan`.
- Export the full pickable destination set (`TRAVEL_WORLDS = Chaos ∪ Light ∪ Oceania`).
- Export `dcOfTravel(world): 'Chaos' | 'Light' | 'Oceania' | null`.

### 2. `src/features/travel/planTravel.ts` — pure allocation engine

No React. Fully unit-testable over plain arrays. This is the heart of the feature.

**Signature (shape, not final):**

```ts
interface PlanTravelOpts {
  homeWorld: string;
  budget: number | null;        // null/0 => unlimited
  metric: 'profit' | 'roi' | 'spread';
  hq: HqMode;                   // 'nq' | 'hq' | 'either'
  minVelocity: number;
  horizonDays: number;          // absorption window, default 7
  applyMarketTax: boolean;
}

interface TravelRow {
  id: number; name: string; sc: number;
  units: number;               // total units to buy
  avgBuyPrice: number;
  homeSell: number;            // net-of-tax revenue per unit
  cost: number;                // sum of buy prices for the allocated units
  profit: number;              // projected net profit
  roi: number;                 // profit / cost
  velocity: number;            // home velocity
  hq: boolean;
}

interface TravelPlan {
  rows: TravelRow[];
  totalCost: number;
  totalProfit: number;
  totalUnits: number;
  blendedRoi: number;
}

function planTravel(
  items: SnapshotItem[],
  destMarket: MarketData,      // destination world's listing books
  homeMarket: MarketData,      // home world's sell price + velocity
  opts: PlanTravelOpts,
): TravelPlan;
```

**Algorithm, per candidate item:**

1. `netRevenue/unit` = home sell price via `pickHighestTrustedTier` (from `src/lib/priceTrust.ts`),
   net of 5% MB tax when `applyMarketTax` (reuse `applyTax` from `computeProfit`).
2. `absorptionCap = max(1, ceil(homeVelocity × horizonDays))`. Items with
   `homeVelocity < minVelocity` are skipped (can't offload).
3. Walk the destination world's `worldListings` cheapest-first, emitting **marginal
   buy-units** — each unit carries its own `buyPrice` (that listing's price) and
   `marginalProfit = netRevenue − buyPrice`. Respect each listing's `quantity` (missing
   `quantity` ⇒ treat as 1, for older cache rows). Emit up to `absorptionCap` units
   total. **Stop as soon as a unit is unprofitable** — listings only get pricier.

**Global allocation:** pool every item's marginal units, order by the chosen metric:

- `profit` → `marginalProfit` desc
- `roi` → `marginalProfit / buyPrice` desc (provably optimal for max-profit-under-budget)
- `spread` → gross `(homeGross − buyPrice)` desc

Greedily take units while cumulative cost ≤ budget (no budget ⇒ take all profitable units
up to the caps). Re-aggregate selected units back into one `TravelRow` per item.

### 3. `TravelPlannerView.tsx` + `TravelResults.tsx`

Mirror the current house style: `EmptyShelfView` / `EmptyShelfResults` +
`ResultTableScaffold`.

**`TravelPlannerView`** (fetch + state + FilterBar):

- Candidate IDs = watchlist items first, then top-ilvl tradeable catalog, capped ~500
  (same approach as DC Flip). Honor `hideCrystals` and the HQ-capable filter when `hq='hq'`.
- Two parallel per-world fetches via `fetchInBatches`: `fetchMarketData(destWorld, …)`
  (destination listing books) and `fetchMarketData(homeWorld, …)` (home sell + velocity).
- Auto-run on load via `useInitialScan`; "Run scan" + stale-filter hint, same as the
  other scan views.

**FilterBar inputs:**

- Destination world dropdown — `TRAVEL_WORLDS` minus the home world.
- Budget (gil) — empty/0 = unlimited.
- Rank by — Projected profit · ROI % · Spread/unit.
- HQ mode (nq/hq/either) and Min sales/day.
- Sell horizon (days), default 7.

**`TravelResults`** (presentation via `ResultTableScaffold`):

- Summary band above the table: destination · spend / budget · total projected profit ·
  blended ROI · items / units.
- Sortable table: `Item · Units · Avg buy · Home sell · Cost · Profit · ROI · Vel`, with
  `ItemNameLinks`, CSV export, density toggle.

### 4. Wiring

- `src/routes/Travel.tsx` route wrapper.
- Register the route in `App.tsx`.
- Add the nav entry in **both** `Sidebar.tsx` and `Header.tsx` under Gil-Making
  (two nav surfaces — easy to miss one).

## Edge cases

- Destination = home world: excluded from the picker.
- Listing `quantity` missing (older cache): treat as 1.
- Zero / sub-threshold home velocity: filtered out by Min sales/day.
- No budget set: fill all profitable units up to absorption caps.
- Universalis batch errors: surfaced via the scaffold's skipped-chunks line, same as
  other scans.

## Testing

- **`planTravel`** — heavy unit coverage: tax math; ROI vs profit vs spread ordering;
  budget cutoff; absorption cap; marginal-listing walk across multiple listings;
  unprofitable-stop; `quantity` fallback to 1; empty/zero-velocity skip; blended ROI and
  summary totals.
- **`travelWorlds`** — `dcOfTravel` for each DC + unknown world.
- **View** — one light render test (loads, runs, renders rows) following the
  `EmptyShelfView` test shape.

## Scoped out of v1 (future)

- Per-stack-size buy hints (which stack sizes actually move at home).
- "Is the trip worth it" threshold / travel-cooldown awareness.
- Showing profitable-but-didn't-fit-budget items dimmed below the basket.
- NA / JP region support (currently Europe + Oceania only).
