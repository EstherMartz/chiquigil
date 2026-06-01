# Empty Shelf scan — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorm)
**Route added:** `/empty-shelf`

## Goal

A dedicated insight page that surfaces **restock opportunities**: items currently **sold out** (zero listings) whose **recent sale history proves live demand** — ranked so the freshly-emptied, fast-moving shelves come first. This is the article's #1 tactic ("find items sold out, check when the last one sold, list into the gap"), made into a one-click ranked scan.

The existing **Out-of-Stock preset** already filters `maxListings: 0` + `minVelocity`, but it ranks only by gil/day and has **no recency signal** — it can't tell a freshly-emptied hot shelf from a months-dead one. This page adds that recency intelligence on its own discoverable page.

## Part 1 — Data: last-sale recency

The history parser currently reads only `{ hq, pricePerUnit }` and discards timestamps. Add a newest-sale timestamp so recency is computable from the cache (scans read cache-only, so it must live on `MarketItem`).

- `RawHistory` (in `src/lib/universalis.ts`): add `timestamp?: number`.
- `MarketItem`: add `lastSaleMs: number | null` — the newest `recentHistory` timestamp ×1000 (Universalis timestamps are seconds), or `null` when there's no history.
- `parseMarketResponse`: compute `lastSaleMs = max(history timestamps) * 1000` (null if empty). `emptyMarketItem()` → `lastSaleMs: null`.
- Regenerate the API bundles (`npm run build:api`) so the bot's hourly cache emits `lastSaleMs`.
- **Graceful degradation:** until the next cache refresh, cached rows lack `lastSaleMs` (→ `null`). Such rows still appear in the scan (so it's useful immediately) but show "—" for Last sold and sort last on freshness.

## Part 2 — Pure runner + types (`src/features/queries/`)

### Types (in `types.ts`)
```ts
export type EmptyShelfSort = 'freshness' | 'velocity' | 'estGilPerDay' | 'suggestedPrice';

export interface EmptyShelfFilter {
  searchCategories: number[];
  hq: HqMode;
  minVelocity: number;       // sales/day; demand proof
  maxListings: number;       // shelf "empty" threshold; default 0 (strictly sold out)
  maxDaysSinceSale: number | null; // drop rows whose last sale is older than this (null = no cap)
  sort: EmptyShelfSort;
  limit: number;
}

export interface EmptyShelfRow {
  id: number; name: string; sc: number; hq: boolean;
  suggestedPrice: number;       // historical median (or avg) for the chosen tier
  velocity: number;
  lastSaleMs: number | null;
  daysSinceLastSale: number | null;
  estGilPerDay: number;         // suggestedPrice × velocity
}

export function defaultEmptyShelfFilter(): EmptyShelfFilter {
  return { searchCategories: [], hq: 'either', minVelocity: 0.14, maxListings: 0,
           maxDaysSinceSale: 30, sort: 'freshness', limit: 200 };
}
```

### `runEmptyShelf(snapshot, market, filter, nowMs)` (new `runEmptyShelf.ts`)
- Iterate snapshot items; apply category + `hq==='hq' ⇒ canHq` filters.
- `m = market[id]`; skip if absent.
- **Tier pick** (`hq` mode): NQ uses `medianNQ ?? averagePriceNQ`; HQ uses `medianHQ ?? averagePriceHQ`; `either` picks the tier with more recent sales (`recentSalesHQ > recentSalesNQ ? HQ : NQ`), falling back to whichever has a price. Skip the row if no usable price.
- Keep only `m.listingCount <= filter.maxListings` (default 0 = sold out) **and** `m.velocity >= filter.minVelocity`.
- `daysSinceLastSale = m.lastSaleMs != null ? (nowMs - m.lastSaleMs) / 86_400_000 : null`.
- Drop the row when `filter.maxDaysSinceSale != null` **and** `daysSinceLastSale != null` **and** `daysSinceLastSale > maxDaysSinceSale`. (Rows with `null` recency are kept — data not yet enriched — and rank last on freshness.)
- `estGilPerDay = suggestedPrice * velocity`.
- Sort: `freshness` = ascending `daysSinceLastSale` with `null` last; `velocity`/`estGilPerDay`/`suggestedPrice` = descending. Slice to `limit`.
- Pure; `nowMs` injected for deterministic tests.

## Part 3 — View + results + nav

### `EmptyShelfView` (`src/features/insights/EmptyShelfView.tsx`)
Mirrors `VendorFlipView`:
- `useSettingsStore` (world, hideCrystals), `useItemSnapshot`, `useState<EmptyShelfFilter>`, `useState<EmptyShelfSort>`.
- `candidateIds` = snapshot items passing category + HQ + hideCrystals filters.
- `run` mutation: `fetchInBatches(candidateIds, chunk => fetchMarketData(world, chunk), { chunkSize: 100, concurrency: 4 })` (cache-only, no rate-limit risk).
- `rows = runEmptyShelf(items, saleMap, { ...filterAtRun, sort }, Date.now())`.
- `useInitialScan(ready, runOnce)` — auto-runs the default scan on load (per the auto-run-scans convention).
- `FilterBar`: a category picker (reuse the existing scan category control), HQ mode, **Min sales/day**, **Sold within (days)**, **Empty threshold (max listings)**, sort. Plus the standard Run-scan button + stale hint.

### `EmptyShelfResults` (`src/features/queries/EmptyShelfResults.tsx`)
Table via the established `ResultTableScaffold` + `SortableHeader` + `ItemNameLinks` idioms (per the match-UI-patterns convention). Columns:
- **Item** (`ItemNameLinks`) · **Last sold** (`{Xd ago}` or "—") · **Vel** (sales/day) · **Suggested** (gil) · **Est gil/day**.
Sort headers wired to `onSortChange`. Empty/least-data states match the other results components.

### Nav + route
- `App.tsx`: add `<Route path="/empty-shelf" element={<EmptyShelf />} />` and the lazy/eager import, following the existing scan routes.
- `Header.tsx`: add an "Empty Shelf" nav entry under the same group as the other trading scans.
- A thin `src/routes/EmptyShelf.tsx` rendering `<EmptyShelfView />` with a short heading (matching `Planner.tsx`/other route wrappers).

## Testing

- `parseMarketResponse`: `lastSaleMs` = newest history timestamp ×1000; `null` with no history; existing tests updated for the new field.
- `runEmptyShelf` pure tests: drops in-stock items (`listingCount > maxListings`); enforces `minVelocity`; computes `daysSinceLastSale` from injected `nowMs`; `maxDaysSinceSale` drops stale rows but keeps `null`-recency rows; tier pick (NQ/HQ/either) and `median ?? avg` fallback; each sort order; `limit`.
- `EmptyShelfResults` render test: rows render with "Xd ago"/"—", suggested price, est gil/day; a `SortableHeader` click calls `onSortChange`.
- `EmptyShelfView` wiring verified via `tsc` + the full suite (react-query view tests follow the existing thin pattern; the logic lives in the tested pure runner).

## Non-goals

- DC/region scope (home-world only — where you list).
- Writing/closing anything (read-only scan).
- Changing the existing Out-of-Stock preset (left as-is; this page supersedes it for recency-aware use).
- Per-item live history fetch in the scan (cache-only; recency comes from the enriched cache field).

## Files

**Modify:**
- `src/lib/universalis.ts` (+ `universalis.test.ts`) — `RawHistory.timestamp`, `MarketItem.lastSaleMs`, parser.
- `src/features/queries/types.ts` — `EmptyShelfFilter`/`EmptyShelfRow`/`EmptyShelfSort` + default.
- `src/App.tsx`, `src/components/layout/Header.tsx` (or wherever nav lives) — route + nav entry.
- `api/*.mjs` — regenerated by `npm run build:api`.

**Add:**
- `src/features/queries/runEmptyShelf.ts` (+ `.test.ts`).
- `src/features/queries/EmptyShelfResults.tsx` (+ `.test.tsx`).
- `src/features/insights/EmptyShelfView.tsx`.
- `src/routes/EmptyShelf.tsx`.
