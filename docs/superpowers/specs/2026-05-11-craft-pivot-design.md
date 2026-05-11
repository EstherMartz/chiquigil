# Craft-for-Gil Pivot — Design Spec

**Date:** 2026-05-11
**Status:** Approved (in conversation)

## Goal

Reframe the app around "what to craft to earn gil on my home world" and visually demote buy-low-sell-high tools. No code is deleted from the flip pipelines themselves — Arbitrage, Best deals, DC discount presets, and Reposts (camp) all keep working. They just move under a single `/trading` tab rendered with low visual priority. The default user journey (Home → Watchlist → Crafts) now contains only craft-supporting screens.

## Non-goals

- Adding new craft-specific dimensions (materia / HQ-mat cost in profit math, retainer slot budget, job-level filter, intermediates depth). These are valuable next steps but out of scope for this pivot — the pivot is purely an IA reframing.
- Deleting flip code. Arbitrage, Best deals, DC presets, Reposts all preserved.
- Touching pure pipeline math (`runQuery`, `runCraftFlip`, `runRepost`, profit calc) other than one branch in `buildRows`.
- Changing Universalis fetch behavior, caching, or IndexedDB shape.

## Routes (before → after)

| Before | After |
|---|---|
| `/` Home | `/` Home (unchanged) |
| `/watchlist` Watchlist | `/watchlist` Watchlist (+ sale-only items now contribute to gil/day sort) |
| `/insights` (Arbitrage / Best deals / Marketshare) | **deleted** |
| `/queries` Queries | `/crafts` Crafts (craft presets only) |
| — | `/trading` Trading (Arbitrage / Best deals / Queries-trading) |
| `/settings` Settings | `/settings` (unchanged) |

**Redirects** (so bookmarks survive):
- `/insights` → `/trading`
- `/queries` → `/crafts`

## Nav

Header order:
```
Home · Watchlist · Crafts · Settings   |   Trading
```

Trading sits after a `border-l` separator and is rendered in `text-text-low` (default) / `text-aether` on hover / `text-gold` when active. Crafters see it's there but it's clearly secondary. No dropdown, no chevron — one-click access preserved, just visually demoted.

Mobile (if collapsed nav exists in current header): same order; separator becomes a horizontal divider in the menu.

## `/crafts` route

`src/routes/Queries.tsx` body extracted into `src/features/queries/QueriesView.tsx`, accepting one prop:
```ts
interface Props { category: 'craft' | 'trading' }
```

`src/routes/Crafts.tsx` becomes a thin wrapper:
```tsx
export default function Crafts() {
  return <QueriesView category="craft" />;
}
```

`QueriesView` filters `PRESETS` by category. For `/crafts` that's 2 presets: Undersupply, Craft-flip Phantom. Default preset on mount = first match (Undersupply).

**Builder default Mode:** when no preset is active, the builder defaults to `mode: 'craft'` on `/crafts`. The Mode select still offers all three (Standard / Craft-flip / Reposts) — no functional restriction, just a default. Achieved by sourcing the default filter from the filtered preset list inside `QueriesView`:

```tsx
function QueriesView({ category }: { category: PresetCategory }) {
  const presets = useMemo(() => PRESETS.filter((p) => p.category === category), [category]);
  const [filter, setFilter] = useState<QueryFilter>(presets[0].filter);
  // ...rest of old Queries.tsx body, with PRESETS → presets
}
```

Old module-level `const DEFAULT_FILTER = PRESETS[0].filter` is removed; the default now lives inside the component and is category-scoped.

H2 label: "Crafts" (replaces "Best Deals Queries").

## `/trading` route

New file `src/routes/Trading.tsx`. Inherits Insights's tab structure plus one new tab.

**Tabs (in order, default = Arbitrage):**
1. **Arbitrage** — renders existing `ArbitrageView` (no change)
2. **Best deals** — renders existing `BestDealsView` (no change)
3. **Queries** — renders `<QueriesView category="trading" />`

`QueriesView`'s trading variant defaults to Mega Value HQ (first trading preset). Builder Mode select unchanged — user can still pick Craft-flip in the trading builder if they want; nothing's gated by route.

H2 label: "Trading".

## `QueryPreset.category`

`src/features/queries/types.ts` gains:
```ts
export type PresetCategory = 'craft' | 'trading';

export interface QueryPreset {
  id: string;
  label: string;
  desc: string;
  category: PresetCategory;
  filter: QueryFilter;
}
```

`src/features/queries/presets.ts` tags each existing preset:

| Preset | Category |
|---|---|
| Mega Value HQ | trading |
| Fast Sellers HQ | trading |
| Food & Potions | trading |
| Furnishings discount | trading |
| Undersupply | craft |
| Craft-flip Phantom | craft |
| Reposts (camp) | trading |

Total: 2 craft, 5 trading.

## Watchlist — Marketshare absorption

The MarketshareView ranked tracked items by gil/day, including sale-only items (using `unit price × velocity`). Watchlist's existing `gilDay` sort already covers craftable items. To absorb the sale-only behavior:

**`src/features/watchlist/buildRows.ts`** — change the `gilPerDay` assignment:
```ts
// Before:
gilPerDay: profitResult ? profitResult.profit * velocity : null,

// After:
gilPerDay: profitResult
  ? profitResult.profit * velocity
  : recipeEntry === null
    ? (d?.minHQ ?? d?.minNQ ?? 0) * velocity || null
    : null,
```

Where `recipeEntry === null` means "we know this item has no recipe" (sale-only). The `|| null` guards against zero/missing price + zero velocity so we don't pollute the sort with junk rows.

`recipeEntry === undefined` (recipe not yet resolved) still produces null gilPerDay — same as today.

**Impact on other code reading `gilPerDay`:**
- `WatchlistTable.tsx` — renders `fmtGil(...)` when non-null, else `—`. No change. Sale-only rows will now show a value instead of `—`.
- `buildCandidates.ts` (session planner) — already filters `r.craftable === true` before consuming gilPerDay, so sale-only rows never enter session candidates. No regression.
- `filterSort.ts` — sort key `gilDay` uses `r.gilPerDay ?? -Infinity`. Now sale-only items have real values and sort correctly.

**Default Watchlist sort:** already `gilDay desc` in `defaultUi()` — no change needed. Watchlist already opens ranked by gil/day; this change just adds sale-only items to that ranking.

**Marketshare's "Include disabled packs" toggle is dropped.** If the user wants disabled packs in the ranking, they re-enable them on Home. Same outcome, less UI.

## File moves & deletions

**Renames:**
| From | To |
|---|---|
| `src/routes/Queries.tsx` | `src/routes/Crafts.tsx` (thin wrapper, see above) |
| `src/routes/Queries.test.tsx` | `src/routes/Crafts.test.tsx` |

**New files:**
- `src/features/queries/QueriesView.tsx` — extracted Queries body, accepts `category` prop
- `src/routes/Trading.tsx`
- `src/routes/Trading.test.tsx`

**Modified:**
- `src/App.tsx` — drop `/insights` and `/queries` routes; add `/crafts`, `/trading`, redirects
- `src/components/layout/Header.tsx` — replace `/insights`, `/queries` nav links with `Crafts`, `Trading`; separator + dim color on Trading
- `src/features/queries/types.ts` — add `PresetCategory` + `category` field
- `src/features/queries/presets.ts` — tag every preset
- `src/features/queries/presets.test.ts` — assert categories
- `src/features/watchlist/buildRows.ts` — sale-only gilPerDay branch
- `src/features/watchlist/buildRows.test.ts` — add fixture for sale-only gilPerDay
- `README.md` — IA section reflects new structure

**Deletions:**
- `src/routes/Insights.tsx`
- `src/routes/Insights.test.tsx`
- `src/features/insights/MarketshareView.tsx`
- `src/features/insights/marketshare.ts`
- `src/features/insights/marketshare.test.ts`

`ArbitrageView.tsx`, `BestDealsView.tsx`, `arbitrage.ts`, `bestDeals.ts` + their tests stay in `src/features/insights/` — Trading.tsx imports cross-folder. Folder rename to `features/trading/` is intentionally skipped (churn-for-no-value).

## Testing

**`Crafts.test.tsx`** (renamed from Queries.test.tsx):
- Existing tests adapted: chip strip now shows only craft presets (2 chips). Smoke tests for Undersupply, Craft-flip Phantom remain.
- Reposts smoke test moves to Trading.test.tsx.

**`Trading.test.tsx`** (new):
- Renders Arbitrage / Best deals / Queries tabs.
- Default tab = Arbitrage.
- Click Queries tab → 5 trading preset chips render.
- Existing Reposts (camp) smoke test runs against Trading's Queries tab.

**`presets.test.ts`** — add assertion: every preset has a `category` matching `'craft' | 'trading'`. Specifically: 2 craft, 5 trading. Reposts categorized as trading.

**`buildRows.test.ts`** — add fixture: sale-only item (no recipe — `recipeMap` returns null) with `d.minNQ = 1000, d.velocity = 5` → expect `gilPerDay === 5000`. Verify craftable items still use `profit × velocity`. Verify `recipeEntry === undefined` (unresolved) still produces null.

**Deleted:** `Insights.test.tsx`, `marketshare.test.ts`.

Expected count: ~201 → ~198. (8 deleted: 3 Insights + 5 marketshare; 5 added: 1 Trading smoke, 2 buildRows, 2 presets category.)

## Done when

- `npm test -- --run` green.
- `npm run build` clean.
- Top nav shows: Home · Watchlist · Crafts · Settings · | · Trading (Trading rendered in `text-text-low`).
- `/` Home unchanged — SessionPlanner still picks crafts.
- `/watchlist` opens sorted by gil/day; sale-only items now display values in the gil/day column.
- `/crafts` shows 2 preset chips (Undersupply, Craft-flip Phantom); builder defaults to Craft-flip mode.
- `/trading` shows 3 tabs (Arbitrage / Best deals / Queries); Queries tab shows 5 trading presets including Reposts (camp).
- `/insights` → 301-style React Router redirect to `/trading`. `/queries` → `/crafts`.
- All three query modes (Standard / Craft-flip / Reposts) still selectable in the builder on either /crafts or /trading.
- No regressions: SessionPlanner, RecipeModal, Settings, all preset pipelines unchanged.
