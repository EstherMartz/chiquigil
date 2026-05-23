# Price History Sparklines — Design Spec

**Date:** 2026-05-23
**Scope:** Inline 7-day price sparklines in Watchlist and Crafts results tables, with batched history fetching, caching, and a settings toggle.

---

## Overview

Add a narrow sparkline column to Watchlist and Crafts results tables showing 7-day price trends as a tiny SVG chart. Each sparkline is coloured by trend direction, handles null gaps for days without sales, and shows a daily breakdown tooltip on hover.

---

## 1. Data Layer

### 1a. Daily Median Bucketing

New function `dailyMedianBuckets` in `src/lib/universalisHistory.ts`.

**Input:** `HistoryEntry[]` (existing type), `lookbackDays: number` (default 7).
**Output:** `(number | null)[]` — exactly `lookbackDays` values, oldest→newest. Each value is the median `pricePerUnit` for that calendar day, or `null` if no sales.

**Logic:**
1. Compute day boundaries from `Date.now()` back `lookbackDays` days.
2. Group entries by calendar day (`Math.floor(tsMs / DAY_MS) * DAY_MS`).
3. For each day slot, collect all `pricePerUnit` values, sort them, pick the median (middle value, or average of two middle values for even counts).
4. Return fixed-length array: index 0 = oldest day, index 6 = today.

Coexists with existing `dailyBuckets` (weighted mean) — different function, different use case.

### 1b. History Fetching Hook

New hook `useSparklineHistory` in `src/features/sparklines/useSparklineHistory.ts`.

**Input:** `itemIds: number[]`, `world: string`, `enabled: boolean` (from settings toggle).
**Returns:** `Map<number, (number | null)[]>` — item ID → 7-element median array.

**Behaviour:**
- Uses `fetchHistoryWithin(world, ids, 604800)` (7 days in seconds) from existing `universalisHistory.ts`.
- Batches up to 100 IDs per request (Universalis limit). Splits larger sets into multiple calls with 100ms delay between batches.
- Caches results in React Query with `queryKey: ['sparkline-history', world, ...sortedIds]`, `staleTime: 60 * 60 * 1000` (1 hour).
- Returns empty map when `enabled` is false (no fetch).
- Swallows errors silently — sparklines are non-critical, never block table rendering.
- Runs `dailyMedianBuckets` on each item's entries to produce the 7-value array.

### 1c. Trend Direction Derivation

New utility `sparklineColor` in `src/features/sparklines/sparklineColor.ts`.

**For Watchlist rows:** Accept the existing `delta: number | null` from `WatchlistRow`. Map to colour:
- `delta > 5` → `#4ade80` (green, matches jade)
- `delta < -5` → `#f87171` (red, matches crimson)
- `delta` between -5 and 5 → `#c9a84c` (amber, stable)
- `delta === null` → `#6b7280` (grey, no data)

**For Crafts rows:** No existing delta. Derive from first non-null vs last non-null point in the 7-day array:
- `last > first` → green
- `last < first` → red
- `last === first` or insufficient points → grey

---

## 2. Sparkline Component Enhancement

Modify existing `src/components/Sparkline.tsx`.

**Current API:** `{ points: number[], width?, height?, className? }`
**New API:** `{ points: (number | null)[], width?, height?, color?: string, className? }`

**Changes:**
- Accept `(number | null)[]` instead of `number[]`.
- Filter out nulls for min/max/coordinate calculations, but preserve index positions so null days create gaps (the polyline skips null indices — render multiple `<polyline>` segments separated by nulls).
- Add `color` prop (hex string). When provided, use as stroke colour instead of `currentColor`.
- Add a filled circle (`<circle r="2" fill={color}">`) at the rightmost non-null point.
- Default width: 80, height: 28.
- When fewer than 2 non-null points: render a single centred dot or `—` dash (existing behaviour is fine).

### Shimmer Placeholder

New component `src/components/SparklineShimmer.tsx` — 80×28 div with skeleton animation, shown while history is loading.

```tsx
export function SparklineShimmer() {
  return (
    <div className="w-[80px] h-[28px] bg-bg-card-hi/50 rounded animate-pulse" />
  );
}
```

---

## 3. Tooltip

Wrap each sparkline in `<InfoTooltip>` with a daily breakdown.

**Tooltip content:** 7 rows, one per day. Format:
```
Mon  1,700
Tue  1,650
Wed  —
Thu  1,720
Fri  1,800
Sat  1,750
Sun  1,780  ← today
```

New utility `formatSparklineTooltip(buckets: (number | null)[]): string` in `src/features/sparklines/sparklineTooltip.ts`. Uses day-of-week labels derived from the current date minus index offset.

---

## 4. Table Integration

### 4a. Watchlist Table

In `src/features/watchlist/WatchlistTable.tsx`:

- Add a `Sparkline` column to `COLS` array, positioned between `dc` (Sale) and `trend` (Trend). Key: `null` (not sortable). Label: empty string or small chart icon. `hideOnMobile: true`.
- The table component receives sparkline data via a new prop `historyMap: Map<number, (number | null)[]>` and `historyLoading: boolean`.
- Each row renders `<SparklineShimmer />` while loading, then `<Sparkline points={...} color={sparklineColor(r.delta)} />` wrapped in `<InfoTooltip>`.
- The parent (`Watchlist` route) calls `useSparklineHistory` with the visible item IDs and passes the map down.

### 4b. Crafts Results Tables

In `src/features/queries/QueryResults.tsx` and `src/features/queries/CraftFlipResults.tsx`:

- Add a sparkline column between the sale price column and the next column. Not sortable. `hideOnMobile: true`.
- Same pattern: receive `historyMap` and `historyLoading` as props.
- Colour derived from first/last point comparison (no existing delta).
- Parent `QueriesView` calls `useSparklineHistory` with result item IDs after the query completes.

---

## 5. Settings Toggle

In `src/features/settings/store.ts`:

- Add `showSparklines: boolean` (default `true`) to `SettingsState`.
- Add `setShowSparklines(v: boolean)` setter.
- Bump persist version and add migration.

In `src/routes/Settings.tsx`:

- Add checkbox under Display section (after Row Density toggle):
```
☑ Show price sparklines
    Loads 7-day sale history for items in Watchlist and Crafts results. Uses additional Universalis API calls.
```

When `showSparklines` is false:
- Sparkline column is hidden (not rendered in COLS).
- `useSparklineHistory` returns empty map without fetching.

---

## 6. Files

### New Files
| File | Purpose |
|------|---------|
| `src/features/sparklines/useSparklineHistory.ts` | React Query hook — batch fetch + cache + median bucketing |
| `src/features/sparklines/sparklineColor.ts` | Trend → hex colour mapping |
| `src/features/sparklines/sparklineTooltip.ts` | Daily breakdown tooltip formatter |
| `src/components/SparklineShimmer.tsx` | Loading placeholder |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/universalisHistory.ts` | Add `dailyMedianBuckets` function |
| `src/components/Sparkline.tsx` | Nullable points, colour prop, endpoint dot, gap rendering |
| `src/features/watchlist/WatchlistTable.tsx` | New sparkline column + props |
| `src/features/queries/QueryResults.tsx` | New sparkline column + props |
| `src/features/queries/CraftFlipResults.tsx` | New sparkline column + props |
| `src/features/queries/QueriesView.tsx` | Call `useSparklineHistory`, pass map to result components |
| `src/routes/Watchlist.tsx` | Call `useSparklineHistory`, pass map to table |
| `src/features/settings/store.ts` | Add `showSparklines` toggle |
| `src/routes/Settings.tsx` | Sparkline checkbox in Display section |

---

## Out of Scope

- Sparklines on Trading Best Deals, Gathering, or scan pages.
- Per-item HQ-only filtering in sparkline data (use all sales).
- Persistent IDB cache for history (React Query in-memory + staleTime is sufficient).
