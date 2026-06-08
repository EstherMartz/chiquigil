# Implementation Plan — Dashboard Intelligence Improvements

Branch: `feature/dashboard-intelligence`
Source: PRD "Dashboard Intelligence Improvements" (Portfolio Concentration Warning · Patch Spike Surface)

This plan is grounded in a read-through of the live code. It answers the PRD's four
open dev questions first, then lays out the work in dependency order.

---

## Answers to the PRD's open questions

**Q1 — How is the catalog/patch date tracked?**
Explicitly. `public/data/snapshots/whatsNew.json` carries `bakedAt` (Unix ms) and
`prevBakedAt`. It surfaces as `whatsNew.data?.bakedAt` via
`useWhatsNewSnapshot` → `loadStaticWhatsNewSnapshot` (`src/lib/staticSnapshots.ts`).
The What's New header already renders `new Date(bakedAt).toISOString().slice(0,10)`.
→ **`bakedAt` is the stable patch signal.** Detection = `bakedAt > last_seen_patch_date`.

**Q2 — Is per-item category stored or derived?**
Stored. `TrackedItem.cat: ItemCategory` (`src/features/items/types.ts`), one of nine
fixed values: `Raid | Tincture | Food | Fish | Dye | Glamour | Housing | Materia | Minion`.
Starter-pack items hard-code it; custom adds infer it once at add-time. `WatchlistRow
extends TrackedItem`, so `row.cat` is on every dashboard row already.
→ **Category aggregation is a cheap client-side group-by `row.cat`.** No catalog join.

**Q3 — Is per-category average velocity computed anywhere?**
No. Only per-item `velocity` exists. For the SPIKE multiplier we compute, inside
`runWhatsNew`, the mean velocity per search-category (`it.sc`) across the new-items set
currently in view, then `spike = velocity / categoryAvg`.
→ **Caveat to honor in copy:** this is the average over *new-this-patch items in that
search category*, not a true DC-wide category average (the app only fetches market data
for the new-items list). Acceptable for v1; note it in a tooltip.

**Q4 — Should `last_seen_patch_date` be server-side or per-browser?**
All preferences in this app are **localStorage / per-browser** (Zustand `persist`).
There is no per-Discord-user server prefs store. v1 stores all three new fields in the
existing settings store. Cross-device sync is out of scope (matches every other pref).

---

## Where things live (anchor map)

| Concern | File |
| --- | --- |
| Dashboard shell + grid | `src/features/dashboard/DashboardView.tsx` |
| KPI stat strip | `src/features/dashboard/tiles/KpiStrip.tsx` |
| Aggregation (concentration, movers, totals) | `src/features/dashboard/aggregate.ts` |
| WHAT CHANGED panel | `src/features/dashboard/tiles/ChangedDigest.tsx` |
| Dashboard prefs store (dismissals) | `src/features/dashboard/dashboardStore.ts` |
| Watchlist row model (`gilPerDay`, `cat`) | `src/features/watchlist/buildRows.ts` |
| Settings store (prefs + `retainerLevels`) | `src/features/settings/store.ts` |
| Craftability check | `src/features/items/craftStatus.ts` |
| Recipe snapshot (classJob, recipeLevel) | `src/features/queries/useRecipeSnapshot.ts` |
| What's New view + filter bar | `src/features/insights/WhatsNewView.tsx` |
| What's New row builder | `src/features/queries/runWhatsNew.ts` |
| What's New results table | `src/features/queries/WhatsNewResults.tsx` |
| What's New types | `src/features/queries/types.ts` |
| Snapshot loader (`bakedAt`) | `src/features/queries/useWhatsNewSnapshot.ts` |
| Discover panel | `src/features/watchlist/DiscoverView.tsx` |
| Category → suggestion ranking | `src/features/watchlist/suggestions.ts` |
| Sidebar nav | `src/components/layout/Sidebar.tsx` |
| Inline add-to-watchlist | `src/features/items/AddToWatchlistButton.tsx` |

Design tokens to reuse: `text-gold / text-jade / text-crimson / text-aether`,
`bg-bg-card`, `border-border-base`; stacked-bar pattern from `MarginHistogram.tsx`;
intensity-fill pattern from `SpreadBars.tsx`.

---

## PART 1 — Portfolio Concentration

### 1A. Category aggregation core (pure, tested)
`src/features/dashboard/aggregate.ts`
- Add `interface CategoryShare { cat: ItemCategory; gilPerDay: number; share: number; itemCount: number }`.
- Add `categoryShares(rows): CategoryShare[]` — group by `row.cat`, sum `gilPerDay`,
  divide by portfolio total, sort desc.
- Add `topCategory(rows): { name; pct; itemCount } | null` — argmax of the above.
- Reuse existing `concentration(rows, 3).topShare` for `top3_share`.
- Unit test `aggregate.test.ts`: weighting is by gil/day not item count (the AC-2 trap),
  empty/zero-total rows, single-category portfolio.

### 1B. CONCENTRATION KPI cell (FR-1.1)
`KpiStrip.tsx` + `DashboardView.tsx`
- Pass `conc3` (top-3 share) and `topCat` into `KpiStrip`.
- Render a 6th cell, two stacked figures (`Top 3: 16%` / `Top cat: 48% RAID`).
- Color the cell via a helper: green (top3<30 ∧ cat<40), amber (top3 30–50 ∨ cat 40–60),
  red (top3>50 ∨ cat>60). Grid changes `md:grid-cols-5` → `md:grid-cols-6`.
- Click scrolls to the concentration widget (anchor id).

### 1C. Concentration risk banner (FR-1.2)
New `src/features/dashboard/tiles/ConcentrationBanner.tsx`, rendered in `DashboardView`
directly below the KPI strip.
- Show only when: `rows.length >= 10` AND `topCat.pct > 50%` AND not suppressed/snoozed.
- Copy: "⚠ HIGH CONCENTRATION — 48% of your daily potential comes from {Cat} gear
  ({n} items)…" + CTA "Find diversification opportunities →" linking to
  `/discover?focus=gaps`.
- Dismiss writes `concentration_banner_last_dismissed = nowIso`; "don't show again"
  writes `concentration_banner_suppressed = true`. Re-show gate: hidden if dismissed
  within 7 days or suppressed.
- New prefs fields added to `settings/store.ts` (see Part 0 below).

### 1D. CONCENTRATION widget (FR-1.3)
New `src/features/dashboard/tiles/ConcentrationWidget.tsx`, placed in the right column
above CROSS-WORLD SPREAD.
- **Income by category**: horizontal stacked bar from `categoryShares`, each segment
  labeled `CAT pct%`, styled like the margin bar. Group tail categories into "other".
- **Diversification opportunities** (collapsed by default): categories from Discover's
  `CATEGORIES` list where the user tracks <2 items (count via `row.cat`), each linking
  to `/discover?category={cat}`. Ordering by Discover potential is a follow-up; v1 orders
  by "least tracked, then alphabetical" and labels each with its tracked count.

### 1E. Discover deep-link support
`src/routes/Discover.tsx` + `DiscoverView.tsx`
- Read `useSearchParams()`; pass `defaultCategory` / `focusGaps` into `DiscoverView`.
- `DiscoverSection` gains an `autoOpen` prop so a linked category opens + scans on mount.
- `focus=gaps` pre-expands categories the user under-tracks.

---

## PART 2 — Patch & Update Spike Surface

### 2A. Patch detection hook
New `src/features/dashboard/usePatchStatus.ts`
- Reads `bakedAt` from `useWhatsNewSnapshot` and `last_seen_patch_date` from settings.
- Returns `{ bakedAt, patchDateIso, isNewPatch, withinWindow(days) }`.
  `isNewPatch = bakedAt > Date.parse(last_seen_patch_date ?? 0)`.
  `withinWindow(14) = Date.now() - bakedAt < 14*DAY`.

### 2B. Craftable-movers selector
New `src/features/dashboard/patchMovers.ts`
- Input: new-item ids (`whatsNew.newItems`), item snapshot, recipe snapshot,
  `retainerLevels`, and market data for those ids.
- Filter to items whose recipe `classJob` is leveled enough
  (`craftStatus` ⇒ `ok`) AND `velocity >= 0.5`. Sort by velocity desc.
- **Data note:** the dashboard does not currently fetch market data for non-watchlist
  items. The banner's velocity gate requires it. v1 reuses the existing Universalis
  client (same as What's New — *not* a new endpoint) to fetch the new-item ids lazily,
  only while `withinWindow(14)`. This is the one added client-side fetch; it satisfies
  "no new API calls" (no new backend lambda) but should be called out to the user.

### 2C. Patch alert banner (FR-2.1)
New `src/features/dashboard/tiles/PatchBanner.tsx`, top of `DashboardView` (above KPI).
- Visible when `isNewPatch && withinWindow(14)` and not dismissed-for-this-bakedAt.
- Lists up to 3 craftable movers, each with name / velocity / price / inline
  `[+ Watchlist]` (reuse `AddToWatchlistButton` logic). "View all new items →" → `/whats-new`.
- Dismiss (✕ or View-all) sets `last_seen_patch_date = patchDateIso` → never re-shows for
  this patch. If dismissed without clicking through, sidebar shows a soft "New patch" cue
  for the rest of the 14-day window (2F).

### 2D. NEW THIS PATCH column (FR-2.2)
`aggregate.ts` + `ChangedDigest.tsx`
- Extend `MoversDigest` with `newThisPatch: WatchlistRow[]`? No — these are *new* items,
  not watchlist rows. Instead pass a separate `newPatchItems` prop into `ChangedDigest`
  built from 2B (id/name/velocity/tracked-flag), gated on `withinWindow(14)`.
- Render a 4th `<Column>`-style list "★ New this patch". Each card: name, `x.x/d`, and
  `[CRAFT?]` → Craft Helper preloaded, or muted `[TRACKED]` when already on the watchlist.
- Empty state: "No new items selling yet — check back soon."
- Confirm the Craft-Helper deep-link route exists; if not, fall back to `/item/:id`.

### 2E. What's New — MY JOBS ONLY + SPIKE column (FR-2.3, FR-2.4)
`types.ts`, `runWhatsNew.ts`, `WhatsNewView.tsx`, `WhatsNewResults.tsx`
- `WhatsNewFilter` += `myJobsOnly: boolean` (default false); `WhatsNewSort` += `'spike'`;
  `WhatsNewRow` += `spike: number | null`.
- `runWhatsNew` gains `recipes` + `levels` params: compute per-`sc` average velocity in a
  first pass, set `row.spike`; when `myJobsOnly`, drop rows whose recipe job isn't leveled.
- Filter bar: add `[□ MY JOBS ONLY]` checkbox next to TRADEABLE ONLY.
  Empty state when on + no matches: "No new craftable items for your jobs yet — try
  lowering Min sales/day."
- Results table: insert SPIKE column between PRICE and SALES/DAY; show `★ HOT` at ≥3×,
  else `x.x×`; make it a `SortableHeader`.

### 2F. Sidebar "New patch" cue
`Sidebar.tsx`
- Optional `badge` on the What's New nav item, lit when `isNewPatch && withinWindow(14)`
  and the banner was soft-dismissed.

---

## PART 0 — Shared prefs (do first)
`src/features/settings/store.ts`
- Add to `SettingsState` (+ defaults + setters), bump `_v` with a migration:
  - `concentrationBannerLastDismissed: string | null` (ISO)
  - `concentrationBannerSuppressed: boolean`
  - `lastSeenPatchDate: string | null` (ISO date)
- Keep naming camelCase to match the store; PRD's snake_case is just spec notation.

---

## Build order (dependency-sorted)
1. **Part 0** — prefs fields + migration.
2. **1A** — `categoryShares` / `topCategory` + tests. (pure, unblocks everything in Part 1)
3. **1B** — CONCENTRATION KPI cell.
4. **1D** — concentration widget; **1E** — Discover deep-links.
5. **1C** — concentration banner (needs 1A + prefs + 1E link target).
6. **2A** — patch detection hook; **2B** — craftable-movers selector (+ lazy market fetch).
7. **2E** — What's New job filter + SPIKE (self-contained; can parallelize with 2A/2B).
8. **2C** — patch banner; **2D** — NEW THIS PATCH column; **2F** — sidebar cue.
9. Typecheck + lint + targeted tests; manual smoke per acceptance criteria.

## Risks / decisions to confirm with user
- **R1 — dashboard market fetch for new items (2B).** Adds one client-side Universalis
  call on dashboard load during the 14-day patch window. No new backend endpoint, but it
  is extra load-time work. Alternative: drop the velocity gate in the banner for v1 and
  show newest craftable items regardless of sales. *Decision needed.*
- **R2 — SPIKE baseline (2E).** "Category average" = average over new-items in that
  search category, not DC-wide. Documented in tooltip. Acceptable for v1.
- **R3 — Diversification ordering (1D).** True "Discover potential" ranking needs a scan
  per category (expensive). v1 orders by least-tracked; real ranking is a follow-up.
- **R4 — Craft Helper deep-link (2D).** Confirm the preload route/param exists before
  wiring `[CRAFT?]`; otherwise fall back to the item page.
