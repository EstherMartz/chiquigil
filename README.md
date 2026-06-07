# ffxiv-helper

Personal crafting/market tool for FFXIV. Live data via Universalis, item metadata via XIVAPI.

Default world: Phantom · DC: Chaos.

## Dev

```
npm install
npm run dev
```

## Deploy

1. Push to GitHub.
2. Import the repo on Vercel (`https://vercel.com/new`).
3. Vercel auto-detects Vite, no config needed beyond `vercel.json` already in repo.
4. Optional env var: `VITE_XIVAPI_BASE` if you want to override the default `https://v2.xivapi.com`.

## Market cache refresh (full / cold / hot tiers)

Bulk scans read pre-fetched blobs instead of hitting Universalis per page load.
External cron jobs (e.g. cron-job.org) hit the **same** `/api/refresh-cache` lambda
with different `tier` params. Fetching all ~50k marketable items every hour flirts with
the function timeout, so the regular runs use a smaller **traded set** and a heavy full
sweep runs only occasionally:

- **Full (whole catalog):** `GET /api/refresh-cache?token=$REFRESH_SECRET&tier=full` —
  run **daily** (and once right after deploy to seed the set). Fetches every marketable
  item, writes `market-cache-cold.json`, and derives both `traded-ids.json`
  (`regularSaleVelocity ≥ TRADED_VELOCITY_THRESHOLD`) and `hot-ids.json` (`≥ HOT_VELOCITY_THRESHOLD`).
- **Cold (traded set):** `GET /api/refresh-cache?token=$REFRESH_SECRET` — run **hourly**.
  Fetches only `traded-ids.json` (a few thousand, well under the timeout; falls back to
  the full catalog until `full` has seeded it), writes `market-cache-cold.json`, refreshes
  `hot-ids.json`. Untraded items have no average/velocity, so they never appear in a scan
  or the feed regardless.
- **Hot (active items):** `GET /api/refresh-cache?token=$REFRESH_SECRET&tier=hot` — run
  every **~5 min**. Fetches only the `hot-ids.json` items and writes `market-cache-hot.json`.

> **After deploy:** run the **full** sweep once (`&tier=full`) to create `traded-ids.json`,
> otherwise the first cold runs fall back to the full catalog and may time out. Each tier's
> response reports `tradedCount` / `hotCount` / `oppCount` so you can size the sets.

The client loads both blobs at startup and merges them with **hot overriding cold**
(fresher wins), falling back to the legacy single blob during rollout. Universalis
payloads are trimmed via a `fields=` whitelist (`marketFields` — `items.`-prefixed for
multi-item requests, bare for single-item; the wrong form returns an empty response).

### Env vars

| Var | Purpose |
| --- | --- |
| `REFRESH_SECRET` | Shared secret protecting the refresh endpoint (`?token=`). |
| `HOT_VELOCITY_THRESHOLD` | Min `regularSaleVelocity` for an item to be "hot" (default `10`). |
| `TRADED_VELOCITY_THRESHOLD` | Min `regularSaleVelocity` for an item to be in the hourly "traded" cold set (default `1`). Lower → broader scan coverage but slower cold runs. |
| `VITE_CACHE_COLD_URL` | Client URL for the cold blob (falls back to `VITE_CACHE_BLOB_URL`, then `/data/market-cache-cold.json`). |
| `VITE_CACHE_HOT_URL` | Client URL for the hot blob (falls back to `/data/market-cache-hot.json`). |

### Opportunity feed (Tier 3)

Each refresh diffs the new DC prices against the previous blob and accumulates
"what just changed" into a public `opportunities.json` (rolling 2-hour window).
Price signals fire when the DC-cheapest **crosses** the item's recent average
(`avgNQ`) this refresh — measured against the stable ~7-day average (not a
since-last-blob delta, which was far too strict to ever fire):

- **crash** — cheapest just dropped ≥15% **below** its recent average (buy, on the tagged world)
- **spike** — cheapest just rose ≥15% **above** its recent average (sell)
- **empty** — DC-wide listings dropped to ≤2 (craft)

Surfaced at `/opportunities`. No new cron or lambda — it rides the existing hot/cold
runs. Optional env `VITE_OPPORTUNITIES_URL` points the client at the blob (falls back to
`/data/opportunities.json`).

## Auth (Discord login gate)

The web app is gated behind Discord OAuth: only members of an allow-listed Discord
guild can sign in. The gate is enforced at the API (`/api/projects` requires a valid
session) with a `/login` page + route guard for UX. Non-browser endpoints
(`/api/plugin/*`, `/api/discord`, `/api/refresh-cache`) stay ungated for their own clients.

### Env vars

| Var | Purpose |
| --- | --- |
| `DISCORD_CLIENT_ID` | OAuth2 client id from the Discord app. |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret. |
| `AUTH_SESSION_SECRET` | HMAC key signing the session + state JWTs. Use ≥32 random bytes, e.g. `openssl rand -base64 48`. |
| `OAUTH_REDIRECT_URI` | Exact callback URL, e.g. `https://qiqirn.tools/api/auth/callback`. Must byte-match a redirect URI registered in the Discord app. |
| `GUILD_ALLOWLIST` | Comma-separated Discord guild IDs allowed in (reused from the projects/bot config). |
| `DISCORD_BOT_TOKEN` | Existing — used server-side to resolve display names. |

In the Discord Developer Portal → your app → **OAuth2**, register both the production
callback (`https://qiqirn.tools/api/auth/callback`) and a localhost one for dev.

A missing `AUTH_SESSION_SECRET` or an empty `GUILD_ALLOWLIST` fails **closed** — the gate
stays locked rather than letting anyone in.

### Local dev

`npm run dev` runs Vite alone and does **not** serve the `/api/*` serverless functions,
so the OAuth round-trip won't work under it. To exercise login locally, run the functions
with the Vercel CLI:

```
npm i -g vercel      # once
vercel dev           # serves the SPA + /api/* together
```

Put the env vars above in `.env` (already gitignored) and register
`http://localhost:3000/api/auth/callback` (match whatever port `vercel dev` prints) as a
Discord redirect URI.

## Test

```
npm test
```

## Phase 2 — Recipe trees + profit

The watchlist now shows true profit per craft (sale price − material cost from Universalis), not just price × velocity.

- Items without a recipe (Materia XII, dyes, etc.) are tagged `sale-only`.
- Click any row to open a recipe detail modal showing ingredient prices and total cost.
- The modal has a "craft intermediates myself" toggle — when on, the cost calc recurses one level (uses the intermediate's own recipe instead of its market price).
- Recipes are cached forever in your browser's IndexedDB; bust the cache from Settings after a game patch.

### Performance notes

First load on a fresh browser hits XIVAPI once per tracked item (~80 calls). Subsequent loads are near-instant from cache. If XIVAPI is slow, the watchlist still renders with market data only and shows ⋯ in the profit column until recipes resolve.

## Phase 3 — Session recommender

The Home page is now a session planner. Tell it how many minutes you have, pick a strategy, optionally lock to a single crafter or a min-profit threshold — it picks 6–8 items from your watchlist that fit the time and maximize gil/min.

- **Time budget** is total wall-clock minutes. Overhead (default 5 min, configurable in Settings) is subtracted before packing.
- **Batch quantity** per item is capped at `velocity × batchCapDays` (default 3 days, configurable). Won't suggest crafting 30 of something that sells 1/day.
- **Diversity rule:** at most 3 items from the same gear set per session.
- **Per-item craft time** defaults to a heuristic (60s + 1s per recipe level over 50, capped at 180s). Override per item in the recipe modal.
- **Strategies:**
  - *Balanced* (default): pure gil/minute.
  - *Quick Win*: favors items that move fast (penalizes <3 sales/day).
  - *Patient*: favors fat-margin items.
- **Sale-only items** (Materia XII, dyes) are skipped — no recipe = no craft time = nothing to pack.

Items below your levels (`craftStatus !== 'ok'`) are excluded automatically.

## Phase 4 — Polish

- **Real ingredient names** in the recipe modal (XIVAPI item-name cache, IndexedDB).
- **30-day sparklines** for price + quantity sold per item, fetched lazily when the modal opens.
- **Backup & restore** in Settings: export your settings + watchlist as JSON; import to restore.
- **Mobile UX:** sticky session summary, larger strategy chips.

The recipe cache and item-name cache are both in IndexedDB (`ffxiv-helper` DB). "Clear recipe cache" in Settings only clears recipes — names stick around independently.

## Home Hub update

Most setup options now live on Home as collapsible panels (closed by default):
- Session defaults (overhead, default craft, batch cap)
- Retainer levels
- World &amp; Data Center
- Watchlist (starter packs + custom items)

Click a starter pack to expand it and uncheck individual items you don't want — exclusions are remembered. Three new packs added: Materia XI, crafted minions, classic glamour. The Settings page is now just the recipe cache and backup/restore.

## Routes

The app is structured around the craft-for-gil flow. Trading tools (price flips, arbitrage) are preserved but visually demoted.

- **Home** — Session planner (existing).
- **Watchlist** — Tracked items with market data. Default sort is gil/day; sale-only items (Materia, dyes) now contribute to the ranking via `unit price × velocity`.
- **Crafts** — `/crafts`. Saddlebag-style preset queries focused on crafting:
  - *Undersupply (craft + list)* — items selling on your home world with ≤2 listings.
  - *Craft-flip Phantom* — craftable items ranked by `(sale − material cost) × velocity` on your home world.
  - Builder defaults to **Craft-flip** mode, but the Mode select still exposes Standard / Craft-flip / Reposts.
- **Settings** — Recipe cache + backup/restore (existing).
- **Trading** — `/trading` (rendered dim in the nav). Three tabs:
  - *Arbitrage* — cross-world price gaps inside your DC.
  - *Best deals* — DC-min prices below Universalis average.
  - *Queries* — preset queries focused on flipping: Mega Value HQ, Fast Sellers HQ, Food & Potions, Furnishings discount, Reposts (camp).

Bookmarks survive: `/queries` redirects to `/crafts`, `/insights` redirects to `/trading`.

### Item DB & bulk fetch

Whole-game presets (under both Crafts and Trading) share a one-time XIVAPI item snapshot (~80k items, ~30s, cached forever in IndexedDB; refresh from Settings after a game patch). Universalis prices are fetched in chunks of 100 IDs with concurrency 4 — a whole-market scan takes ~10–40s.

## Legacy

The original single-file artifact lives in `legacy/phantom_crafting_tracker.html` for reference.
