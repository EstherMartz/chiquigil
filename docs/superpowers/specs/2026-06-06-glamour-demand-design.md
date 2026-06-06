# Glamour Demand — Design

**Date:** 2026-06-06
**Status:** Approved (pending spec review)

## Summary

A new insight page that ranks FFXIV gear by how often it appears across the
community's most-loved glamours on [Eorzea Collection](https://ffxiv.eorzeacollection.com),
joined with the app's item and market data. It doubles as a "what glamour gear
is in demand → craft/flip opportunity" tool, consistent with the rest of the
gil-making app.

The ranking metric is **uses** — the number of distinct top glamours an item
appears in (the scraper increments a per-item counter once per glamour it shows
up in). Higher uses = more sought-after = higher rank.

## Decisions (from brainstorming)

- **Scraper stays a standalone Python sidecar.** The existing script runs
  manually ~monthly (or via the user's own cron) and writes its JSON output into
  the repo. No TS port, no Vercel cron lambda (the project is at the 12-function
  Hobby cap).
- **Market-opportunity angle.** Join marketboard median price + sales velocity.
- **Untradeable items are excluded** (not shown at all).
- **Name→ID resolution happens at runtime** via a pure, testable resolver against
  the already-loaded item snapshot. No bake/enrichment step.
- **Unmatched names are dropped but counted** for a transparency footnote.

## Data contract

The page reads the scraper's output verbatim at
`public/data/snapshots/glamours.json`. The user points the script's `OUTPUT_FILE`
at this path (or copies the file there) and commits it.

```jsonc
{
  "generated_at": "2026-06-01T00:00:00Z", // ISO 8601 UTC; drives freshness chip
  "pages_scraped": 10,
  "glamours_checked": 360,
  "unique_items": 412,
  "ranking": [
    { "item": "Eternal Bliss Dress", "uses": 87 },
    { "item": "Ala Mhigan Gloves",   "uses": 64 }
    // ... sorted by uses desc by the scraper, but the app re-sorts defensively
  ]
}
```

Only `generated_at` and `ranking` are consumed by the app. The other fields are
informational and may be surfaced in the freshness/transparency line. The app
must tolerate a missing file (feature shows an empty state, never crashes).

## Architecture

Follows the established insight-page pipeline:

```
public/data/snapshots/glamours.json   (committed, Python-produced)
        │  fetch
        ▼
loadStaticGlamourRanking()            (src/lib/staticSnapshots.ts)
        │
        ▼
useGlamourSnapshot()                  (react-query hook, staleTime: Infinity)
        │  + useItemSnapshot() → itemsById
        ▼
resolveGlamourRanking(ranking, itemsById)   (pure fn, unit-tested)
        │  → { rows: ResolvedGlamourItem[], unmatched: number, untradeable: number }
        ▼
GlamourDemandView                     (auto market scan + table/filter/sort)
        │
        ▼
/glamour route + Gil-Making sidebar entry
```

### Resolver: `resolveGlamourRanking`

Location: `src/features/glamour/resolveGlamourRanking.ts`

Pure function, no I/O. Signature:

```ts
interface RawGlamourEntry { item: string; uses: number }
interface ResolvedGlamourItem {
  id: number;
  name: string;       // canonical name from the item snapshot
  sc: number;         // ItemSearchCategory
  ilvl: number;
  rarity?: number;
  uses: number;
}
interface GlamourResolution {
  rows: ResolvedGlamourItem[];   // tradeable, matched, sorted by uses desc
  matched: number;               // resolved to an item id
  unmatched: number;             // scraped names with no item match
  untradeable: number;           // matched but sc === 0 (dropped)
}

function resolveGlamourRanking(
  ranking: RawGlamourEntry[],
  itemsById: SnapshotItem[] | Map<number, SnapshotItem>,
): GlamourResolution
```

Behaviour:
1. Build a normalized-name → item index from the item snapshot. **Normalization:**
   trim, lowercase, NFKC-normalize, strip a trailing HQ marker (`` or `(HQ)`),
   collapse internal whitespace to single spaces. On duplicate normalized names
   (rare for gear), the **lowest item id wins** (deterministic).
2. For each ranking entry, normalize `item` and look it up.
   - No match → increment `unmatched`, skip.
   - Match with `sc === 0` → increment `untradeable`, skip.
   - Match with `sc !== 0` → emit a `ResolvedGlamourItem`, increment `matched`.
3. Sort emitted rows by `uses` desc, tie-break by `name` asc (stable, deterministic).

`sc === 0` (no ItemSearchCategory) is the marketability proxy already used by the
heatmap and other views: an item with no search category cannot be listed on the
market board, so it is untradeable.

### Snapshot loader + hook

- `src/lib/staticSnapshots.ts`: add `loadStaticGlamourRanking()` returning
  `{ generatedAt: string | null; ranking: RawGlamourEntry[] } | null`. Mirrors
  `loadStaticWhatsNewSnapshot` (plain fetch, null on failure).
- `src/features/queries/useGlamourSnapshot.ts`: react-query hook,
  `queryKey: ['glamourSnapshot']`, `staleTime: Infinity`, returns
  `{ generatedAt, ranking }` with an empty default.

### View: `GlamourDemandView`

Location: `src/features/glamour/GlamourDemandView.tsx` (route wrapper at
`src/routes/GlamourDemand.tsx`, lazy-loaded).

Mirrors `WhatsNewView` / `GcSeals`:
- Pull `useGlamourSnapshot()` + `useItemSnapshot()`, build `itemsById`, run
  `resolveGlamourRanking` in a `useMemo`.
- Auto-run a market scan for the resolved tradeable IDs on the current world
  using `useInitialScan` + `fetchInBatches`/`fetchMarketData` (cache-backed, so
  a few hundred IDs is cheap). Manual "Refresh" button like other scan views.
- Join each row with market data: median price (`medianNQ ?? medianHQ ?? minNQ`)
  and velocity.

**Columns (desktop table; mobile = card list):**

| Col | Source | Notes |
|-----|--------|-------|
| Rank | row index after sort | `#` |
| Item | `ItemNameLinks` | icon + name + external links |
| Category | `categoryLabel(sc)` | from `itemSearchCategories` |
| ilvl | `ilvl` | right-aligned, tabular |
| Uses | `uses` | primary metric; subtle intensity bar (design-system spread-bar idiom), relative to max uses in view |
| Price | market median | gold, `fmtGil` |
| Vel/day | market velocity | `.toFixed(1)` |

- **Default sort:** Uses desc. All columns sortable via the existing sortable-header pattern.
- **Filter:** `CategorySelect` to filter by item search category. (Slot-level
  filtering via ItemUICategory is out of scope for v1 — no ui→label map exists
  yet; category filter reuses existing, tested infra.)
- **Freshness + transparency line:** "Scraped {generated_at, relative}" chip plus
  a footnote: "{matched} ranked · {unmatched} unmatched · {untradeable} untradeable hidden".
- **Empty states:** snapshot missing/empty → `EmptyState` explaining the page and
  how data is populated; market not yet loaded → `Spinner`.

### Routing & navigation

- `src/App.tsx`: add lazy route `/glamour` → `GlamourDemand`.
- `src/components/layout/Sidebar.tsx`: add "Glamour Demand" under the
  **Gil-Making** section.
- `src/components/layout/Header.tsx`: add the route's title mapping if the header
  derives titles from the route table.

### Docs

A short note (in `docs/` or the scraper's directory) on running the scraper
monthly and committing the refreshed `glamours.json`, including the
`OUTPUT_FILE` path and the polite-scraping config already in the script.

## Error handling

- Missing/malformed `glamours.json` → loader returns null → page shows empty
  state. No crash.
- Ranking entries with non-string `item` or non-number `uses` → skipped by the
  resolver (defensive guards), not counted as unmatched.
- Market fetch failures → existing scan error banner; resolved rows still render
  with price/velocity shown as "—".
- Items present in the ranking but absent from the current item snapshot (e.g.
  brand-new patch gear not yet baked) → counted as unmatched.

## Testing

- **Resolver unit tests** (`resolveGlamourRanking.test.ts`): exact match;
  normalization (case, whitespace, HQ marker, unicode); untradeable (`sc===0`)
  dropped and counted; unmatched counted; duplicate normalized name → lowest id;
  ranking sorted by uses desc with name tie-break; defensive skip of malformed
  entries; empty input.
- **Loader**: covered by existing `staticSnapshots` test patterns (null on
  missing/failed fetch).
- Market scan + table rendering reuse existing, already-tested infrastructure.

## Out of scope (YAGNI)

- Porting the scraper to TS / automating it on Vercel cron.
- Slot-level (ItemUICategory) filtering and a ui→label map.
- Loves-weighted scoring (the scraper counts appearances, not loves; uses is the
  agreed metric).
- Showing untradeable items or raw unmatched names as rows.
- Per-glamour drill-down (which glamours an item appears in).
```

## File checklist

| File | Change |
|------|--------|
| `public/data/snapshots/glamours.json` | New — committed scraper output |
| `src/lib/staticSnapshots.ts` | Add `loadStaticGlamourRanking()` |
| `src/features/queries/useGlamourSnapshot.ts` | New hook |
| `src/features/glamour/resolveGlamourRanking.ts` | New pure resolver |
| `src/features/glamour/resolveGlamourRanking.test.ts` | New tests |
| `src/features/glamour/GlamourDemandView.tsx` | New view |
| `src/routes/GlamourDemand.tsx` | New lazy route wrapper |
| `src/App.tsx` | Register `/glamour` route |
| `src/components/layout/Sidebar.tsx` | Add nav entry (Gil-Making) |
| `src/components/layout/Header.tsx` | Add title mapping if needed |
| `docs/...` | Scraper run note |
