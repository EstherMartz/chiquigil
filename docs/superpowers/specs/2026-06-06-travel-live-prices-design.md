# Travel Planner — On-demand Live Prices — Design

**Date:** 2026-06-06
**Status:** Approved (design)

## Overview

Add an on-demand "live prices" refresh to the Travel Planner, mirroring the item
page's `LiveRefreshBar`. Today the scan reads the hourly bot cache (instant but up
to ~90 min stale). The new control re-runs the same scan pulling straight from
Universalis, so the player can confirm a trip on current prices — gated by a 60s
cooldown and engineered to stay within Universalis's documented limits.

## Behavior

- A second button beside **Run scan**: **`↻ Live prices`** (jade, matching the item
  page refresh affordance).
- Clicking it re-runs the scan against live Universalis data and shows a
  `Live · just now` freshness tag (relative time).
- After a refresh the button is disabled for **60s** (`Wait Ns`), same as the item
  page. The instant cache **Run scan** stays unchanged.
- No auto-refresh interval, no per-row refresh (YAGNI).

## Mechanism

The existing `run` mutation gains a `live: boolean` argument (`run.mutate(live)`):

- `live === false` (default, and the "Run scan" / initial auto-scan path): region +
  home fetched via `fetchMarketData` (cache-only, instant). Unchanged.
- `live === true`: region + home fetched via `fetchMarketLive`, chunked at **100 IDs
  per request**. `fetchMarketLive` already parses multi-item responses and merges
  results into the in-memory scope cache, so `planTravel` recomputes on fresh data
  and the freshness tag reflects the pull.

`planTravel` is unchanged — it already filters the region-scope `worldListings` to
the chosen destination world, which works for both cache and live region data
(multi-world region queries include `worldName`).

## Respecting Universalis limits

Documented limits: 25 req/s (50 burst) on the API; **max 8 simultaneous connections
per IP**. Strategy:

- Multi-item endpoint takes up to 100 IDs/request → ~500 candidates ≈ **5 requests
  per scope**, ~10 total.
- Fetch the two scopes **sequentially** (region, then home), each through
  `fetchInBatches` with **concurrency 6** → peak **6 simultaneous connections**
  (safely under the 8 cap), well under 25 req/s.
- The 60s cooldown is the second guardrail.
- Live fetches return ~10 listings/item (vs the cache's ~50) — slightly shallower
  depth, fresher prices. Surface this in the button tooltip.

## Components / Files

- **New:** `src/lib/useCooldown.ts` — `useCooldown(ms)` → `{ onCooldown, secondsLeft,
  start() }`. A small, tested timer hook so the button's 60s gate isn't a duplicated
  inline timer. (Does not refactor `LiveRefreshBar` now — out of scope.)
- **New:** `src/lib/useCooldown.test.ts` — unit tests with fake timers.
- **Modify:** `src/features/travel/TravelPlannerView.tsx`
  - `run` mutation: `mutationFn: async (live: boolean) => …`; choose fetcher per
    `live`; fetch scopes sequentially at concurrency 6 when live.
  - Track `liveAt: number | null` (set on a successful live run) for the freshness tag.
  - `FilterBar` gains the `↻ Live prices` button wired to `useCooldown` + a
    `onLive` handler (`run.mutate(true)` then `start()` the cooldown). `Run scan`
    calls `run.mutate(false)`. `useInitialScan` calls `run.mutate(false)`.

## Error handling

Reuse the existing `run.isError` banner and the skipped-chunks line. A partial
Universalis failure (rate limit / CORS / 404) drops those chunks into
`destRes.errors` / `homeRes.errors` → shown as skipped, same as today.

## Testing

- `useCooldown`: starts not-on-cooldown; `start()` → on cooldown with `secondsLeft`
  counting down; clears after `ms`; re-`start()` resets. Use Vitest fake timers.
- Manual: click Live prices → results refresh, `Live · just now` appears, button
  shows `Wait 60s` and counts down; a second scope failing shows skipped chunks.

## Scope boundaries

- No change to `planTravel` or the engine.
- No auto-refresh, no per-row live refresh.
- Does not touch `LiveRefreshBar`.
