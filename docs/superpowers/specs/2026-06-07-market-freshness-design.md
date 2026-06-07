# Market Data Freshness — Faster Bulk Scans & Opportunity Detection — Design

**Date:** 2026-06-07
**Status:** Approved (design)

## Overview

Today every bulk scan (Movers, Best Deals, Empty Shelf, Vendor/Material Flip…)
reads a **single hourly blob** (`market-cache.json`) produced by an external cron
hitting [`/api/refresh-cache`](../../../src/api/refresh-cache.ts). An opportunity
that appears at :05 isn't visible until the next hourly refresh — the "1h late"
problem.

This design tightens that loop in three stacked tiers, all free on Vercel, and
bakes in the seams so a future real-time WebSocket worker (the deferred "#4") is a
contained swap rather than a rewrite.

The guiding split established during brainstorming: **cache = breadth** (catalog-wide
scans stay on the shared blob); **live = depth** (focused views go live, handled
separately by the item/travel live-price path and the future browser WebSocket).
This spec is only about the **breadth** side.

## Background: two kinds of staleness

- **Cache lag (0–60 min)** — caused by the hourly cron cadence. *Fixable here.*
- **Universalis upload lag (per-item, unbounded)** — Universalis only updates an
  item when a player running an uploader plugin opens its board. Polling can't fix
  this; `lastUploadTime` is the real freshness signal. We let it *steer* effort
  (hot/cold) rather than fight it.

## Tier 1 — Higher cadence + smaller payloads

**Cadence (no code, config only):** Point the external cron (cron-job.org) at
`/api/refresh-cache` every **10 min** instead of 60. 288 invocations/day is well
within Hobby limits and the function finishes in seconds. This is the single
biggest, cheapest freshness win (6×).

**`fields=` payload trim (code):** [`marketFetch.ts`](../../../src/bot/marketFetch.ts)
and [`buildMarketUrl`](../../../src/lib/universalis.ts:63) currently fetch full
listing/history objects but the parser keeps only a handful of fields. Add a
`fields=` whitelist so each Universalis response carries only what
[`parseMarketResponse`](../../../src/lib/universalis.ts:78) reads. Smaller responses
→ faster cycles → headroom for the higher cadence.

The whitelist is the field set the parser reads: `itemID`, `listings.{pricePerUnit,
hq,worldName,quantity,retainerName}`, `recentHistory.{pricePerUnit,hq,timestamp}`,
`regularSaleVelocity`, `lastUploadTime`, `averagePriceNQ`, `averagePriceHQ`,
`listingsCount`.

> **VERIFIED LIVE (2026-06-07) — the path form depends on request shape:**
> - **Multi-item** endpoint (`/scope/id1,id2,…`) nests items under `items`, so paths
>   MUST be **`items.`-prefixed** (`items.listings.pricePerUnit`). Bare paths return a
>   **completely empty response** — the cron would silently produce blank scans.
> - **Single-item** endpoint (`/scope/id`) returns a **flat** object, so paths must be
>   **bare**. `items.`-prefixed returns empty.
>
> Since both `buildMarketUrl` (single or multi, via `fetchMarketLive`) and `fetchBatch`
> (multi, but a 1-id final batch is possible) can emit either shape, a single static
> constant is wrong. The implementation uses a `marketFields(idCount)` helper that
> picks the prefix by id count. This is the silent-failure class flagged in the
> XIVAPI v2 memory note — confirmed and handled.

## Tier 2 — Hot/cold tiering (two blobs)

Not every item deserves equal frequency — opportunities come from a minority. Split
the refresh into two tiers driven by **server-knowable** signals (the cron is
stateless and cannot read client-side watchlists):

- **Hot set** — items whose `regularSaleVelocity` in the *previous* refresh exceeded
  a threshold, **plus** items flagged as "moved" by the Tier-3 diff. Refresh every
  **~5 min**.
- **Cold set** — every other tracked item. Refresh hourly.

### Blob layout

Two blobs instead of one:

- `market-cache-hot.json` — small, written every hot run.
- `market-cache-cold.json` — large, written every cold run.

Same `SharedCache` shape (`{ phantom, dc, region, ts }`) for each. The client loads
**both** and merges with **hot overriding cold** (hot is fresher). Back-compat: if
`market-cache-hot.json` 404s (first deploy), the client falls back to the single
legacy blob, so nothing breaks during rollout.

### One lambda, two crons

To respect the 12-lambda Hobby cap, **do not** add a function. The existing
`/api/refresh-cache` gains a `tier` query param:

- `/api/refresh-cache?token=…&tier=hot` → fetch hot IDs, write hot blob.
- `/api/refresh-cache?token=…&tier=cold` (default) → fetch cold IDs, write cold blob.

Two cron-job.org jobs hit the same lambda with different params.

### Hot-set derivation

The hot run needs the hot ID list without re-deriving from a full fetch. Source of
truth: after each **cold** run, compute the hot ID set (velocity ≥ threshold ∪
movers from the diff) and persist it as `hot-ids.json` (a plain number array blob).
The hot run reads `hot-ids.json`; if absent, it falls back to a static seed
(e.g. top-N by a bundled velocity heuristic or simply the full set on first run).

## Tier 3 — Server-side opportunity detection (app + plugin surfaces)

Detection currently happens client-side, only on page load. Move it next to the
data so the work is done once per refresh and consumed everywhere.

In the refresh handler, after fetching and **before** overwriting the blob:

1. Read the previous same-tier blob.
2. **Diff** old vs new per item using pure functions (see seams): new significantly-
   cheaper listings, large min-price moves, freshly-empty shelves.
3. Write a compact `opportunities.json` (top movers / new deals).

**Surfaces (decided 2026-06-07 — NO Discord/proactive push for now):**
- **Web app** — the scan pages / a "fresh opportunities" panel read `opportunities.json`
  and paint it instantly (a small artifact, no per-page recompute).
- **Dalamud plugin** — a `/api/plugin/*` endpoint serves the same `opportunities.json`
  so opportunities surface in-game.

No Discord webhook, no `DISCORD_ALERT_WEBHOOK`, no alert-threshold/dedupe/cooldown
machinery — those only matter for push. This also avoids the "Vercel `api/discord` is
interactions-only and can't push" problem entirely. (A Discord push could be added
later as an optional consumer of the same `opportunities.json`; out of scope now.)

## #4 seam notes (future real-time WebSocket worker)

The eventual real-time upgrade replaces *who fills the hot blob* — an always-on
worker holding a Universalis WebSocket (`wss://universalis.app/api/ws`, BSON,
per-world/DC subscription) that patches an in-memory `MarketData` and flushes to
`market-cache-hot.json`. Because the **blob is the contract**, nothing downstream
changes. To keep that swap contained, this design mandates two seams up front:

1. **Pure merge/diff functions.** Implement the Tier-3 diff and the
   listing/sale patch as pure, exported, unit-tested functions:
   - `applyListingUpdate(item: MarketItem, listings: WorldListing[]): MarketItem`
   - `applySaleUpdate(item: MarketItem, sale: { price: number; hq: boolean; ts: number }): MarketItem`
   - `diffMarket(prev: MarketData, next: MarketData): Opportunity[]`
   The cron diff uses `diffMarket`; the future WS worker reuses
   `applyListingUpdate`/`applySaleUpdate` verbatim to patch on `listings/add` /
   `sales/add` events. **This same patch logic is also what the earlier
   browser-side WebSocket feature needs — build it once, here.**
2. **Single blob-writer seam.** All blob writes go through
   [`writeMarketCache`](../../../src/bot/marketCache.ts) (generalized to take a blob
   name). The future worker calls the same writer with the same shape.

With these in place, #4 is "wrap the existing patch/decode code in an always-on
process + flush to a blob" — ops work (standing up Fly.io/Railway/Durable Object),
not a refactor. Ordering note for later: do the **browser** WebSocket before the
server worker so the BSON decoder + reconnect + patch code is already written and
reused.

## Files

**Tier 1 + 2 (first plan):**
- **Modify** `src/lib/universalis.ts` — `MARKET_FIELDS` const; `buildMarketUrl`
  appends `&fields=`; `loadSharedMarketCache` loads hot + cold blobs (hot overrides),
  with legacy single-blob fallback.
- **Modify** `src/bot/marketFetch.ts` — `fetchBatch` URL appends `&fields=`.
- **Modify** `src/bot/marketCache.ts` — `writeMarketCache(cache, name)` takes a blob
  name; add `writeHotIds(ids)` / `readHotIds()` helpers (or a small `blobJson.ts`).
- **Modify** `src/api/refresh-cache.ts` — read `tier` param; hot path reads
  `hot-ids.json` + writes hot blob; cold path writes cold blob + recomputes hot IDs.
- **Build:** regenerate `api/refresh-cache.mjs` via `npm run build:api`.

**Tier 3 (second plan — separate subsystem):**
- **Create** `src/bot/marketDiff.ts` — `Opportunity` type, `diffMarket`,
  `applyListingUpdate`, `applySaleUpdate` (pure, tested).
- **Modify** `src/api/refresh-cache.ts` — wire diff + write `opportunities.json`.
- **Add** a web surface (scan-page panel reading `opportunities.json`) + a
  `/api/plugin/*` endpoint serving it to the plugin. (No Discord alert module.)

## Respecting Universalis limits

Documented: ~25 req/s (50 burst), max 8 simultaneous connections/IP. The cold run is
unchanged (100 IDs/request, 8 concurrent — already safe). The hot run is a strict
subset, so it's strictly lighter. The `fields=` trim reduces bytes, not request
count, so it doesn't change the concurrency story. No change to `MAX_CONCURRENT`.

## Scope boundaries

- **Not** touching focused-view live prices (item page / travel) — that's the
  separate "depth" path.
- **Not** building the browser or server WebSocket here — only the pure
  patch/diff functions that both will reuse.
- **Not** reading client watchlists server-side (not available to the stateless
  cron); hot set is velocity/movement-derived.
- Cadence change is an external cron-config action, documented as a manual step.

## Rollout / verification

1. Deploy with the two-blob loader (legacy fallback keeps prod working before the
   hot cron exists).
2. Add the **cold** cron at hourly (replaces the current single job).
3. Add the **hot** cron at 5 min.
4. Verify `fields=` parity against live before relying on the trim.
5. Tier 3: verify the webhook fires on a synthetic diff before enabling alert
   thresholds in prod.
