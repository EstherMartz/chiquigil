# FFXIV Helper — Rebuild Design

**Date:** 2026-05-10
**Status:** Phase 1 spec (rebuild parity). Phases 2–4 outlined in appendix.

## Context

Existing artifact: `phantom_crafting_tracker.html` — single-file (~1050 lines) HTML/CSS/JS app that fetches Universalis market data for ~70 hand-curated FFXIV items on the Phantom world (Chaos DC), scores them by `price × velocity`, and suggests crafting sessions.

Pain points motivating the rebuild:
- Retainer levels and item list hardcoded in JS (no in-app editing).
- No persistence — refreshing wipes filter state.
- Score is a proxy; no true profit calc (sale price minus material cost).
- Single HTML file — awkward to host, share, or use on phone.

## Goal

Turn the artifact into a hostable React SPA centered on a **time-budgeted session recommender**: user enters "I have 60 minutes," app proposes which items to craft and in what quantities to maximize gil/hour, accounting for material cost, market velocity, and crafter levels.

Phase 1 ships rebuild parity + editable settings + searchable item-add. Recipe/profit and the session recommender follow in later phases.

## Scope (Phase 1)

In:
- React + Vite + TypeScript scaffold, Tailwind for styling, Zustand for state, TanStack Query for fetching, deployed to Vercel.
- Port existing watchlist table view + Universalis fetch (Phantom + Chaos).
- Settings page: editable retainer levels, world/DC config (default Phantom/Chaos).
- Item watchlist managed in-app via XIVAPI search-add. Starter packs (raid set, tinctures, food, dyes, glamour, housing) ship as toggleable bundles seeded from the current hardcoded `ITEMS`.
- `localStorage` persistence for settings + watchlist + filter state.
- Mobile-friendly responsive layout.

Out (deferred to later phases):
- Recipe tree, material cost, true profit calc → Phase 2.
- Time-budgeted session recommender → Phase 3.
- History charts, export/import, polish → Phase 4.

## Architecture

### Tech stack
- **React 18 + Vite + TypeScript** — component model, type safety, fast dev/build.
- **Tailwind CSS** — utility-first; existing color palette (`--bg-deep`, `--gold`, `--aether`, etc.) ported to `tailwind.config.ts` theme tokens. Cinzel/Fraunces/JetBrains Mono fonts kept.
- **Zustand** — client UI state (filters, sort, current view). Persisted slices wired through `zustand/middleware/persist` to `localStorage`.
- **TanStack Query** — Universalis fetches. 5-minute `staleTime`, manual refetch button. Caches per (world, DC, item-id-set) key.
- **React Router v6** — three top-level routes (`/`, `/watchlist`, `/settings`).
- **No backend.** Static SPA. Vercel deploy via GitHub repo.

### Module layout

```
src/
  main.tsx
  App.tsx
  routes/
    Home.tsx              // session recommender (Phase 3 placeholder in P1)
    Watchlist.tsx         // ported table view
    Settings.tsx
  features/
    universalis/
      api.ts              // fetch helpers, types
      useMarketData.ts    // TanStack Query hook
    items/
      starterPacks.ts     // seeded bundles from current ITEMS array
      xivapiSearch.ts     // search XIVAPI for craftable items
      useWatchlist.ts     // Zustand-backed hook
    settings/
      store.ts            // Zustand persisted store
      LevelsEditor.tsx
      WorldDcPicker.tsx
  components/
    table/                // sortable table primitives
    layout/               // header, nav, status indicator
  lib/
    universalis.ts        // pure typed client
    xivapi.ts             // pure typed client
    score.ts              // current price × velocity score (replaced in P2)
  styles/
    index.css
```

Each module has one purpose, narrow exports, testable in isolation.

### Data flow (Phase 1)

1. App boot → Zustand hydrates from `localStorage`.
2. Watchlist view computes the active item-id set from (starter packs enabled) ∪ (custom items).
3. `useMarketData(itemIds, world, dc)` issues two parallel Universalis calls (world + DC), normalizes into typed rows.
4. Table renders rows; filters/sort/search are local Zustand state, not URL.
5. Settings mutations write through Zustand → `localStorage` → next render.
6. Manual "Refresh" invalidates the TanStack Query cache for the current key.

### State persistence

`localStorage` keys (namespaced under `ffxiv-helper:`):
- `settings` — `{ world, dc, retainerLevels: Record<CrafterCode, number>, overheadMinutes }` (overhead unused in P1, reserved for P3).
- `watchlist` — `{ starterPacks: Record<PackId, boolean>, customItems: Array<{id, addedAt}> }`.
- `ui` — `{ catFilter, craftFilter, sortKey, sortDir, search }` (filter state).

Schema versioned (`{ _v: 1, ... }`); migrations stub provided for future shape changes.

### Universalis client

Typed wrapper over `https://universalis.app/api/v2/{world|dc}/{ids}?listings=10&entries=15`. Returns `Record<itemId, { listings, recentHistory, regularSaleVelocity, lastUploadTime }>`. Errors surfaced as TanStack Query error state, rendered as a banner with retry.

### XIVAPI client (search-add)

Endpoint: XIVAPI v2 `/search?indexes=Item&filters=ItemSearchCategory.Name~Craft...` or `/search?string=...&indexes=Item` filtered to craftable (`Recipes!=null`). Returns `{ id, name, icon, recipeLevel, crafter }`. Used only in Settings → "Add item" search box. No caching needed in P1 (search results are transient); IndexedDB cache lands in P2.

### Starter packs

Seeded from the current `ITEMS` array, grouped:
- `raid-current` — Courtly Lover's set (LTW + WVR)
- `tinctures-g4` — Gemdraughts + Gemsaps
- `food-7x` — current-tier CUL items
- `dyes` — General-purpose dyes
- `materia-xii` — Materia XII
- `glamour-faves` — Neo-Ishgardian, Diadochos, Quaintrelle, Crystarium
- `housing-faves` — round tables, beds, lamps, Sharlayan, etc.

Each pack toggle on/off in Settings. Default: all current 7.x packs on, Quaintrelle/housing off.

### Score (Phase 1)

Same as today: `price × velocity`, normalized 0–100. Documented as a placeholder replaced by true `gil_per_minute` in P3.

## UI sketch (Phase 1)

- **Top nav** — three links (Home / Watchlist / Settings) + status indicator + manual refresh.
- **Home** — placeholder card "Session recommender coming in Phase 3" + quick stats (total tracked items, last refresh, top 3 by current score).
- **Watchlist** — search bar, category chips, crafter chips, sortable table (parity with current artifact). Click row name → opens Universalis in new tab (item detail modal lands in P2).
- **Settings** — three sections:
  1. World / DC pickers.
  2. Retainer levels — 8 number inputs, one per crafter, with same color tier classes as today.
  3. Watchlist — starter pack toggles + custom items list (search-add box, remove buttons).

## Error handling

- Network failure → red banner with retry button. Stale cached data still renders.
- Invalid world/DC → fall back to default (Phantom/Chaos) + warning toast.
- Corrupt `localStorage` → reset to defaults, log to console.
- XIVAPI rate-limit (429) → exponential backoff, surface "search throttled, try again."

## Testing

- **Vitest** for unit tests:
  - `lib/universalis.ts` — request URL construction, response parsing.
  - `lib/score.ts` — score math against fixtures.
  - `features/settings/store.ts` — persistence migration stub.
  - `features/items/starterPacks.ts` — pack composition.
- **React Testing Library** for component tests on the watchlist table (sort + filter behavior).
- No e2e in P1.

## Deployment

- Working directory `c:/Users/esthe/Documents/Dev/ffxiv-helper` is not currently a git repo. Phase 1 step 0 = `git init`, commit existing artifact, then scaffold the React app alongside it (artifact moved to `legacy/phantom_crafting_tracker.html` for reference).
- GitHub repo (private to start).
- Vercel project linked to `main` branch. Automatic deploys on push, preview deploys on PRs.
- Single env var: `VITE_XIVAPI_BASE` (default `https://v2.xivapi.com`).

## Risks / open questions

- **XIVAPI v2 availability** — confirm endpoint + response shape during scaffolding; fall back to v1 if needed.
- **CORS** — both Universalis and XIVAPI permit browser CORS today; verify on first fetch.
- **Bundle size** — Tailwind + React + TanStack + Zustand should land under 200KB gzipped; budget asserted in CI.

## Appendix — Phase 2–4 outline

**Phase 2 — Recipe + profit (2–3 sessions)**
- XIVAPI recipe fetch, IndexedDB cache (via `idb`), patch-bust button.
- Recursive recipe-tree resolver. Per-item toggle: "buy intermediates" (default) vs "craft self".
- Material cost = sum of leaf market prices. Profit = sale price − material cost.
- Replace `score` with `gil_per_craft`. Detail modal showing tree.

**Phase 3 — Session recommender (1–2 sessions)**
- Home view becomes the primary screen.
- Inputs: time budget (minutes), strategy (Quick Win / Patient / Balanced), optional crafter lock, optional min-profit threshold.
- Per-item craft-time default heuristic (recipe level → 30–90s NQ, longer for complex). User-overridable in watchlist.
- Fixed session overhead (configurable, default 5 min) added once.
- Greedy knapsack: rank by `gil_per_minute`, pack into budget, cap batch size by `velocity × N days`. Diversity rule (don't pile a whole gear set).
- Output: ordered list of items, batch sizes, projected gil.

**Phase 4 — Polish (1+ session)**
- Mobile UX pass, larger touch targets, sticky session summary.
- History chart per item (last 30d price + velocity from Universalis history endpoint).
- Export/import settings as JSON.
- Performance: virtualized table if watchlist grows past ~200 items.
