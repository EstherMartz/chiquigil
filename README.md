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

## Legacy

The original single-file artifact lives in `legacy/phantom_crafting_tracker.html` for reference.
