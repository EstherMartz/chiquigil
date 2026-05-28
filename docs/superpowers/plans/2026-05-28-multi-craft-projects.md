# Multi-Craft Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a single craft project to contain multiple target items so shared ingredients merge into one task list.

**Architecture:** Add a `project_items` table (additive migration); add three new methods to `CraftStore`; update `/craft new` to make `item` optional and add a `/craft add-item` subcommand that rebuilds merged tasks on each call; pass an optional item list to `buildProjectMessage` for the multi-item header line.

**Tech Stack:** TypeScript, libsql/Turso (SQLite-compatible), Vitest, Discord interactions via `discordApi.*`, esbuild bundle at `api/discord.mjs`.

---

## File Map

| File | Change |
|---|---|
| `src/bot/craftStore.ts` | Add `project_items` table migration + 3 new interface methods + implementations |
| `src/bot/craftStore.test.ts` | Tests for 3 new store methods |
| `src/bot/craftRender.ts` | Add optional `projectItems?` param to `buildProjectMessage` |
| `src/bot/craftStrings.ts` | Add 2 new strings: `ITEM_ADDED` reply, `EMPTY_PROJECT_CREATED` reply |
| `src/bot/craftCommands.ts` | Update `handleCraftNew` (item optional) + add `handleCraftAddItem` |
| `src/api/discord.ts` | Wire `/craft add-item` subcommand dispatch + update `handleCraftNew` call |
| `scripts/register-commands.ts` | Make `item`/`qty` optional in `new`; add `add-item` subcommand |
| `api/discord.mjs` | Rebuilt by `npm run build:api` — must be committed |

---

### Task 1: Store — `project_items` table + 3 new methods

**Files:**
- Modify: `src/bot/craftStore.ts`
- Modify: `src/bot/craftStore.test.ts`

**Context:** The store uses libsql (SQLite). Schema migrations use `ALTER TABLE … ADD COLUMN` wrapped in try/catch. New tables go in the SCHEMA string and are safe to re-run with `CREATE TABLE IF NOT EXISTS`. The `CraftTask` type is `{ itemId, itemName, qtyNeeded, source, meta }` (from `src/bot/craftTypes.ts`). `CraftStore` is an interface + factory function in the same file.

- [ ] **Step 1: Write failing tests for the 3 new methods**

Add to the bottom of `src/bot/craftStore.test.ts`:

```typescript
  it('addProjectItem stores a row and getProjectItems returns it', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Set', targetItemId: 0, targetQty: 0, createdBy: 'u1',
    });
    await store.addProjectItem(pid, 42, 'Iron Helm', 1);
    await store.addProjectItem(pid, 43, 'Iron Body', 2);
    const items = await store.getProjectItems(pid);
    expect(items).toHaveLength(2);
    expect(items[0].itemName).toBe('Iron Helm');
    expect(items[1].qty).toBe(2);
  });

  it('replaceTasks wipes old tasks and inserts new ones atomically', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'P', targetItemId: 0, targetQty: 0, createdBy: 'u1',
    });
    // Seed some tasks first
    await store.addTasks(pid, [
      { itemId: 10, itemName: 'Old Task', qtyNeeded: 99, source: 'gather', meta: {} },
    ]);
    // Replace entirely
    await store.replaceTasks(pid, [
      { itemId: 20, itemName: 'Iron Ore', qtyNeeded: 5, source: 'gather', meta: {} },
      { itemId: 21, itemName: 'Iron Ingot', qtyNeeded: 2, source: 'craft', meta: { job: 'BSM' } },
    ]);
    const tasks = await store.getTasks(pid);
    expect(tasks).toHaveLength(2);
    expect(tasks.find(t => t.itemName === 'Old Task')).toBeUndefined();
    expect(tasks.find(t => t.itemName === 'Iron Ore')).toBeDefined();
  });

  it('getProjectItems returns empty array for project with no items', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'P', targetItemId: 0, targetQty: 0, createdBy: 'u1',
    });
    const items = await store.getProjectItems(pid);
    expect(items).toHaveLength(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/bot/craftStore.test.ts
```

Expected: 3 new tests fail with errors like `store.addProjectItem is not a function`.

- [ ] **Step 3: Add the `project_items` table to the SCHEMA string**

In `src/bot/craftStore.ts`, inside the `SCHEMA` template literal (after the `channel_state` table), add:

```sql

    CREATE TABLE IF NOT EXISTS project_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      item_id    INTEGER NOT NULL,
      item_name  TEXT NOT NULL,
      qty        INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
```

- [ ] **Step 4: Add 3 method signatures to the `CraftStore` interface**

In `src/bot/craftStore.ts`, add after the `closeProject` signature:

```typescript
  addProjectItem(projectId: number, itemId: number, itemName: string, qty: number): Promise<void>;
  getProjectItems(projectId: number): Promise<Array<{ id: number; itemId: number; itemName: string; qty: number }>>;
  replaceTasks(projectId: number, tasks: CraftTask[]): Promise<void>;
```

- [ ] **Step 5: Implement the 3 methods in the returned object**

In `src/bot/craftStore.ts`, add after `closeProject` implementation:

```typescript
    async addProjectItem(projectId, itemId, itemName, qty) {
      const createdAt = Date.now();
      await client.execute({
        sql: `INSERT INTO project_items (project_id, item_id, item_name, qty, created_at) VALUES (?, ?, ?, ?, ?)`,
        args: [projectId, itemId, itemName, qty, createdAt],
      });
    },

    async getProjectItems(projectId) {
      const result = await client.execute({
        sql: 'SELECT * FROM project_items WHERE project_id = ? ORDER BY created_at ASC',
        args: [projectId],
      });
      return result.rows.map((row) => ({
        id: Number(row.id),
        itemId: Number(row.item_id),
        itemName: String(row.item_name),
        qty: Number(row.qty),
      }));
    },

    async replaceTasks(projectId, tasks) {
      await client.execute({
        sql: 'DELETE FROM tasks WHERE project_id = ?',
        args: [projectId],
      });
      const now = Date.now();
      for (const t of tasks) {
        await client.execute({
          sql: `INSERT INTO tasks (project_id, item_id, item_name, qty_needed, source, meta, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            projectId,
            t.itemId,
            t.itemName,
            t.qtyNeeded,
            t.source,
            t.meta ? JSON.stringify(t.meta) : null,
            now,
          ],
        });
      }
    },
```

- [ ] **Step 6: Run tests to verify they pass**

```
npx vitest run src/bot/craftStore.test.ts
```

Expected: All tests pass (old + 3 new).

- [ ] **Step 7: Commit**

```bash
git add src/bot/craftStore.ts src/bot/craftStore.test.ts
git commit -m "feat(store): add project_items table + addProjectItem/getProjectItems/replaceTasks"
```

---

### Task 2: Render — optional `projectItems` header in `buildProjectMessage`

**Files:**
- Modify: `src/bot/craftRender.ts`

**Context:** `buildProjectMessage` is at line 155. Its signature is `(project: CraftProject, tasks: StoredTask[])`. The spec says: when `projectItems` has 2+ rows, prepend a summary line to the description. Format: `` Items: Ironworks Helm ×1 · Ironworks Body ×1 ``. When undefined or length ≤ 1, render unchanged. There are no existing tests for `buildProjectMessage`, so a brief test is appropriate here.

- [ ] **Step 1: Create a test file for craftRender**

Create `src/bot/craftRender.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildProjectMessage } from './craftRender';
import type { CraftProject, StoredTask } from './craftTypes';

function fakeProject(overrides: Partial<CraftProject> = {}): CraftProject {
  return {
    id: 1,
    guildId: 'g1',
    channelId: 'c1',
    messageId: null,
    name: 'Test Set',
    targetItemId: 0,
    targetQty: 0,
    createdBy: 'u1',
    threadId: null,
    status: 'open',
    createdAt: 1_700_000_000_000,
    displayPartKey: null,
    displayPhaseIndex: null,
    ...overrides,
  };
}

function fakeTask(overrides: Partial<StoredTask> = {}): StoredTask {
  return {
    id: 1,
    projectId: 1,
    itemId: 10,
    itemName: 'Iron Ore',
    qtyNeeded: 5,
    qtyDone: 0,
    source: 'gather',
    meta: null,
    assigneeId: null,
    status: 'open',
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('buildProjectMessage', () => {
  it('renders without item summary when projectItems is undefined', () => {
    const project = fakeProject();
    const tasks = [fakeTask()];
    const { embeds } = buildProjectMessage(project, tasks);
    const desc = (embeds[0] as any).description as string;
    expect(desc).not.toContain('Items:');
  });

  it('renders without item summary when projectItems has only 1 entry', () => {
    const project = fakeProject();
    const tasks = [fakeTask()];
    const { embeds } = buildProjectMessage(project, tasks, [{ itemName: 'Iron Helm', qty: 1 }]);
    const desc = (embeds[0] as any).description as string;
    expect(desc).not.toContain('Items:');
  });

  it('prepends item summary line when projectItems has 2+ entries', () => {
    const project = fakeProject();
    const tasks = [fakeTask()];
    const projectItems = [
      { itemName: 'Iron Helm', qty: 1 },
      { itemName: 'Iron Body', qty: 1 },
    ];
    const { embeds } = buildProjectMessage(project, tasks, projectItems);
    const desc = (embeds[0] as any).description as string;
    expect(desc).toContain('Items:');
    expect(desc).toContain('Iron Helm ×1');
    expect(desc).toContain('Iron Body ×1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/bot/craftRender.test.ts
```

Expected: 2 tests pass (undefined/single-item return no summary) but 1 fails (summary not rendered yet).

- [ ] **Step 3: Update `buildProjectMessage` signature and description logic**

In `src/bot/craftRender.ts`, change the function signature at line 155–158 from:

```typescript
export function buildProjectMessage(
  project: CraftProject,
  tasks: StoredTask[],
): { embeds: object[]; components: object[] } {
```

to:

```typescript
export function buildProjectMessage(
  project: CraftProject,
  tasks: StoredTask[],
  projectItems?: Array<{ itemName: string; qty: number }>,
): { embeds: object[]; components: object[] } {
```

Then, immediately after the `let description = '';` declaration (around line 183), add the multi-item header:

```typescript
  // Multi-item summary header (only when 2+ distinct items)
  if (projectItems && projectItems.length >= 2) {
    const summary = projectItems.map((pi) => `${pi.itemName} ×${pi.qty}`).join(' · ');
    description += `**Items:** ${summary}\n`;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/bot/craftRender.test.ts
```

Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/bot/craftRender.ts src/bot/craftRender.test.ts
git commit -m "feat(render): optional projectItems header in buildProjectMessage"
```

---

### Task 3: Strings — add 2 new copy strings

**Files:**
- Modify: `src/bot/craftStrings.ts`

**Context:** All user-facing Spanish copy lives here. New strings are needed for: (a) the ephemeral reply when an empty project is created via `/craft new` without item, and (b) the ephemeral reply when `/craft add-item` succeeds. Both must use Qiqirn voice (Spanish, third-person, repeated words).

- [ ] **Step 1: Add two new exported strings**

At the end of `src/bot/craftStrings.ts`, append:

```typescript
// ── Multi-item projects ──
export const EMPTY_PROJECT_CREATED = (id: number) =>
  `✨ ¡Proyecto #${id} creado creado! Añade piezas con \`/craft add-item id:${id}\`.`;
export const ITEM_ADDED = (itemName: string, taskCount: number) =>
  `✅ ¡${itemName} añadido añadido! El proyecto ahora tiene ${taskCount} tareas.`;
export const ADD_ITEM_PROJECT_CLOSED = 'Ese proyecto ya está cerrado cerrado 🐀';
export const ADD_ITEM_WRONG_GUILD = 'Ese proyecto no es de aquí.';
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/bot/craftStrings.ts
git commit -m "feat(strings): add EMPTY_PROJECT_CREATED, ITEM_ADDED, and error strings for multi-craft"
```

---

### Task 4: Commands — `handleCraftNew` optional item + `handleCraftAddItem`

**Files:**
- Modify: `src/bot/craftCommands.ts`

**Context:** `handleCraftNew` currently requires `item: string` and uses it to do a `searchItems` lookup. The spec says: when `item` is provided, everything works exactly as today. When `item` is omitted (empty string / null), skip the breakdown entirely, create the project with `targetItemId=0, targetQty=0`, and return the `EMPTY_PROJECT_CREATED` ephemeral reply — no announcement posted yet.

`handleCraftAddItem` must: resolve item name → `searchItems`; load + validate project; `store.addProjectItem`; load all `project_items`; for each item call `explode` + `buildBreakdown`; merge tasks by `(itemId, source)` summing `qtyNeeded`; `store.replaceTasks`; if `project.messageId` is null → post announcement + create thread (reuse the existing posting logic from `handleCraftNew`); else → edit existing message; `refreshBoard`; return ephemeral `ITEM_ADDED` reply.

Merge rule: `Map<string, CraftTask>` keyed by `${itemId}:${source}`. For duplicates, sum `qtyNeeded`, keep first occurrence's `meta`.

`refreshBoard` is an unexported function in the same file — `handleCraftAddItem` will live in the same file so it can call `refreshBoard` directly.

- [ ] **Step 1: Update `handleCraftNew` signature to accept optional item**

In `src/bot/craftCommands.ts`, change the `opts` parameter type at line 47:

```typescript
export async function handleCraftNew(
  opts: { item?: string | null; qty?: number; name?: string | null; intermediates?: boolean; pingRole?: string | null },
  guildId: string,
  channelId: string,
  userId: string,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
```

- [ ] **Step 2: Add the empty-project early-return at the top of `handleCraftNew`**

After the function signature, before the existing `searchItems` call, add:

```typescript
  // Empty project flow: item omitted → create placeholder, no announcement
  if (!opts.item) {
    if (!opts.name) {
      return { content: 'Necesitas un nombre para el proyecto si no especificas un objeto.', flags: 64 };
    }
    const targetChannelId = deps.craftChannelId ?? channelId;
    const projectId = await deps.store.createProject({
      guildId,
      channelId: targetChannelId,
      name: opts.name,
      targetItemId: 0,
      targetQty: 0,
      createdBy: userId,
      displayPartKey: null,
      displayPhaseIndex: null,
    });
    await refreshBoard(deps, guildId);
    return { content: S.EMPTY_PROJECT_CREATED(projectId), flags: 64 };
  }
```

- [ ] **Step 3: Fix qty default for the existing single-item flow**

The existing code uses `opts.qty` directly. Add a default at the start of the existing flow:

```typescript
  const qty = opts.qty ?? 1;
```

Then replace every `opts.qty` reference in the rest of the function with `qty`.

Concretely in `handleCraftNew`, after the empty-project block, the existing code reads:

```typescript
  const matches = searchItems(deps.nameIndex, opts.item, 1);
```

Change to:

```typescript
  const qty = opts.qty ?? 1;
  const matches = searchItems(deps.nameIndex, opts.item, 1);
```

And replace `opts.qty` with `qty` throughout the rest of the function (appears in: `projectName` default, `explode` call, `buildBreakdown` call, `createProject` call, console.log).

- [ ] **Step 4: Add `handleCraftAddItem` export**

At the end of `src/bot/craftCommands.ts` (before the `refreshBoard` function), add:

```typescript
/**
 * Handle /craft add-item — add an item to a multi-craft project and rebuild tasks
 */
export async function handleCraftAddItem(
  opts: { id: number; item: string; qty: number },
  guildId: string,
  channelId: string,
  userId: string,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
  // Resolve item
  const matches = searchItems(deps.nameIndex, opts.item, 1);
  if (matches.length === 0) {
    return { content: S.ITEM_NOT_FOUND(opts.item), flags: 64 };
  }
  const itemId = matches[0].id;
  const itemName = matches[0].name;

  // Validate project
  const project = await deps.store.getProject(opts.id);
  if (!project || project.guildId !== guildId) {
    return { content: S.PROJECT_NOT_FOUND(opts.id), flags: 64 };
  }
  if (project.status !== 'open') {
    return { content: S.ADD_ITEM_PROJECT_CLOSED, flags: 64 };
  }

  // Persist item
  await deps.store.addProjectItem(opts.id, itemId, itemName, opts.qty);

  // Load all items for this project and rebuild merged task list
  const allProjectItems = await deps.store.getProjectItems(opts.id);
  const { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft } = deps.snapshots;
  const market = deps.marketBundle;

  const mergeMap = new Map<string, CraftTask>();
  for (const pi of allProjectItems) {
    const breakdown = buildBreakdown(
      pi.itemId,
      pi.qty,
      market,
      { recipes, namesById, vendorMap, specialShop, gatheringCatalog, companyCraft },
      { craftIntermediates: true },
    );
    const allTasks = [...breakdown.crafts, ...breakdown.acquire];
    for (const t of allTasks) {
      const key = `${t.itemId}:${t.source}`;
      const existing = mergeMap.get(key);
      if (existing) {
        existing.qtyNeeded += t.qtyNeeded;
      } else {
        mergeMap.set(key, { ...t });
      }
    }
  }

  const mergedTasks = [...mergeMap.values()];
  if (mergedTasks.length === 0) {
    return { content: S.NO_RECIPE(itemName), flags: 64 };
  }

  await deps.store.replaceTasks(opts.id, mergedTasks);

  // Reload project + tasks after replaceTasks
  const updatedProject = await deps.store.getProject(opts.id);
  const storedTasks = await deps.store.getTasks(opts.id);
  const projectItems = allProjectItems.map((pi) => ({ itemName: pi.itemName, qty: pi.qty }));
  const { embeds, components } = buildProjectMessage(updatedProject!, storedTasks, projectItems);

  const targetChannelId = deps.craftChannelId ?? channelId;
  const roleId = deps.crafterRoleId;

  if (!project.messageId) {
    // First item added — post the announcement
    let content = '';
    if (roleId) content = `<@&${roleId}> `;
    content += S.NEW_PROJECT_CONTENT(opts.id);

    const announcementMsg = await discordApi.sendToChannel(deps.botToken, targetChannelId, {
      content,
      embeds,
      components,
      allowed_mentions: roleId ? { roles: [roleId] } : undefined,
    });

    if (!announcementMsg) {
      return { content: S.CHANNEL_NOT_FOUND, flags: 64 };
    }

    const messageId = String(announcementMsg.id);
    await deps.store.setProjectMessageId(opts.id, messageId);

    try {
      const projectName = updatedProject!.name;
      const thread = await discordApi.createThread(deps.botToken, targetChannelId, messageId, projectName.slice(0, 100));
      if (thread) {
        const threadId = String(thread.id);
        await deps.store.setProjectThreadId(opts.id, threadId);
        const threadMsg = S.THREAD_PROJECT_CREATED(userId, storedTasks.length);
        await discordApi.sendToChannel(deps.botToken, threadId, { content: threadMsg });
      }
    } catch (e) {
      console.error('[craft] failed to create thread:', e instanceof Error ? e.message : e);
    }
  } else {
    // Subsequent items — edit existing announcement
    try {
      await discordApi.editMessage(deps.botToken, project.channelId, project.messageId, { embeds, components });
    } catch (e) {
      console.error('[craft] failed to edit announcement:', e instanceof Error ? e.message : e);
    }
  }

  await refreshBoard(deps, guildId);

  console.log(`[craft] project #${opts.id} — item "${itemName}" added, ${storedTasks.length} merged tasks`);
  return { content: S.ITEM_ADDED(itemName, storedTasks.length), flags: 64 };
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/bot/craftCommands.ts
git commit -m "feat(commands): handleCraftNew optional item + handleCraftAddItem"
```

---

### Task 5: Discord handler — wire `/craft add-item` dispatch + update `handleCraftNew` call

**Files:**
- Modify: `src/api/discord.ts`

**Context:** The `/craft` subcommand dispatch is inside a `waitUntil` callback at around line 236. Each subcommand is an `else if (subcommand === '...')` block. `handleCraftNew` is called at line 244. Its call signature must be updated to match the new optional `item`/`qty`.

- [ ] **Step 1: Update the `handleCraftNew` call to pass item as potentially empty**

Find the existing block starting with `if (subcommand === 'new')` (around line 236–250). Currently:

```typescript
              const item = subOptions.find((o) => o.name === 'item')?.value ?? '';
              const qty = parseInt(subOptions.find((o) => o.name === 'qty')?.value ?? '1', 10);
```

Change to:

```typescript
              const item = subOptions.find((o) => o.name === 'item')?.value ?? null;
              const qty = parseInt(String(subOptions.find((o) => o.name === 'qty')?.value ?? '1'), 10);
```

(The `item` is now `null` when omitted, matching the new `opts.item?: string | null` signature.)

- [ ] **Step 2: Add the `add-item` dispatch block**

After the `else if (subcommand === 'close')` block and before the `else if (subcommand === 'setup')` block, insert:

```typescript
            } else if (subcommand === 'add-item') {
              const projectId = parseInt(String(subOptions.find((o: any) => o.name === 'id')?.value ?? '0'), 10);
              const item = String(subOptions.find((o: any) => o.name === 'item')?.value ?? '');
              const qty = parseInt(String(subOptions.find((o: any) => o.name === 'qty')?.value ?? '1'), 10);
              response = await handleCraftAddItem(
                { id: projectId, item, qty },
                guildId,
                channelId,
                userId,
                deps,
              );
```

- [ ] **Step 3: Add `handleCraftAddItem` to the import from `craftCommands`**

Near the top of `src/api/discord.ts`, find:

```typescript
import { buildBreakdown } from './craftSourcing';
import { buildProjectMessage, buildBoardMessage, buildRequestPrompt } from './craftRender';
import { explode } from './craftExplode';
import * as discordApi from './discordApi';
import * as S from './craftStrings';
```

Wait — that import is actually in `craftCommands.ts`. In `src/api/discord.ts`, find the import line:

```typescript
import { handleCraftNew, handleCraftList, handleCraftClaim, handleCraftShow, handleCraftClose, handleCraftSetup } from '../bot/craftCommands';
```

Change to:

```typescript
import { handleCraftNew, handleCraftList, handleCraftClaim, handleCraftShow, handleCraftClose, handleCraftSetup, handleCraftAddItem } from '../bot/craftCommands';
```

- [ ] **Step 4: Update the ephemeral-deferred flag logic**

`/craft add-item` should also be ephemeral. The existing check:

```typescript
    const isEphemeral = cmdName === 'craft' && subName !== 'show';
```

already handles this correctly (any craft subcommand except `show` is ephemeral) — no change needed here.

- [ ] **Step 5: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/api/discord.ts
git commit -m "feat(discord): wire /craft add-item dispatch"
```

---

### Task 6: Command registration — update `scripts/register-commands.ts`

**Files:**
- Modify: `scripts/register-commands.ts`

**Context:** Discord command definitions are PUT globally via this script. `item` and `qty` in `/craft new` must become `required: false`. A new `add-item` subcommand must be added. The existing `required: true` on `qty` means Discord will force users to fill it in — we want it optional for the empty-project flow.

- [ ] **Step 1: Make `item` and `qty` optional in `/craft new`**

In `scripts/register-commands.ts`, find the `new` subcommand options and change:

```typescript
          { type: 3, name: 'item', description: 'Item a craftear', required: true, autocomplete: true },
          { type: 4, name: 'qty', description: 'Cantidad', required: true, min_value: 1 },
          { type: 3, name: 'name', description: 'Nombre del proyecto', required: false },
```

to:

```typescript
          { type: 3, name: 'item', description: 'Item a craftear (opcional para proyectos multi-pieza)', required: false, autocomplete: true },
          { type: 4, name: 'qty', description: 'Cantidad', required: false, min_value: 1 },
          { type: 3, name: 'name', description: 'Nombre del proyecto (requerido si no hay item)', required: false },
```

- [ ] **Step 2: Add the `add-item` subcommand**

After the `close` subcommand entry:

```typescript
      { type: 1, name: 'close', description: 'Cerrar proyecto', options: [{ type: 4, name: 'id', description: 'ID del proyecto', required: true }] },
```

Add:

```typescript
      {
        type: 1, name: 'add-item', description: 'Añadir objeto a un proyecto multi-pieza',
        options: [
          { type: 4, name: 'id', description: 'ID del proyecto', required: true },
          { type: 3, name: 'item', description: 'Objeto a añadir', required: true, autocomplete: true },
          { type: 4, name: 'qty', description: 'Cantidad', required: false, min_value: 1 },
        ],
      },
```

- [ ] **Step 3: Re-register commands**

```
npx tsx --env-file=.env scripts/register-commands.ts
```

Expected: `Registered 3 commands globally.`

- [ ] **Step 4: Commit**

```bash
git add scripts/register-commands.ts
git commit -m "feat(register): add-item subcommand + optional item/qty in /craft new"
```

---

### Task 7: Rebuild bundle + integration smoke test

**Files:**
- Modify: `api/discord.mjs` (rebuilt artifact)

**Context:** The deployed code is the esbuild bundle at `api/discord.mjs`. Source changes in `src/api/discord.ts` and `src/bot/*.ts` only take effect after a rebuild. Always rebuild + commit the bundle.

- [ ] **Step 1: Run all tests**

```
npx vitest run
```

Expected: All tests pass (no regressions).

- [ ] **Step 2: Rebuild the bundle**

```
npm run build:api
```

Expected: Completes with no errors. `api/discord.mjs` is updated.

- [ ] **Step 3: Verify the bundle contains the new dispatch**

```
grep -c "add-item" api/discord.mjs
```

Expected: Count > 0.

- [ ] **Step 4: Verify the bundle contains the new store methods**

```
grep -c "addProjectItem\|replaceTasks\|getProjectItems" api/discord.mjs
```

Expected: Count > 0.

- [ ] **Step 5: Commit**

```bash
git add api/discord.mjs
git commit -m "build: rebuild bundle for multi-craft projects feature"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `project_items` table (additive migration) | Task 1 |
| `addProjectItem` store method | Task 1 |
| `getProjectItems` store method | Task 1 |
| `replaceTasks` store method | Task 1 |
| `buildProjectMessage` optional `projectItems?` param | Task 2 |
| Items summary line (2+ items) | Task 2 |
| `EMPTY_PROJECT_CREATED` Qiqirn reply | Task 3 |
| `ITEM_ADDED` Qiqirn reply | Task 3 |
| Error strings for closed/wrong-guild | Task 3 |
| `/craft new` item optional + empty-project flow | Task 4 |
| `handleCraftAddItem` — resolve + validate + merge + post/edit | Task 4 |
| Merge rule: `(itemId, source)` key, sum `qtyNeeded` | Task 4 |
| First item posts announcement + thread | Task 4 |
| Subsequent items edit existing announcement | Task 4 |
| `refreshBoard` after add-item | Task 4 |
| Wire `add-item` in `discord.ts` dispatch | Task 5 |
| Update `handleCraftNew` call (null item) | Task 5 |
| Import `handleCraftAddItem` | Task 5 |
| `item`/`qty` → `required: false` in registration | Task 6 |
| `add-item` subcommand registered | Task 6 |
| Bundle rebuilt | Task 7 |

**Error cases from spec:**

| Error case | Covered |
|---|---|
| `/craft new` no item AND no name | Task 4 (early-return with error message) |
| `/craft add-item` on closed project | Task 4 (`ADD_ITEM_PROJECT_CLOSED`) |
| `/craft add-item` on wrong guild | Task 4 (`ADD_ITEM_WRONG_GUILD`) |
| Item not found | Task 4 (`S.ITEM_NOT_FOUND`) |
| No recipe found | Task 4 (`S.NO_RECIPE`) |

**Type consistency check:** `handleCraftAddItem` in Task 4 uses `CraftTask` (imported already at top of `craftCommands.ts`) and calls `buildProjectMessage` with 3 args matching the updated signature from Task 2. `S.EMPTY_PROJECT_CREATED`, `S.ITEM_ADDED`, `S.ADD_ITEM_PROJECT_CLOSED`, `S.ADD_ITEM_WRONG_GUILD` are all defined in Task 3.

**Out-of-scope items (deferred per spec):**
- `/craft remove-item`
- Per-item task attribution in embed
- Web `/projects` mirror (auto-reflects DB, no code change needed)

All clean. No placeholders, no TODOs, no type mismatches.
