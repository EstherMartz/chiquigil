# Dalamud Plugin — QiqirnCompanion Design

**Date:** 2026-05-28  
**Status:** Approved

## Context

An in-game Dalamud plugin (`qiqirn-companion`) that brings two qiqirn.tools features into FFXIV without alt-tabbing:

1. **Craft suggestions** — reads in-game inventory, shows what can be crafted and the MB price
2. **Project coordination** — browse open FC craft projects and claim tasks from inside the game

Identity for claiming = character name read from game client automatically. No Discord auth required.  
This is the user's first Dalamud plugin — design prioritises the standard Dalamud template and minimal complexity.

---

## Architecture

```
[FFXIV Game + Dalamud]
    ↓ IInventoryManager / ClientState (Dalamud APIs)
[QiqirnCompanion — separate C# repo]
    ↓ HTTPS via HttpClient
[qiqirn.tools Vercel API]
    GET  /api/projects?guild={id}      ← already exists, plugin reuses as-is
    GET  /api/projects/{id}            ← already exists
    POST /api/plugin/claim             ← new (src/api/plugin-claim.ts)
    GET  /api/plugin/craftable         ← new (src/api/plugin-craftable.ts)
    ↓
[Turso DB]  [market-cache.json blob]  [item snapshots]
```

The plugin repo is fully standalone (C#, .NET 8). The `ffxiv-helper` repo only gains 2 new API files, 1 new store method, and 2 vercel.json rewrite entries.

---

## Plugin repo structure

```
qiqirn-companion/
├── QiqirnCompanion.csproj     — net8.0-windows, Dalamud plugin template
├── Plugin.cs                  — entry point, DI via IDalamudPluginInterface, window manager
├── Configuration.cs           — IDalamudPluginInterface.SavePluginConfig / LoadPluginConfig
├── Windows/
│   ├── MainWindow.cs          — ImGui window with two tabs: Projects | Crafting
│   └── ConfigWindow.cs        — guild ID, API URL, optional character name override
└── Services/
    ├── ApiClient.cs           — typed HttpClient wrappers for all qiqirn.tools endpoints
    └── InventoryReader.cs     — reads bags 1-4 via IInventoryManager service injection
```

---

## New qiqirn.tools backend

### `src/api/plugin-claim.ts` — `POST /api/plugin/claim`

```json
// Request body
{ "projectId": 5, "taskId": 12, "characterName": "Estheria Moonweave", "guildId": "123456789" }

// Response (200)
{ "ok": true, "task": { "id": 12, "status": "claimed", "assigneeName": "Estheria Moonweave" } }

// Error responses
{ "error": "Guild not in allow-list" }   // 403
{ "error": "Task not found" }            // 404
```

Logic: verify guildId in GUILD_ALLOWLIST, load project to confirm guild match, then call `craftStore.claimTaskByCharacter(taskId, characterName)`.

### `src/api/plugin-craftable.ts` — `GET /api/plugin/craftable`

```
GET /api/plugin/craftable?inv=%5B%7B%22id%22%3A5058%2C%22qty%22%3A40%7D%5D
```

Query param `inv`: URL-encoded JSON array of `{ id: number, qty: number }`.

Algorithm:
1. Parse inventory from query param
2. Load item/recipe snapshot (same static data the web app uses)
3. For each recipe, check if all ingredients are present in inventory at required qty
4. Fetch market prices for craftable outputs from `market-cache.json` blob (same blob the bot uses)
5. Return only items where all ingredients are satisfied

```json
{
  "craftable": [
    { "itemId": 5766, "name": "Cotton Yarn", "qty": 4, "minNQ": 1200, "velocity": 8.3 },
    { "itemId": 5058, "name": "Cotton Boll", "qty": 2, "minNQ": 450, "velocity": 12.1 }
  ]
}
```

### `src/bot/craftStore.ts` — new method

```ts
async claimTaskByCharacter(taskId: number, characterName: string): Promise<StoredTask | null>
```

Mirrors existing `claimTask` but accepts a character name string instead of a Discord user ID. Returns the updated task row or null if not found.

### `vercel.json` — 2 new rewrites

```json
{ "source": "/api/plugin/claim", "destination": "/api/plugin-claim" },
{ "source": "/api/plugin/craftable", "destination": "/api/plugin-craftable" }
```

---

## Plugin UI design

### Projects tab

```
[↻ Refresh]  Project: [Cotton Yarn (x20) ▼]

 Item            | Qty | Status   | Assignee
─────────────────┼─────┼──────────┼───────────
 Cotton Yarn     |  20 | claimed  | Lunara
 Cotton Boll     | 100 | open     | —        [Claim]
 Wind Shard      | 200 | done     | ✓ Esthe

Claiming as: Estheria Moonweave
```

- Dropdown populated from `GET /api/projects?guild={id}` on tab open and on refresh
- `[Claim]` button visible on rows with `status === "open"` only
- On click: POST claim, row updates optimistically to `claimed / characterName`
- Character name auto-read from `ClientState.LocalPlayer?.Name ?? config.CharacterNameOverride`

### Crafting tab

```
[📦 Scan Inventory]  ☐ Include Saddlebag

 Item             | Can Make | Min Price NQ | Sales/day
──────────────────┼──────────┼──────────────┼──────────
 Cotton Yarn      |       12 |        1,200 |       8.3
 Linen Cloth      |        4 |        3,450 |       5.1

(click item name to copy to clipboard)
```

- Reads bags 1–4 via `IInventoryManager.GetInventory(InventoryType.Bag0..3)`
- Saddlebag toggle adds `InventoryType.SaddleBag0/1` when checked
- Results sorted by `minNQ × canMake` descending (best gil opportunity first)

### Config window (⚙ icon in title bar)

| Setting | Type | Default |
|---|---|---|
| Guild ID | text | (empty) |
| API Base URL | text | `https://qiqirn.tools` |
| Character Name Override | text | (empty) |

---

## Scope deferred to v2

- Retainer inventory reading (requires separate `RetainerManager` Dalamud hooks)
- Live Universalis fallback (prices come from hourly bot cache blob only in v1)
- Task un-claiming
- Filtering by project status (closed projects)

---

## Verification

### Backend (ffxiv-helper repo)
1. `src/bot/craftStore.test.ts` — add test for `claimTaskByCharacter`
2. Manual: `curl -X POST https://qiqirn.tools/api/plugin/claim -d '{"projectId":1,"taskId":1,"characterName":"Test","guildId":"..."}'` — returns `{ ok: true }`
3. Manual: `curl "https://qiqirn.tools/api/plugin/craftable?inv=[{\"id\":5058,\"qty\":100}]"` — returns craftable list
4. Verify in Discord: `/craft show id:1` — task shows as claimed by character name

### Plugin (qiqirn-companion repo)
1. `dotnet build` — no errors
2. Copy DLL to `%APPDATA%\XIVLauncher\devPlugins\QiqirnCompanion\`
3. In-game `/xlplugins` → Load Dev Plugin → plugin window opens
4. Set guild ID in config → Projects tab populates
5. Claim a task in-game → confirmed in Discord via `/craft show`
6. Scan inventory → craftable items appear with prices
