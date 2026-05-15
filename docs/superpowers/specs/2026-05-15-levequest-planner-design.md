# Levequest planner — design

Date: 2026-05-15

## Problem

The app helps you find profitable items to buy, craft, gather, or flip. It does not help you with **levequests**, which are a major gilmaking and leveling tool in FFXIV. Picking the right leve to spend an allowance on is non-obvious: each leve has a job, level, city, gross gil reward, EXP reward, and (for crafter leves) a material cost paid out of pocket. With ~600–800 leves across all expansions and 16 jobs, no in-game UI ranks them by gil/leve or EXP/leve.

## Goal

A standalone `/leves` route that, for a chosen job + level cap, ranks every available leve by gil or EXP per allowance. For DoH crafter leves it subtracts Universalis material cost; for DoL gatherer leves it shows base gil only; for DoW/DoM combat leves it shows the flat reward.

## Scope

- All leve types: DoH (Carpenter…Culinarian), DoL (MIN/BTN/FSH), DoW/DoM (Grand Company combat leves).
- Filter by job (single class or category) and level cap.
- Sort by **net gil per allowance** (gross gil − mat cost, DoH only) or **base EXP per allowance**. User toggles between the two modes.
- DoH gil assumes 100% HQ submission (the gil-optimal case; visible in a header note).
- DoH mat cost uses Universalis prices for every recipe component, pulled via the existing query infrastructure.

## Non-goals (deferred)

- **DoL collectability tiers** (+50%/+100%/+150% gil for Silver/Gold/Platinum) — base gil only, noted in the UI.
- **Over-level EXP penalty** — leve EXP shown is the raw base. Mentioned in UI note.
- **"Repeat" turn-in bonus** — some leves let you turn in the same item three times for ~3× gil; v1 treats each as a single turn-in. Gil/allowance math stays correct since a triple-repeat is still 1 allowance.
- **City / levemete picker** — explicitly out per the user's filter-shape decision.
- **Aetheryte teleport-cost subtraction**, **allowance tracking** (`I have 47 allowances`), **per-character HQ rate modeling** — all out.
- **Static curated dataset fallback** — snapshot from XIVAPI v2 is the only data source. If XIVAPI is down the page shows the same error state as other snapshot-driven views.

## Architecture

### New files

- `src/lib/leveSnapshot.ts` — fetch & parse the XIVAPI v2 `Leve` sheet (plus `CraftLeve` for DoH ingredient/qty data, `LeveAssignmentType` for type labels). Mirrors the existing `itemSnapshot.ts` pattern. Returns `SnapshotLeve[]`.
- `src/lib/recipeCache.ts` — extended (not a new file) to add `getCachedLeves` / `putCachedLeves` / `clearLeveCache` / `getLeveSnapshotUpdatedAt`, mirroring the existing item-snapshot helpers. Uses a distinct IndexedDB object store key from items.
- `src/features/leves/levePlanStore.ts` — persisted zustand slice (`persist` middleware, key `'ffxiv-helper:leve-plan'`):
  - `mode: 'gil' | 'exp'` (default `'gil'`)
  - `jobFilter: LeveJobFilter` (default `'all'`)
  - `maxLevel: number` (default `100`)
  - setters: `setMode`, `setJobFilter`, `setMaxLevel`
- `src/features/leves/computeLevePlan.ts` — **pure** function `computeLevePlan(snapshot, prices, recipes, filters) → LevePlanResult`. Sort + filter + math live here so they're unit-testable without a render.
- `src/features/leves/useLevePlanQuery.ts` — react-query mutation hook that orchestrates: load snapshot → collect DoH ingredient ids → Universalis batch fetch → run `computeLevePlan`. Returns `{ run, rows, ready, isPending, isError, error }`. Mirrors `useGatheringQuery.ts`.
- `src/features/leves/LevePlanner.tsx` — view component. Filter controls + the results table. Item-name links use the existing `<ItemNameLinks>` component.
- `src/routes/LevePlan.tsx` — route page wrapping `<LevePlanner>`. Adds a "Refresh leve snapshot" button alongside the existing snapshot-refresh pattern, plus the "Run" button.
- `src/App.tsx` — register `<Route path="/leves" element={<LevePlan />} />`.

### Data shapes

```ts
// src/lib/leveSnapshot.ts
export interface SnapshotLeve {
  id: number;
  name: string;                          // "And Bring Plenty of Ale"
  level: number;                          // 1–100
  type: 'doh' | 'dol' | 'dow' | 'dom';
  classJob: number;                       // FFXIV ClassJob id (8=CRP, 9=BSM, …)
  city: string;                           // "Limsa Lominsa" etc.
  baseGil: number;                        // gross gil, NQ submission, single turn-in
  baseExp: number;                        // base EXP, single turn-in
  hqGilMultiplier: number;                // 2.0 for DoH, 1.0 for DoL/DoW
  targetItemId: number | null;            // DoH/DoL only
  targetItemQty: number | null;           // DoH/DoL only
}
```

Exact XIVAPI v2 field-name mapping (e.g., `AllowanceCost`, `ExpReward`, the array of CraftLeve→Item references) needs a live probe during implementation. Document the mapping in `leveSnapshot.ts` comments next to each parsed field.

```ts
// src/features/leves/levePlanStore.ts
export type LeveJobFilter =
  | 'all'
  | 'doh' | 'dol' | 'dow'
  | 'CRP' | 'BSM' | 'ARM' | 'GSM' | 'LTW' | 'WVR' | 'ALC' | 'CUL'
  | 'MIN' | 'BTN' | 'FSH'
  | 'GC';  // Grand Company combat leves, collapsed to one bucket
```

```ts
// src/features/leves/computeLevePlan.ts
export interface LeveRow {
  id: number;
  name: string;
  classJobCode: string;     // 'CRP', 'BSM', …
  level: number;
  city: string;
  grossGil: number;          // baseGil × multiplier × qty
  matCost: number | null;    // DoH only
  netGil: number;            // grossGil − matCost (or grossGil if no mat cost)
  exp: number;
  hasMatCostData: boolean;   // false when any ingredient is missing a price or recipe; sinks the row in gil-mode sort
  targetItemId: number | null;
  targetItemQty: number | null;
}

export interface LevePlanResult {
  rows: LeveRow[];           // sorted by current mode
}
```

### Data flow

1. **Page load**: `useLeveSnapshot()` reads IndexedDB. If empty, fetches the `Leve` + `CraftLeve` + `LeveAssignmentType` sheets via XIVAPI v2 in paginated loops, parses, persists. Cached forever (refresh button explicit, matching item snapshot UX).
2. **Filter change**: store updates; component re-renders. No fetch.
3. **Run click**:
   1. `computeLevePlan` filters by `jobFilter` + `maxLevel`.
   2. For DoH rows, collect every `targetItemId`, walk each via `useRecipes`/`recipeSnapshot` to collect every ingredient id (single-level recipes only; nested ingredient recipes are NOT recursively priced — same simplification as existing craft-flip presets).
   3. Batch-call Universalis for the union of ingredient ids using `scope: 'home'` (matches the gathering planner's default — pricing is for items the user would actually buy on their home world).
   4. Compute per-row math, sort, return.
4. **Render**: `<LevePlanner>` shows the table; mode toggle re-sorts in place without re-fetching.

### Math

- **DoH**: `grossGil = baseGil × hqGilMultiplier × targetItemQty`. `matCost = sum(univPrice(ingredientId) × ingredientQty) × targetItemQty`. `netGil = grossGil − matCost`.
- **DoL**: `grossGil = baseGil × targetItemQty`. `matCost = null`. `netGil = grossGil`.
- **DoW/DoM**: `grossGil = baseGil`. `matCost = null`. `netGil = grossGil`.

### Sort

- **Gil mode**: descending `netGil`. Rows with `hasMatCostData === false` sink to the bottom of their type group.
- **EXP mode**: descending `exp`. (Ignores gil/cost entirely.)

### Edge cases (explicit)

- **Universalis returns no price for an ingredient**: `matCost = null` for that row, `hasMatCostData = false`, render `?` in the Mat Cost column and `—` in Net Gil. Row sinks in gil-mode sort.
- **Recipe not in `recipeSnapshot`** (DoH target item with no known recipe — rare, possibly NPC-supplied items): same treatment.
- **Leve has no target item** (some repair / slay leves): `targetItemId = null`, `matCost = null`, `netGil = grossGil`.
- **`maxLevel` filters away every leve**: render an empty-state message, not a blank table.

## UI

### Controls (single row above the table)

- **Mode** radio: `Gil` / `Exp`. Mirrors the gathering planner's Time/Gil radio.
- **Job filter** select: a grouped dropdown — `All`, then `DoH` (with per-class options + "All DoH"), `DoL` (per-class + "All DoL"), `DoW/DoM` (single "Grand Company" option).
- **Max level**: numeric input, 1–100, default 100.
- **Run** button: triggers the Universalis batch fetch + compute. Disabled while pending. Same loading-state shape as the gathering planner.

### Table columns

| Name | Job | Lvl | City | Gross Gil | Mat Cost | Net Gil | EXP |

- **Name**: for DoH/DoL — render the target item name + qty (e.g., "Cobalt Ingot ×3") via `<ItemNameLinks>`. For DoW/DoM — render the leve name as plain text. The hover popover gives recipe context for DoH targets automatically.
- **Job**: 3-letter chip (e.g., "BSM", "MIN", "GC").
- **Lvl**: integer.
- **City**: full name.
- **Gross Gil**: integer with locale-thousands.
- **Mat Cost**: integer with locale-thousands, or `?` if degraded, or `—` for non-DoH.
- **Net Gil**: same.
- **EXP**: integer.

A header note above the table, font-mono, small, low-contrast:
> "DoH gil assumes 100% HQ submission. DoL collectability bonuses (+50% to +150%) not modeled. EXP shown is the raw base — penalties for over-leveling are not applied."

## Testing

Mirrors the gathering planner's test layout.

- **`src/lib/leveSnapshot.test.ts`** — `parseLeveSheetPage` over fixture XIVAPI rows. Asserts type classification (DoH vs DoL vs combat), job-code mapping, city derivation, gil/exp extraction, HQ multiplier rule.
- **`src/features/leves/computeLevePlan.test.ts`** — pure-function unit tests:
  - DoH: gross gil with HQ multiplier + qty; mat cost summed; net gil = gross − cost; sort descending by net gil.
  - DoL: gross gil = baseGil × qty; mat cost null; sort by gross gil.
  - DoW: gross gil = baseGil; sort.
  - Filter: `jobFilter='CRP'` keeps only CRP rows; `maxLevel=50` drops level >50.
  - Mode toggle: gil-mode vs exp-mode use different sort keys.
  - Degradation: row with one missing ingredient price sets `hasMatCostData=false`, sinks in gil sort.
- **`src/features/leves/levePlanStore.test.ts`** — setters update state; persistence key matches; defaults are correct (matches the pattern in `gatheringPlanStore.test.ts`).
- **`src/features/leves/LevePlanner.test.tsx`** — renders fixture rows; mode toggle re-sorts visible rows; job filter narrows; item-name link present for DoH targets; empty-state message when filter eliminates all rows.
- **`src/routes/LevePlan.test.tsx`** — route renders, Run button fires the query, loading state visible, error state on Universalis failure.

## Risks

- **XIVAPI v2 Leve sheet schema** — exact field names for gil/exp/HQ-multiplier and the `CraftLeve` → ingredient list are not pinned in this spec. Implementer probes one row during Task 1 and writes the parser against the actual response. If a critical field is missing or renamed, the implementer flags it before continuing.
- **Universalis price-coverage gap** — many lower-tier DoH ingredients may have no listings on the user's world. The `hasMatCostData = false` degradation path keeps the page useful (those rows still appear, just sunk).
- **`recipeSnapshot` may not include every leve target item** — leve targets are mostly normal craftable items, but some are leve-specific item ids that don't appear in any recipe. The degradation path covers it.
- **Snapshot fetch is the largest data pull in the app** — likely a few hundred KB across paginated pages. The progress-indicator pattern from `useItemSnapshot` covers it; first visit takes a few seconds, subsequent visits are instant.

## Out of scope (future, if useful)

- DoL collectability bonus modeling (with or without character-perception inputs).
- Over-level EXP penalty curves.
- City / levemete picker for teleport-cost subtraction.
- Per-class HQ submission rate modeling.
- Allowance counter integration.
- "Repeat" triple-turn-in bonus modeling.
- Recipe sub-component recursion (currently single-level mat cost only).
