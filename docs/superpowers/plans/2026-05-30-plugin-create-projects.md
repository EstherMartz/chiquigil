# Plugin-Created Projects + Refresh 401 Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Dalamud plugin guild-authenticated endpoints to list **and create** crafting projects, fixing the Refresh 401 regression and enabling project creation (with full Discord sync) from in-game.

**Architecture:** Extract shared project-read logic into `src/api/_projects-core.ts`, consumed by both the session-gated `/api/projects` (web) and a new guild-gated `/api/plugin/projects` (plugin: GET list/detail + POST create). The create path reuses the bot's `handleCraftNew`, which already does explode → persist → post embed/thread/buttons. Two small additions make it reusable: resolve by `itemId`, and return `projectId`/`taskCount`. Creator rendering is made mention-safe so a character name doesn't produce a broken `<@…>`. The plugin's `ApiClient` is repointed and gains `CreateProjectAsync`; the Projects tab gets a "New Project" form.

**Tech Stack:** TypeScript Vercel functions (`@vercel/node`), Vitest, libSQL/Turso (`@libsql/client`), esbuild bundling to `api/*.mjs`; C# Dalamud plugin (ImGui, `System.Net.Http`, `System.Text.Json`).

**Repos:**
- Backend: `C:\Users\esthe\Documents\Dev\ffxiv-helper` (branch `feature/plugin-create-projects`)
- Plugin: `C:\Users\esthe\Documents\Dev\qiqirn-companion`

> ⚠️ The plugin's `.cs` files are **UTF-16 encoded**. Standard grep treats them as binary. Use the Read/Edit tools (which decode correctly), and when writing C# preserve the existing encoding.

---

## File Structure

**Backend (`ffxiv-helper`):**
- Create: `src/api/_projects-core.ts` — shared list/detail builders + allow-list/name-resolution helpers.
- Create: `src/api/_projects-core.test.ts` — unit tests for the core helpers.
- Modify: `src/api/projects.ts` — thin session-gated wrapper over the core.
- Create: `src/api/plugin-projects.ts` — guild-gated GET list/detail + POST create.
- Create: `src/api/plugin-projects.test.ts` — endpoint tests.
- Modify: `src/bot/craftStrings.ts` — add `mentionOrName`; use it in `THREAD_PROJECT_CREATED`.
- Modify: `src/bot/craftRender.ts` — use `mentionOrName` for the board requester line.
- Create: `src/bot/craftStrings.test.ts` — `mentionOrName` unit test.
- Modify: `src/bot/craftCommands.ts` — `handleCraftNew` accepts `itemId`, returns `projectId`/`taskCount`.
- Modify: `vercel.json` — rewrites + function config for `plugin-projects`.
- Modify: `package.json` — add `src/api/plugin-projects.ts` to the `build:api` esbuild entry list.

**Plugin (`qiqirn-companion`):**
- Modify: `Services/ApiClient.cs` — repoint project reads; add `CreateProjectAsync` + `CreateProjectResult`.
- Modify: `Windows/MainWindow.cs` — "New Project" form in the Projects tab.

---

## Task 1: Extract shared project-read core

**Files:**
- Create: `src/api/_projects-core.ts`
- Create: `src/api/_projects-core.test.ts`
- Modify: `src/api/projects.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/_projects-core.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { listProjectSummaries, getProjectDetail, isAllowed } from './_projects-core';

let store: CraftStore;

async function seed(s: CraftStore, guildId = 'G1') {
  const id = await s.createProject({
    guildId, channelId: 'C1', name: 'Test', targetItemId: 42, targetQty: 3, createdBy: 'U1',
  });
  await s.addTasks(id, [
    { itemId: 10, itemName: 'Iron Ore', qtyNeeded: 5, source: 'gather', meta: {} },
    { itemId: 20, itemName: 'Iron Ingot', qtyNeeded: 2, source: 'craft', meta: { job: 'BSM' } },
    { itemId: 99, itemName: 'Tatanora Hull', qtyNeeded: 1, source: 'workshop', meta: {} },
  ]);
  return id;
}

beforeEach(async () => {
  store = await openCraftStore(':memory:');
  process.env.GUILD_ALLOWLIST = 'G1';
  delete process.env.DISCORD_BOT_TOKEN; // skip Discord name lookups
});

describe('isAllowed', () => {
  it('honors the allow-list', () => {
    expect(isAllowed('G1')).toBe(true);
    expect(isAllowed('OTHER')).toBe(false);
  });
});

describe('listProjectSummaries', () => {
  it('returns summaries with task counts', async () => {
    await seed(store);
    const { projects } = await listProjectSummaries(store, 'G1', 'open');
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ name: 'Test', targetItemId: 42, targetQty: 3, status: 'open' });
    expect(projects[0].taskCounts.bySource.workshop).toBe(1);
  });

  it('returns nothing for status=closed', async () => {
    await seed(store);
    const { projects } = await listProjectSummaries(store, 'G1', 'closed');
    expect(projects).toHaveLength(0);
  });
});

describe('getProjectDetail', () => {
  it('returns project + tasks for an allowed guild', async () => {
    const id = await seed(store);
    const detail = await getProjectDetail(store, id);
    expect(detail).not.toBeNull();
    expect(detail!.project.id).toBe(id);
    expect(detail!.tasks).toHaveLength(3);
  });

  it('returns null for a disallowed guild', async () => {
    const id = await seed(store, 'OTHER');
    const detail = await getProjectDetail(store, id);
    expect(detail).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    expect(await getProjectDetail(store, 999999)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/_projects-core.test.ts`
Expected: FAIL — cannot find module `./_projects-core`.

- [ ] **Step 3: Create the core module**

Create `src/api/_projects-core.ts` (this is the existing logic from `projects.ts`, lifted verbatim and exported):

```typescript
import type { CraftStore } from '../bot/craftStore';
import type { StoredTask, TaskSource } from '../bot/craftTypes';

export function getAllowList(): string[] {
  return (process.env.GUILD_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAllowed(guildId: string): boolean {
  const list = getAllowList();
  return list.length > 0 && list.includes(guildId);
}

export function computeTaskCounts(tasks: StoredTask[]) {
  const byStatus = { open: 0, claimed: 0, done: 0 };
  const bySource: Record<TaskSource, number> = {
    craft: 0, workshop: 0, market: 0, vendor: 0, currency: 0, gather: 0,
  };
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    bySource[t.source] = (bySource[t.source] ?? 0) + 1;
  }
  return { byStatus, bySource };
}

// User-name resolution. Cached per function instance.
const nameCache = new Map<string, string>();

async function fetchDisplayName(guildId: string, userId: string, botToken: string): Promise<string> {
  const cacheKey = `${guildId}:${userId}`;
  const cached = nameCache.get(cacheKey);
  if (cached) return cached;

  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (r.ok) {
      const m = (await r.json()) as { nick?: string | null; user?: { global_name?: string | null; username?: string | null } };
      const name = m.nick ?? m.user?.global_name ?? m.user?.username ?? userId;
      nameCache.set(cacheKey, name);
      return name;
    }
  } catch {
    // fall through to /users
  }

  try {
    const r = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (r.ok) {
      const u = (await r.json()) as { global_name?: string | null; username?: string | null };
      const name = u.global_name ?? u.username ?? userId;
      nameCache.set(cacheKey, name);
      return name;
    }
  } catch {
    // give up
  }

  nameCache.set(cacheKey, userId);
  return userId;
}

export async function resolveNames(guildId: string, userIds: Iterable<string>): Promise<Record<string, string>> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!token || unique.length === 0) return Object.fromEntries(unique.map((id) => [id, id]));
  const entries = await Promise.all(unique.map(async (id) => [id, await fetchDisplayName(guildId, id, token)] as const));
  return Object.fromEntries(entries);
}

export async function listProjectSummaries(store: CraftStore, guildId: string, statusFilter: string) {
  let projects = await store.listOpenProjects(guildId);
  if (statusFilter === 'closed') projects = [];

  const userIdSet = new Set<string>();
  const summaries = await Promise.all(projects.map(async (p) => {
    const tasks = await store.getTasks(p.id);
    userIdSet.add(p.createdBy);
    for (const t of tasks) if (t.assigneeId) userIdSet.add(t.assigneeId);
    return {
      id: p.id,
      name: p.name,
      targetItemId: p.targetItemId,
      targetQty: p.targetQty,
      createdBy: p.createdBy,
      threadId: p.threadId,
      status: p.status,
      createdAt: p.createdAt,
      taskCounts: computeTaskCounts(tasks),
    };
  }));
  const userNames = await resolveNames(guildId, userIdSet);
  return { projects: summaries, userNames };
}

/** Returns the detail payload, or null when the project doesn't exist or isn't allow-listed. */
export async function getProjectDetail(store: CraftStore, id: number) {
  const project = await store.getProject(id);
  if (!project || !isAllowed(project.guildId)) return null;

  const [tasks, rawProjectItems] = await Promise.all([
    store.getTasks(id),
    store.getProjectItems(id),
  ]);
  const userIds = [project.createdBy, ...tasks.map((t) => t.assigneeId).filter((x): x is string => x != null)];
  const userNames = await resolveNames(project.guildId, userIds);
  const projectItems = rawProjectItems.map(({ itemName, qty }) => ({ itemName, qty }));
  return {
    project: {
      id: project.id,
      name: project.name,
      targetItemId: project.targetItemId,
      targetQty: project.targetQty,
      createdBy: project.createdBy,
      threadId: project.threadId,
      status: project.status,
      createdAt: project.createdAt,
    },
    tasks,
    userNames,
    projectItems,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/_projects-core.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Refactor `projects.ts` to use the core**

Replace the body of `src/api/projects.ts` with this (keeps the session gate; delegates to the core):

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { requireSession } from './_auth';
import { isAllowed, listProjectSummaries, getProjectDetail } from './_projects-core';

let storePromise: Promise<CraftStore> | null = null;
function getStore(): Promise<CraftStore> {
  const injected = (globalThis as any).__testCraftStore as CraftStore | undefined;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  res.setHeader('Cache-Control', 'no-store');

  const url = req.url ?? '';
  const detailMatch = /\/api\/projects\/(\d+)/.exec(url);
  const store = await getStore();

  if (detailMatch) {
    const detail = await getProjectDetail(store, Number(detailMatch[1]));
    if (!detail) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(detail);
  }

  const guildId = (req.query?.guild as string | undefined) ?? '';
  if (!guildId) return res.status(400).json({ error: 'Missing guild query param' });
  if (!isAllowed(guildId)) return res.status(403).json({ error: 'Guild not in allow-list' });

  const statusFilter = (req.query?.status as string | undefined) ?? 'open';
  const payload = await listProjectSummaries(store, guildId, statusFilter);
  return res.status(200).json(payload);
}

export const config = { api: { bodyParser: false } };
```

- [ ] **Step 6: Run the existing projects tests to verify no regression**

Run: `npx vitest run src/api/projects.test.ts`
Expected: PASS (all existing cases — list, detail, 401/403/404 gate).

- [ ] **Step 7: Commit**

```bash
git add src/api/_projects-core.ts src/api/_projects-core.test.ts src/api/projects.ts
git commit -m "refactor: extract shared project-read core from projects.ts"
```

---

## Task 2: Mention-safe creator rendering

**Files:**
- Modify: `src/bot/craftStrings.ts`
- Modify: `src/bot/craftRender.ts`
- Create: `src/bot/craftStrings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/bot/craftStrings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mentionOrName } from './craftStrings';

describe('mentionOrName', () => {
  it('renders a Discord mention for a snowflake id', () => {
    expect(mentionOrName('123456789012345678')).toBe('<@123456789012345678>');
  });

  it('renders the literal text for a character name', () => {
    expect(mentionOrName('Esther Martz')).toBe('Esther Martz');
  });

  it('treats too-short numeric strings as plain text', () => {
    expect(mentionOrName('42')).toBe('42');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bot/craftStrings.test.ts`
Expected: FAIL — `mentionOrName` is not exported.

- [ ] **Step 3: Add `mentionOrName` to `craftStrings.ts`**

Add near the top of `src/bot/craftStrings.ts` (after any imports, before the existing exports):

```typescript
/** Discord snowflakes are 17–20 digit numeric strings. Plugin-created projects
 *  store a character name instead — render that as plain text, not a broken mention. */
export function mentionOrName(value: string): string {
  return /^\d{17,20}$/.test(value) ? `<@${value}>` : value;
}
```

- [ ] **Step 4: Use it in `THREAD_PROJECT_CREATED`**

In `src/bot/craftStrings.ts`, change the `THREAD_PROJECT_CREATED` export (currently line ~78):

```typescript
export const THREAD_PROJECT_CREATED = (userId: string, taskCount: number) =>
  `📋 Proyecto creado por <@${userId}> — ${taskCount} tareas. ¡Reclama las tuyas arriba!`;
```

to:

```typescript
export const THREAD_PROJECT_CREATED = (userId: string, taskCount: number) =>
  `📋 Proyecto creado por ${mentionOrName(userId)} — ${taskCount} tareas. ¡Reclama las tuyas arriba!`;
```

- [ ] **Step 5: Use it in the board requester line**

In `src/bot/craftRender.ts`, import `mentionOrName`. Find the existing import of `craftStrings` (it is imported as `S`, e.g. `import * as S from './craftStrings';`) and add a named import alongside it:

```typescript
import { mentionOrName } from './craftStrings';
```

Then change the requester line (currently line ~374):

```typescript
      const requester = ` · <@${project.createdBy}>`;
```

to:

```typescript
      const requester = ` · ${mentionOrName(project.createdBy)}`;
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/bot/craftStrings.test.ts src/bot/craftRender.test.ts`
Expected: PASS (new `mentionOrName` cases + existing render tests still green).

- [ ] **Step 7: Commit**

```bash
git add src/bot/craftStrings.ts src/bot/craftRender.ts src/bot/craftStrings.test.ts
git commit -m "feat: mention-safe creator rendering for plugin-created projects"
```

---

## Task 3: `handleCraftNew` accepts `itemId` and returns `projectId`/`taskCount`

**Files:**
- Modify: `src/bot/craftCommands.ts`

- [ ] **Step 1: Extend `CommandResponse` and the `opts` type**

In `src/bot/craftCommands.ts`, change the `CommandResponse` interface (currently ~line 36) to add two optional fields:

```typescript
export interface CommandResponse {
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
  flags?: number;
  projectId?: number;
  taskCount?: number;
}
```

In the `handleCraftNew` signature (currently ~line 47), add `itemId` to the opts object type:

```typescript
export async function handleCraftNew(
  opts: { item?: string | null; itemId?: number | null; qty?: number | null; name?: string | null; intermediates?: boolean; pingRole?: string | null },
  guildId: string,
  channelId: string,
  userId: string,
  deps: CraftCommandDeps,
): Promise<CommandResponse> {
```

- [ ] **Step 2: Allow the single-item path when only `itemId` is given**

The empty-project guard (currently ~line 55) is `if (!opts.item) {`. Change it so an `itemId` also counts as "has an item":

```typescript
  if (!opts.item && opts.itemId == null) {
```

- [ ] **Step 3: Resolve the item from `itemId` when provided**

Replace the item-resolution block (currently ~lines 80–89, from `const qty = opts.qty ?? 1;` through `const itemName = matches[0].name;`):

```typescript
  const qty = opts.qty ?? 1;

  // Resolve the target item. The plugin passes an exact itemId; the bot passes a
  // name to fuzzy-search.
  let itemId: number;
  let itemName: string;
  if (opts.itemId != null) {
    itemId = opts.itemId;
    itemName = deps.snapshots.namesById.get(opts.itemId) ?? `Item #${opts.itemId}`;
  } else {
    const matches = searchItems(deps.nameIndex, opts.item!, 1);
    if (matches.length === 0) {
      return { content: S.ITEM_NOT_FOUND(opts.item!), flags: 64 };
    }
    itemId = matches[0].id;
    itemName = matches[0].name;
  }
```

- [ ] **Step 4: Return `projectId`/`taskCount` on success**

Find the success return at the end of the single-item flow (currently ~lines 240–243):

```typescript
  return {
    content: S.PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
    flags: 64,
  };
```

Change it to:

```typescript
  return {
    content: S.PROJECT_CREATED(projectId, targetChannelId, storedTasks.length),
    flags: 64,
    projectId,
    taskCount: storedTasks.length,
  };
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors). If `opts.item!` triggers a lint complaint, it is guarded by Step 2's branch and is correct.

- [ ] **Step 6: Run the bot command tests**

Run: `npx vitest run src/bot/`
Expected: PASS (existing craft tests unaffected — the new fields are additive).

- [ ] **Step 7: Commit**

```bash
git add src/bot/craftCommands.ts
git commit -m "feat: handleCraftNew accepts itemId and returns projectId/taskCount"
```

---

## Task 4: New `/api/plugin/projects` endpoint (list/detail/create)

**Files:**
- Create: `src/api/plugin-projects.ts`
- Create: `src/api/plugin-projects.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/api/plugin-projects.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the heavy create-path dependencies so POST tests don't hit the network.
vi.mock('../bot/loadSnapshots', () => ({
  loadSnapshots: vi.fn(async () => ({ namesById: new Map<number, string>([[42, 'Test Item']]) })),
}));
vi.mock('../bot/craftCommands', () => ({
  handleCraftNew: vi.fn(async (opts: any) =>
    opts.itemId === 42
      ? { content: 'ok', flags: 64, projectId: 7, taskCount: 3 }
      : { content: 'No recipe', flags: 64 },
  ),
}));

import handler from './plugin-projects';
import { handleCraftNew } from '../bot/craftCommands';
import { openCraftStore, type CraftStore } from '../bot/craftStore';

let store: CraftStore;

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

async function seed(s: CraftStore, guildId = 'G1') {
  const id = await s.createProject({
    guildId, channelId: 'C1', name: 'Test', targetItemId: 42, targetQty: 3, createdBy: 'U1',
  });
  await s.addTasks(id, [
    { itemId: 10, itemName: 'Iron Ore', qtyNeeded: 5, source: 'gather', meta: {} },
    { itemId: 20, itemName: 'Iron Ingot', qtyNeeded: 2, source: 'craft', meta: {} },
  ]);
  return id;
}

beforeEach(async () => {
  store = await openCraftStore(':memory:');
  process.env.GUILD_ALLOWLIST = 'G1';
  process.env.TURSO_DATABASE_URL = ':memory:';
  delete process.env.DISCORD_BOT_TOKEN;
  delete process.env.VITE_CACHE_BLOB_URL; // loadMarketCache returns empty
  (globalThis as any).__testCraftStore = store;
  vi.clearAllMocks();
});

describe('GET /api/plugin/projects', () => {
  it('lists projects for an allowed guild (no session cookie needed)', async () => {
    await seed(store);
    const req = { method: 'GET', url: '/api/plugin/projects?guild=G1', query: { guild: 'G1' }, headers: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].projects).toHaveLength(1);
  });

  it('403s when guild not in allow-list', async () => {
    const req = { method: 'GET', url: '/api/plugin/projects?guild=OTHER', query: { guild: 'OTHER' }, headers: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('400s when guild missing', async () => {
    const req = { method: 'GET', url: '/api/plugin/projects', query: {}, headers: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('GET /api/plugin/projects/:id', () => {
  it('returns project + tasks', async () => {
    const id = await seed(store);
    const req = { method: 'GET', url: `/api/plugin/projects/${id}`, query: {}, headers: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].project.id).toBe(id);
    expect(res.json.mock.calls[0][0].tasks).toHaveLength(2);
  });

  it('404s for a disallowed guild', async () => {
    const id = await seed(store, 'OTHER');
    const req = { method: 'GET', url: `/api/plugin/projects/${id}`, query: {}, headers: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('POST /api/plugin/projects', () => {
  it('403s when guild not in allow-list (before touching create deps)', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'OTHER', itemId: 42, qty: 1, characterName: 'Esther' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(handleCraftNew).not.toHaveBeenCalled();
  });

  it('400s on missing fields', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'G1', qty: 1 } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('400s on out-of-range qty', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'G1', itemId: 42, qty: 0, characterName: 'Esther' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('creates a project and returns projectId/taskCount', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: { host: 'qiqirn.tools' },
      body: { guildId: 'G1', itemId: 42, qty: 5, name: 'My Project', characterName: 'Esther Martz' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ ok: true, projectId: 7, taskCount: 3 });
    // character name flows through as the createdBy/userId
    expect(handleCraftNew).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 42, qty: 5, name: 'My Project' }),
      'G1', '', 'Esther Martz', expect.anything(),
    );
  });

  it('returns ok:false when the breakdown yields no project', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: { host: 'qiqirn.tools' },
      body: { guildId: 'G1', itemId: 999, qty: 1, characterName: 'Esther' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/api/plugin-projects.test.ts`
Expected: FAIL — cannot find module `./plugin-projects`.

- [ ] **Step 3: Create the endpoint**

Create `src/api/plugin-projects.ts`:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { loadSnapshots } from '../bot/loadSnapshots';
import { buildNameIndex } from '../bot/nameIndex';
import { handleCraftNew, type CraftCommandDeps } from '../bot/craftCommands';
import { isAllowed, listProjectSummaries, getProjectDetail } from './_projects-core';

let storePromise: Promise<CraftStore> | null = null;
function getStore(): Promise<CraftStore> {
  const injected = (globalThis as any).__testCraftStore as CraftStore | undefined;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}

async function loadMarketCache(): Promise<Record<string, Record<string, unknown>>> {
  const url = process.env.VITE_CACHE_BLOB_URL;
  if (!url) return { phantom: {}, dc: {}, region: {} };
  try {
    const res = await fetch(url);
    if (!res.ok) return { phantom: {}, dc: {}, region: {} };
    return (await res.json()) as Record<string, Record<string, unknown>>;
  } catch {
    return { phantom: {}, dc: {}, region: {} };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const url = req.url ?? '';

  // ── GET: list or detail ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const store = await getStore();
    const detailMatch = /\/api\/plugin\/projects\/(\d+)/.exec(url);
    if (detailMatch) {
      const detail = await getProjectDetail(store, Number(detailMatch[1]));
      if (!detail) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(detail);
    }
    const guildId = (req.query?.guild as string | undefined) ?? '';
    if (!guildId) return res.status(400).json({ error: 'Missing guild query param' });
    if (!isAllowed(guildId)) return res.status(403).json({ error: 'Guild not in allow-list' });
    const statusFilter = (req.query?.status as string | undefined) ?? 'open';
    return res.status(200).json(await listProjectSummaries(store, guildId, statusFilter));
  }

  // ── POST: create ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { guildId, itemId, qty, name, characterName, intermediates } = req.body ?? {};

    // Validate BEFORE assembling create deps (so bad requests never load snapshots).
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

    const deps: CraftCommandDeps = {
      store,
      snapshots,
      nameIndex,
      marketBundle: marketBundle as any,
      botToken: process.env.DISCORD_BOT_TOKEN ?? '',
      appId: process.env.DISCORD_APP_ID ?? '',
      world: process.env.HOME_WORLD ?? 'Phantom',
      dc: process.env.HOME_DC ?? 'Chaos',
      region: process.env.REGION ?? 'Europe',
      craftChannelId: process.env.CRAFT_CHANNEL_ID || undefined,
      crafterRoleId: process.env.CRAFTER_ROLE_ID || undefined,
    };

    // channelId '' → handleCraftNew falls back to the guild's configured craft channel.
    // characterName is the createdBy/userId (rendered mention-safe downstream).
    const result = await handleCraftNew(
      { itemId: itemIdNum, qty: qtyNum, name: name ?? null, intermediates: intermediates ?? true },
      String(guildId),
      '',
      String(characterName),
      deps,
    );

    if (typeof result.projectId === 'number') {
      return res.status(200).json({
        ok: true,
        projectId: result.projectId,
        taskCount: result.taskCount ?? 0,
      });
    }
    return res.status(200).json({ ok: false, error: result.content ?? 'Could not create project' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

> Note: this endpoint does **not** export `config = { bodyParser: false }`, so Vercel parses the JSON POST body into `req.body` (matching `plugin-claim.ts`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api/plugin-projects.test.ts`
Expected: PASS (all GET + POST cases).

- [ ] **Step 5: Verify `buildNameIndex` import name**

Confirm the export exists and matches the import:

Run: `npx tsc --noEmit`
Expected: PASS. (If `buildNameIndex` is exported under a different name in `src/bot/nameIndex.ts`, fix the import to match — it is used the same way in `src/api/discord.ts`.)

- [ ] **Step 6: Commit**

```bash
git add src/api/plugin-projects.ts src/api/plugin-projects.test.ts
git commit -m "feat: guild-authed /api/plugin/projects (list, detail, create)"
```

---

## Task 5: Wire routing and the build

**Files:**
- Modify: `vercel.json`
- Modify: `package.json`

- [ ] **Step 1: Add rewrites**

In `vercel.json`, in the `rewrites` array, add these two entries immediately after the `"/api/plugin/cleanup"` rewrite (the `:id` rule MUST come before the bare path):

```json
    { "source": "/api/plugin/projects/:id", "destination": "/api/plugin-projects" },
    { "source": "/api/plugin/projects", "destination": "/api/plugin-projects" },
```

- [ ] **Step 2: Add the function config**

In `vercel.json`, in the `functions` object, add (after the `"api/plugin-cleanup.mjs"` entry):

```json
    "api/plugin-projects.mjs": {
      "maxDuration": 30
    },
```

- [ ] **Step 3: Add the endpoint to the esbuild bundle list**

In `package.json`, in the `build:api` script, add `src/api/plugin-projects.ts` to the list of esbuild entry files (e.g. right after `src/api/plugin-cleanup.ts`). The resulting script:

```json
    "build:api": "esbuild src/api/discord.ts src/api/refresh-cache.ts src/api/projects.ts src/api/plugin-claim.ts src/api/plugin-craftable.ts src/api/plugin-items.ts src/api/plugin-item-sources.ts src/api/plugin-craft-breakdown.ts src/api/plugin-trading-query.ts src/api/plugin-cleanup.ts src/api/plugin-projects.ts src/api/auth.ts --bundle --platform=node --format=esm --outdir=api --out-extension:.js=.mjs --packages=external",
```

- [ ] **Step 4: Build to verify the bundle is produced**

Run: `npm run build:api`
Expected: succeeds; `api/plugin-projects.mjs` now exists.

Run: `ls api/plugin-projects.mjs`
Expected: the file is listed.

- [ ] **Step 5: Run the full backend test suite**

Run: `npx vitest run`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add vercel.json package.json api/plugin-projects.mjs
git commit -m "build: route + bundle /api/plugin/projects"
```

---

## Task 6: Plugin ApiClient — repoint reads + add create

**Files:**
- Modify: `Services/ApiClient.cs` (in `qiqirn-companion`)

> Use the Read/Edit tools — this file is UTF-16. Preserve encoding.

- [ ] **Step 1: Repoint the project-list call**

In `Services/ApiClient.cs`, change `GetProjectsAsync` so it calls the plugin route:

```csharp
        var res = await _http.GetAsync($"api/plugin/projects?guild={Uri.EscapeDataString(guildId)}");
```

(Only the URL string changes — `api/projects?guild=…` → `api/plugin/projects?guild=…`.)

- [ ] **Step 2: Repoint the project-detail call**

In `GetProjectDetailAsync`, change the URL:

```csharp
        var res = await _http.GetAsync($"api/plugin/projects/{id}");
```

- [ ] **Step 3: Add the create-result record**

Add near the other DTO records (e.g. after `ApiProjectDetail`, around line 46):

```csharp
public record CreateProjectResult(
    [property: JsonPropertyName("ok")]        bool   Ok,
    [property: JsonPropertyName("projectId")] int    ProjectId,
    [property: JsonPropertyName("taskCount")] int    TaskCount,
    [property: JsonPropertyName("error")]     string? Error
);
```

- [ ] **Step 4: Add `CreateProjectAsync`**

In the `ApiClient` class, add this method (next to `ClaimTaskAsync`):

```csharp
    /// <summary>Create a new crafting project from a target item. Posts to Discord on success.</summary>
    public async Task<CreateProjectResult> CreateProjectAsync(
        string guildId, int itemId, int qty, string? name, string characterName, bool intermediates = true)
    {
        var body    = new { guildId, itemId, qty, name, characterName, intermediates };
        var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        var res     = await _http.PostAsync("api/plugin/projects", content);
        res.EnsureSuccessStatusCode();
        var result = await res.Content.ReadFromJsonAsync<CreateProjectResult>(_json);
        return result ?? new CreateProjectResult(false, 0, 0, "Empty response");
    }
```

- [ ] **Step 5: Build the plugin**

Run: `dotnet build C:\Users\esthe\Documents\Dev\qiqirn-companion\QiqirnCompanion.csproj -c Release`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit (in the plugin repo)**

```bash
git -C C:/Users/esthe/Documents/Dev/qiqirn-companion add Services/ApiClient.cs
git -C C:/Users/esthe/Documents/Dev/qiqirn-companion commit -m "feat: repoint project reads to /api/plugin/projects + add CreateProjectAsync"
```

---

## Task 7: Plugin UI — "New Project" form in the Projects tab

**Files:**
- Modify: `Windows/MainWindow.cs` (in `qiqirn-companion`)

> UTF-16 file — use Read/Edit tools.

- [ ] **Step 1: Add create-form state fields**

In `MainWindow.cs`, in the "Projects tab state" region (after `_selectedPhaseKey`, ~line 31), add:

```csharp
    // New-project form state
    private bool                       _showNewProject     = false;
    private string                     _newProjectSearch   = string.Empty;
    private List<ItemSearchResult>     _newProjectResults  = [];
    private ItemSearchResult?          _newProjectSelected = null;
    private int                        _newProjectQty      = 1;
    private string                     _newProjectName     = string.Empty;
    private bool                       _newProjectBusy     = false;
    private string                     _newProjectError    = string.Empty;
```

- [ ] **Step 2: Add a "New Project" toggle button to the Projects tab header**

In `DrawProjectsTab`, after the project-selector `Combo` block (after the closing `}` of the `if (_projects.Count > 0)` block, ~line 160) and before `ImGui.Separator();`, add:

```csharp
        ImGui.SameLine();
        if (ImGui.Button(_showNewProject ? "Cancel" : "＋ New Project"))
        {
            _showNewProject = !_showNewProject;
            _newProjectError = string.Empty;
        }

        if (_showNewProject)
            DrawNewProjectForm();
```

- [ ] **Step 3: Add the form renderer**

Add this method to `MainWindow.cs` (next to `LoadProjects`, in the async-helpers region):

```csharp
    private void DrawNewProjectForm()
    {
        ImGui.Separator();
        ImGui.TextDisabled("Create a new crafting project");

        // Item search box
        ImGui.SetNextItemWidth(280);
        if (ImGui.InputTextWithHint("##npsearch", "Search item…", ref _newProjectSearch, 100))
            SearchNewProjectItems();
        ImGui.SameLine();
        if (ImGui.Button("Search##np"))
            SearchNewProjectItems();

        // Results combo
        if (_newProjectResults.Count > 0)
        {
            var names = _newProjectResults.ConvertAll(r => r.Name).ToArray();
            var idx = _newProjectSelected != null
                ? _newProjectResults.FindIndex(r => r.Id == _newProjectSelected.Id)
                : -1;
            ImGui.SetNextItemWidth(280);
            if (ImGui.Combo("##npresult", ref idx, names, names.Length) && idx >= 0)
                _newProjectSelected = _newProjectResults[idx];
        }

        if (_newProjectSelected != null)
            ImGui.TextDisabled($"Selected: {_newProjectSelected.Name}");

        // Qty + optional name
        ImGui.SetNextItemWidth(110);
        if (ImGui.InputInt("Qty##np", ref _newProjectQty))
            _newProjectQty = Math.Clamp(_newProjectQty, 1, 99999);

        ImGui.SetNextItemWidth(280);
        ImGui.InputTextWithHint("##npname", "Project name (optional)", ref _newProjectName, 100);

        // Create
        var canCreate = _newProjectSelected != null && !_newProjectBusy && !string.IsNullOrEmpty(_config.GuildId);
        if (!canCreate) ImGui.BeginDisabled();
        if (ImGui.Button("Create Project"))
            CreateProject();
        if (!canCreate) ImGui.EndDisabled();

        if (_newProjectBusy)
        {
            ImGui.SameLine();
            ImGui.TextDisabled("Creating…");
        }
        if (!string.IsNullOrEmpty(_newProjectError))
            ImGui.TextColored(new Vector4(1, 0.3f, 0.3f, 1), _newProjectError);
    }

    private void SearchNewProjectItems()
    {
        var query = _newProjectSearch.Trim();
        if (query.Length < 2) return;
        Task.Run(async () =>
        {
            try
            {
                var page = await _api.SearchItemsAsync(query, 1, 20);
                _newProjectResults = page?.Items ?? [];
                if (_newProjectResults.Count > 0) _newProjectSelected = _newProjectResults[0];
            }
            catch (Exception ex)
            {
                _newProjectError = $"Search failed: {ex.Message}";
            }
        });
    }

    private void CreateProject()
    {
        if (_newProjectSelected is null) return;
        var item = _newProjectSelected;
        var qty = _newProjectQty;
        var name = string.IsNullOrWhiteSpace(_newProjectName) ? null : _newProjectName.Trim();

        _newProjectBusy = true;
        _newProjectError = string.Empty;

        Task.Run(async () =>
        {
            try
            {
                var result = await _api.CreateProjectAsync(_config.GuildId, item.Id, qty, name, CharacterName);
                if (result.Ok)
                {
                    // Reset the form and refresh the project list so the new one appears.
                    _showNewProject     = false;
                    _newProjectSearch   = string.Empty;
                    _newProjectResults  = [];
                    _newProjectSelected = null;
                    _newProjectQty      = 1;
                    _newProjectName     = string.Empty;
                    LoadProjects();
                }
                else
                {
                    _newProjectError = result.Error ?? "Could not create project.";
                }
            }
            catch (Exception ex)
            {
                _newProjectError = $"Create failed: {ex.Message}";
            }
            finally
            {
                _newProjectBusy = false;
            }
        });
    }
```

- [ ] **Step 4: Build the plugin**

Run: `dotnet build C:\Users\esthe\Documents\Dev\qiqirn-companion\QiqirnCompanion.csproj -c Release`
Expected: build succeeds.

- [ ] **Step 5: Commit (in the plugin repo)**

```bash
git -C C:/Users/esthe/Documents/Dev/qiqirn-companion add Windows/MainWindow.cs
git -C C:/Users/esthe/Documents/Dev/qiqirn-companion commit -m "feat: New Project form in the Projects tab"
```

---

## Task 8: End-to-end verification

**Files:** none (manual verification)

- [ ] **Step 1: Deploy / run the backend**

Deploy the `feature/plugin-create-projects` branch (preview) or run locally so the plugin's configured base URL reaches the new endpoint. Confirm `api/plugin-projects.mjs` is included.

- [ ] **Step 2: Verify the 401 fix**

In-game, open the plugin → Projects tab → click **Refresh**.
Expected: the project list loads (no "401 (Unauthorized)" error), and selecting a project shows its tasks.

- [ ] **Step 3: Verify project creation**

Click **＋ New Project** → search for an item with a recipe → select it → set qty → optionally name it → **Create Project**.
Expected: the form closes, the list refreshes, and the new project appears and is selectable with its task breakdown.

- [ ] **Step 4: Verify Discord sync**

Check the guild's configured craft channel in Discord.
Expected: a new project embed + thread (or forum post) appears with claim buttons, exactly like `/craft new`. The creator shows as the **character name** in plain text (not a broken `<@…>` mention). The pinned board (text channels) lists the new project.

- [ ] **Step 5: Verify claiming still works**

Claim a task from the plugin and confirm it reflects in both the plugin and the Discord embed.

---

## Notes for the implementer

- **DRY:** the read logic lives only in `_projects-core.ts`; both `projects.ts` and `plugin-projects.ts` consume it. Do not duplicate name-resolution or task-count code.
- **Auth model:** `/api/plugin/projects` is intentionally guild-allow-list authed (no Discord session) — identical to every other `/api/plugin/*` endpoint. The web `/api/projects` keeps its session gate.
- **Why character name as `createdBy`:** the plugin has no Discord user id. `mentionOrName` renders snowflakes as mentions and everything else (character names) as plain text, so existing bot projects are unaffected.
- **`marketBundle` shape:** the create endpoint passes the same `{ phantom, dc, region }` cache bundle the bot uses in `discord.ts` (cast to `any`) — used only for cost estimation; tasks are created regardless.
- If `buildNameIndex` / `loadSnapshots` export names differ from this plan, mirror exactly how `src/api/discord.ts` imports them.
```
