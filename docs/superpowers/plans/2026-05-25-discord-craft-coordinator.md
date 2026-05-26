# Discord Craft Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/craft` feature to the Discord bot that turns "we want N of item X" into a full Teamcraft-style breakdown (what to craft and by which job, what to buy and with which gil/currency, what to gather), then lets the guild **claim and track who's doing what** directly in Discord and **announces** projects to the channel. Progress (amounts done) updates live on the announcement message.

**Architecture:** A new `bot/src/craft/` module. A pure **breakdown engine** recursively explodes a target item through `recipes.json` to leaf materials, then classifies each material's source by reusing the web app's existing shopping-list survey (`surveyIngredients`) plus the gathering catalog. A small **SQLite store** (the bot runs locally, so a single on-disk file persists across restarts) holds projects and assignable tasks. A **Discord layer** registers a `/craft` slash command with subcommands and handles button/select interactions that claim tasks and record progress, editing the announcement embed in place. No new external data sources — everything runs on snapshots the repo already bakes (`recipes.json`, `items.json`, `vendorShop.json`, `specialShop.json`, `gathering.json`) plus the existing Universalis market fetch.

**Tech Stack:** TypeScript (ESM), discord.js v14, better-sqlite3, Vitest. Reuses shared code from the web app's `../../src/` (the bot already imports from there, e.g. `runCraftFlip`).

---

## What already exists (reuse, do not rebuild)

The hard parts are already in the repo. The new work is mostly the *coordination* layer (projects, assignments, announcements).

| Capability | Where it lives | Notes |
|---|---|---|
| Recipe data, keyed by output item | `bot/src/loadSnapshots.ts` → `snapshots.recipes: Map<itemResultId, Recipe>` | `Recipe.ingredients = {itemId, amount}[]`, `Recipe.classJob` is a `CrafterCode` (`CRP`/`BSM`/…) or `'ANY'`. Recursion works directly off this map. |
| One-level ingredient aggregation | `src/features/shoppingList/aggregateIngredients.ts` | Good reference, but only expands intermediates one level. The new engine recurses fully (see Task 2). |
| **Source classification** (market board / gil vendor / **which currency**) | `src/features/shoppingList/shoppingListSurvey.ts` → `surveyIngredients(demand, prices, vendorMap, shopSnapshot)` | Returns per-item `{ mb, npc, currency, autoSource }`. `currency` already tells you the cheapest tomestone/scrip and cost per unit. **This is the "buy with which currency" logic.** |
| Currency definitions | `src/lib/currencies.ts` → `CURRENCIES`, `getCurrencyById`, `CurrencyId` | Poetics, scrips, MGP, etc. |
| Gil vendor prices | `snapshots.vendorMap: Map<itemId, gil>` (already loaded) | What NPCs charge. |
| Currency-shop data | `public/data/snapshots/specialShop.json` → `{ bakedAt, byCurrency: [CurrencyId, ShopEntry[]][] }`; type in `src/lib/specialShopSnapshot.ts` (`SpecialShopSnapshot`) | **Not yet loaded by the bot** — add in Task 1. |
| Gathering data ("what to gather") | `public/data/snapshots/gathering.json` → `{ bakedAt, entries: [itemId, {level,timed,hidden}][] }`; type in `src/lib/gatheringCatalog.ts` (`GatheringInfo`/`GatheringCatalog`) | **Not yet loaded by the bot** — add in Task 1. Presence of an itemId means it's gatherable. |
| Live market prices | `bot/src/fetchMarketForOutputs.ts` → `fetchMarketForOutputs(ids, cfg)` → `{ phantom, dc, region }` (`MarketData`); cached layer in `bot/src/chat/tools.ts` | `surveyIngredients` filters to EU worlds, so pass the `dc` (Chaos) `MarketData` for guild-local prices. |
| Item-name search | `bot/src/chat/nameIndex.ts` → `buildNameIndex(namesById)`, `searchItems(index, query, limit)` | Lets users type `item:"Grade 8 Tincture of Strength"`. |
| Slash-command registration | `bot/src/registerCommands.ts` | Add `/craft` here. |
| Interaction routing + customId convention | `bot/src/index.ts`, `bot/src/interactions.ts`, `bot/src/buttons.ts` | Existing IDs look like `cleanup:<cacheId>:<ownerId>:<action>`. Use a distinct `cproj:` prefix to avoid collisions. |
| Admin-permission pattern | `bot/src/index.ts` (the `/purge` handler checks `PermissionFlagsBits.ManageMessages`) | Reuse for "close project". |

---

## File Map

| File | Responsibility |
|------|---------------|
| `bot/src/loadSnapshots.ts` | **Edit:** also load `specialShop.json` + `gathering.json`; extend `BotSnapshots`. |
| `bot/src/craft/types.ts` | `CraftProject`, `CraftTask`, `TaskSource`, `Breakdown` types. |
| `bot/src/craft/explode.ts` | Pure recursive breakdown: target → craft steps (by job) + leaf demand map. |
| `bot/src/craft/explode.test.ts` | Unit tests for recursion, depth cap, cycle guard, quantity math. |
| `bot/src/craft/sourcing.ts` | Wrap `surveyIngredients` + gathering catalog → tagged acquire tasks. |
| `bot/src/craft/sourcing.test.ts` | Unit tests for source tagging (craft/mb/npc/currency/gather). |
| `bot/src/craft/store.ts` | SQLite (better-sqlite3) CRUD for projects + tasks. |
| `bot/src/craft/store.test.ts` | Store tests against an in-memory `:memory:` db. |
| `bot/src/craft/render.ts` | Build the announcement embed + claim/progress components from a project. |
| `bot/src/craft/commands.ts` | `/craft` subcommand handlers (`new`, `list`, `show`, `close`). |
| `bot/src/craft/interactions.ts` | Handle `cproj:` button + select-menu interactions. |
| `bot/src/registerCommands.ts` | **Edit:** register `/craft` with subcommands. |
| `bot/src/index.ts` | **Edit:** route `/craft` + `cproj:` interactions; build store + deps at startup. |
| `bot/package.json` | **Edit:** add `better-sqlite3` (+ `@types/better-sqlite3`). |
| `bot/.gitignore` | **Edit:** ignore the local db file (`data/craft.db`). |
| `bot/src/config.ts` | **Edit:** add `CRAFT_CHANNEL_ID`, `CRAFT_ROLE_ID`, `CRAFT_DB_PATH`. |

---

## Data model (SQLite, local file `bot/data/craft.db`)

The bot runs on Esther's machine as a single process, so SQLite is ideal: one file, synchronous API, survives restarts, no server. (If the bot is ever moved to Fly.io, this file needs a mounted volume — noted in "Future".)

```sql
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  message_id  TEXT,                 -- the announcement message we edit in place
  name        TEXT NOT NULL,
  target_item_id INTEGER NOT NULL,
  target_qty  INTEGER NOT NULL,
  created_by  TEXT NOT NULL,        -- Discord user id
  thread_id   TEXT,                 -- per-project coordination thread (extra)
  status      TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL,
  item_name   TEXT NOT NULL,
  qty_needed  INTEGER NOT NULL,
  qty_done    INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL,        -- 'craft' | 'market' | 'vendor' | 'currency' | 'gather'
  meta        TEXT,                 -- JSON: { job?, world?, price?, currency?, costPerUnit?, gatherLevel? }
  assignee_id TEXT,                 -- Discord user id, null = unclaimed
  status      TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'claimed' | 'done'
  updated_at  INTEGER NOT NULL
);

-- Bot-owned persistent messages per channel (pinned roll-up board + request prompt).
CREATE TABLE IF NOT EXISTS channel_state (
  guild_id           TEXT NOT NULL,
  channel_id         TEXT NOT NULL,
  board_message_id   TEXT,          -- pinned "Active crafting projects" roll-up
  request_message_id TEXT,          -- pinned "Request a craft" prompt
  PRIMARY KEY (guild_id, channel_id)
);
```

One **task = one line item** of the breakdown (one distinct item to obtain). `source` + `meta` carry the "how": which crafter job, which world/price, which currency and cost, or gathering level.

---

## The breakdown engine

### `explode.ts` — recursion (Task 2)

```text
explode(targetId, targetQty, recipes, opts) ->
  crafts: Map<itemId, { outputQty, craftCount, job }>   // intermediate + final crafts
  leaves: Map<itemId, qty>                              // raw materials to acquire

DFS with a depth cap (e.g. 20) and a visited-on-path set (cycle guard):
  recipe = recipes.get(id)
  if recipe exists AND (id === target OR opts.craftIntermediates):
      yield      = recipe.amountResult ?? 1             // units produced per synthesis*
      craftCount = Math.ceil(qty / yield)               // syntheses needed to make `qty`
      crafts[id] += { outputQty: qty, craftCount, job: recipe.classJob }
      for ing in recipe.ingredients:
          explode(ing.itemId, ing.amount * craftCount, ...)   // demand scales with crafts, not output
  else:
      leaves[id] += qty
```

\* **Yield matters.** `recipe.amountResult` is the units produced per synthesis (ingots, lumber, cloth, reagents commonly yield 3). Use `craftCount = ceil(qtyNeeded / yield)` and scale sub-ingredient demand by `craftCount` — not by output units — or the engine over-orders raw mats ~3× for those steps. **This plumbing is already in the repo:** `Recipe.amountResult?` plus the `AmountResult` fetch field and parser were added to `src/lib/recipes.ts` and `src/lib/recipeSnapshot.ts` (with unit tests). The *baked* `recipes.json` only carries real yields after a one-time re-bake — run `npm run snapshots` from the repo root. Until then every recipe reads as yield 1, which is safe (just not yet optimal for the 3-yield items). Always read it as `recipe.amountResult ?? 1`.

Default `craftIntermediates = true` (full Teamcraft tree). Expose it as a `/craft new` option so users can choose "buy intermediates off the market board instead".

### `sourcing.ts` — tag the leaves (Task 3)

1. Fetch market prices for all leaf ids via `fetchMarketForOutputs(leafIds, cfg)`; use the `dc` (Chaos) `MarketData`.
2. Call `surveyIngredients(leafDemand, dcPrices, snapshots.vendorMap, snapshots.specialShop)`.
3. For each leaf, pick a source in this priority and build a `CraftTask`:
   - `gather` if the item is in `snapshots.gatheringCatalog` (carry `level`); **and** it has no cheap vendor/currency option. (Gatherables are usually free, so prefer gathering unless a vendor is trivially cheap — make the rule explicit and testable.)
   - `currency` if `survey.currency` is set (carry `currency.shortLabel` + `costPerUnit`).
   - `vendor` if `survey.npc` is set and cheaper than market (`survey.autoSource === 'npc'`).
   - `market` otherwise (carry `survey.mb.world` + `survey.mb.price`).
4. Crafts from `explode` become `source: 'craft'` tasks tagged with `meta.job`.

Result: a `Breakdown` = `{ crafts: CraftTask[], acquire: CraftTask[] }`, each task ready to persist.

---

## Discord UX

### Slash command: `/craft`

| Subcommand | Options | Behaviour |
|---|---|---|
| `/craft new` | `item` (string, autocomplete via `searchItems`), `qty` (int), `name` (string, optional label), `intermediates` (bool, default true), `ping_role` (role, optional) | Resolve item → run breakdown → create project + tasks → post the announcement embed **to the craft channel** (`CRAFT_CHANNEL_ID`, falls back to the current channel) → start a coordination **thread** on it → ping `@Crafters` if configured → refresh the pinned board. |
| `/craft list` | — | List open projects in this guild with progress (`12/40 tasks done`). |
| `/craft show` | `id` (int) | Re-post / refresh a project's board (re-fetches prices, updates embed). |
| `/craft close` | `id` (int) | Mark closed. Allowed for project creator or `ManageMessages`. |
| `/craft setup` | — | (admin) Post + pin the "Request a craft" prompt and initialise the roll-up board in the craft channel. Requires `ManageMessages`. |

### The announcement message

A single rich embed the bot **edits in place** as tasks are claimed/completed. Layout:

```
🛠  Project: "Raid prep — 8× Grade 8 Tincture of Strength"   [open · 6/19 done]

CRAFT (by job)
  🔨 BSM · 24× Iron Ingot ............ @alice (0/24)
  ⚗️ ALC · 8× Tincture base .......... unclaimed
BUY — Market Board (Chaos)
  🪙 96× Copper Ore .................. @bob ✅ (96/96)  ~120g · Omega
BUY — Currency
  💠 8× Item .......................... unclaimed  · 20 Poetics ea
GATHER
  ⛏  60× Tin Ore (MIN L25) .......... @carol (30/60)
```

Components (max 5 action rows / message):
- **Row 1 — string select "Claim a task":** options = unclaimed/claimable tasks (max 25; paginate or split by section if more). Selecting assigns the task to the clicker and re-renders.
- **Row 2 — buttons:** `Log progress` (opens a modal to type an amount → adds to `qty_done`, auto-marks `done` at 100%), `Mark mine done`, `Unclaim`, `Refresh prices`.

customId scheme (distinct from `cleanup:`): `cproj:<projectId>:<action>[:<taskId>]`, e.g. `cproj:7:claim`, `cproj:7:progress:42`. Route in `index.ts` by checking `customId.startsWith('cproj:')` **before** the existing `decodeCustomId`/cleanup branch. The "Request a craft" button uses `cproj:request` (no project id) and opens a modal whose submit id is `cproj:requestmodal`.

### Permissions & ownership

Anyone in an allow-listed guild can claim/log progress (it's collaborative). Closing a project requires being the creator or having `ManageMessages` — mirror the `/purge` permission check already in `index.ts`.

---

### Dedicated crafting channel & extras

The feature centres on a dedicated channel (e.g. `#crafting`), mirroring how the AI chat is gated to `CHAT_CHANNEL_ID` today.

- **Config (`bot/src/config.ts`):** `craftChannelId = optional('CRAFT_CHANNEL_ID')` (where the board + announcements live) and `crafterRoleId = optional('CRAFT_ROLE_ID')` (the opt-in `@Crafters` ping). `/craft` stays runnable from any channel — Discord can't scope a slash command to one channel — but the **board always posts to the craft channel**, falling back to the invoking channel if `CRAFT_CHANNEL_ID` is unset.
- **Pinned roll-up board:** one bot-owned, pinned "Active crafting projects" message listing every open project with progress % and a jump link. Stored in `channel_state.board_message_id`; re-rendered and edited on every project create/claim/progress/close (create + pin it if missing). New render fn `buildBoardMessage(openProjects)`.
- **Thread per project:** after posting a project's announcement, `await message.startThread({ name: project.name, autoArchiveDuration: 1440 })`; store `projects.thread_id`. Claim/progress events drop a one-line note in the thread so chatter stays off the main board. Needs *Create Public Threads* + *Send Messages in Threads*.
- **`@Crafters` role ping:** if `crafterRoleId` is set (or `/craft new ping_role` is passed), the announcement `content` includes `<@&roleId>` with `allowedMentions: { roles: [roleId] }` so only that role is pinged.
- **"Request a craft" button:** `/craft setup` (admin) posts a pinned standing message with a button (`cproj:request`). Clicking opens a modal (item, qty, optional name); submit (`cproj:requestmodal`) runs the same `new` flow. New render fn `buildRequestPrompt()`.
- **Startup:** if `craftChannelId` is set, ensure the board (and request prompt, if `setup` ran earlier) exist by reading `channel_state`; recreate if the stored message was deleted.
- **Gotchas:** slash commands appear in every channel (we don't hard-gate, just route the board to `#crafting`); the channel pin limit is 50 and we use 2; always set `allowedMentions` so a role ping never escalates to `@everyone`.

## Integration points (exact edits)

1. **`bot/src/loadSnapshots.ts`** — read two more files and extend `BotSnapshots`:
   - `specialShop.json` → `{ bakedAt, byCurrency: [CurrencyId, ShopEntry[]][] }` → `specialShop: SpecialShopSnapshot` (`{ byCurrency: new Map(...) }`).
   - `gathering.json` → `{ bakedAt, entries: [number, GatheringInfo][] }` → `gatheringCatalog: Map<number, GatheringInfo>`.
   - Mirror the baked shapes used by `src/lib/staticSnapshots.ts` (`loadStaticSpecialShopSnapshot`, `loadStaticGatheringCatalog`).
2. **`bot/src/index.ts`** — at startup build `const store = openCraftStore(config.craftDbPath)` and a `craftDeps` object (`{ store, snapshots, nameIndex, cfg, fetchMarket }`). Add a `/craft` branch in the `InteractionCreate` handler and a `cproj:` branch for component interactions. Also route the `cproj:request` button + `cproj:requestmodal` modal submit, and on `ClientReady` ensure the pinned board/request messages exist when `CRAFT_CHANNEL_ID` is set.
3. **`bot/src/registerCommands.ts`** — add the `/craft` `SlashCommandBuilder` with the four subcommands above (and `setAutocomplete(true)` on the `item` option).
4. **`bot/package.json`** — add `better-sqlite3` and `@types/better-sqlite3`.
5. **`bot/.gitignore`** — add `data/` (the db lives at `bot/data/craft.db`; default via `config.craftDbPath = process.env.CRAFT_DB_PATH ?? 'data/craft.db'`).
6. **`bot/src/config.ts`** — add `craftChannelId` (`CRAFT_CHANNEL_ID`), `crafterRoleId` (`CRAFT_ROLE_ID`), and `craftDbPath` (`CRAFT_DB_PATH`); document the three new vars in `bot/.env`.

---

## Tasks

### Task 1: Load the extra snapshots
- [ ] Extend `BotSnapshots` with `specialShop` + `gatheringCatalog`; load both files; log counts at startup. Reuse types from `src/lib/specialShopSnapshot.ts` and `src/lib/gatheringCatalog.ts`.

### Task 2: Breakdown engine — `explode.ts` (+ tests)
- [ ] Pure recursion with depth cap + cycle guard; returns `{ crafts, leaves }`. Quantity math multiplies down the tree. Cover: simple recipe, nested intermediates, `craftIntermediates=false`, missing recipe → leaf, deep/looping safety.

### Task 3: Sourcing — `sourcing.ts` (+ tests)
- [ ] Fetch market for leaf ids; call `surveyIngredients`; produce tagged `CraftTask[]`. Test the source-priority rules (gather vs currency vs vendor vs market) with fixture data.

### Task 4: Store — `store.ts` (+ tests)
- [ ] `openCraftStore(path)`, `createProject`, `addTasks`, `getProject`, `listOpenProjects`, `claimTask`, `logProgress`, `unclaimTask`, `setProjectMessageId`, `closeProject`. Test against `:memory:`.

### Task 5: Render — `render.ts`
- [ ] `buildProjectMessage(project, tasks)` → `{ embeds, components }`. Group by section; show assignee + `done/needed`; respect the 25-option select cap and embed field limits.

### Task 6: Commands + interactions
- [ ] `commands.ts`: `/craft new|list|show|close|setup` + autocomplete. `interactions.ts`: handle `cproj:*` claim/progress/unclaim/refresh and the `cproj:request`/`cproj:requestmodal` flow, edit the message in place. Wire both into `index.ts` and `registerCommands.ts`.

### Task 6b: Dedicated channel, board, threads, role ping, request button
- [ ] Add `CRAFT_CHANNEL_ID` + `CRAFT_ROLE_ID` config, the `channel_state` table, and `projects.thread_id`. Post announcements to the craft channel; maintain the pinned roll-up board (`buildBoardMessage`); start a thread per project; ping `@Crafters` via `allowedMentions`; add `/craft setup` + the `cproj:request` button and `cproj:requestmodal` modal. On startup, recreate the board/prompt if deleted.

### Task 7: Final verification
- [ ] `npm run typecheck` and `npm test` green. Manual smoke in a test guild: run `/craft setup` in `#crafting`, `/craft new` a multi-tier item (e.g. a tincture or a piece of gear), confirm the breakdown sections + the pinned board look right and a thread is created, claim a task from two accounts, log partial progress (board updates), use the "Request a craft" button, close the project, then restart the bot and confirm projects + assignments + the board survive (persistence check).

---

## Edge cases & Discord limits

- **Select-menu cap (25 options):** large projects exceed it. v1: cap the claim menu at 25 and add a "show more" page button, or split menus per section.
- **Embed limits:** 25 fields, 1024 chars/field, 6000 total. Long lists: collapse into a few `description` blocks rather than one-field-per-task, or paginate.
- **Yield:** handled via `recipe.amountResult ?? 1` and `craftCount = ceil(needed / yield)` (see the breakdown engine). The `Recipe` type + parser already carry it; run `npm run snapshots` once to populate real values in `recipes.json` (defaults to 1 until then).
- **Crafted vs buyable intermediates:** an intermediate may be craftable *and* on the market board. Default to crafting; surface the market alternative in `meta` so a future "buy this instead" toggle is easy.
- **Missing recipes:** if `recipes.json` lacks an intermediate, it correctly falls through to a leaf acquire task.
- **Concurrency:** single local process → SQLite's default locking is fine. Wrap claim/progress in a transaction to avoid double-claims.
- **Stale prices:** `/craft show` re-fetches; reuse the disk-cached market layer from `chat/tools.ts` to avoid hammering Universalis.

## Out of scope (future)
- Baking gathering **node coordinates/maps** and timed-node windows.
- Per-character inventory awareness ("you already have 40 Copper Ore").
- Reminders / nudges for unclaimed tasks (could be a scheduled job).
- Multi-target projects (craft several different items in one project).
- Moving the bot to Fly.io → mount a volume for `craft.db`.

---

## Claude Code prompt

Paste the prompt in `prompt-craft-coordinator.md` (sibling file) into Claude Code from the `ffxiv-helper` repo root. It references this plan and the exact files above.
