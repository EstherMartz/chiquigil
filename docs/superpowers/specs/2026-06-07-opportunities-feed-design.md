# Opportunity Feed (Tier 3) — Design

**Date:** 2026-06-07
**Status:** Approved (design)
**Parent:** `docs/superpowers/specs/2026-06-07-market-freshness-design.md` (this is Tier 3, scoped to its own subsystem)

## Overview

A **"what just changed"** delta feed. Today the scan pages (Movers, Best Deals,
Empty Shelf) compute *full current rankings* client-side and have no memory of the
previous state, so they can't answer "what newly became an opportunity since the last
refresh." Tier 3 fills that gap: the refresh cron diffs the new prices against the
previous blob, records items that just crossed a threshold into a rolling
`opportunities.json`, and a new `/opportunities` page (plus, later, the plugin)
displays it.

Detection is **DC-wide**: it diffs the `dc` scope (which aggregates every world in the
data center) and tags each opportunity with the world to act on — so it surfaces the
best deal anywhere in the DC, not just the home world.

This feature deliberately does **not** push to Discord (decided 2026-06-07) — the feed
is read in the app and the plugin.

## Detection model

### Source data
The cron already fetches a `MarketBundle` with a `dc` scope. Each item's `dc` entry has:
- `minNQ` — cheapest NQ price across the whole DC.
- `worldListings` — cheapest-first listings, each with `world` (name), `price`, `hq`.
- `listingCount` — total DC-wide listings (capped at `LISTINGS_CAP`).
- `velocity`, `avgNQ`.

### Granularity (decided)
**DC-cheapest + world tag** — one signal per item, the DC-wide cheapest, tagged with
the world holding it. Covers all DC servers (the cheapest can be on any of them).
*Not* per-world tracking (every world diffed independently) — that's a noisier feed
and a bigger build; noted as a future option.

### Kinds & thresholds

> **REVISED 2026-06-07 after live testing.** The original "≥20% move since the previous
> blob" baseline produced `oppCount: 0` across a full 50,360-item run — real price swings
> happen gradually, so almost nothing jumps 20% inside one 5-min/1h interval. Price signals
> now measure the DC-cheapest against the item's **recent average** (`avgNQ`, ~7-day) and
> fire on a fresh **crossing** of a ±`DEAL_PCT` band. This catches "cheap vs its norm"
> reliably while staying a delta (the crossing keeps it distinct from Movers' static ranking).

`DEAL_PCT = 15`. Let `avg = next.avgNQ`, `dealLine = avg·0.85`, `spikeLine = avg·1.15`:

| kind | condition (`dc` scope, prev `p` → next `n`) | meaning |
| --- | --- | --- |
| `crash` | `p.minNQ > dealLine` and `n.minNQ ≤ dealLine` | buy — just dropped ≥15% below its average, cheapest on world `W` |
| `spike` | `p.minNQ < spikeLine` and `n.minNQ ≥ spikeLine` | sell — just rose ≥15% above its average |
| `empty` | `listingCount` was > 2, now ≤ 2 | craft — undersupplied DC-wide |

`oldValue` = the recent average (the norm); `newValue` = current DC-cheapest;
`changePct` = signed % of current vs average.

Notes:
- Price kinds need a prev counterpart, a positive `avgNQ`, and both `minNQ`s present;
  otherwise skipped. Items steadily below the line (no fresh crossing) don't re-fire.
- `empty` fires on the supply drop regardless of price.
- One kind per item per refresh; if price crossed AND shelf emptied, `empty` wins (it's
  the rarer, stronger signal). Keeps the feed one-row-per-item-per-refresh.

### Opportunity record
```ts
export type OpportunityKind = 'crash' | 'spike' | 'empty';

export interface Opportunity {
  itemId: number;
  kind: OpportunityKind;
  world: string;        // world holding the DC-cheapest listing; '' for empty (DC-wide)
  oldValue: number | null;  // prev minNQ (crash/spike) or prev listingCount (empty)
  newValue: number | null;  // next minNQ (crash/spike) or next listingCount (empty)
  changePct: number | null; // signed % for crash/spike; null for empty
  velocity: number;         // next velocity (sales/day)
  gilPerDay: number;        // newValue(min price) × velocity; 0 for empty
  detectedAt: number;       // the run's ts (ms)
}
```

## Architecture

### 1. Pure diff/merge module — `src/bot/marketDiff.ts`
Pure, unit-tested. These are the **reusable seams** the future WebSocket worker will
also call (it patches in-memory `MarketData`, then runs the same diff).

```ts
export function diffMarket(prev: MarketData, next: MarketData, now: number): Opportunity[]
```
- Iterates `next`; for each item with a `prev` counterpart, applies the kind rules
  above on the `dc`-scope values passed in (`prev`/`next` are the `dc` MarketData).
- `world` = `next[id].worldListings[0]?.world ?? ''`.
- Skips items with no prev entry (no baseline).

```ts
export function mergeOpportunities(
  existing: Opportunity[], fresh: Opportunity[], ttlMs: number, now: number,
): Opportunity[]
```
- Union keyed by `${itemId}:${kind}`, **fresh wins** (latest `detectedAt`).
- Drops entries with `detectedAt < now - ttlMs` (default TTL **2h**).
- Returns sorted by `detectedAt` desc (freshest first).

### 2. Cron wiring — `src/api/refresh-cache.ts`
The handler already fetches the new bundle and writes the tier blob. Add, per run
(both hot and cold — they feed the same file; hot gives 5-min deltas on active items,
cold sweeps the long tail hourly):

1. Read the previous same-tier blob (`readBlobJson<SharedCache>(blobName)`) **before**
   writing the new one.
2. If a previous blob exists: `fresh = diffMarket(prev.dc, next.dc, ts)`.
3. `existing = (await readBlobJson<OppFile>('opportunities.json'))?.opportunities ?? []`
4. `merged = mergeOpportunities(existing, fresh, TWO_HOURS, ts)`
5. `writeBlobJson('opportunities.json', { ts, opportunities: merged })`

`OppFile = { ts: number; opportunities: Opportunity[] }`.

Concurrency: hot (5-min) and cold (hourly) rarely overlap; a read-merge-write race at
worst drops one run's additions, which the next run recovers. Not worth locking.

### 3. Public blob, no new lambda
`opportunities.json` is a **public** blob (same as `market-cache-*.json`). Both the web
app and the plugin fetch it directly by URL — **no new serverless function**, so we
stay under the 12-lambda Hobby cap. ("Server endpoint, UI later" = the cron writes this
blob now; plugin UI consumes it later from its own repo.)

### 4. Client loader — `src/lib/opportunities.ts`
```ts
export async function loadOpportunities(): Promise<Opportunity[]>
```
- Fetches `VITE_OPPORTUNITIES_URL || '/data/opportunities.json'` with `cache: 'no-store'`.
- Returns `[]` on missing/failed (so the page renders an empty state, never errors).
- Re-exports `Opportunity`/`OpportunityKind` from `marketDiff` for the view's types.

### 5. Web page — `src/features/opportunities/OpportunitiesView.tsx` + route
A new insight page matching the established idioms ([[feedback_match_ui_patterns]]):
- Uses `FreshnessChip` (blob `ts`), `FilterBar`, `ResultTableScaffold`, `SortableHeader`,
  `ItemNameLinks`.
- **Auto-runs on load** (it's a file read — per the auto-run-scans convention).
- Columns: **Item** (ItemNameLinks), **Kind** (badge styled via `ALERT_CLASS`:
  crash=crimson, spike=jade, empty=gold), **World** (act-on world), **old → new**,
  **Δ%**, **velocity**, **gil/day**, **detected** (relative time).
- **Filter** by kind (all / crash / spike / empty). **Sort** by detected (default),
  gil/day, Δ%.
- Route `/opportunities` added in `src/App.tsx`; a nav entry added near the other
  market-insight links.

## Data flow

```
cron run (hot or cold)
  → fetchMarketForOutputs → next bundle
  → readBlobJson(prev tier blob)         [before overwrite]
  → writeMarketCache(next, tier blob)
  → diffMarket(prev.dc, next.dc, ts) → fresh[]
  → mergeOpportunities(existing, fresh, 2h, ts) → merged[]
  → writeBlobJson('opportunities.json', {ts, opportunities: merged})

web /opportunities
  → loadOpportunities() → Opportunity[]
  → FilterBar + ResultTableScaffold render

plugin (later, own repo)
  → GET public opportunities.json blob → render in-game
```

## Testing

- **`diffMarket`** (`src/bot/marketDiff.test.ts`): crash fires at −20% (not at −19%);
  spike at +20%; empty when listingCount 5→2 (not 5→3); no baseline (prev missing /
  prev minNQ null) → no crash/spike; `empty` wins when price moved AND shelf emptied;
  `world` is the cheapest listing's world.
- **`mergeOpportunities`**: fresh overrides existing for same item+kind; same item
  different kind kept separately; entries older than TTL dropped; output sorted
  freshest-first.
- **`loadOpportunities`** (`src/lib/opportunities.test.ts`): parses the blob; returns
  `[]` on 404 / network error.
- **`OpportunitiesView`** (`src/features/opportunities/OpportunitiesView.test.tsx`):
  renders rows from a stubbed loader; the kind filter narrows rows; empty state when
  the feed is empty.

## Scope boundaries

- **DC-cheapest only** (one signal per item) — not per-world tracking; not region.
- **No Discord / no push** — read-only in app + plugin.
- **No `applyListingUpdate`/`applySaleUpdate`** here — those are for the future WS
  worker; this ships `diffMarket`/`mergeOpportunities` only.
- **No plugin UI** in this repo — the public blob is the handoff; plugin consumption
  lands in the Qiqirn Companion repo later.
- Detection runs in the existing refresh lambda; **no new serverless function**.

## Rollout

1. Ship the diff + blob write + `/opportunities` page behind no flag (the page shows an
   empty state until the first cron run writes the blob — safe).
2. Set `VITE_OPPORTUNITIES_URL` to the blob URL once the cron has written it (falls back
   to `/data/opportunities.json` otherwise).
3. No cron changes — detection rides the existing hot/cold runs.
