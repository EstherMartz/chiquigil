# Market Heatmap

A treemap visualization of market activity. Each cell is an item; size reflects velocity, color reflects profit margin (craftable) or velocity intensity (non-craftable). Two browsing modes: "Top Movers" for discovery and "By Category" for focused analysis.

## Route & Navigation

- Route: `/heatmap`
- Nav link: "Heatmap" in the sidebar

## Modes

**Top Movers** — Loads all tradeable items from the item snapshot, fetches Universalis data for the home world, then keeps the top ~200 by velocity. No user input required.

**By Category** — User picks a category from the existing `itemSearchCategories` system (Raid Food, Tinctures, Arms, Armor, Housing, etc.). Fetches market data for all items in that category.

Both modes share the same treemap rendering; only the item selection differs.

## Treemap Cells

| Property | Metric | Rationale |
|----------|--------|-----------|
| Size | velocity (sales/day) | Fast sellers = bigger visual weight |
| Color | profit margin % (craftable) or velocity intensity (non-craftable) | Actionable color for craftables; neutral blue tone for non-craftable scaled by velocity |
| Label | Item name (truncated) | Readable at a glance |
| Hover | Full name, price, velocity, margin | Detail on demand |
| Click | Navigate to `/item/:id` | Drill into the item page |

### Color Scale

- Craftable items: red (margin ≤ 0%) → yellow (margin ~25%) → green (margin ≥ 50%)
- Non-craftable items: slate (low velocity) → blue (high velocity)

## Data Flow

1. **Select candidates** — Filter the item snapshot by mode:
   - Top Movers: all tradeable items (non-zero `priceLow` or `canHq` or `sc > 0`); no pre-filter by category.
   - By Category: items whose `sc` matches the selected search category.
2. **Fetch market data** — Use `fetchMarketData(world, candidateIds)` via `fetchInBatches` (same pattern as currency flip). Home-world scope only to keep requests manageable.
3. **Filter by velocity** — Drop items with velocity < 0.1/day (essentially dead markets). For Top Movers, sort by velocity descending and take the top 200.
4. **Compute margin** (craftable items only) — Look up the recipe in the recipe snapshot. For each ingredient, use `minNQ` from the fetched market data (fetch ingredient prices in a second batch if not already fetched). `margin = (salePrice - materialCost) / salePrice` where `salePrice = medianNQ ?? medianHQ ?? minNQ ?? minHQ`.
5. **Layout** — Run a squarified treemap algorithm over the filtered items. Input: array of `{ id, area: velocity }`. Output: array of `{ id, x, y, w, h }` as fractions of the container.
6. **Render** — Map layout rects to absolutely-positioned `<div>`s with background color from the color scale and a click handler navigating to `/item/:id`.

## Treemap Layout

Implement a squarified treemap layout function (~50 lines). No external library.

```
squarify(items: { id; area }[], containerWidth, containerHeight)
  → { id; x; y; w; h }[]
```

Standard algorithm: sort items by area descending, then greedily fill rows/columns maintaining aspect ratios close to 1.

## Component Structure

- `src/routes/Heatmap.tsx` — Route wrapper (same pattern as other routes)
- `src/features/heatmap/HeatmapView.tsx` — Main view: mode toggle, category picker, "Run" button, results
- `src/features/heatmap/HeatmapChart.tsx` — Treemap renderer: takes sized+colored cell data, renders positioned divs
- `src/features/heatmap/buildHeatmapData.ts` — Pure function: takes items, market data, recipes → cell descriptors (label, area, color, id)
- `src/features/heatmap/squarify.ts` — Treemap layout algorithm
- `src/features/heatmap/squarify.test.ts` — Unit tests for layout
- `src/features/heatmap/buildHeatmapData.test.ts` — Unit tests for data pipeline

## UI Skeleton

```
┌─────────────────────────────────────────────┐
│ [Top Movers]  [By Category ▾]   [Run scan]  │
├─────────────────────────────────────────────┤
│                                             │
│   ┌──────────┬─────┬───────────────┐        │
│   │          │     │               │        │
│   │  item A  │  B  │    item C     │        │
│   │          │     │               │        │
│   ├────┬─────┼─────┤               │        │
│   │ D  │  E  │  F  │               │        │
│   ├────┴─────┴─────┴───┬───┬───────┤        │
│   │      item G        │ H │   I   │        │
│   └────────────────────┴───┴───────┘        │
│                                             │
│  Legend: 🟢 high margin  🟡 mid  🔴 low/neg │
└─────────────────────────────────────────────┘
```

## Testing

- `squarify.test.ts`: total area preserved, no overlaps, all rects inside container, aspect ratios reasonable
- `buildHeatmapData.test.ts`: margin calculation, color assignment, filtering of dead-market items, craftable vs non-craftable color logic
