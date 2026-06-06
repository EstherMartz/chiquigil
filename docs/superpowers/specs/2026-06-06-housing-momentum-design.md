# Restore Housing Momentum — design

**Date:** 2026-06-06
**Status:** Approved, ready for implementation plan

## Problem

The `/housing` view (`HousingMarketView`) was originally a "spike tracker" — its
compute file is literally `spikeSignal.ts`, and `HousingRow` carries a
`momentumPct` field meant to surface housing items whose price is spiking (a good
time to sell/flip). But the momentum signal is dormant: the view passes
`history: undefined` into `buildHousingRow`, so `momentumPct` is always `null`,
and the table renders no momentum column at all.

It was disabled because momentum needs `computeWeekDelta` over sale *history*,
which is **not** in the bot's hourly `market-cache.json` (history is live-only via
`fetchHistoryWithin`). Fetching history for the whole candidate set up front is
expensive — and now that the 400-item cap is removed, more so.

## Decision

Restore momentum as a **7-day price Δ% column**, populated **on-demand for the
rows currently visible**. The table paginates 25 rows at a time; we fetch live
history only for the visible window, growing as the user loads more. Momentum is
**display-only (not a sort key)** in v1.

(Considered and deferred: baking the 7-day delta into the hourly bot cache so
it's free at render for all items and sortable. That scales better but touches
the bot/cache pipeline — left as a future option.)

## Architecture

Four isolated units.

### 1. `ResultTableScaffold` — new optional `onVisibleRows` prop

`src/features/queries/ResultTableScaffold.tsx` owns pagination (`useLoadMore`),
so the parent can't see the visible slice. Add one optional, backward-compatible
prop:

```ts
onVisibleRows?: (visible: T[]) => void;
```

Fired from a `useEffect` keyed on the visible row-id signature (so it fires when
the page grows or the underlying rows change, not on every render). Every other
caller omits it and is unaffected. This is the clean, reusable hook for
per-visible enrichment.

### 2. `useHousingMomentum(world, scanKey, visibleIds)` — new hook

`src/features/housing/useHousingMomentum.ts`. Keeps a `Map<number, number | null>`
of computed 7-day deltas:

- When `visibleIds` contains ids not yet in the map, batch them (chunks of 100)
  to `fetchHistoryWithin(world, ids, 14 * 86400)`, run `computeWeekDelta` per
  item, and accumulate into the map.
- Reset the map when `scanKey` (`` `${world}:${tab}` ``) changes.
- Map value semantics: `number` = delta %, `null` = fetched but insufficient
  (a week had zero sales → no meaningful comparison), **absent** = still pending.

The "which ids still need fetching" decision is extracted as a pure helper:

```ts
export function idsToFetch(visibleIds: number[], cache: Map<number, unknown>): number[];
// returns the unique visibleIds not present as keys in cache
```

### 3. `HousingMarketView` — wire it up

`src/features/housing/HousingMarketView.tsx`:

- Track `const [visibleIds, setVisibleIds] = useState<number[]>([])`.
- Pass `onVisibleRows={(rows) => setVisibleIds(rows.map((r) => r.id))}` to the
  scaffold.
- `const momentum = useHousingMomentum(world, `${world}:${tab}`, visibleIds)`.
- Add a **7d Δ** column (after Sales/day) that reads `momentum.get(r.id)`:
  - absent → `…` (pending)
  - `null` → `—` (insufficient history)
  - `number` → `fmtDelta(n)` — `+N%` in jade, `−N%` in crimson, `0%` neutral.
- The column is **display-only**: no `SortableHeader`, no `momentumPct` sort key
  wired to the UI. (Existing sort columns — price, velocity, craftMargin,
  craftGilPerDay — are all cache-backed, so the visible window stays stable while
  momentum streams in. Sorting by a partially-loaded column would create a
  fetch→reorder→refetch loop; avoided by design.)

`buildHousingRow` is unchanged — it still produces `momentumPct: null` from the
cache scan; momentum now comes from the overlay map at render, not from the row.

### 4. `fmtDelta(pct)` — formatter

Small pure helper (co-located with the view or in `spikeSignal.ts`). Rounds to a
whole percent, prefixes sign, returns the string; the color class is chosen at
the call site from the sign.

## Data flow

```
cache scan → rows (momentum-agnostic)
          → ResultTableScaffold paginates
          → onVisibleRows(slice) → setVisibleIds
          → useHousingMomentum: idsToFetch → fetchHistoryWithin (live, batched)
          → computeWeekDelta → accumulate Map
          → 7d Δ cells read the Map
```

## Cost

~1 live Universalis history request per 25-row page (chunked at 100 ids/request).
Bounded and lazy; nothing fetched until rows are seen. Works across all three
tabs (furnishings / materials / all).

## Error handling

`fetchHistoryWithin` already swallows network/CORS errors and returns an empty
map — those ids simply resolve to `null` (rendered `—`). No partial-failure
banner needed; momentum is a soft enrichment, never blocks the table.

## Testing

- **`idsToFetch`** — returns only the visible ids absent from the cache; dedupes;
  empty when all present.
- **`fmtDelta`** — `+12%` / `−8%` / `0%` formatting and sign.
- **`computeWeekDelta`** — already covered in `universalisHistory.test.ts`.
- **`ResultTableScaffold` `onVisibleRows`** — light render test that it fires with
  the visible slice and re-fires when the page grows.

## Scoped out of v1

- Sorting/ranking by momentum (wants the bot-cache approach for complete data).
- Persisting fetched history across tab switches (reset per `scanKey` is fine;
  React Query-level caching is a possible later optimization).
