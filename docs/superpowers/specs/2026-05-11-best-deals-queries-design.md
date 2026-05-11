# Best Deals Queries — Design Spec

**Date:** 2026-05-11
**Status:** Approved (in conversation)

## Goal

Add a `/queries` route inspired by saddlebagexchange.com's "Best Deals Queries". Users pick a preset (or build a custom filter) and get a ranked table of underpriced items across the entire DC market — not just their tracked watchlist pool.

V1 ships four presets plus a generic query builder backed by the same engine.

## Non-goals

- Server-side scanning or scheduled pre-aggregation (pure client).
- Cross-DC scans (Phantom/Chaos DC only, same as the rest of the app).
- Persisting query results between sessions (only the item snapshot is cached).
- Replacing the existing `/insights` views — those still operate on the tracked pool.

## Architecture

```
┌─────────────────┐    one-time     ┌──────────────────────┐
│ XIVAPI v2 sheet │ ──────────────▶ │ IndexedDB            │
│ /api/sheet/Item │  paginated      │ store: marketItems   │
└─────────────────┘                 │ ~80k rows × 6 fields │
                                    └──────────────────────┘
                                              │
                                              ▼ filter by category + HQ-capability
                                    ┌──────────────────────┐
                                    │ candidate ids        │
                                    └──────────────────────┘
                                              │ chunks of 100, concurrency 4
                                              ▼
┌─────────────────┐                 ┌──────────────────────┐
│ Universalis DC  │ ──────────────▶ │ priceMap[id]         │
│ /api/v2/{dc}/   │                 │ MarketItem           │
└─────────────────┘                 └──────────────────────┘
                                              │
                                              ▼ runQuery(): apply filters + sort
                                    ┌──────────────────────┐
                                    │ QueryResultRow[]     │
                                    └──────────────────────┘
```

**Modules (new):**
- `src/lib/itemSnapshot.ts` — fetch + cache the item DB. Pure helpers + a TanStack Query hook.
- `src/lib/universalisBulk.ts` — `chunkIds()` and `fetchInBatches()`. Pure.
- `src/features/queries/runQuery.ts` — pure filter + rank function.
- `src/features/queries/presets.ts` — preset configs + helpers.
- `src/features/queries/QueryBuilder.tsx` — form for `QueryFilter`.
- `src/features/queries/QueryResults.tsx` — results table.
- `src/routes/Queries.tsx` — top-level page with preset chips + builder + results.

**Modules (modified):**
- `src/components/layout/Header.tsx` — new nav link.
- `src/App.tsx` — new route.
- `src/routes/Settings.tsx` — new "Item DB" card with size + refresh button.

## Data shapes

```ts
interface SnapshotItem {
  id: number;
  name: string;
  sc: number;     // ItemSearchCategory id (0 means non-marketable; filtered out at write time)
  ui: number;     // ItemUICategory id
  ilvl: number;   // LevelItem
  canHq: boolean;
}

interface QueryFilter {
  searchCategories: number[];   // empty = all marketable
  hq: 'hq' | 'nq' | 'either';
  minDealPct: number;            // 0 = no filter
  minVelocity: number;            // 0 = no filter (sales/day)
  minPrice: number | null;
  maxPrice: number | null;
  sort: 'discount' | 'gilFlow' | 'velocity' | 'unitPrice';
  limit: number;                  // default 100
}

interface QueryPreset {
  id: string;
  label: string;
  desc: string;
  filter: QueryFilter;
}

interface QueryResultRow {
  id: number;
  name: string;
  sc: number;
  unitPrice: number;       // current min (matching hq filter)
  averagePrice: number;    // Universalis averagePriceNQ/HQ
  dealPct: number;         // 0–99 (rounded)
  velocity: number;        // sales/day
  gilFlow: number;         // unitPrice × velocity
  hq: boolean;             // whether the match was HQ
}
```

## Item snapshot (one-time fetch)

**Source:** XIVAPI v2, `https://v2.xivapi.com/api/sheet/Item?fields=Name,ItemSearchCategory,ItemUICategory,LevelItem,CanBeHq&limit=500&after={cursor}`.

**Filtering:** keep only rows with `ItemSearchCategory.value > 0` (marketable). Drops the non-marketable majority (quest items, currencies, dummies).

**Storage:** IndexedDB store `marketItems` on the existing `ffxiv-helper` DB. Schema upgrade adds the store. Whole snapshot persists indefinitely.

**Refresh:** Settings page exposes "Item DB · N items · last refreshed YYYY-MM-DD · [Refresh]" — the only way to invalidate.

**Fetch UX:** first query attempt triggers the snapshot. Show progress: "Loading item DB (one-time, ~30s)…  12,450 / ~80,000".

**Estimated size:** ~80k rows × ~80 bytes JSON ≈ 6 MB. Acceptable for IndexedDB.

## Universalis bulk fetcher

`fetchInBatches(ids: number[], fetchOne: (chunk: number[]) => Promise<MarketData>, concurrency = 4): Promise<{ data: MarketData, errors: number[][] }>`

- Splits `ids` into chunks of 100 (Universalis limit).
- Runs `concurrency` chunks in flight at once.
- On a chunk error, push the chunk's ids to `errors` and continue. Caller surfaces a banner.
- Merges all successful responses into one `MarketData` map.

Worst case: 80k items / 100 = 800 batches / 4 concurrency ≈ ~200 sequential rounds. At ~200ms per Universalis call that's ~40s. Most presets touch ≤5k items (≤13s).

## runQuery (pure)

```ts
function runQuery(
  snapshot: SnapshotItem[],
  priceMap: MarketData,
  filter: QueryFilter,
): QueryResultRow[]
```

Steps:
1. **Category match:** if `filter.searchCategories.length > 0`, keep snapshot items whose `sc` is in the set.
2. **HQ capability filter:** if `filter.hq === 'hq'`, drop items where `canHq === false`.
3. **Price lookup:** for each remaining item, read `priceMap[id]`. Skip if absent or both NQ/HQ data is null.
4. **HQ vs NQ pick:** per `filter.hq`:
   - `'hq'` → use `minHQ` + `averagePriceHQ`. Skip items where either is null.
   - `'nq'` → use `minNQ` + `averagePriceNQ`. Skip items where either is null.
   - `'either'` → use the lower of `(minHQ, minNQ)` and its matching `averagePrice*`. Tag `hq` accordingly.
5. **Compute** `dealPct = round((avg - current) / avg * 100)`, `gilFlow = current * velocity`.
6. **Threshold filters:** drop rows failing `minDealPct`, `minVelocity`, `minPrice`, `maxPrice`.
7. **Sort** by `filter.sort` descending.
8. **Slice** to `filter.limit`.

## Presets (v1)

```ts
const PRESETS: QueryPreset[] = [
  {
    id: 'mega-value-hq', label: 'Mega Value HQ',
    desc: 'HQ items priced ≥1M gil currently discounted ≥30%.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 30, minVelocity: 0,
              minPrice: 1_000_000, maxPrice: null, sort: 'unitPrice', limit: 100 },
  },
  {
    id: 'fast-sellers-hq', label: 'Fast Sellers HQ',
    desc: 'HQ items with ≥3 sales/day and ≥15% discount.',
    filter: { searchCategories: [], hq: 'hq', minDealPct: 15, minVelocity: 3,
              minPrice: null, maxPrice: null, sort: 'gilFlow', limit: 100 },
  },
  {
    id: 'food-potions', label: 'Food & Potions',
    desc: 'Meals + medicine at ≥20% discount.',
    filter: { searchCategories: [43, 44], hq: 'either', minDealPct: 20, minVelocity: 0,
              minPrice: null, maxPrice: null, sort: 'discount', limit: 100 },
  },
  {
    id: 'furnishings', label: 'Furnishings discount',
    desc: 'Housing items (Tabletop / Wall-mounted / Furnishing / Outdoor / etc) at ≥30% discount.',
    filter: { searchCategories: [56, 57, 65, 66, 67, 68, 69, 70, 71, 72], hq: 'nq',
              minDealPct: 30, minVelocity: 0, minPrice: null, maxPrice: null,
              sort: 'discount', limit: 100 },
  },
];
```

**Category ID verification:** Task 1 of the implementation plan pins the exact `ItemSearchCategory` IDs by probing live XIVAPI (one-off check, recorded as a constants file `src/lib/itemSearchCategories.ts`). The values above are typical EW/DT mappings; treat them as draft until verified.

## UI layout

```
┌──────────────────────────────────────────────────────────────┐
│  Best Deals Queries                                          │
├──────────────────────────────────────────────────────────────┤
│  [Mega Value HQ] [Fast Sellers HQ] [Food & Potions]          │
│  [Furnishings]   [Custom…]                                   │
├──────────────────────────────────────────────────────────────┤
│  Filter:                                                     │
│    Category   [multi-select chips: Furniture, Medicine, …]   │
│    HQ/NQ      ( ) HQ  (•) NQ  ( ) Either                     │
│    Min disc.  [20] %    Min vel. [3] /day                    │
│    Price      [_____]  to  [_____]   Sort [Discount  ▼]      │
│    Limit      [100]                  [Run query]             │
├──────────────────────────────────────────────────────────────┤
│  Showing 47 of 4,832 items   ·   Last fetched: 2s ago        │
│  [Skipped 12 items: Universalis batch error]                 │
│                                                              │
│  # │ Item                  │ Current │ Avg   │ Disc │ Vel    │
│  1 │ Faerie Round Table    │  120k   │ 480k  │ -75% │  1.2   │
│  …                                                           │
└──────────────────────────────────────────────────────────────┘
```

Clicking a preset populates the builder form and immediately runs the query. The user can edit and re-run.

**Empty / loading / error states:**
- No snapshot yet: "Loading item DB (one-time, ~30s)…  12,450 / ~80,000".
- Query running: spinner "Fetching prices for N items…  120 / 800 batches done".
- Batch error: render the rows we have, plus a banner "12 items skipped (Universalis error)".

## Caching

| Cache | Scope | Where | TTL |
|---|---|---|---|
| Item snapshot | Whole-app | IndexedDB store `marketItems` | Forever; user refreshes from Settings |
| Universalis price results | Per `(filterHash, dc)` | TanStack Query in-memory | 10 minutes |
| Recipe cache | (existing) | IndexedDB store `recipes` | Forever |

## Testing

Pure helpers, TDD:
- `parseItemSheetPage()` — parses the `fields=...` response shape; handles missing optional fields.
- `chunkIds(ids, size)` — basic batching with edge cases.
- `fetchInBatches(...)` — instrumented fake `fetchOne` verifies concurrency limit and that errors don't kill the run.
- `runQuery(...)` — ~6 tests covering category match, HQ capability filter, discount/velocity/price thresholds, each sort mode, limit slice.
- Each preset has a sanity test (filter is valid; `searchCategories` non-empty where expected; sort mode is legal).

Smoke test (`routes/Queries.test.tsx`):
- Renders preset chips + builder.
- Clicking "Food & Potions" populates form fields with that preset's values.
- With a mocked snapshot (3 items, mixed categories) and a mocked `fetch` returning prices, "Run query" produces the expected row count and order.

Not tested directly: XIVAPI / Universalis network (mocked at the boundary as the rest of the repo does).

## Done when

- `npm test -- --run` green.
- `npm run build` clean.
- `/queries` route accessible from header nav.
- First visit triggers item snapshot fetch (one-time, ~30s) with progress UI.
- Four presets work end-to-end against live data.
- Builder form lets the user override any preset and re-run.
- Settings page shows item DB size + refresh button.
