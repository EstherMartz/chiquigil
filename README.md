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

## Legacy

The original single-file artifact lives in `legacy/phantom_crafting_tracker.html` for reference.
