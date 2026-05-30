# Craftable Export-to-Text + List Import to Project Creator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export to Text" button to the plugin's Crafting tab (copies the craftable list as `{qty}x {name}` to the clipboard), and a paste-to-import flow in the New Project form that creates a multi-item project from such a list (each line a target the project breaks down), with full Discord sync.

**Architecture:** Plugin-only for export (`ImGui.SetClipboardText`). For import: the plugin parses the text and sends `items[]` to the **existing** `POST /api/plugin/projects` (no new Vercel function — we're at the 12-lambda Hobby cap). The endpoint dispatches the `items[]` body to a new `handleCraftNewFromList` in `craftCommands.ts`, which resolves names server-side, builds the merged task breakdown (reusing an extracted `buildTasksForProjectItems` helper), and posts the project to Discord. The single-item create path and the working `handleCraftNew` posting code are left untouched.

**Tech Stack:** TypeScript Vercel functions, Vitest, libSQL/Turso, esbuild → `api/*.mjs`; C# Dalamud plugin (`Dalamud.Bindings.ImGui`).

**Repos:**
- Backend: `C:\Users\esthe\Documents\Dev\ffxiv-helper` — branch `feature/list-export-import`
- Plugin: `C:\Users\esthe\Documents\Dev\qiqirn-companion` — branch `feature/list-export-import`

> ⚠️ Plugin `.cs` files are **UTF-8** (MainWindow.cs has a BOM); use Read/Edit (not grep/cat). Do NOT introduce raw control characters.

---

## File Structure

**Backend (`ffxiv-helper`):**
- Modify: `src/bot/craftCommands.ts` — add `buildTasksForProjectItems`, `resolveItemsByName`, `handleCraftNewFromList`; add `unmatched?` to `CommandResponse`; refactor `handleCraftAddItem` to use the task-builder helper.
- Create: `src/bot/craftCommands.test.ts` — unit tests for the two pure helpers.
- Modify: `src/api/plugin-projects.ts` — POST dispatches `items[]` → `handleCraftNewFromList`.
- Modify: `src/api/plugin-projects.test.ts` — tests for the `items[]` path.
- Rebuild: `api/plugin-projects.mjs` (+ other bundles embedding the changed bot code) via `npm run build:api`.

**Plugin (`qiqirn-companion`):**
- Modify: `Services/ApiClient.cs` — `CreateProjectResult.Unmatched` + `CreateProjectFromListAsync`.
- Modify: `Windows/MainWindow.cs` — Export-to-Text button (Crafting tab) + import UI/parser (New Project form).

---

## Task 1: Backend — extract pure helpers (`buildTasksForProjectItems`, `resolveItemsByName`)

**Files:**
- Modify: `src/bot/craftCommands.ts`
- Create: `src/bot/craftCommands.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/bot/craftCommands.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildTasksForProjectItems, resolveItemsByName, type CraftCommandDeps } from './craftCommands';
import { buildNameIndex } from './nameIndex';
import type { BotSnapshots } from './loadSnapshots';
import type { MarketBundle } from '../features/watchlist/useMarketData';

const emptyMarket: MarketBundle = { phantom: {}, dc: {}, region: {} };

function snapshots(over: Partial<BotSnapshots> = {}): BotSnapshots {
  return {
    recipes: new Map(),
    namesById: new Map(),
    vendorMap: new Map(),
    specialShop: { byCurrency: new Map() },
    gatheringCatalog: new Map(),
    companyCraft: new Map(),
    ...over,
  } as BotSnapshots;
}

function deps(snap: BotSnapshots): CraftCommandDeps {
  return { snapshots: snap, marketBundle: emptyMarket } as unknown as CraftCommandDeps;
}

describe('resolveItemsByName', () => {
  it('resolves known names and collects unknowns', () => {
    const nameIndex = buildNameIndex(new Map([[5106, 'Iron Ore'], [5107, 'Hardsilver Ore']]));
    const { resolved, unmatched } = resolveItemsByName(nameIndex, [
      { name: 'Iron Ore', qty: 6 },
      { name: 'Nonexistent Widget', qty: 2 },
    ]);
    expect(resolved).toEqual([{ itemId: 5106, itemName: 'Iron Ore', qty: 6 }]);
    expect(unmatched).toEqual(['Nonexistent Widget']);
  });
});

describe('buildTasksForProjectItems', () => {
  it('merges the same leaf item across multiple project items', () => {
    const snap = snapshots({ namesById: new Map([[5106, 'Iron Ore']]) });
    const tasks = buildTasksForProjectItems(
      [{ itemId: 5106, qty: 6 }, { itemId: 5106, qty: 10 }],
      deps(snap),
    );
    const iron = tasks.filter((t) => t.itemId === 5106);
    expect(iron).toHaveLength(1);
    expect(iron[0].qtyNeeded).toBe(16);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bot/craftCommands.test.ts`
Expected: FAIL — `buildTasksForProjectItems` / `resolveItemsByName` not exported.

- [ ] **Step 3: Add the helpers to `craftCommands.ts`**

In `src/bot/craftCommands.ts`, after the existing `mergeTasks` function (around line 259), add:

```typescript
/** Build the merged task list for a set of project target items: run buildBreakdown
 *  for each and merge by (itemId, source). Shared by add-item and list-import. */
export function buildTasksForProjectItems(
  projectItems: Array<{ itemId: number; qty: number }>,
  deps: CraftCommandDeps,
): CraftTask[] {
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;
  const market = deps.marketBundle;
  const raw: CraftTask[] = [];
  for (const pi of projectItems) {
    const bd = buildBreakdown(
      pi.itemId,
      pi.qty,
      market,
      { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
      { craftIntermediates: true },
    );
    raw.push(...bd.crafts, ...bd.acquire);
  }
  return mergeTasks(raw);
}

/** Resolve a list of {name, qty} to item IDs via the name index. Names with no
 *  fuzzy match are returned in `unmatched`. */
export function resolveItemsByName(
  nameIndex: NameIndex,
  items: Array<{ name: string; qty: number }>,
): { resolved: Array<{ itemId: number; itemName: string; qty: number }>; unmatched: string[] } {
  const resolved: Array<{ itemId: number; itemName: string; qty: number }> = [];
  const unmatched: string[] = [];
  for (const it of items) {
    const matches = searchItems(nameIndex, it.name, 1);
    if (matches.length === 0) { unmatched.push(it.name); continue; }
    resolved.push({ itemId: matches[0].id, itemName: matches[0].name, qty: it.qty });
  }
  return { resolved, unmatched };
}
```

(`buildBreakdown`, `mergeTasks`, `searchItems`, `NameIndex`, `CraftTask`, `CraftCommandDeps` are all already imported/defined in this file.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bot/craftCommands.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Refactor `handleCraftAddItem` to use `buildTasksForProjectItems`**

In `handleCraftAddItem`, find the block that builds the merged task list (currently around lines 291–307):

```typescript
  // 4. Load all project items and rebuild merged task list
  const projectItems = await deps.store.getProjectItems(opts.projectId);
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;
  const market = deps.marketBundle;

  const allRawTasks: CraftTask[] = [];
  for (const pi of projectItems) {
    const bd = buildBreakdown(
      pi.itemId,
      pi.qty,
      market,
      { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
      { craftIntermediates: true },
    );
    allRawTasks.push(...bd.crafts, ...bd.acquire);
  }

  const mergedTasks = mergeTasks(allRawTasks);
```

Replace it with:

```typescript
  // 4. Load all project items and rebuild merged task list
  const projectItems = await deps.store.getProjectItems(opts.projectId);
  const mergedTasks = buildTasksForProjectItems(projectItems, deps);
```

(Behavior is identical — same loop + merge, now via the shared helper.)

- [ ] **Step 6: Run the bot test suite**

Run: `npx vitest run src/bot/`
Expected: PASS (existing tests + the 2 new ones; `handleCraftAddItem` is unchanged behaviorally).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/bot/craftCommands.ts src/bot/craftCommands.test.ts
git commit -m "refactor: extract buildTasksForProjectItems + resolveItemsByName helpers"
```

---

## Task 2: Backend — `handleCraftNewFromList`

**Files:**
- Modify: `src/bot/craftCommands.ts`

- [ ] **Step 1: Add `unmatched` to `CommandResponse`**

Find the `CommandResponse` interface (it currently has `content?/embeds?/components?/flags?/projectId?/taskCount?`). Add one field:

```typescript
export interface CommandResponse {
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
  flags?: number;
  projectId?: number;
  taskCount?: number;
  unmatched?: string[];
}
```

- [ ] **Step 2: Add the `handleCraftNewFromList` handler**

Add this function to `src/bot/craftCommands.ts` (place it right after `handleCraftNew`). It mirrors `handleCraftNew`'s create + announce sequence intentionally (the existing posting code has no unit-test coverage, so we duplicate the proven sequence rather than refactor the prod path):

```typescript
/**
 * Create a project from a pasted list of target items (plugin list-import).
 * Each entry is a target that gets broken down + merged into tasks, then the
 * project is announced to Discord like a normal /craft new.
 * NOTE: the announce/post sequence below intentionally mirrors handleCraftNew —
 * keep them in sync. (Not extracted: the posting path has no test coverage.)
 */
export async function handleCraftNewFromList(
  opts: { name: string; items: Array<{ name: string; qty: number }> },
  guildId: string,
  channelId: string,
  userId: string,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  // 1. Resolve names → item IDs
  const { resolved, unmatched } = resolveItemsByName(deps.nameIndex, opts.items);
  if (resolved.length === 0) {
    return { content: S.ITEM_NOT_FOUND(opts.items.map((i) => i.name).join(', ')), flags: 64, unmatched };
  }

  // 2. Determine target channel from guild config or fallback
  let targetChannelId = deps.craftChannelId ?? channelId;
  try {
    const guildConfig = await deps.store.getGuildConfig(guildId);
    if (guildConfig) targetChannelId = guildConfig.craftChannelId;
  } catch (e) {
    console.warn('[craft] failed to fetch guild config, using fallback', e instanceof Error ? e.message : e);
  }

  // 3. Create the project (empty target — it is a multi-item list project)
  const projectId = await deps.store.createProject({
    guildId,
    channelId: targetChannelId,
    name: opts.name,
    targetItemId: 0,
    targetQty: 0,
    createdBy: userId,
  });

  // 4. Record each resolved item + build merged tasks
  for (const r of resolved) {
    await deps.store.addProjectItem(projectId, r.itemId, r.itemName, r.qty);
  }
  const projectItems = await deps.store.getProjectItems(projectId);
  const tasks = buildTasksForProjectItems(projectItems, deps);
  if (tasks.length === 0) {
    return { content: S.NO_RECIPE(resolved[0].itemName), flags: 64, unmatched };
  }
  await deps.store.addTasks(projectId, tasks);

  // 5. Set the initial display phase (for multi-phase CompanyCraft items)
  const initial = initialDisplayPhase(tasks);
  if (initial) {
    await deps.store.setProjectDisplayPhase(projectId, initial.partKey, initial.phaseIndex);
  }

  // 6. Render + announce (mirrors handleCraftNew)
  const project = await deps.store.getProject(projectId);
  if (!project) return { content: 'Failed to create project', flags: 64, unmatched };
  const storedTasks = await deps.store.getTasks(projectId);
  const piSummary = projectItems.map((pi) => ({ itemName: pi.itemName, qty: pi.qty }));
  const { embeds, components } = buildProjectMessage(project, storedTasks, piSummary);

  const roleId = deps.crafterRoleId;
  let content = '';
  if (roleId) content = `<@&${roleId}> `;
  content += S.NEW_PROJECT_CONTENT(projectId);

  const channelInfo = await discordApi.getChannel(deps.botToken, targetChannelId);
  const isForumChannel = channelInfo?.type === 15;

  if (isForumChannel) {
    let forumPost: Record<string, unknown> | null = null;
    try {
      forumPost = await discordApi.createForumPost(deps.botToken, targetChannelId, opts.name.slice(0, 100), {
        content, embeds, components,
        allowed_mentions: roleId ? { roles: [roleId] } : undefined,
      });
    } catch (e) {
      return { content: `No se pudo crear el post en el foro — ${e instanceof Error ? e.message : String(e)}`, flags: 64, projectId, taskCount: storedTasks.length, unmatched };
    }
    if (forumPost) {
      const threadId = String(forumPost.id);
      await deps.store.setProjectThreadId(projectId, threadId);
      try {
        await discordApi.sendToChannel(deps.botToken, threadId, { content: S.THREAD_PROJECT_CREATED(userId, storedTasks.length) });
      } catch (e) {
        console.error('[craft] failed to send forum post message:', e instanceof Error ? e.message : e);
      }
    }
  } else {
    const announcementMsg = await discordApi.sendToChannel(deps.botToken, targetChannelId, {
      content, embeds, components,
      allowed_mentions: roleId ? { roles: [roleId] } : undefined,
    });
    if (!announcementMsg) {
      return { content: S.CHANNEL_NOT_FOUND, flags: 64, projectId, taskCount: storedTasks.length, unmatched };
    }
    const messageId = String(announcementMsg.id);
    await deps.store.setProjectMessageId(projectId, messageId);
    try {
      const thread = await discordApi.createThread(deps.botToken, targetChannelId, messageId, opts.name.slice(0, 100));
      if (thread) {
        const threadId = String(thread.id);
        await deps.store.setProjectThreadId(projectId, threadId);
        await discordApi.sendToChannel(deps.botToken, threadId, { content: S.THREAD_PROJECT_CREATED(userId, storedTasks.length) });
      }
    } catch (e) {
      console.error('[craft] failed to create thread:', e instanceof Error ? e.message : e);
    }
  }

  if (!isForumChannel) {
    await refreshBoard(deps, guildId);
  }

  console.log(`[craft] list project #${projectId} created with ${storedTasks.length} tasks (${unmatched.length} unmatched)`);
  return {
    content: S.PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
    flags: 64,
    projectId,
    taskCount: storedTasks.length,
    unmatched,
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Confirm `refreshBoard`, `initialDisplayPhase`, `buildProjectMessage`, `discordApi`, `S` are all in scope — they are, used by `handleCraftNew` in the same file.)

- [ ] **Step 4: Run the bot suite**

Run: `npx vitest run src/bot/`
Expected: PASS (no behavior change to existing handlers; the new handler is additive and exercised by Task 3's endpoint test via mock + in-game later).

- [ ] **Step 5: Commit**

```bash
git add src/bot/craftCommands.ts
git commit -m "feat: handleCraftNewFromList — create a project from a list of target items"
```

---

## Task 3: Backend — endpoint `items[]` dispatch

**Files:**
- Modify: `src/api/plugin-projects.ts`
- Modify: `src/api/plugin-projects.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/api/plugin-projects.test.ts`, extend the top `vi.mock('../bot/craftCommands', ...)` to also mock `handleCraftNewFromList`, and add a describe block. Replace the existing mock factory with:

```typescript
vi.mock('../bot/craftCommands', () => ({
  handleCraftNew: vi.fn(async (opts: any) =>
    opts.itemId === 42
      ? { content: 'ok', flags: 64, projectId: 7, taskCount: 3 }
      : { content: 'No recipe', flags: 64 },
  ),
  handleCraftNewFromList: vi.fn(async (opts: any) =>
    opts.items?.length
      ? { content: 'ok', flags: 64, projectId: 9, taskCount: 5, unmatched: ['Ghost Item'] }
      : { content: 'No items matched', flags: 64, unmatched: [] },
  ),
}));
```

And update the import line to also import the new mock:

```typescript
import { handleCraftNew, handleCraftNewFromList } from '../bot/craftCommands';
```

Then add this describe block:

```typescript
describe('POST /api/plugin/projects (items[] import)', () => {
  it('creates a project from a list and returns projectId/taskCount/unmatched', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: { host: 'qiqirn.tools' },
      body: { guildId: 'G1', name: 'My List', characterName: 'Esther', items: [{ name: 'Iron Ore', qty: 6 }, { name: 'Ghost Item', qty: 2 }] } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ ok: true, projectId: 9, taskCount: 5, unmatched: ['Ghost Item'] });
    expect(handleCraftNewFromList).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My List', items: [{ name: 'Iron Ore', qty: 6 }, { name: 'Ghost Item', qty: 2 }] }),
      'G1', '', 'Esther', expect.anything(),
    );
    expect(handleCraftNew).not.toHaveBeenCalled();
  });

  it('403s when guild not allow-listed (before deps)', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'OTHER', name: 'X', characterName: 'E', items: [{ name: 'Iron Ore', qty: 1 }] } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(handleCraftNewFromList).not.toHaveBeenCalled();
  });

  it('400s when items entries are all invalid', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'G1', name: 'X', characterName: 'E', items: [{ name: '', qty: 0 }] } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('400s when name missing for an items import', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'G1', characterName: 'E', items: [{ name: 'Iron Ore', qty: 1 }] } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/api/plugin-projects.test.ts`
Expected: FAIL — the `items[]` branch doesn't exist yet (likely falls into the single-item path → wrong status / handler not called).

- [ ] **Step 3: Add the `items[]` dispatch to the POST handler**

In `src/api/plugin-projects.ts`:

1. Update the import to include the new handler:

```typescript
import { handleCraftNew, handleCraftNewFromList, type CraftCommandDeps } from '../bot/craftCommands';
```

2. Inside the `if (req.method === 'POST')` block, right after `const { ... } = req.body ?? {}`, branch on `items`. Change the destructure and add the multi-item path BEFORE the existing single-item validation. The POST block becomes:

```typescript
  if (req.method === 'POST') {
    const { guildId, itemId, qty, name, characterName, intermediates, items } = req.body ?? {};

    // ── Multi-item list import ───────────────────────────────────────────────
    if (Array.isArray(items)) {
      if (!guildId || !characterName || !name) {
        return res.status(400).json({ error: 'Missing required fields: guildId, name, characterName' });
      }
      if (!isAllowed(String(guildId))) {
        return res.status(403).json({ error: 'Guild not in allow-list' });
      }
      const validItems = items
        .map((it: any) => ({ name: String(it?.name ?? '').trim(), qty: Number(it?.qty) }))
        .filter((it) => it.name.length > 0 && Number.isInteger(it.qty) && it.qty >= 1 && it.qty <= 99999);
      if (validItems.length === 0) {
        return res.status(400).json({ error: 'No valid items in list' });
      }

      const deps = await buildCreateDeps(req);
      const result = await handleCraftNewFromList(
        { name: String(name), items: validItems },
        String(guildId), '', String(characterName), deps,
      );
      if (typeof result.projectId === 'number') {
        return res.status(200).json({ ok: true, projectId: result.projectId, taskCount: result.taskCount ?? 0, unmatched: result.unmatched ?? [] });
      }
      return res.status(200).json({ ok: false, error: result.content ?? 'Could not create project', unmatched: result.unmatched ?? [] });
    }

    // ── Single-item create (existing) ────────────────────────────────────────
    if (!guildId || itemId == null || qty == null || !characterName) {
      return res.status(400).json({ error: 'Missing required fields: guildId, itemId, qty, characterName' });
    }
    if (!isAllowed(String(guildId))) {
      return res.status(403).json({ error: 'Guild not in allow-list' });
    }
    const qtyNum = Number(qty);
    const itemIdNum = Number(itemId);
    if (!Number.isInteger(itemIdNum) || itemIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid itemId' });
    }
    if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > 99999) {
      return res.status(400).json({ error: 'qty must be between 1 and 99999' });
    }

    const deps = await buildCreateDeps(req);
    const result = await handleCraftNew(
      { itemId: itemIdNum, qty: qtyNum, name: name ?? null, intermediates: intermediates ?? true },
      String(guildId), '', String(characterName), deps,
    );
    if (typeof result.projectId === 'number') {
      return res.status(200).json({ ok: true, projectId: result.projectId, taskCount: result.taskCount ?? 0 });
    }
    return res.status(200).json({ ok: false, error: result.content ?? 'Could not create project' });
  }
```

3. Extract the deps-assembly (currently inline in the single path) into a helper so both paths share it. Add this function above `handler`:

```typescript
async function buildCreateDeps(req: VercelRequest): Promise<CraftCommandDeps> {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'qiqirn.tools';
  const baseUrl = `${proto}://${host}`;

  const [store, snapshots, cache] = await Promise.all([
    getStore(),
    loadSnapshots(baseUrl),
    loadMarketCache(),
  ]);
  const nameIndex = buildNameIndex(snapshots.namesById);
  const marketBundle = { phantom: cache.phantom ?? {}, dc: cache.dc ?? {}, region: cache.region ?? {} };

  return {
    store, snapshots, nameIndex,
    marketBundle: marketBundle as any,
    botToken: process.env.DISCORD_BOT_TOKEN ?? '',
    appId: process.env.DISCORD_APP_ID ?? '',
    world: process.env.HOME_WORLD ?? 'Phantom',
    dc: process.env.HOME_DC ?? 'Chaos',
    region: process.env.REGION ?? 'Europe',
    craftChannelId: process.env.CRAFT_CHANNEL_ID || undefined,
    crafterRoleId: process.env.CRAFTER_ROLE_ID || undefined,
  };
}
```

Remove the now-duplicated inline deps-assembly from the single-item path (replaced by `const { deps } = await buildCreateDeps(req);` above). Keep the existing `loadMarketCache`, `getStore`, and imports.

> The mocked tests don't call `buildCreateDeps`'s network paths meaningfully — `loadSnapshots` is mocked and `loadMarketCache` returns empty when `VITE_CACHE_BLOB_URL` is unset (the test's `beforeEach` already deletes it). Validation returns happen before `buildCreateDeps`, so the 400/403 tests never touch it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api/plugin-projects.test.ts`
Expected: PASS (existing single-item + read tests, plus the 4 new items[] tests).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Rebuild the API bundles + run full suite**

Run: `npm run build:api`
Then confirm the bundle changed: `git status -s api/`
Expected: `api/plugin-projects.mjs` (and likely `api/discord.mjs`, since both embed `craftCommands.ts`) show as modified.

Run: `npx vitest run`
Expected: PASS (full suite).

- [ ] **Step 6: Commit**

```bash
git add src/api/plugin-projects.ts src/api/plugin-projects.test.ts api/*.mjs
git commit -m "feat: /api/plugin/projects accepts an items[] list import"
```

---

## Task 4: Plugin — ApiClient `CreateProjectFromListAsync`

**Files:**
- Modify: `Services/ApiClient.cs` (UTF-8; use Read/Edit)

- [ ] **Step 1: Add `Unmatched` to `CreateProjectResult`**

Find the `CreateProjectResult` record and add the field:

```csharp
public record CreateProjectResult(
    [property: JsonPropertyName("ok")]        bool   Ok,
    [property: JsonPropertyName("projectId")] int    ProjectId,
    [property: JsonPropertyName("taskCount")] int    TaskCount,
    [property: JsonPropertyName("error")]     string? Error,
    [property: JsonPropertyName("unmatched")] List<string>? Unmatched
);
```

- [ ] **Step 2: Update the existing `CreateProjectAsync` fallback**

In `CreateProjectAsync`, the null-fallback constructor now needs the extra arg. Change:

```csharp
        return result ?? new CreateProjectResult(false, 0, 0, "Empty response");
```
to:
```csharp
        return result ?? new CreateProjectResult(false, 0, 0, "Empty response", null);
```

- [ ] **Step 3: Add `CreateProjectFromListAsync`**

Add this method next to `CreateProjectAsync`:

```csharp
    /// <summary>Create a project from a pasted list of (name, qty) target items. Posts to Discord on success.</summary>
    public async Task<CreateProjectResult> CreateProjectFromListAsync(
        string guildId, string name, List<(string name, int qty)> items, string characterName)
    {
        var body = new
        {
            guildId,
            name,
            characterName,
            items = items.ConvertAll(i => new { name = i.name, qty = i.qty }),
        };
        var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        var res     = await _http.PostAsync("api/plugin/projects", content);
        res.EnsureSuccessStatusCode();
        var result = await res.Content.ReadFromJsonAsync<CreateProjectResult>(_json);
        return result ?? new CreateProjectResult(false, 0, 0, "Empty response", null);
    }
```

- [ ] **Step 4: Build**

Run: `dotnet build C:\Users\esthe\Documents\Dev\qiqirn-companion\QiqirnCompanion.csproj -c Release`
Expected: succeeds (0 errors). If `CreateProjectAsync`'s fallback wasn't updated, the compiler will flag the arg count — fix per Step 2.

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/esthe/Documents/Dev/qiqirn-companion add Services/ApiClient.cs
git -C C:/Users/esthe/Documents/Dev/qiqirn-companion commit -m "feat: ApiClient.CreateProjectFromListAsync + Unmatched field"
```

---

## Task 5: Plugin — Export to Text (Crafting tab)

**Files:**
- Modify: `Windows/MainWindow.cs` (UTF-8; use Read/Edit)

- [ ] **Step 1: Add export status state**

In the "Crafting tab state" region (near `_maxMissing`), add:

```csharp
    private string _craftExportStatus = string.Empty;
```

- [ ] **Step 2: Add the Export button to the Crafting tab header**

In `DrawCraftingTab`, the header currently has "Scan Inventory", "Include Saddlebag", "Max missing", and a loading indicator. After the `Max missing` InputInt block (and its tooltip), add an Export button that is enabled only when there are makeable rows:

```csharp
        var canExport = _craftable.Exists(c => c.Qty > 0);
        ImGui.SameLine();
        if (!canExport) ImGui.BeginDisabled();
        if (ImGui.Button("Export to Text"))
            ExportCraftableToText();
        if (!canExport) ImGui.EndDisabled();
        if (!string.IsNullOrEmpty(_craftExportStatus))
        {
            ImGui.SameLine();
            ImGui.TextDisabled(_craftExportStatus);
        }
```

- [ ] **Step 3: Add the export method**

Add this method to `MainWindow.cs` (near the other Crafting helpers, e.g. after `ScanInventory`):

```csharp
    private void ExportCraftableToText()
    {
        var lines = new List<string>();
        foreach (var c in _craftable)
            if (c.Qty > 0) lines.Add($"{c.Qty}x {c.Name}");

        if (lines.Count == 0)
        {
            _craftExportStatus = "Nothing to export";
            return;
        }

        ImGui.SetClipboardText(string.Join("\n", lines));
        _craftExportStatus = $"Copied {lines.Count} items";
    }
```

(`ImGui.SetClipboardText` is already used in `Services/ItemInteractions.cs`. `List<string>` and `string.Join` need `System.Collections.Generic` / `System`, both already imported in this file.)

- [ ] **Step 4: Build**

Run: `dotnet build C:\Users\esthe\Documents\Dev\qiqirn-companion\QiqirnCompanion.csproj -c Release`
Expected: succeeds (0 errors/warnings). If `ImGui.SetClipboardText` has a different signature in this binding, match the usage in `Services/ItemInteractions.cs:38`.

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/esthe/Documents/Dev/qiqirn-companion add Windows/MainWindow.cs
git -C C:/Users/esthe/Documents/Dev/qiqirn-companion commit -m "feat: Export to Text on the Crafting tab"
```

---

## Task 6: Plugin — import list into the New Project form

**Files:**
- Modify: `Windows/MainWindow.cs` (UTF-8; use Read/Edit)

- [ ] **Step 1: Add import state**

In the "New-project form state" region (near `_newProjectName`), add:

```csharp
    private string _newProjectList = string.Empty;
```

Add this using at the top of the file if not present (for `Regex`):

```csharp
using System.Text.RegularExpressions;
```

- [ ] **Step 2: Add the import UI to `DrawNewProjectForm`**

At the end of `DrawNewProjectForm` (just before the closing brace, after the existing error display), add:

```csharp
        ImGui.Separator();
        ImGui.TextDisabled("Or paste a list (e.g. \"12x Iron Ore\"):");
        ImGui.InputTextMultiline("##nplist", ref _newProjectList, 4096, new Vector2(280, 90));

        var canImport = !_newProjectBusy && !string.IsNullOrEmpty(_config.GuildId) && !string.IsNullOrWhiteSpace(_newProjectList);
        if (!canImport) ImGui.BeginDisabled();
        if (ImGui.Button("Create from list"))
            CreateProjectFromList();
        if (!canImport) ImGui.EndDisabled();
```

- [ ] **Step 3: Add the parser + import method**

Add to `MainWindow.cs` (near `CreateProject`):

```csharp
    // Parse "12x Item Name" lines. Returns parsed (name, qty) pairs and the count of unparseable lines.
    private static (List<(string name, int qty)> items, int skipped) ParseList(string text)
    {
        var items = new List<(string name, int qty)>();
        var skipped = 0;
        var rx = new Regex(@"^\s*(\d+)\s*[xX×]\s*(.+?)\s*$");
        foreach (var raw in text.Split('\n'))
        {
            if (string.IsNullOrWhiteSpace(raw)) continue;
            var m = rx.Match(raw);
            if (!m.Success) { skipped++; continue; }
            if (!int.TryParse(m.Groups[1].Value, out var qty) || qty < 1) { skipped++; continue; }
            items.Add((m.Groups[2].Value.Trim(), qty));
        }
        return (items, skipped);
    }

    private void CreateProjectFromList()
    {
        var (items, skipped) = ParseList(_newProjectList);
        if (items.Count == 0)
        {
            _newProjectError = "No valid lines (expected e.g. \"12x Iron Ore\").";
            return;
        }
        var name = string.IsNullOrWhiteSpace(_newProjectName) ? "Imported project" : _newProjectName.Trim();

        _newProjectBusy = true;
        _newProjectError = string.Empty;

        Task.Run(async () =>
        {
            try
            {
                var result = await _api.CreateProjectFromListAsync(_config.GuildId, name, items, CharacterName);
                if (result.Ok)
                {
                    var notes = new List<string>();
                    if (skipped > 0) notes.Add($"skipped {skipped} unparseable line(s)");
                    if (result.Unmatched is { Count: > 0 }) notes.Add($"couldn't find: {string.Join(", ", result.Unmatched)}");
                    _newProjectError = notes.Count > 0 ? "Created — " + string.Join("; ", notes) : string.Empty;

                    // Reset the form and refresh.
                    _showNewProject     = notes.Count > 0; // keep open if there were notes to read
                    _newProjectSearch   = string.Empty;
                    _newProjectResults  = [];
                    _newProjectSelected = null;
                    _newProjectQty      = 1;
                    _newProjectName     = string.Empty;
                    _newProjectList     = string.Empty;
                    LoadProjects();
                }
                else
                {
                    _newProjectError = result.Error ?? "Could not create project.";
                }
            }
            catch (Exception ex)
            {
                _newProjectError = $"Import failed: {ex.Message}";
            }
            finally
            {
                _newProjectBusy = false;
            }
        });
    }
```

- [ ] **Step 4: Build**

Run: `dotnet build C:\Users\esthe\Documents\Dev\qiqirn-companion\QiqirnCompanion.csproj -c Release`
Expected: succeeds (0 errors/warnings). If `ImGui.InputTextMultiline` has a different signature in this binding, check existing multiline usage or fall back to `ImGui.InputTextMultiline(label, ref str, maxLen, size)` shape; match the binding used elsewhere.

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/esthe/Documents/Dev/qiqirn-companion add Windows/MainWindow.cs
git -C C:/Users/esthe/Documents/Dev/qiqirn-companion commit -m "feat: import a pasted list into the New Project form"
```

---

## Task 7: End-to-end verification

**Files:** none (manual)

- [ ] **Step 1: Deploy the backend branch** (preview or merge+prod) so the plugin reaches the updated `POST /api/plugin/projects`. The plugin targets `https://qiqirn.tools`.

- [ ] **Step 2: Export round-trip.** In-game: Crafting tab → Scan Inventory → **Export to Text** → confirm "Copied N items" and paste elsewhere to verify the `{qty}x {name}` format.

- [ ] **Step 3: Import.** New Project form → paste the copied list (optionally add an unknown line + a garbage line) → optionally set a name → **Create from list**. Confirm: a project is created, appears in the plugin list, and posts the embed + thread + claim buttons in the Discord craft channel. Confirm unmatched/skipped lines are reported.

- [ ] **Step 4: Single-item create still works** (regression): the existing single-item "Create Project" flow still creates a project.

---

## Notes for the implementer

- **No new Vercel function** — the import rides on the existing `POST /api/plugin/projects` (12-lambda Hobby cap). Do not add a route or function.
- **`handleCraftNewFromList` mirrors `handleCraftNew`'s posting on purpose** — the posting path has no unit-test coverage, so we duplicate the proven sequence rather than refactor the prod path. Keep the two in sync; a future task with test coverage can unify them.
- **DRY where safe:** `buildTasksForProjectItems` and `buildCreateDeps` are shared; `resolveItemsByName` isolates the testable name-resolution logic.
- Plugin `.cs` are UTF-8 — use Read/Edit, never introduce raw control bytes.
- Export uses ASCII `x`; the importer also accepts `×` and `X`.
