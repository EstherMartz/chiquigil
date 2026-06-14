# Market-refresh re-architecture: offload the heavy sweep to GitHub Actions

**Date:** 2026-06-14
**Status:** Design approved (pending spec review)
**Relates to:** `2026-06-07-market-freshness-design.md`, `2026-06-07-opportunities-feed-design.md`

## Problem

The Universalis bulk-cache refresh (`/api/refresh-cache`) has been **100% failing in
production since the tiered + opportunities design shipped (~2026-06-07)** — zero
successful runs in 7 days. It also consumed ~75% of the Vercel Hobby free tier's 4h
Fluid Active-CPU budget for zero useful work, triggering the "75% usage" warning that
opened this investigation.

### Root cause (measured, not guessed)

Two independent failures, wedged together:

1. **Scale.** The `full` tier sweeps the entire item catalog. Measured: **50,360
   catalog items × 3 scopes ≈ 2,218s** of Universalis fetching (lower bound; a 500-id
   probe took 22s with ~2/3 of requests throttled/404'd). The Vercel **Hobby function
   limit is 300s** (Pro is 1800s) — so `full` is ~7× over and **can never complete**.
   Because `full`/`cold` never finished, the seed blobs (`hot-ids.json`,
   `traded-ids.json`) were never written, so `hot` fell back to the 50k catalog and
   504'd every 5 minutes — pinning the function ~24/7.

2. **An unhandled throw.** [`fetchBatch`](../../../src/bot/marketFetch.ts) calls
   `await res.json()` with no try/catch. Universalis returns **HTTP 200 with a non-JSON
   body** (its rate-limit / Cloudflare page) under load; `res.json()` then throws
   uncaught → the `cold` tier returns 500 on as few as ~503 items (not a timeout).

A prior fix (`d488bf1`) made `hot`/`cold` bail with 503 instead of loading the 50k
catalog — this **stopped the CPU bleed** but did **not** restore freshness.

### Key fact that unlocks the fix

The catalog is 50,360 items, but only **16,794 are marketable** (Universalis'
authoritative list at `https://universalis.app/api/v2/marketable`). The other ~67% are
untradeable (crystals, currencies, quest items, untradeable gear) — they have **no
market board**, were never in the cache blobs (velocity 0 < threshold), and every
request for them 404'd. `loadItemIds` (the 50k load) is used **only** by the refresh
sweep — nothing else depends on it — so trimming the swept universe to the marketable
set breaks no feature.

## Goals / non-goals

**Goals**
- Restore genuinely fresh bulk market data on the **Vercel Hobby** plan (no upgrade).
- Keep the existing client/plugin **read-contract** 100% stable.
- Keep minute-scale (5-min) freshness for the high-velocity "hot" set.
- Make the pipeline resilient to Universalis throttling (degrade, never crash).

**Non-goals**
- Real-time WebSocket bulk feed (the deferred "always-on WS worker" — out of scope).
- Tracking market prices for untradeable items (they have none).
- Upgrading to Vercel Pro.

## Architecture

Split the work by where it fits the time budget:

| Where | Cadence | Job | Writes |
|-------|---------|-----|--------|
| **GitHub Actions** (free, no time limit) | hourly | Full **marketable** sweep (16,794 × 3 scopes) + derive hot set + scan deals | `market-cache-cold.json`, `hot-ids.json`, `opportunities.json` |
| **Vercel cron** (cron-job.org) | every 5 min | `hot` tier: sweep `hot-ids.json` set (~163–2k) | `market-cache-hot.json` |

The two writers touch **disjoint blobs** — no write conflicts. GitHub Actions (no 300s
ceiling) is what *seeds* `hot-ids.json`, so the Vercel hot tier always has its input —
dissolving the old chicken-and-egg.

The **client read-contract is unchanged**: same blob names, same JSON shapes
(`SharedCache`, `OpportunitiesFile`, `number[]`), same `VITE_CACHE_COLD_URL` /
`VITE_CACHE_HOT_URL` / `VITE_OPPORTUNITIES_URL` env vars. Web + plugin need no changes.

**No new Vercel lambda** — the 12-lambda Hobby cap is untouched.

## Components / files

- **NEW `src/bot/refreshMarket.ts`** — extract the refresh orchestration into one shared
  module so the Vercel handler and the CI script share a single code path (no drift).
  Roughly: `runRefresh({ ids, world, dc, region, outputs })` → fetches the 3 scopes and
  writes the requested outputs (cold cache + hot-ids + opportunities, or just hot cache).
- **`src/bot/marketFetch.ts`** — harden `fetchBatch`: wrap `res.json()` in try/catch →
  return `{}` on a non-JSON/parse failure (fixes the `cold`-500 and makes throttling
  degrade gracefully). Add patient retry/backoff for CI (no time pressure there).
- **`src/api/refresh-cache.ts`** — reduce the cron path to the `hot` tier (reads
  `hot-ids.json`, writes `market-cache-hot.json`) via the shared module. Keep `full`/`cold`
  as manual/debug paths (`?tier=`) but off the cron.
- **NEW `scripts/refresh-market.ts`** — CI entry (run via `tsx`); reads the committed
  `marketable-ids.json`, calls the shared module to write cold cache + hot-ids +
  opportunities. Uses `BLOB_READ_WRITE_TOKEN` from env (read automatically by
  `@vercel/blob`).
- **NEW `.github/workflows/refresh-market.yml`** — `schedule` (hourly) + manual
  `workflow_dispatch`; checks out the repo, installs deps, runs `tsx scripts/refresh-market.ts`.
  Secrets: `BLOB_READ_WRITE_TOKEN`; vars: `HOME_WORLD` / `HOME_DC` / `REGION` (default
  Phantom / Chaos / Europe).
- **`scripts/bake-snapshots.ts`** + **NEW `public/data/snapshots/marketable-ids.json`** —
  the bake fetches `/api/v2/marketable` and writes the 16,794-id array (and a
  `marketableCount` in `manifest.json`); **on fetch failure it keeps the last committed
  file** (never overwrites with a partial/empty list).
- **Retire** `traded-ids.json` and the Vercel `cold`/`full` **cron** jobs. The old `cold`
  tier used `traded-ids.json` only to keep the hourly Vercel sweep under 300s; GitHub
  Actions now does the full 16k cold sweep hourly with no size constraint, so the
  traded-set concept is unnecessary. (Nothing outside the cron reads `traded-ids.json`.)

## Data flow

1. **Bake (`npm run snapshots`, occasional/manual):** refresh `marketable-ids.json`
   (committed to the repo).
2. **GitHub Actions (hourly):** checkout → `tsx scripts/refresh-market.ts` → read
   committed `marketable-ids.json` → fetch 3 scopes (with retry/backoff) → write
   `market-cache-cold.json`, `hot-ids.json`, `opportunities.json` to Vercel Blob.
3. **Vercel cron (every 5 min):** `GET /api/refresh-cache?tier=hot&token=…` → read
   `hot-ids.json` → fetch that set → write `market-cache-hot.json`.
4. **Client (unchanged):** `loadSharedMarketCache` reads cold + hot blobs (hot overlays
   cold by timestamp); `/opportunities` reads `opportunities.json`; plugin APIs read the
   cold blob.

## Error handling

- `fetchBatch` returns `{}` on any non-OK response **and** on a JSON parse failure — one
  throttled/garbage batch can never crash a run (kills the `cold`-500 class).
- Blob `put` wrapped so a token/quota failure surfaces a clean, logged error.
- Bake keeps the last good `marketable-ids.json` if Universalis is unreachable at build
  time. The CI script aborts (does **not** fall back to a 50k sweep) if no marketable id
  source is available, so it never silently reverts to the broken behavior.
- GitHub Actions failures are visible in the Actions tab; partial data is tolerated — the
  next hourly run recovers. Retry/backoff in CI mitigates the observed ~2/3 throttle rate.

## Testing

- **TDD** the `fetchBatch` parse-failure path: a 200 response with a non-JSON body →
  returns `{}` (no throw).
- Cover the shared `refreshMarket` module with a mocked fetch (correct outputs written
  for the hot-only vs full-sweep output sets).
- Existing `selectHotIds` / `scanDeals` / `mergeDeals` tests stay green.
- Local dry-run of `scripts/refresh-market.ts` against a small id subset before wiring CI.

## Rollout (runbook)

1. Land the code (fetch hardening, shared module, marketable bake, CI script, workflow).
2. Add repo secret `BLOB_READ_WRITE_TOKEN` and vars `HOME_WORLD`/`HOME_DC`/`REGION`.
3. Manually run the GitHub Action once (`workflow_dispatch`) to seed the blobs; confirm
   it returns success and the blobs update.
4. In cron-job.org: keep **only** the 5-min `?tier=hot` job; delete the hourly `cold` and
   daily `full` jobs.
5. Verify the site shows fresh cold + hot prices and `/opportunities` is populated.

## Risks

- **GitHub Actions cron drift** — scheduled runs can be delayed under GH load; hourly
  tolerance absorbs this.
- **Universalis throttling** — affects data completeness regardless of host; CI retry/
  backoff + the next hourly run mitigate. A run may produce a partial cold cache; never a
  crash.
- **Borderline Vercel hot tier** — the hot set is small (~163–2k); even at the worst
  measured throughput it stays far under 300s, and bails 503 (cheap) if `hot-ids.json` is
  somehow absent.
- **Two pipelines drifting** — mitigated by the shared `src/bot/refreshMarket.ts` module;
  both the lambda and the CI script call the same code.
- **Secret exposure** — `BLOB_READ_WRITE_TOKEN` lives as a GitHub repo secret; rotate via
  the Vercel Blob dashboard if leaked.
