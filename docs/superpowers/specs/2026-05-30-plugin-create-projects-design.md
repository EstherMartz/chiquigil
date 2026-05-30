# Create crafting projects from the plugin + fix Refresh 401

**Date:** 2026-05-30
**Status:** Approved — ready for implementation plan
**Repos:** `ffxiv-helper` (backend) + `qiqirn-companion` (Dalamud/C# plugin)

## Problem

Two related asks from the plugin's Projects tab:

1. **Regression — Refresh returns `401 (Unauthorized)`.** The Discord auth gate (PR #2, shipped 2026-05-30) wrapped `GET /api/projects` in `requireSession`, which demands the `qiqirn_session` Discord cookie. The plugin has no such cookie — it authenticates by guild allow-list — so its project list/detail calls now fail.
2. **New feature — create crafting projects from inside the plugin.** Today projects can only be created via the Discord bot's `/craft new`.

## Root cause of the 401

The plugin's `ApiClient` calls the **web** endpoints directly:

- `GetProjectsAsync` → `GET api/projects?guild={guildId}` (`Services/ApiClient.cs:292`)
- `GetProjectDetailAsync` → `GET api/projects/{id}` (`Services/ApiClient.cs:302`)

Both are now session-gated (`src/api/projects.ts:92`). The plugin's other calls survive because they live under `/api/plugin/*`, which authenticate by **guild allow-list** (`GUILD_ALLOWLIST`), not a Discord session — e.g. `plugin-claim.ts`. The fix is to give the plugin guild-authed project read endpoints under the same `/api/plugin/*` convention.

> Note on security posture: before the auth gate, `/api/projects?guild=X` was effectively unauthenticated (any caller with a valid guild id could read project data). The new plugin endpoints intentionally restore exactly that access level (guild-allowlist), matching every other `/api/plugin/*` endpoint. The web endpoint stays locked behind the session.

## Design decisions (settled)

- **Full Discord sync.** Plugin-created projects post the same embed + thread/forum post + claim buttons as `/craft new`, into the guild's configured craft channel. No second-class projects.
- **Both repos, plugin repo is local** at `C:\Users\esthe\Documents\Dev\qiqirn-companion`.

## Architecture — backend (`ffxiv-helper`)

### 1. Extract shared project-read logic

Pull the list-summary and detail-building logic out of `src/api/projects.ts` into a new helper module `src/api/_projects-core.ts`:

- `listProjectSummaries(store, guildId, statusFilter)` → `{ projects, userNames }`
- `getProjectDetail(store, id)` → `{ project, tasks, userNames, projectItems } | null` (null when not found / not allow-listed)

This carries over the existing helpers (`computeTaskCounts`, `resolveNames`, `fetchDisplayName`, `isAllowed`). Both endpoints below consume it so their JSON shapes can never drift.

`src/api/projects.ts` keeps `requireSession` and becomes a thin wrapper over the helper (web app behavior unchanged).

### 2. New endpoint: `api/plugin-projects.ts`

Guild-allowlist authed (no session). Method dispatch:

- `GET /api/plugin/projects?guild=X` → `listProjectSummaries`. **Identical JSON shape** to `/api/projects` so the plugin's `ApiProject` deserialization is unchanged.
- `GET /api/plugin/projects/{id}` → `getProjectDetail`. Returns 404 when not found or the project's guild isn't allow-listed (same opacity as the web endpoint). Identical shape to `/api/projects/{id}`.
- `POST /api/plugin/projects` → create (below).

Auth: read `guildId` from query (GET) or body (POST); reject with 403 if not in `GUILD_ALLOWLIST`. Mirrors `plugin-claim.ts`.

### 3. Create flow (POST)

Request body:

```jsonc
{
  "guildId":       "string",   // required, must be allow-listed
  "itemId":        12345,        // required, target item
  "qty":           10,           // required, 1..99999
  "name":          "string?",    // optional project name
  "characterName": "string",     // required — creator label (FFXIV char)
  "intermediates": true          // optional, default true
}
```

Handler:

1. Validate (allow-list, required fields, `qty` 1–99999) → 403/400 on failure.
2. Assemble `CraftCommandDeps` exactly as `src/api/discord.ts:261` does: `loadSnapshots(baseUrl)`, market cache bundle, `store`, `botToken`, `appId`, `world/dc/region`, `craftChannelId`, `crafterRoleId`.
3. Call the existing `handleCraftNew(opts, guildId, channelId, userId, deps)`. Pass `channelId = ''` so it falls back to the guild's configured craft channel (same path the bot uses). Pass `userId = characterName`.
4. Map the result to `{ ok: true, projectId, taskCount, channelId }`, or `{ ok: false, error }` (e.g. no-recipe, missing channel config).

Response (success):

```jsonc
{ "ok": true, "projectId": 42, "taskCount": 17, "channelId": "..." }
```

### 4. Two surgical changes to `handleCraftNew` (`src/bot/craftCommands.ts`)

`handleCraftNew` is reused as-is for its full create+post flow, with two minimal additions:

- **Resolve by `itemId`.** Add optional `itemId?: number` to its `opts`. When present, skip the `searchItems(nameIndex, item, …)` fuzzy lookup and use the id + `snapshots.namesById` directly. The plugin already knows the exact item; this avoids name-match ambiguity. The bot path (passing `item` name) is unchanged.
- **Mention-safe creator.** Plugin projects store a character name in `createdBy`, not a Discord snowflake. Today the embed renders `<@${project.createdBy}>` (`src/bot/craftRender.ts:374`) and `THREAD_PROJECT_CREATED(userId)` renders a mention (`src/bot/craftStrings.ts:78`). Introduce a helper `mentionOrName(value)` that emits `<@value>` only when `value` is a Discord snowflake (regex `^\d{17,20}$`) and the literal text otherwise. Apply it at both render sites. Bot projects (snowflake ids) keep pings; plugin projects show e.g. `Esther Martz` as plain text.

> `resolveNames` in the read path already degrades gracefully: a non-snowflake `createdBy` simply fails the Discord member/user lookup and falls back to itself (the character name), which is the desired display. No change needed there.

### 5. Routing (`vercel.json`)

Add rewrites mirroring the existing `/api/plugin/*` entries (order matters — `:id` before the bare path):

```jsonc
{ "source": "/api/plugin/projects/:id", "destination": "/api/plugin-projects" },
{ "source": "/api/plugin/projects",     "destination": "/api/plugin-projects" }
```

Add a `functions` entry for `api/plugin-projects.mjs` with `maxDuration: 30` (the create path runs a breakdown + Discord posts, same budget as the breakdown endpoint).

## Architecture — plugin (`qiqirn-companion`)

### `Services/ApiClient.cs`

- Repoint `GetProjectsAsync` → `api/plugin/projects?guild={guildId}`.
- Repoint `GetProjectDetailAsync` → `api/plugin/projects/{id}`.
- Add `CreateProjectAsync(string guildId, int itemId, int qty, string? name, string characterName, bool intermediates = true)` → `POST api/plugin/projects`. Returns a small result type `{ bool Ok; int ProjectId; int TaskCount; string? Error }`.

### `Windows/MainWindow.cs` — Projects tab

Add a "＋ New Project" affordance:

- Item picker reusing the existing `SearchItemsAsync` flow (same pattern the Search tab uses).
- Qty input (clamped 1–99999) and optional name field.
- "Create" button → `CreateProjectAsync`, using the plugin's current guild and character name (the same `characterName` already used for claims).
- On success: re-run the existing project-list refresh so the new project appears. On failure: show the returned error inline (allow-list / no-recipe / missing channel).

## Error handling

| Condition | Response |
|---|---|
| Guild not in allow-list | 403 `{ error }` |
| Missing/invalid fields | 400 `{ error }` |
| `qty` out of 1–99999 | 400 `{ error }` |
| Item has no recipe/breakdown | 200 `{ ok: false, error }` (surfaced in-plugin) |
| No craft channel configured for guild | 200 `{ ok: false, error }` (clear message, not a broken post) |

## Testing

**Backend (`src/api/`):**
- `plugin-projects.test.ts` using the `__testCraftStore` injection pattern from `projects.test.ts`:
  - GET list/detail parity with `/api/projects` output shape.
  - 403 when guild not allow-listed; 404 for unknown/cross-guild detail.
  - POST happy path (creates project + tasks), bad input (400), qty bounds, non-allow-listed (403).
- Unit test for `mentionOrName`: snowflake → mention, character name → literal.
- Existing `projects.test.ts` must still pass after the helper extraction.

**Plugin (`qiqirn-companion`):**
- Manual in-game verification: build, load, create a project from the Projects tab, confirm it (a) appears in the plugin list and (b) posts the embed + thread + claim buttons in the Discord craft channel.

## Out of scope

- Editing/closing projects from the plugin (claim already exists; create is the gap).
- Multi-item project creation from the plugin (bot's `/craft add-item` flow) — single target item only for v1.
- Any change to the web app's session-based auth.
