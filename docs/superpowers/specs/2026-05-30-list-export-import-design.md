# Export craftable list to text + import list into project creator

**Date:** 2026-05-30
**Status:** Approved — ready for implementation plan
**Repos:** `qiqirn-companion` (Dalamud/C# plugin) + `ffxiv-helper` (backend)

## Problem

Two related quality-of-life additions to the plugin:

1. **Export to Text** — on the Crafting tab (the "what can I craft from my inventory" list), let the user copy the list to the clipboard as plain `{qty}x {name}` lines, to paste elsewhere.
2. **Import list** — in the project creator (the New Project form), let the user paste a `{qty}x {name}` list (same format) to create a multi-item project in one action.

Target format (round-trips between the two):

```
30x Raw Amber
28x Flax
14x Linseed Oil
...
```

## Decisions (settled)

- **Import semantics = targets that break down.** Each pasted line is a *target item*; the project decomposes it into sub-tasks (gather/buy/craft + intermediates), exactly like the bot's `/craft add-item`. (User chose this over a literal flat checklist.)
- **No new Vercel function.** The deploy is at the Hobby-plan 12-lambda cap, so the import MUST fold into the existing `POST /api/plugin/projects` function — not a new endpoint.
- **Name resolution server-side.** The plugin parses the text format; the server resolves names → item IDs via its authoritative name index.

## Part 1 — Export to Text (plugin only)

**File:** `Windows/MainWindow.cs` (Crafting tab — `DrawCraftingTab` / `_craftable`).

- Add an **"Export to Text"** button in the Crafting tab header (next to "Scan Inventory" / the options row). Enabled only when `_craftable` contains at least one row with `Qty > 0`.
- On click: build a string from `_craftable` in current display order, one line per item with `Qty > 0`, formatted exactly `"{item.Qty}x {item.Name}"` (ASCII `x`, single space before the name), joined by `\n`. Copy to clipboard via `ImGui.SetClipboardText(text)` (already used in `Services/ItemInteractions.cs:38`).
- Show a transient confirmation next to the button (e.g. `"Copied N items"`), stored in a field and shown after a successful copy. No backend call.

Rows with `Qty <= 0` (near-complete crafts surfaced by "Max missing") are omitted — `0x Name` is not useful in a copy list.

## Part 2 — Import list → project

### Plugin UI — `Windows/MainWindow.cs` (`DrawNewProjectForm`)

Below the existing single-item create controls, add:
- `ImGui.Separator()` + `ImGui.TextDisabled("Or paste a list:")`.
- A multiline input (`ImGui.InputTextMultiline("##nplist", ref _newProjectList, 4096, new Vector2(280, 90))`).
- A **"Create from list"** button, gated by `!_newProjectBusy && !string.IsNullOrEmpty(_config.GuildId)` and a non-empty text box.

New state fields: `private string _newProjectList = string.Empty;` (reuse `_newProjectBusy` / `_newProjectError` for status; reuse `_newProjectName` for the project name).

On click → `CreateProjectFromList()`:
1. Parse `_newProjectList` line by line. For each non-blank line, match `^\s*(\d+)\s*[x×]\s*(.+?)\s*$` (case-insensitive on `x`; tolerate `×`). Collect `(name, qty)` for matches and the raw text of unparseable lines.
2. If no lines parse → set `_newProjectError = "No valid lines (expected '12x Item Name')."` and stop.
3. Determine project name: `_newProjectName` trimmed, or `"Imported project"` if blank.
4. `Task.Run` → `_api.CreateProjectFromListAsync(_config.GuildId, name, parsedItems, CharacterName)`.
5. On `result.Ok`: reset the form (clear list/search/name, hide form), `LoadProjects()`. If `result.Unmatched`/local parse-failures are non-empty, surface them in `_newProjectError` as an informational note (e.g. `"Created. Couldn't find: A, B"` / `"Skipped unparseable lines: N"`).
6. On failure / exception: set `_newProjectError`.

Mirror the async + busy/error conventions of the existing `CreateProject()`.

### Plugin ApiClient — `Services/ApiClient.cs`

- Extend `CreateProjectResult` with `[property: JsonPropertyName("unmatched")] List<string>? Unmatched`.
- Add:

```csharp
public async Task<CreateProjectResult> CreateProjectFromListAsync(
    string guildId, string name, List<(string name, int qty)> items, string characterName)
{
    var body    = new { guildId, name, characterName, items = items.ConvertAll(i => new { name = i.name, qty = i.qty }) };
    var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
    var res     = await _http.PostAsync("api/plugin/projects", content);
    res.EnsureSuccessStatusCode();
    var result = await res.Content.ReadFromJsonAsync<CreateProjectResult>(_json);
    return result ?? new CreateProjectResult(false, 0, 0, "Empty response", null);
}
```

(The single-item `CreateProjectAsync` is unchanged except the extra `null` constructor arg for the new `Unmatched` field.)

### Backend — `src/api/plugin-projects.ts` (POST, existing function)

Branch on the body: if `items` is a non-empty array → multi-item import path; else the existing single `itemId` path (unchanged).

Multi-item validation (before deps assembly): `guildId` present + allow-listed (403), `characterName` present, `name` present, `items` a non-empty array of `{name: string, qty: int 1..99999}` (400 otherwise; invalid individual entries are dropped, not fatal, unless none remain).

Then assemble `CraftCommandDeps` (same as the single path) and call:

```ts
const result = await handleCraftNewFromList(
  { name: String(name), items: validItems },  // validItems: {name, qty}[]
  String(guildId), '', String(characterName), deps,
);
```

Map to `{ ok: true, projectId, taskCount, unmatched }` when `result.projectId` is a number, else `{ ok: false, error: result.content }`.

### Backend — `src/bot/craftCommands.ts`

**Extract a shared helper** (DRY — the per-item breakdown+merge loop currently lives inline in `handleCraftAddItem`):

```ts
export function buildTasksForProjectItems(
  projectItems: Array<{ itemId: number; qty: number }>,
  deps: CraftCommandDeps,
): CraftTask[] {
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;
  const market = deps.marketBundle;
  const raw: CraftTask[] = [];
  for (const pi of projectItems) {
    const bd = buildBreakdown(pi.itemId, pi.qty, market,
      { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
      { craftIntermediates: true });
    raw.push(...bd.crafts, ...bd.acquire);
  }
  return mergeTasks(raw);
}
```

Refactor `handleCraftAddItem` to use it (behavior unchanged).

**New handler** `handleCraftNewFromList(opts: { name: string; items: Array<{ name: string; qty: number }> }, guildId, channelId, userId, deps): Promise<CommandResponse & { unmatched?: string[] }>`:

1. Resolve each `items[i].name` via `searchItems(deps.nameIndex, name, 1)`. Build `resolved: {itemId, itemName, qty}[]` and `unmatched: string[]` (names with no match).
2. If `resolved` is empty → return `{ content: 'No items matched', flags: 64, unmatched }` (no `projectId` → endpoint reports `ok:false`).
3. Resolve target channel from guild config (same as `handleCraftNew`), determine forum vs text via `discordApi.getChannel`.
4. `createProject` (empty: `targetItemId: 0, targetQty: 0`, with `name`, channel, `createdBy: userId`); compute `initialDisplayPhase` after tasks are built and persist via the create or `setProjectDisplayPhase`.
5. `addProjectItem` for each resolved item.
6. `tasks = buildTasksForProjectItems(resolved, deps)`; `addTasks(projectId, tasks)`.
7. Post the announcement + thread (forum or text) exactly as `handleCraftNew` does. **Extract the post-and-thread sequence** shared by `handleCraftNew` into a helper `announceNewProject(project, storedTasks, deps, userId, { pingRole })` and call it from both, to avoid a third copy of the posting logic. (If extraction proves too entangled during implementation, mirror the sequence and note it; prefer extraction.)
8. Refresh board (text channels). Return `{ content: S.PROJECT_CREATED(...), flags: 64, projectId, taskCount: tasks.length, unmatched }`.

`CommandResponse` already has optional `projectId`/`taskCount`; add optional `unmatched?: string[]`.

### Routing / build
No `vercel.json` change (same function, same route). `src/api/plugin-projects.ts` is already in the `build:api` bundle list. Rebuild + commit `api/plugin-projects.mjs` (and any other bundles that embed the changed bot code, e.g. `api/discord.mjs`) after the source changes.

## Error handling summary

| Condition | Behavior |
|---|---|
| Export with nothing craftable | Button disabled |
| Import: no parseable lines | Plugin error, no API call |
| Import: some lines unparseable | Import the rest; report skipped count |
| Import: names not found server-side | Returned in `unmatched`; project still created from matched items; shown to user |
| Import: zero items matched server-side | `ok:false`, no project created |
| Guild not allow-listed / missing fields | 403 / 400 (before deps) |

## Testing

**Backend (`src/api/`, `src/bot/`):**
- `plugin-projects.test.ts`: add cases for the `items` path — dispatches to `handleCraftNewFromList` (mocked) with the parsed items; success returns `{ok, projectId, taskCount, unmatched}`; 400 when `items` empty/invalid and no `itemId`; 403 when guild not allow-listed (handler not called).
- `craftCommands` test: `buildTasksForProjectItems` merges duplicate `(itemId, source)` across multiple target items (pure-ish, uses a small fixture snapshot/market); `handleCraftAddItem` still passes after the refactor.
- Existing single-item create + read tests must stay green.

**Plugin (`qiqirn-companion`):**
- Release build (0 warnings/errors).
- In-game round-trip: Crafting tab → Export to Text → paste into the New Project list box → Create from list → project appears in the plugin and posts to the Discord craft channel; unmatched/unparseable lines reported.

## Out of scope

- Literal (no-breakdown) import — explicitly not chosen.
- Editing an existing project from a pasted list (import only creates new projects).
- Exporting from tabs other than Crafting.
