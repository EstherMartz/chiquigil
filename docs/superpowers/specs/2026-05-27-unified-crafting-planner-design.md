# Unified Crafting Planner

## Overview

Extend the existing Discord-based crafting planner so it (a) supports **CompanyCraft** items (FC workshop furniture, submarine/airship parts) alongside regular crafter recipes under a single `/craft` flow, and (b) is **mirrored read-only into the web app** at `/projects` and `/projects/:id`. Both surfaces (Discord + web) read from the same Turso project store.

The Discord bot stays the single source of mutations (create / claim / log progress / close). The web view is a calmer, read-only mirror — useful for browsing on a second screen, linking from Discord, and seeing the full project at a glance without scrolling chat.

## Goals

- One unified `/craft new <item>` flow handles both regular recipes and CompanyCraft items. The user never has to know in advance which type they want.
- Aggregate all CompanyCraft phases into one ingredient bucket per top-level sequence — submarine/workshop projects are tracked the same way as any other craft.
- A web view of all open projects in the user's guild, plus a per-project detail page that mirrors the Discord embed.
- No new servers, no new auth flows. Re-use the existing Vercel Functions + Turso + Vercel Blob stack.

## Non-goals (V1)

- **No writes from the web.** All mutations stay in Discord. The web view is strictly read-only.
- **No per-phase tracking** for CompanyCraft. We treat phase-1..N as one flat ingredient list. Users coordinate phase ordering via thread chat, not the data model.
- **No Discord OAuth / login.** Guild filtering is handled by a server-side `GUILD_ALLOWLIST` env var; anyone with the URL can see the project list for the allowed guild.
- **No cross-guild views.** Each deploy serves one guild (matches current bot deployment shape).
- **No real-time push.** Web view polls every 30s via TanStack Query; that's good enough for a coordination tool.
- **Airship parts UI parity.** Submarines and airships both fall out of `CompanyCraftSequence` so they come along for free, but we don't add airship-specific UX.

## Architecture

### Data flow

```
                  ┌──────────────────┐
                  │  XIVAPI v2       │
                  │  CompanyCraft*   │
                  └────────┬─────────┘
                           │  (snapshot build, offline)
                           ▼
              ┌─────────────────────────────┐
              │ public/data/snapshots/      │
              │   companyCraft.json         │
              │   recipes.json (existing)   │
              │   items.json    (existing)  │
              └────────┬────────────────────┘
                       │  (loaded into IDB at app boot)
                       ▼
   ┌───────────────────────────────────────────────────┐
   │ buildBreakdown(targetId, qty, market, deps)       │
   │   recipes.get(id)?         → standard craft tree  │
   │   else companyCraft.get(id)? → 1 workshop task +  │
   │                                flat acquire leaves│
   └────────┬──────────────────────────────────────────┘
            │
            ├─► Discord /craft new (writes to Turso)
            │
            ▼
   ┌──────────────────────────────────┐
   │ Turso `projects` + `tasks`       │
   └────────┬─────────────────┬───────┘
            │                 │
            │                 │ GET /api/projects[?guild=…]
            │                 │ GET /api/projects/:id
            │                 ▼
            │       ┌──────────────────────┐
            │       │ Web /projects        │
            │       │     /projects/:id    │ (TanStack Query, 30s poll)
            │       └──────────────────────┘
            ▼
   Discord embeds (unchanged)
```

### What's new

- A snapshot file `public/data/snapshots/companyCraft.json` baked from XIVAPI's `CompanyCraftSequence` → `CompanyCraftPart` → `CompanyCraftProcess` → `CompanyCraftSupplyItem` chain, flattened to `Map<resultItemId, { itemId, name, ingredients: { itemId, qty }[] }>`.
- A new `TaskSource` value `'workshop'` for the synthetic "submit to FC workshop" task.
- An extension to `buildBreakdown` (in `src/bot/craftSourcing.ts`) so it falls back to the companyCraft snapshot when the standard recipe lookup misses.
- A nameIndex augmentation so `/craft new <name>` autocomplete finds CompanyCraft result items (`The Whale Bridge`, `Tatanora Hull`, …).
- A new Vercel Function `api/projects.mjs` (esbuild output) exposing two endpoints.
- New web routes `/projects` and `/projects/:id` under `src/features/projects/`.

## CompanyCraft handling

### What XIVAPI gives us

`CompanyCraftSequence` rows describe one top-level craft (e.g. "Tatanora Hull"). Each row points at up to 8 `CompanyCraftPart` entries, each part has multiple `CompanyCraftProcess` phases, and each process has `CompanyCraftSupplyItem` rows with `Item` + `SetQuantity` (per craft) and `SetsRequired`. Total material per ingredient = `SetQuantity × SetsRequired`, summed across all phases.

### Aggregation rule

Per the user's choice — "aggregate all phases into one ingredient bucket":

For each `CompanyCraftSequence`:
1. Walk every Part → Process → SupplyItem.
2. For each SupplyItem, add `SetQuantity × SetsRequired` to a `Map<itemId, qty>`.
3. The output is one synthetic recipe per Sequence: `{ resultItemId, resultName, ingredients: [{ itemId, qty }] }`.

The result item ID for a sequence is `CompanyCraftSequence.ResultItem` (the finished hull/wing/etc.).

### Why not per-phase

User ask was explicit. Phase tracking would multiply project complexity (one project becomes N tasks just for the "submit phase X" sub-step), and the bot already supports threading + chat for coordinating "we're on phase 2 now". Keep the data model flat.

### Synthetic task

When `buildBreakdown` resolves a target via companyCraft (not recipes), the resulting `Breakdown` looks like:

```ts
{
  crafts: [
    // ONE synthetic task representing "submit all materials at the workshop"
    {
      itemId: <resultItemId>,
      itemName: "Tatanora Hull",
      qtyNeeded: targetQty,
      source: 'workshop',
      meta: {},
    },
  ],
  acquire: [
    // The flattened ingredient list, sourced normally via surveyIngredients
    // (gather > currency > vendor > market) just like a regular craft.
  ],
}
```

The acquire-side path is unchanged — we just feed CompanyCraft leaves into the existing `surveyIngredients` survey. No new sourcing logic.

### Tie-breaker: recipes win

If an item happens to appear both as a standard recipe result AND as a CompanyCraftSequence result (unlikely but possible if SE ever changes a sheet), `recipes` wins. The check order in `buildBreakdown` is:

```ts
const standard = deps.recipes.get(targetId);
if (standard) return explodeAndSurvey(...);  // existing path

const workshop = deps.companyCraft.get(targetId);
if (workshop) return buildWorkshopBreakdown(...);

throw new Error(`Item ${targetId} has no recipe or workshop sequence`);
```

This preserves existing behaviour for every current `/craft new` invocation.

## Discord bot changes

### `/craft new <item>` — single command, both types

The slash command stays exactly the same shape (already registered in `scripts/register-commands.ts`). The only changes are internal:

- **Autocomplete** (`src/api/discord.ts` autocomplete handler) — `searchItems(nameIndex, q)` already runs against a unified name map. We extend `nameIndex` at boot to also include CompanyCraft result item names so they show up.
- **Resolution** (`src/bot/craftSourcing.ts`) — see "Synthetic task" above.
- **Embed rendering** ([src/bot/craftRender.ts](src/bot/craftRender.ts), strings in [src/bot/craftStrings.ts](src/bot/craftStrings.ts)) — the `workshop` source needs a friendly label/emoji entry alongside the existing `JOB_EMOJI` / source-icon map. Otherwise the embed format is unchanged because the task list shape is unchanged.

### Storage

No schema migration needed. `tasks.source` is already a free-form `TEXT` column; we just start writing `'workshop'` into it. `meta` stays optional and empty for workshop tasks.

### Bot logic touch-list

- [src/bot/craftTypes.ts](src/bot/craftTypes.ts) — add `'workshop'` to the `TaskSource` union.
- [src/bot/craftSourcing.ts](src/bot/craftSourcing.ts) — branch on standard-recipe vs companyCraft lookup; add `buildWorkshopBreakdown` helper.
- [src/bot/nameIndex.ts](src/bot/nameIndex.ts) — extend builder to also fold in `companyCraft` names.
- [src/bot/craftRender.ts](src/bot/craftRender.ts) + [src/bot/craftStrings.ts](src/bot/craftStrings.ts) — map `'workshop'` → label/emoji.
- [src/api/discord.ts](src/api/discord.ts) — pass the companyCraft snapshot through to `buildBreakdown`'s `deps`.

## Web app changes

### Routes

```
/projects          → ProjectsList   (all open projects in this guild)
/projects/:id      → ProjectDetail  (one project, all tasks)
```

Both routes are added to the existing router setup. Already-existing top-nav "Tools" menu gets a "Crafting Projects" entry.

### Components

```
src/features/projects/
  ProjectsList.tsx        // table of open projects
  ProjectDetail.tsx       // header + grouped task list
  useProjects.ts          // TanStack Query hook → GET /api/projects
  useProject.ts           // TanStack Query hook → GET /api/projects/:id
  types.ts                // re-export shared task/project types from bot/craftTypes
```

#### `ProjectsList`

- Uses `useProjects()` (30s `refetchInterval`).
- Columns: name, target item (icon + name + qty), source-mix summary (e.g. `5 craft · 12 market · 3 workshop`), creator (Discord user ID → text-only), `Last updated`, link to detail.
- Filterable by status (`open` default; toggle for `closed`).
- Empty state: "No open projects. Start one with `/craft new` in Discord."

#### `ProjectDetail`

- Uses `useProject(id)`.
- Header card: project name, target (icon + name + qty), creator, created-at, link out to the Discord thread (if `thread_id` present).
- Task list grouped by `source`: `craft`, `workshop`, `gather`, `currency`, `vendor`, `market`. Each group is a collapsible section with task count + sum-of-qty-needed.
- Per task: item icon + name (ItemNameLink → `/item/:id`), `qtyDone / qtyNeeded` progress, assignee (Discord user ID text), status pill.
- **No interaction beyond browsing** — no claim/unclaim/log buttons. A small "Edit in Discord" callout points back to the bot.
- Reuses the existing `FilterBar` + `ResultTableScaffold` + `SortableHeader` idiom per the `match-ui-patterns` memory.

### Networking

- TanStack Query, `staleTime: 0`, `refetchInterval: 30_000`, `refetchOnWindowFocus: true`.
- No mutations.
- Errors surface a banner: "Couldn't load projects — Discord bot may be down."

## API

### `GET /api/projects?guild=<id>`

Returns `Project[]` for the given guild. `guild` is required. The server validates against `process.env.GUILD_ALLOWLIST` (comma-separated guild IDs) — requests for guilds not in the allow-list 403.

Response shape (matches `CraftProject` minus internals):

```ts
{
  projects: Array<{
    id: number;
    name: string;
    targetItemId: number;
    targetItemName: string;   // joined from names snapshot, server-side
    targetQty: number;
    createdBy: string;        // raw Discord user ID
    threadId: string | null;
    status: 'open' | 'closed';
    createdAt: number;
    taskCounts: { byStatus: { open: number; claimed: number; done: number }; bySource: Record<TaskSource, number> };
  }>;
}
```

Filter: `?status=open` (default) or `?status=all` or `?status=closed`.

### `GET /api/projects/:id`

Returns one project + all tasks.

```ts
{
  project: { /* same as list-item, minus taskCounts */ };
  tasks: StoredTask[];  // exact shape from src/bot/craftTypes.ts
}
```

If the project's `guild_id` is not in the allow-list, 404 (not 403 — don't reveal whether the ID exists).

### Implementation

- Source file: `src/api/projects.ts`.
- Build target: `api/projects.mjs` via the existing `npm run build:api` esbuild script (the script needs a second entry point added).
- Re-uses the same `getCraftStore()` Turso client pattern as `src/api/discord.ts` — same `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` env vars.
- Reads `targetItemName` from the existing names snapshot (loaded once at cold-start).
- No write paths.

### CORS

`Access-Control-Allow-Origin` set to the deploy's own origin only (read `process.env.VERCEL_URL`). Web view fetches relatively (`/api/projects`), so CORS only matters if someone hits the endpoint from elsewhere.

## Snapshot pipeline

### Where it slots in

A new step in the existing [scripts/bake-snapshots.ts](scripts/bake-snapshots.ts), alongside the existing `bakeItems` / `bakeRecipes` / `bakeLeves` / etc. functions:

```
fetchCompanyCraftSheets()
  → fetch CompanyCraftSequence rows + linked Part / Process / SupplyItem
  → aggregate per Sequence
  → write public/data/snapshots/companyCraft.json
```

XIVAPI v2 array-field gotchas (per the `xivapi-v2-quirks` memory): use the right filter syntax, batch under the 20k row budget, audit response shapes after each schema change.

### IDB cache version bump

Bump the existing IDB cache version by one so old clients clear and reload the new `companyCraft.json` alongside the existing snapshots. (Look up current version in the IDB open-call when implementing; the plan task will pin the exact number.)

### Cost

The CompanyCraftSequence sheet is small (couple-hundred rows × ~8 parts × ~10 phases × handful of supply items). Output JSON should be well under 100 KB after aggregation.

## Testing

### Unit

- `craftSourcing.test.ts` — extend with: "falls back to companyCraft when recipes miss", "produces single workshop task", "aggregates phases into one ingredient bucket", "tie-breaks toward recipes when both exist".
- `nameIndex.test.ts` — extend with: "includes CompanyCraft result names".
- `api/projects.test.ts` (new) — list endpoint with mock Turso store: returns projects, filters by status, validates guild allow-list, builds task-count summary correctly. Detail endpoint: returns project + tasks, 404s on disallowed guild.

### Integration

- One end-to-end snapshot-bake test against a tiny fixture matching the XIVAPI v2 shape (don't hit the live API in CI).
- Manual: `/craft new Tatanora Hull` in a dev guild, confirm embed renders + `/projects` web view shows the same project + tasks.

### What we're **not** testing

- The visual styling of the web pages — covered by existing FilterBar/ResultTable conventions.
- Discord embed rendering — already exercised in production for non-workshop tasks; the workshop branch only changes the label-mapping line, which the existing snapshot test on the embed builder will cover.

## Risks & open questions

1. **Names without snapshot.** If a user types a CompanyCraft item name but the new snapshot hasn't loaded yet (cold cache), autocomplete will miss it and `/craft new` will reject as "unknown item". Acceptable: same failure mode as a missing recipes snapshot today.
2. **Phase-aware folks will ask.** Some FCs prefer to track phases. Punt to a V2 if anyone asks; the data is preserved in the snapshot so we can light it up later without a re-bake.
3. **Submarine ingredient sourcing.** Some submarine-part materials are themselves CompanyCraft outputs (e.g. an intermediate panel). The synthetic recipe stops at leaf items, so any sub-craft becomes a `gather`/`market` task instead of recursing into a sub-workshop. **Verify during snapshot build** whether any SupplyItem points at another CompanyCraftSequence; if so, we either recurse or document the gap. Worst case: the user crafts the intermediate via its own `/craft new` flow.
4. **Allow-list footgun.** If `GUILD_ALLOWLIST` is unset, the API rejects all requests. Document this in the README's deploy section.
5. **`api/projects.mjs` bundling.** The existing `build:api` script likely targets one entry. We need to add a second entry point (and the build memo entry in [project_vercel_bot_status.md](../../memory/project_vercel_bot_status.md) needs an update once shipped).
6. **30s poll cost.** A single user with the page open ≈ 2880 hits/day to Turso. Fine for libsql free tier; revisit if usage grows.

## Out-of-scope follow-ups (V2+)

- Phase-aware tracking for CompanyCraft (one task per phase, "advance to phase N" button in Discord).
- Discord OAuth + write actions from the web (claim/unclaim/log-progress without leaving the page).
- Multi-guild deploys (would need real auth + per-guild scoping in the URL or session).
- Real-time push via SSE or websockets to drop the 30s poll.
- Bake `/projects` activity into the existing planner / shopping-list flows so a user can say "shop for project #12".
