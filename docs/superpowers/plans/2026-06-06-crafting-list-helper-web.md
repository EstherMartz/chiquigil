# Crafting List Helper (Web, Part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Teamcraft-style web crafting-list builder: search → checkbox tray → save a named server-stored list → open it to a resolved breakdown (Final Items, Sub-crafts by depth, Gathered, Vendor/Other, Crystals) with Sections/Table views and plugin-code + plain-text exports.

**Architecture:** New `lists`/`list_items` Turso tables with CRUD folded into the existing authed `/api/projects` lambda (no new lambda). List **resolution happens client-side**, reusing the cached item/recipe/gathering/shop snapshots and the same `explode`-style traversal Craft Helper uses — extended with depth + per-final-item provenance + crystal bucketing. Three new routes under the existing `Craft Lists` nav entry. UI composes existing primitives (`SectionHeader`, `ResultTableScaffold`, `ItemNameLinks`, `HqStar`, button tokens).

**Tech Stack:** TypeScript, React 18, react-router-dom v7, @tanstack/react-query, Zustand (existing stores only), @libsql/client (Turso), Vitest + @testing-library/react, Tailwind. Spec: `docs/superpowers/specs/2026-06-06-crafting-list-helper-web-design.md`.

---

## File Structure

**Server**
- `src/bot/craftTypes.ts` — *modify*: add list types (`NewListItem`, `StoredListItem`, `StoredList`, `ListSummary`).
- `src/bot/craftStore.ts` — *modify*: add `lists`/`list_items` schema + `genListId()` + 6 CRUD methods on `CraftStore`.
- `src/api/_lists-core.ts` — *create*: validation + request handlers returning `{status, body}`.
- `src/api/projects.ts` — *modify*: dispatch `/api/lists*` (GET/POST/PUT/DELETE), remove `bodyParser:false`.
- `vercel.json` — *modify*: add `/api/lists/:id` and `/api/lists` rewrites → `/api/projects`.

**Client logic**
- `src/features/craftLists/types.ts` — *create*: client DTOs.
- `src/features/craftLists/listCode.ts` — *create*: `qq:list:v1:` encode/decode + plain-text export.
- `src/features/craftLists/resolveList.ts` — *create*: depth/provenance/section resolution.
- `src/features/craftLists/useCraftLists.ts` — *create*: react-query hooks.

**Client UI**
- `src/features/craftLists/SourceTag.tsx` — *create*: colored source chip.
- `src/routes/CraftLists.tsx` — *create*: builder (search + tray).
- `src/routes/YourLists.tsx` — *create*: saved lists.
- `src/routes/ListDetail.tsx` — *create*: detail (Sections | Table + export bar).
- `src/App.tsx` — *modify*: imports, routes, `PAGE_TITLES`.
- `src/components/layout/Sidebar.tsx` — *modify*: add nav entry.

**Tests** (co-located): `craftStore.lists.test.ts`, `_lists-core.test.ts`, `lists.api.test.ts`, `listCode.test.ts`, `resolveList.test.ts`, plus page smoke tests.

---

## Task 1: List types + store schema + CRUD

**Files:**
- Modify: `src/bot/craftTypes.ts`
- Modify: `src/bot/craftStore.ts`
- Test: `src/bot/craftStore.lists.test.ts`

- [ ] **Step 1: Add list types to `craftTypes.ts`**

Append to `src/bot/craftTypes.ts`:

```ts
// ── Crafting Lists (Teamcraft-style personal lists) ────────────────────────
export interface NewListItem {
  itemId: number;
  itemName: string;
  qty: number;
  isHq: boolean;
}

export interface StoredListItem extends NewListItem {
  id: number;
  position: number;
}

export interface StoredList {
  id: string;
  ownerId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  items: StoredListItem[];
}

export interface ListSummary {
  id: string;
  name: string;
  itemCount: number;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Write the failing store test**

Create `src/bot/craftStore.lists.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openCraftStore, type CraftStore } from './craftStore';

let store: CraftStore;

beforeEach(async () => {
  store = await openCraftStore(':memory:');
});

const ITEMS = [
  { itemId: 100, itemName: 'Gunblade', qty: 1, isHq: false },
  { itemId: 200, itemName: 'Surcoat of Fending', qty: 2, isHq: true },
];

describe('craftStore lists', () => {
  it('creates a list and reads it back with items in order', async () => {
    const id = await store.createList('owner1', 'Set of Fending', ITEMS);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const list = await store.getList(id);
    expect(list).not.toBeNull();
    expect(list!.name).toBe('Set of Fending');
    expect(list!.ownerId).toBe('owner1');
    expect(list!.items).toHaveLength(2);
    expect(list!.items[0]).toMatchObject({ itemId: 100, qty: 1, isHq: false, position: 0 });
    expect(list!.items[1]).toMatchObject({ itemId: 200, qty: 2, isHq: true, position: 1 });
  });

  it('lists summaries for an owner with item counts', async () => {
    await store.createList('owner1', 'A', ITEMS);
    await store.createList('owner1', 'B', [ITEMS[0]]);
    await store.createList('owner2', 'C', ITEMS);

    const summaries = await store.listListsForOwner('owner1');
    expect(summaries).toHaveLength(2);
    const byName = Object.fromEntries(summaries.map((s) => [s.name, s]));
    expect(byName.A.itemCount).toBe(2);
    expect(byName.B.itemCount).toBe(1);
  });

  it('updates name only for the owner', async () => {
    const id = await store.createList('owner1', 'Old', ITEMS);
    expect(await store.updateListMeta(id, 'owner2', 'Hacked')).toBe(false);
    expect(await store.updateListMeta(id, 'owner1', 'New')).toBe(true);
    expect((await store.getList(id))!.name).toBe('New');
  });

  it('replaces items only for the owner', async () => {
    const id = await store.createList('owner1', 'L', ITEMS);
    expect(await store.replaceListItems(id, 'owner2', [ITEMS[0]])).toBe(false);
    const ok = await store.replaceListItems(id, 'owner1', [
      { itemId: 300, itemName: 'Ring of Fending', qty: 5, isHq: false },
    ]);
    expect(ok).toBe(true);
    const list = await store.getList(id);
    expect(list!.items).toHaveLength(1);
    expect(list!.items[0]).toMatchObject({ itemId: 300, qty: 5, position: 0 });
  });

  it('deletes a list and its items only for the owner', async () => {
    const id = await store.createList('owner1', 'L', ITEMS);
    expect(await store.deleteList(id, 'owner2')).toBe(false);
    expect(await store.deleteList(id, 'owner1')).toBe(true);
    expect(await store.getList(id)).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/bot/craftStore.lists.test.ts`
Expected: FAIL — `store.createList is not a function` (methods not yet defined).

- [ ] **Step 4: Add schema to `craftStore.ts`**

In `src/bot/craftStore.ts`, inside the `SCHEMA` template string (after the `app_users` table, before the closing backtick at line ~125), add:

```sql
    CREATE TABLE IF NOT EXISTS lists (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT NOT NULL,
      name        TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS list_items (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id   TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      item_id   INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      qty       INTEGER NOT NULL,
      is_hq     INTEGER NOT NULL DEFAULT 0,
      position  INTEGER NOT NULL DEFAULT 0
    );
```

- [ ] **Step 5: Add list types to the import + interface**

In `src/bot/craftStore.ts` line 2, extend the type import to include the new types:

```ts
import type { CraftProject, StoredTask, CraftTask, ChannelState, AppUser, AccessLevel, NewListItem, StoredList, ListSummary } from './craftTypes';
```

Add these method signatures to the `CraftStore` interface (after `setUserAccess`, before `close`):

```ts
  createList(ownerId: string, name: string, items: NewListItem[]): Promise<string>;
  getList(id: string): Promise<StoredList | null>;
  listListsForOwner(ownerId: string): Promise<ListSummary[]>;
  updateListMeta(id: string, ownerId: string, name: string): Promise<boolean>;
  replaceListItems(id: string, ownerId: string, items: NewListItem[]): Promise<boolean>;
  deleteList(id: string, ownerId: string): Promise<boolean>;
```

- [ ] **Step 6: Implement the methods**

In `src/bot/craftStore.ts`, add a top-level helper above `export async function openCraftStore` (e.g. after the `GuildConfig` interface):

```ts
import { randomUUID } from 'node:crypto';

/** Short, URL-friendly, non-enumerable list id (12 hex chars from a UUID). */
function genListId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}
```

> Note: `randomUUID` import goes at the top of the file with the other imports; the function can live just below the imports.

Inside the returned store object (alongside the other methods, before `close`), add:

```ts
    async createList(ownerId, name, items) {
      const id = genListId();
      const now = Date.now();
      const statements = [
        {
          sql: 'INSERT INTO lists (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          args: [id, ownerId, name, now, now] as (number | string | null)[],
        },
        ...items.map((it, i) => ({
          sql: 'INSERT INTO list_items (list_id, item_id, item_name, qty, is_hq, position) VALUES (?, ?, ?, ?, ?, ?)',
          args: [id, it.itemId, it.itemName, it.qty, it.isHq ? 1 : 0, i] as (number | string | null)[],
        })),
      ];
      await client.batch(statements, 'write');
      return id;
    },

    async getList(id) {
      const head = await client.execute({ sql: 'SELECT * FROM lists WHERE id = ?', args: [id] });
      const row = head.rows[0];
      if (!row) return null;
      const itemRows = await client.execute({
        sql: 'SELECT * FROM list_items WHERE list_id = ? ORDER BY position ASC',
        args: [id],
      });
      return {
        id: String(row.id),
        ownerId: String(row.owner_id),
        name: String(row.name),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        items: itemRows.rows.map((r) => ({
          id: Number(r.id),
          itemId: Number(r.item_id),
          itemName: String(r.item_name),
          qty: Number(r.qty),
          isHq: Number(r.is_hq) === 1,
          position: Number(r.position),
        })),
      };
    },

    async listListsForOwner(ownerId) {
      const result = await client.execute({
        sql: `
          SELECT l.id, l.name, l.created_at, l.updated_at,
                 (SELECT COUNT(*) FROM list_items WHERE list_id = l.id) AS item_count
          FROM lists l
          WHERE l.owner_id = ?
          ORDER BY l.updated_at DESC
        `,
        args: [ownerId],
      });
      return result.rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        itemCount: Number(r.item_count),
        createdAt: Number(r.created_at),
        updatedAt: Number(r.updated_at),
      }));
    },

    async updateListMeta(id, ownerId, name) {
      const now = Date.now();
      const result = await client.execute({
        sql: 'UPDATE lists SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
        args: [name, now, id, ownerId],
      });
      return result.rowsAffected > 0;
    },

    async replaceListItems(id, ownerId, items) {
      const owned = await client.execute({
        sql: 'SELECT id FROM lists WHERE id = ? AND owner_id = ?',
        args: [id, ownerId],
      });
      if (owned.rows.length === 0) return false;
      const now = Date.now();
      const statements = [
        { sql: 'DELETE FROM list_items WHERE list_id = ?', args: [id] as (number | string | null)[] },
        ...items.map((it, i) => ({
          sql: 'INSERT INTO list_items (list_id, item_id, item_name, qty, is_hq, position) VALUES (?, ?, ?, ?, ?, ?)',
          args: [id, it.itemId, it.itemName, it.qty, it.isHq ? 1 : 0, i] as (number | string | null)[],
        })),
        { sql: 'UPDATE lists SET updated_at = ? WHERE id = ?', args: [now, id] as (number | string | null)[] },
      ];
      await client.batch(statements, 'write');
      return true;
    },

    async deleteList(id, ownerId) {
      const owned = await client.execute({
        sql: 'SELECT id FROM lists WHERE id = ? AND owner_id = ?',
        args: [id, ownerId],
      });
      if (owned.rows.length === 0) return false;
      // Delete children explicitly — SQLite FK cascade is not guaranteed enabled.
      await client.batch([
        { sql: 'DELETE FROM list_items WHERE list_id = ?', args: [id] },
        { sql: 'DELETE FROM lists WHERE id = ?', args: [id] },
      ], 'write');
      return true;
    },
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/bot/craftStore.lists.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add src/bot/craftTypes.ts src/bot/craftStore.ts src/bot/craftStore.lists.test.ts
git commit -m "feat(craft-lists): lists/list_items tables + store CRUD"
```

---

## Task 2: `_lists-core.ts` (validation + request handlers)

**Files:**
- Create: `src/api/_lists-core.ts`
- Test: `src/api/_lists-core.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/_lists-core.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { handleCreateList, handleGetList, handleListLists, handleUpdateList, handleDeleteList } from './_lists-core';

let store: CraftStore;
beforeEach(async () => { store = await openCraftStore(':memory:'); });

const BODY = {
  name: 'Set of Fending',
  items: [
    { itemId: 100, itemName: 'Gunblade', qty: 1, isHq: false },
    { itemId: 200, itemName: 'Surcoat', qty: 2, isHq: true },
  ],
};

describe('_lists-core', () => {
  it('creates, lists, gets, updates, deletes', async () => {
    const created = await handleCreateList(store, 'owner1', BODY);
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;

    const listed = await handleListLists(store, 'owner1');
    expect(listed.status).toBe(200);
    expect((listed.body as { lists: unknown[] }).lists).toHaveLength(1);

    const got = await handleGetList(store, id);
    expect(got.status).toBe(200);
    expect((got.body as { name: string }).name).toBe('Set of Fending');

    const updated = await handleUpdateList(store, id, 'owner1', { name: 'Renamed' });
    expect(updated.status).toBe(200);
    expect((await handleGetList(store, id)).body).toMatchObject({ name: 'Renamed' });

    const del = await handleDeleteList(store, id, 'owner1');
    expect(del.status).toBe(200);
    expect((await handleGetList(store, id)).status).toBe(404);
  });

  it('rejects an empty or unnamed list with 400', async () => {
    expect((await handleCreateList(store, 'o', { name: '', items: BODY.items })).status).toBe(400);
    expect((await handleCreateList(store, 'o', { name: 'X', items: [] })).status).toBe(400);
  });

  it('rejects invalid item quantities', async () => {
    const bad = { name: 'X', items: [{ itemId: 1, itemName: 'A', qty: 0, isHq: false }] };
    expect((await handleCreateList(store, 'o', bad)).status).toBe(400);
  });

  it('blocks non-owner update/delete with 403', async () => {
    const id = (await handleCreateList(store, 'owner1', BODY)).body as { id: string };
    expect((await handleUpdateList(store, id.id, 'intruder', { name: 'Z' })).status).toBe(403);
    expect((await handleDeleteList(store, id.id, 'intruder')).status).toBe(403);
  });

  it('404s when getting a missing list', async () => {
    expect((await handleGetList(store, 'nope')).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/api/_lists-core.test.ts`
Expected: FAIL — module `./_lists-core` not found.

- [ ] **Step 3: Implement `_lists-core.ts`**

Create `src/api/_lists-core.ts`:

```ts
import type { CraftStore } from '../bot/craftStore';
import type { NewListItem } from '../bot/craftTypes';

export interface CoreResult {
  status: number;
  body: unknown;
}

const MAX_NAME = 120;
const MAX_ITEMS = 200;

function sanitizeItems(raw: unknown): NewListItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) return null;
  const out: NewListItem[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const itemId = Number(o.itemId);
    const qty = Number(o.qty);
    const itemName = String(o.itemName ?? '').trim();
    if (!Number.isInteger(itemId) || itemId <= 0) return null;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99999) return null;
    if (itemName.length === 0) return null;
    out.push({ itemId, itemName, qty, isHq: !!o.isHq });
  }
  return out;
}

function sanitizeName(raw: unknown): string | null {
  const name = String(raw ?? '').trim();
  if (name.length === 0 || name.length > MAX_NAME) return null;
  return name;
}

export async function handleCreateList(
  store: CraftStore, ownerId: string, body: { name?: unknown; items?: unknown },
): Promise<CoreResult> {
  const name = sanitizeName(body?.name);
  const items = sanitizeItems(body?.items);
  if (!name) return { status: 400, body: { error: 'List name is required' } };
  if (!items) return { status: 400, body: { error: 'List must have 1–200 valid items' } };
  const id = await store.createList(ownerId, name, items);
  return { status: 201, body: { id } };
}

export async function handleListLists(store: CraftStore, ownerId: string): Promise<CoreResult> {
  const lists = await store.listListsForOwner(ownerId);
  return { status: 200, body: { lists } };
}

export async function handleGetList(store: CraftStore, id: string): Promise<CoreResult> {
  const list = await store.getList(id);
  if (!list) return { status: 404, body: { error: 'List not found' } };
  return { status: 200, body: list };
}

export async function handleUpdateList(
  store: CraftStore, id: string, ownerId: string,
  body: { name?: unknown; items?: unknown },
): Promise<CoreResult> {
  const existing = await store.getList(id);
  if (!existing) return { status: 404, body: { error: 'List not found' } };
  if (existing.ownerId !== ownerId) return { status: 403, body: { error: 'Not your list' } };

  if (body?.name !== undefined) {
    const name = sanitizeName(body.name);
    if (!name) return { status: 400, body: { error: 'Invalid name' } };
    await store.updateListMeta(id, ownerId, name);
  }
  if (body?.items !== undefined) {
    const items = sanitizeItems(body.items);
    if (!items) return { status: 400, body: { error: 'Invalid items' } };
    await store.replaceListItems(id, ownerId, items);
  }
  const updated = await store.getList(id);
  return { status: 200, body: updated };
}

export async function handleDeleteList(
  store: CraftStore, id: string, ownerId: string,
): Promise<CoreResult> {
  const existing = await store.getList(id);
  if (!existing) return { status: 404, body: { error: 'List not found' } };
  if (existing.ownerId !== ownerId) return { status: 403, body: { error: 'Not your list' } };
  await store.deleteList(id, ownerId);
  return { status: 200, body: { ok: true } };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/api/_lists-core.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/_lists-core.ts src/api/_lists-core.test.ts
git commit -m "feat(craft-lists): list validation + core request handlers"
```

---

## Task 3: Fold `/api/lists*` routes into the projects lambda

**Files:**
- Modify: `src/api/projects.ts`
- Modify: `vercel.json`
- Test: `src/api/lists.api.test.ts`

- [ ] **Step 1: Write the failing API test**

Create `src/api/lists.api.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import handler from './projects';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { signSession, SESSION_COOKIE } from './_auth';

let store: CraftStore;

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

async function authedReq(method: string, url: string, sub = 'owner1', body?: unknown) {
  const token = await signSession({ sub, username: 'E', avatar: null, guilds: ['G1'] });
  return {
    method, url, query: {},
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    body,
  } as any;
}

beforeEach(async () => {
  store = await openCraftStore(':memory:');
  process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
  delete process.env.DISCORD_BOT_TOKEN;
  (globalThis as any).__testCraftStore = store;
});

const BODY = { name: 'Fending', items: [{ itemId: 100, itemName: 'Gunblade', qty: 1, isHq: false }] };

describe('lists API (folded into /api/projects lambda)', () => {
  it('401s without a session', async () => {
    const res = mockRes();
    await handler({ method: 'GET', url: '/api/lists', query: {}, headers: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('creates, lists, gets, updates, deletes', async () => {
    let res = mockRes();
    await handler(await authedReq('POST', '/api/lists', 'owner1', BODY), res);
    expect(res.status).toHaveBeenCalledWith(201);
    const id = res.json.mock.calls[0][0].id as string;

    res = mockRes();
    await handler(await authedReq('GET', '/api/lists', 'owner1'), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].lists).toHaveLength(1);

    res = mockRes();
    await handler(await authedReq('GET', `/api/lists/${id}`, 'owner1'), res);
    expect(res.json.mock.calls[0][0].name).toBe('Fending');

    res = mockRes();
    await handler(await authedReq('PUT', `/api/lists/${id}`, 'owner1', { name: 'Renamed' }), res);
    expect(res.status).toHaveBeenCalledWith(200);

    res = mockRes();
    await handler(await authedReq('DELETE', `/api/lists/${id}`, 'owner1'), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('blocks a non-owner from deleting', async () => {
    let res = mockRes();
    await handler(await authedReq('POST', '/api/lists', 'owner1', BODY), res);
    const id = res.json.mock.calls[0][0].id as string;

    res = mockRes();
    await handler(await authedReq('DELETE', `/api/lists/${id}`, 'intruder'), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/api/lists.api.test.ts`
Expected: FAIL — handler returns 405/404 for `/api/lists` (routes not wired).

- [ ] **Step 3: Rewrite `src/api/projects.ts` to dispatch lists**

Replace the entire contents of `src/api/projects.ts` with:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { requireSession } from './_auth';
import { isAllowed, listProjectSummaries, getProjectDetail } from './_projects-core';
import {
  handleCreateList, handleGetList, handleListLists, handleUpdateList, handleDeleteList,
} from './_lists-core';

let storePromise: Promise<CraftStore> | null = null;
function getStore(): Promise<CraftStore> {
  const injected = (globalThis as any).__testCraftStore as CraftStore | undefined;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}

async function handleLists(
  req: VercelRequest, res: VercelResponse, store: CraftStore, ownerId: string, url: string,
): Promise<VercelResponse> {
  const idMatch = /\/api\/lists\/([^/?]+)/.exec(url);
  const id = idMatch ? decodeURIComponent(idMatch[1]) : null;
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (id) {
    if (req.method === 'GET') return send(res, await handleGetList(store, id));
    if (req.method === 'PUT') return send(res, await handleUpdateList(store, id, ownerId, body));
    if (req.method === 'DELETE') return send(res, await handleDeleteList(store, id, ownerId));
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.method === 'GET') return send(res, await handleListLists(store, ownerId));
  if (req.method === 'POST') return send(res, await handleCreateList(store, ownerId, body));
  return res.status(405).json({ error: 'Method not allowed' });
}

function send(res: VercelResponse, r: { status: number; body: unknown }): VercelResponse {
  return res.status(r.status).json(r.body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  res.setHeader('Cache-Control', 'no-store');
  const url = req.url ?? '';
  const store = await getStore();

  // ── Crafting Lists (personal, session-owned) ──────────────────────────────
  if (url.startsWith('/api/lists')) {
    return handleLists(req, res, store, session.sub, url);
  }

  // ── Projects (existing, guild-scoped, GET only) ───────────────────────────
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const detailMatch = /\/api\/projects\/(\d+)/.exec(url);
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
```

> The `export const config = { api: { bodyParser: false } }` line is intentionally removed so POST/PUT JSON bodies populate `req.body` (matching `plugin-projects.ts`). GET has no body, so this does not affect the existing projects path.

- [ ] **Step 4: Add rewrites to `vercel.json`**

In `vercel.json`, in the `rewrites` array, add these two entries immediately after the `/api/projects/:id` rewrite (line 39). Order matters: `:id` before the bare path.

```json
    { "source": "/api/lists/:id", "destination": "/api/projects" },
    { "source": "/api/lists", "destination": "/api/projects" },
```

> No new entry is added to `functions` — `/api/lists*` is served by the existing `api/projects.mjs`, so the lambda count stays at 12.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/api/lists.api.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the existing projects test to confirm no regression**

Run: `npx vitest run src/api/projects.test.ts`
Expected: PASS (all existing tests still green).

- [ ] **Step 7: Commit**

```bash
git add src/api/projects.ts vercel.json src/api/lists.api.test.ts
git commit -m "feat(craft-lists): fold /api/lists CRUD into projects lambda"
```

---

## Task 4: List code + plain-text export

**Files:**
- Create: `src/features/craftLists/types.ts`
- Create: `src/features/craftLists/listCode.ts`
- Test: `src/features/craftLists/listCode.test.ts`

- [ ] **Step 1: Create client DTOs**

Create `src/features/craftLists/types.ts`:

```ts
export interface CraftListItem {
  itemId: number;
  itemName: string;
  qty: number;
  isHq: boolean;
}

export interface CraftListSummary {
  id: string;
  name: string;
  itemCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CraftListDetail {
  id: string;
  ownerId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  items: CraftListItem[];
}
```

- [ ] **Step 2: Write the failing test**

Create `src/features/craftLists/listCode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeListCode, decodeListCode } from './listCode';
import type { CraftListItem } from './types';

const ITEMS: CraftListItem[] = [
  { itemId: 100, itemName: 'Gunblade', qty: 1, isHq: false },
  { itemId: 200, itemName: 'Surcôat of Fending', qty: 2, isHq: true },
];

describe('listCode', () => {
  it('round-trips a list through encode/decode', () => {
    const code = encodeListCode('Set of Fending', ITEMS);
    expect(code.startsWith('qq:list:v1:')).toBe(true);
    const decoded = decodeListCode(code);
    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe('Set of Fending');
    expect(decoded!.items).toEqual([
      { itemId: 100, qty: 1, isHq: false },
      { itemId: 200, qty: 2, isHq: true },
    ]);
  });

  it('returns null for a malformed code', () => {
    expect(decodeListCode('not-a-code')).toBeNull();
    expect(decodeListCode('qq:list:v1:!!!notbase64!!!')).toBeNull();
    expect(decodeListCode('qq:list:v2:abc')).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/features/craftLists/listCode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `listCode.ts`**

Create `src/features/craftLists/listCode.ts`:

```ts
import type { CraftListItem } from './types';
import type { ResolvedList } from './resolveList';

const PREFIX = 'qq:list:v1:';

interface WireList {
  n: string;
  i: [number, number, 0 | 1][]; // [itemId, qty, hqFlag]
}

export interface DecodedList {
  name: string;
  items: { itemId: number; qty: number; isHq: boolean }[];
}

// UTF-8-safe base64url. btoa only handles Latin-1, so encode UTF-8 first.
function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeListCode(name: string, items: CraftListItem[]): string {
  const wire: WireList = {
    n: name,
    i: items.map((it) => [it.itemId, it.qty, it.isHq ? 1 : 0] as [number, number, 0 | 1]),
  };
  return PREFIX + toBase64Url(JSON.stringify(wire));
}

export function decodeListCode(code: string): DecodedList | null {
  if (!code.startsWith(PREFIX)) return null;
  try {
    const wire = JSON.parse(fromBase64Url(code.slice(PREFIX.length))) as WireList;
    if (typeof wire?.n !== 'string' || !Array.isArray(wire.i)) return null;
    const items = wire.i.map((t) => ({ itemId: Number(t[0]), qty: Number(t[1]), isHq: t[2] === 1 }));
    if (items.some((it) => !Number.isInteger(it.itemId) || !Number.isInteger(it.qty))) return null;
    return { name: wire.n, items };
  } catch {
    return null;
  }
}

/** Human-readable resolved ingredient list for shopping outside the game. */
export function resolvedToPlainText(listName: string, resolved: ResolvedList): string {
  const lines: string[] = [`${listName}`, ''];
  const section = (title: string, rows: { itemName: string; requiredQty: number }[]) => {
    if (rows.length === 0) return;
    lines.push(`== ${title} ==`);
    for (const r of rows) lines.push(`${r.itemName} x${r.requiredQty}`);
    lines.push('');
  };
  section('Final Items', resolved.finalItems.map((f) => ({ itemName: f.itemName, requiredQty: f.qty })));
  for (const [depth, rows] of [...resolved.subCraftsByDepth.entries()].sort((a, b) => a[0] - b[0])) {
    section(`Sub-crafts (Level ${depth})`, rows);
  }
  section('Gathered', resolved.gathered);
  section('Vendor / Other', resolved.otherAcquired);
  section('Crystals', resolved.crystals);
  return lines.join('\n').trim() + '\n';
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/features/craftLists/listCode.test.ts`
Expected: PASS (2 tests).

> `resolvedToPlainText` imports `ResolvedList` from the next task's module; the type-only import compiles fine because the file is created in Task 5. If running this task strictly alone, Task 5 must be completed before `npm run build`. Tests in this task do not exercise `resolvedToPlainText`.

- [ ] **Step 6: Commit**

```bash
git add src/features/craftLists/types.ts src/features/craftLists/listCode.ts src/features/craftLists/listCode.test.ts
git commit -m "feat(craft-lists): qq:list:v1 code + plain-text export"
```

---

## Task 5: `resolveList.ts` (depth, provenance, sections, crystals)

**Files:**
- Create: `src/features/craftLists/resolveList.ts`
- Test: `src/features/craftLists/resolveList.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/craftLists/resolveList.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveList, type ResolveDeps } from './resolveList';
import type { Recipe } from '../../lib/recipes';
import type { SnapshotItem } from '../../lib/itemSnapshot';

// Tree: Sword(1) -> 2x Ingot(craft) + 1x FireShard(crystal)
//       Ingot -> 3x Ore(gather) + 1x Flux(vendor)
const recipes = new Map<number, Recipe | null>([
  [1, { itemResultId: 1, classJob: 'BSM', recipeLevel: 90, ingredients: [
    { itemId: 2, amount: 2 }, { itemId: 7, amount: 1 },
  ], amountResult: 1, stats: { durability: 80, progress: 1, quality: 1, stars: 4, requiredCraftsmanship: 0, requiredControl: 0 } }],
  [2, { itemResultId: 2, classJob: 'BSM', recipeLevel: 50, ingredients: [
    { itemId: 3, amount: 3 }, { itemId: 4, amount: 1 },
  ], amountResult: 1 }],
]);

const itemsById = new Map<number, SnapshotItem>([
  [1, { id: 1, name: 'Sword', sc: 5, ui: 0, ilvl: 600, canHq: true, rarity: 1 }],
  [2, { id: 2, name: 'Ingot', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
  [3, { id: 3, name: 'Ore', sc: 9, ui: 0, ilvl: 1, canHq: true, rarity: 1 }],
  [4, { id: 4, name: 'Flux', sc: 9, ui: 0, ilvl: 1, canHq: false, rarity: 1 }],
  [7, { id: 7, name: 'Fire Shard', sc: 58, ui: 0, ilvl: 1, canHq: false, rarity: 1 }],
] as [number, SnapshotItem][]);

const deps: ResolveDeps = {
  recipes,
  gathering: new Map([[3, { level: 50, timed: false, hidden: false }]]),
  vendorMap: new Map([[4, 100]]),
  specialShop: { byCurrency: new Map() },
  itemsById,
};

describe('resolveList', () => {
  it('groups final items, sub-crafts by depth, gathered, vendor and crystals', () => {
    const r = resolveList([{ itemId: 1, qty: 1, isHq: false }], deps);

    expect(r.finalItems).toHaveLength(1);
    expect(r.finalItems[0]).toMatchObject({ itemId: 1, qty: 1, job: 'BSM', recipeLevel: 90, stars: 4 });

    // Ingot is a depth-1 sub-craft, qty 2
    const lvl1 = r.subCraftsByDepth.get(1)!;
    expect(lvl1.map((x) => x.itemId)).toContain(2);
    const ingot = lvl1.find((x) => x.itemId === 2)!;
    expect(ingot).toMatchObject({ requiredQty: 2, source: 'Crafted', depth: 1, recipeLevel: 50 });
    expect(ingot.usedToCraft).toEqual(['Sword']);

    // Ore: 2 ingots * 3 ore = 6, gathered
    const ore = r.gathered.find((x) => x.itemId === 3)!;
    expect(ore).toMatchObject({ requiredQty: 6, source: 'Gathered' });

    // Flux: vendor, qty 2
    const flux = r.otherAcquired.find((x) => x.itemId === 4)!;
    expect(flux).toMatchObject({ requiredQty: 2, source: 'Vendor' });

    // Fire Shard: crystal, qty 1
    expect(r.crystals.map((x) => x.itemId)).toEqual([7]);
    expect(r.crystals[0].source).toBe('Crystal');
  });

  it('flags timed gathers and aggregates "used to craft" across final items', () => {
    const r = resolveList(
      [{ itemId: 1, qty: 1, isHq: false }, { itemId: 2, qty: 5, isHq: false }],
      { ...deps, gathering: new Map([[3, { level: 50, timed: true, hidden: false }]]) },
    );
    const ore = r.gathered.find((x) => x.itemId === 3)!;
    expect(ore.source).toBe('TimedGather');
    // Ingot is both a final item (qty 5) and a sub-craft of Sword (qty 2) → feeds Sword
    const ingot = r.subCraftsByDepth.get(1)!.find((x) => x.itemId === 2)!;
    expect(ingot.usedToCraft).toEqual(['Sword']);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/features/craftLists/resolveList.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `resolveList.ts`**

Create `src/features/craftLists/resolveList.ts`:

```ts
import type { Recipe } from '../../lib/recipes';
import type { GatheringCatalog } from '../../lib/gatheringCatalog';
import type { SpecialShopSnapshot } from '../../lib/specialShopSnapshot';
import type { SnapshotItem } from '../../lib/itemSnapshot';
import { CRYSTALS_SEARCH_CATEGORY } from '../queries/commonFilters';

export type ListSource =
  | 'Crafted' | 'Gathered' | 'TimedGather' | 'Vendor' | 'MonsterDrop' | 'Tome' | 'Crystal';

export interface ResolvedIngredient {
  itemId: number;
  itemName: string;
  requiredQty: number;
  source: ListSource;
  craftedByJob?: string;
  recipeLevel?: number;
  usedToCraft: string[];
  depth?: number;
  canHq?: boolean;
}

export interface FinalItemRow {
  itemId: number;
  itemName: string;
  qty: number;
  isHq: boolean;
  job?: string;
  recipeLevel?: number;
  stars?: number;
}

export interface ResolvedList {
  finalItems: FinalItemRow[];
  subCraftsByDepth: Map<number, ResolvedIngredient[]>;
  gathered: ResolvedIngredient[];      // Gathered + TimedGather
  otherAcquired: ResolvedIngredient[]; // Vendor + Tome + MonsterDrop
  crystals: ResolvedIngredient[];
  all: ResolvedIngredient[];           // flat, for the Table view
}

export interface ResolveDeps {
  recipes: Map<number, Recipe | null>;
  gathering: GatheringCatalog;
  vendorMap: Map<number, number>;
  specialShop: SpecialShopSnapshot;
  itemsById: Map<number, SnapshotItem>;
}

export interface ListInput {
  itemId: number;
  qty: number;
  isHq?: boolean;
}

interface Node {
  qty: number;
  minDepth: number;
  roots: Set<string>;
  isCraft: boolean;
  job?: string;
  recipeLevel?: number;
}

const MAX_DEPTH = 20;

function classifyLeaf(itemId: number, deps: ResolveDeps): ListSource {
  // Crystals first — shards can also appear in gathering nodes, but they belong
  // in their own section regardless.
  if (deps.itemsById.get(itemId)?.sc === CRYSTALS_SEARCH_CATEGORY) return 'Crystal';
  const g = deps.gathering.get(itemId);
  if (g) return g.timed ? 'TimedGather' : 'Gathered';
  for (const entries of deps.specialShop.byCurrency.values()) {
    if (entries.some((e) => e.itemId === itemId)) return 'Tome';
  }
  if (deps.vendorMap.has(itemId)) return 'Vendor';
  return 'MonsterDrop';
}

export function resolveList(inputs: ListInput[], deps: ResolveDeps): ResolvedList {
  const nodes = new Map<number, Node>();

  function touch(id: number, qty: number, depth: number, root: string): Node {
    let n = nodes.get(id);
    if (!n) {
      n = { qty: 0, minDepth: depth, roots: new Set(), isCraft: false };
      nodes.set(id, n);
    }
    n.qty += qty;
    if (depth < n.minDepth) n.minDepth = depth;
    n.roots.add(root);
    return n;
  }

  function walk(id: number, qty: number, depth: number, root: string, path: Set<number>) {
    const recipe = depth > MAX_DEPTH || path.has(id) ? null : deps.recipes.get(id);
    const node = touch(id, qty, depth, root);
    if (recipe) {
      node.isCraft = true;
      node.job = recipe.classJob;
      node.recipeLevel = recipe.recipeLevel;
      const craftCount = Math.ceil(qty / (recipe.amountResult ?? 1));
      path.add(id);
      for (const ing of recipe.ingredients) {
        walk(ing.itemId, ing.amount * craftCount, depth + 1, root, path);
      }
      path.delete(id);
    }
  }

  const finalItems: FinalItemRow[] = [];
  for (const input of inputs) {
    const recipe = deps.recipes.get(input.itemId) ?? undefined;
    const meta = deps.itemsById.get(input.itemId);
    const rootName = meta?.name ?? `Item #${input.itemId}`;
    finalItems.push({
      itemId: input.itemId,
      itemName: rootName,
      qty: input.qty,
      isHq: !!input.isHq,
      job: recipe?.classJob,
      recipeLevel: recipe?.recipeLevel,
      stars: recipe?.stats?.stars,
    });
    // Walk the ingredients of each final item (the final item itself is not an ingredient).
    if (recipe) {
      const craftCount = Math.ceil(input.qty / (recipe.amountResult ?? 1));
      const path = new Set<number>([input.itemId]);
      for (const ing of recipe.ingredients) {
        walk(ing.itemId, ing.amount * craftCount, 1, rootName, path);
      }
    }
  }

  const subCraftsByDepth = new Map<number, ResolvedIngredient[]>();
  const gathered: ResolvedIngredient[] = [];
  const otherAcquired: ResolvedIngredient[] = [];
  const crystals: ResolvedIngredient[] = [];
  const all: ResolvedIngredient[] = [];

  for (const [id, n] of nodes) {
    const meta = deps.itemsById.get(id);
    const name = meta?.name ?? `Item #${id}`;
    const usedToCraft = [...n.roots].sort((a, b) => a.localeCompare(b));
    const base: ResolvedIngredient = {
      itemId: id, itemName: name, requiredQty: n.qty,
      usedToCraft, canHq: meta?.canHq,
      source: 'MonsterDrop',
    };
    if (n.isCraft) {
      const row: ResolvedIngredient = {
        ...base, source: 'Crafted', depth: n.minDepth, craftedByJob: n.job, recipeLevel: n.recipeLevel,
      };
      const bucket = subCraftsByDepth.get(n.minDepth) ?? [];
      bucket.push(row);
      subCraftsByDepth.set(n.minDepth, bucket);
      all.push(row);
    } else {
      const source = classifyLeaf(id, deps);
      const row: ResolvedIngredient = { ...base, source };
      if (source === 'Crystal') crystals.push(row);
      else if (source === 'Gathered' || source === 'TimedGather') gathered.push(row);
      else otherAcquired.push(row);
      all.push(row);
    }
  }

  const byName = (a: ResolvedIngredient, b: ResolvedIngredient) => a.itemName.localeCompare(b.itemName);
  for (const rows of subCraftsByDepth.values()) rows.sort(byName);
  gathered.sort(byName);
  otherAcquired.sort(byName);
  crystals.sort(byName);
  all.sort(byName);

  return { finalItems, subCraftsByDepth, gathered, otherAcquired, crystals, all };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/craftLists/resolveList.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/craftLists/resolveList.ts src/features/craftLists/resolveList.test.ts
git commit -m "feat(craft-lists): client-side list resolution (depth, sources, crystals)"
```

---

## Task 6: React-query hooks

**Files:**
- Create: `src/features/craftLists/useCraftLists.ts`
- Test: `src/features/craftLists/useCraftLists.test.ts`

- [ ] **Step 1: Write the failing test (fetch helpers)**

Create `src/features/craftLists/useCraftLists.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchLists, fetchList, createListReq, updateListReq, deleteListReq } from './useCraftLists';

afterEach(() => { vi.restoreAllMocks(); });

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('useCraftLists fetch helpers', () => {
  it('fetchLists GETs /api/lists and unwraps lists', async () => {
    const spy = mockFetch(200, { lists: [{ id: 'a', name: 'A', itemCount: 1, createdAt: 0, updatedAt: 0 }] });
    const lists = await fetchLists();
    expect(spy).toHaveBeenCalledWith('/api/lists');
    expect(lists).toHaveLength(1);
  });

  it('fetchList GETs /api/lists/:id', async () => {
    mockFetch(200, { id: 'abc', ownerId: 'o', name: 'X', createdAt: 0, updatedAt: 0, items: [] });
    const list = await fetchList('abc');
    expect(list.id).toBe('abc');
  });

  it('createListReq POSTs and returns the new id', async () => {
    const spy = mockFetch(201, { id: 'new1' });
    const id = await createListReq('My List', [{ itemId: 1, itemName: 'A', qty: 1, isHq: false }]);
    expect(id).toBe('new1');
    expect(spy).toHaveBeenCalledWith('/api/lists', expect.objectContaining({ method: 'POST' }));
  });

  it('throws on a non-ok response', async () => {
    mockFetch(403, { error: 'nope' });
    await expect(fetchList('x')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/features/craftLists/useCraftLists.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useCraftLists.ts`**

Create `src/features/craftLists/useCraftLists.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CraftListSummary, CraftListDetail, CraftListItem } from './types';

const LISTS_KEY = ['craft-lists'] as const;

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchLists(): Promise<CraftListSummary[]> {
  const body = await asJson<{ lists: CraftListSummary[] }>(await fetch('/api/lists'));
  return body.lists;
}

export async function fetchList(id: string): Promise<CraftListDetail> {
  return asJson<CraftListDetail>(await fetch(`/api/lists/${encodeURIComponent(id)}`));
}

export async function createListReq(name: string, items: CraftListItem[]): Promise<string> {
  const body = await asJson<{ id: string }>(await fetch('/api/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, items }),
  }));
  return body.id;
}

export async function updateListReq(
  id: string, patch: { name?: string; items?: CraftListItem[] },
): Promise<CraftListDetail> {
  return asJson<CraftListDetail>(await fetch(`/api/lists/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }));
}

export async function deleteListReq(id: string): Promise<void> {
  await asJson<{ ok: true }>(await fetch(`/api/lists/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export function useCraftLists() {
  return useQuery({ queryKey: LISTS_KEY, queryFn: fetchLists });
}

export function useCraftList(id: string | undefined) {
  return useQuery({
    queryKey: [...LISTS_KEY, id],
    queryFn: () => fetchList(id!),
    enabled: !!id,
  });
}

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, items }: { name: string; items: CraftListItem[] }) => createListReq(name, items),
    onSuccess: () => qc.invalidateQueries({ queryKey: LISTS_KEY }),
  });
}

export function useUpdateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; items?: CraftListItem[] } }) =>
      updateListReq(id, patch),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: LISTS_KEY });
      qc.invalidateQueries({ queryKey: [...LISTS_KEY, vars.id] });
    },
  });
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteListReq(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: LISTS_KEY }),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/craftLists/useCraftLists.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/craftLists/useCraftLists.ts src/features/craftLists/useCraftLists.test.ts
git commit -m "feat(craft-lists): react-query hooks for list CRUD"
```

---

## Task 7: SourceTag chip

**Files:**
- Create: `src/features/craftLists/SourceTag.tsx`
- Test: `src/features/craftLists/SourceTag.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/craftLists/SourceTag.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceTag } from './SourceTag';

describe('SourceTag', () => {
  it('renders a human label per source', () => {
    render(<SourceTag source="TimedGather" />);
    expect(screen.getByText('TIMED GATHER')).toBeInTheDocument();
  });

  it('renders crystal label', () => {
    render(<SourceTag source="Crystal" />);
    expect(screen.getByText('CRYSTAL')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/features/craftLists/SourceTag.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SourceTag.tsx`**

Create `src/features/craftLists/SourceTag.tsx`:

```tsx
import type { ListSource } from './resolveList';

const LABEL: Record<ListSource, string> = {
  Crafted: 'CRAFTED',
  Gathered: 'GATHERED',
  TimedGather: 'TIMED GATHER',
  Vendor: 'VENDOR',
  MonsterDrop: 'MONSTER / OTHER',
  Tome: 'TOME / TOKEN',
  Crystal: 'CRYSTAL',
};

const COLOR: Record<ListSource, string> = {
  Crafted: 'border-gold text-gold',
  Gathered: 'border-jade text-jade',
  TimedGather: 'border-jade text-jade',
  Vendor: 'border-aether text-aether',
  MonsterDrop: 'border-crimson text-crimson',
  Tome: 'border-aether text-aether',
  Crystal: 'border-border-hi text-text-dim',
};

export function SourceTag({ source }: { source: ListSource }) {
  return (
    <span className={`inline-block font-mono text-[9px] tracking-widest uppercase border px-1.5 py-0.5 leading-none ${COLOR[source]}`}>
      {LABEL[source]}
    </span>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/craftLists/SourceTag.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/craftLists/SourceTag.tsx src/features/craftLists/SourceTag.test.tsx
git commit -m "feat(craft-lists): source-tag chip"
```

---

## Task 8: Builder page (`/craft-lists`)

**Files:**
- Create: `src/routes/CraftLists.tsx`
- Test: `src/routes/CraftLists.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/routes/CraftLists.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CraftLists from './CraftLists';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

vi.mock('../features/queries/useItemSnapshot', () => ({
  useItemSnapshot: () => ({ data: { items: [
    { id: 100, name: 'Gunblade', sc: 5, ui: 0, ilvl: 600, canHq: true, rarity: 1 },
    { id: 200, name: 'Gunhilda Cloak', sc: 5, ui: 0, ilvl: 600, canHq: true, rarity: 1 },
  ] } }),
}));
vi.mock('../features/queries/useRecipeSnapshot', () => ({
  useRecipeSnapshot: () => ({ data: new Map() }),
}));
vi.mock('../features/queries/useSnapshotById', () => ({
  useSnapshotById: () => new Map(),
}));

const createMut = vi.fn();
vi.mock('../features/craftLists/useCraftLists', () => ({
  useCreateList: () => ({ mutateAsync: createMut, isPending: false }),
}));

function renderPage() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><CraftLists /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => { navigate.mockReset(); createMut.mockReset(); });

describe('CraftLists builder', () => {
  it('searches, adds to the tray, and creates a list', async () => {
    createMut.mockResolvedValue('newid');
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/search items/i), { target: { value: 'gun' } });
    // Two matches; check the first row
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByText(/1 item selected/i)).toBeInTheDocument();

    vi.spyOn(window, 'prompt').mockReturnValue('My Set');
    fireEvent.click(screen.getByRole('button', { name: /create list/i }));

    expect(createMut).toHaveBeenCalledWith({
      name: 'My Set',
      items: [{ itemId: 100, itemName: 'Gunblade', qty: 1, isHq: false }],
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/routes/CraftLists.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CraftLists.tsx`**

Create `src/routes/CraftLists.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useItemSnapshot } from '../features/queries/useItemSnapshot';
import { useRecipeSnapshot } from '../features/queries/useRecipeSnapshot';
import { useCreateList } from '../features/craftLists/useCraftLists';
import { SectionHeader } from '../components/SectionHeader';
import { HqStar } from '../components/HqStar';
import { crafterBeadClass } from '../features/items/crafterColors';
import { btnPrimary, btnSecondary, btnGhost } from '../components/buttonStyles';
import type { CraftListItem } from '../features/craftLists/types';

const MAX_RESULTS = 50;

interface Selected { qty: number; isHq: boolean; name: string }

export default function CraftLists() {
  const navigate = useNavigate();
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot(true);
  const createList = useCreateList();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Map<number, Selected>>(new Map());

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !snapshot.data) return { rows: [] as { id: number; name: string; canHq: boolean }[], total: 0 };
    const rows: { id: number; name: string; canHq: boolean }[] = [];
    let total = 0;
    for (const it of snapshot.data.items) {
      if (!it.name.toLowerCase().includes(q)) continue;
      total++;
      if (rows.length < MAX_RESULTS) rows.push({ id: it.id, name: it.name, canHq: it.canHq });
    }
    return { rows, total };
  }, [query, snapshot.data]);

  const recipeFor = (id: number) => recipes.data?.get(id) ?? null;

  function toggle(id: number, name: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, { qty: 1, isHq: false, name });
      return next;
    });
  }
  function setQty(id: number, qty: number) {
    setSelected((prev) => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, qty: Math.max(1, qty) });
      return next;
    });
  }
  function selectAll() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of results.rows) if (!next.has(r.id)) next.set(r.id, { qty: 1, isHq: false, name: r.name });
      return next;
    });
  }
  function clearAll() { setSelected(new Map()); }

  async function createFromSelection() {
    if (selected.size === 0) return;
    const name = window.prompt('Name this list:')?.trim();
    if (!name) return;
    const items: CraftListItem[] = [...selected.entries()].map(([itemId, s]) => ({
      itemId, itemName: s.name, qty: s.qty, isHq: s.isHq,
    }));
    const id = await createList.mutateAsync({ name, items });
    navigate(`/craft-lists/${id}`);
  }

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <SectionHeader
        label="Craft Lists"
        trailing={<Link to="/craft-lists/saved" className={btnGhost}>All lists →</Link>}
      />
      <p className="font-mono text-[11px] text-text-low max-w-prose">
        Search items, check what you want to make, then build a list — no node timers, just the items.
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search items…"
        className="w-full bg-bg-card border border-border-base text-text-cream font-mono text-sm px-3 py-2.5 focus:outline-none focus:border-aether"
      />

      {/* Selected tray */}
      {selected.size > 0 && (
        <div className="border border-gold/60 bg-bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-widest uppercase text-gold">
              {selected.size} item{selected.size === 1 ? '' : 's'} selected
            </span>
            <div className="flex gap-2">
              <button onClick={clearAll} className={btnGhost}>Clear all</button>
              <button onClick={createFromSelection} disabled={createList.isPending} className={btnPrimary}>
                Create list from selection →
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...selected.entries()].map(([id, s]) => (
              <div key={id} className="flex items-center gap-1.5 border border-border-base bg-bg-card-hi px-2 py-1">
                <span className="text-text-cream text-xs">{s.name}</span>
                <input
                  type="number" min={1} value={s.qty}
                  aria-label={`Qty for ${s.name}`}
                  onChange={(e) => setQty(id, parseInt(e.target.value) || 1)}
                  className="w-12 bg-bg-card border border-border-base text-text-cream font-mono text-xs px-1 py-0.5"
                />
                <button onClick={() => toggle(id, s.name)} aria-label={`Remove ${s.name}`} className="text-text-low hover:text-crimson px-1">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results.rows.length > 0 && (
        <div className="border border-border-base bg-bg-card">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-base">
            <span className="font-mono text-[10px] tracking-widest uppercase text-text-low">
              {results.total} match{results.total === 1 ? '' : 'es'}
              {results.total > MAX_RESULTS && ` — showing first ${MAX_RESULTS}, refine to narrow`}
            </span>
            <button onClick={selectAll} className={btnSecondary}>Select all results</button>
          </div>
          <ul>
            {results.rows.map((r) => {
              const recipe = recipeFor(r.id);
              const checked = selected.has(r.id);
              return (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 border-t border-border-base hover:bg-bg-card-hi first:border-t-0">
                  <input type="checkbox" checked={checked} onChange={() => toggle(r.id, r.name)} aria-label={`Select ${r.name}`} />
                  <span className="text-text-cream grow">{r.name}{r.canHq && <HqStar leading />}</span>
                  {recipe && (
                    <span className="font-mono text-[10px] text-text-low flex items-center gap-2">
                      <span className={`${crafterBeadClass(recipe.classJob)}`}>●</span>
                      Lv{recipe.recipeLevel}
                      {recipe.stats?.stars ? <span className="text-gold">{'★'.repeat(recipe.stats.stars)}</span> : null}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {query.trim().length >= 2 && results.rows.length === 0 && (
        <div className="p-8 text-center text-text-low font-mono text-xs italic">No items match “{query}”.</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/routes/CraftLists.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/routes/CraftLists.tsx src/routes/CraftLists.test.tsx
git commit -m "feat(craft-lists): builder page (search + selection tray)"
```

---

## Task 9: Your Lists page (`/craft-lists/saved`)

**Files:**
- Create: `src/routes/YourLists.tsx`
- Test: `src/routes/YourLists.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/routes/YourLists.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import YourLists from './YourLists';

const del = vi.fn();
vi.mock('../features/craftLists/useCraftLists', () => ({
  useCraftLists: () => ({
    data: [
      { id: 'a', name: 'Set of Fending', itemCount: 13, createdAt: 0, updatedAt: 1 },
      { id: 'b', name: 'Scrip Turn-ins', itemCount: 6, createdAt: 0, updatedAt: 2 },
    ],
    isLoading: false, isError: false,
  }),
  useDeleteList: () => ({ mutate: del, isPending: false }),
}));

beforeEach(() => { del.mockReset(); });

function renderPage() {
  return render(<MemoryRouter><YourLists /></MemoryRouter>);
}

describe('YourLists', () => {
  it('renders saved lists with counts', () => {
    renderPage();
    expect(screen.getByText('Set of Fending')).toBeInTheDocument();
    expect(screen.getByText(/13 recipes/i)).toBeInTheDocument();
  });

  it('filters by name', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/filter lists/i), { target: { value: 'scrip' } });
    expect(screen.queryByText('Set of Fending')).not.toBeInTheDocument();
    expect(screen.getByText('Scrip Turn-ins')).toBeInTheDocument();
  });

  it('deletes after confirm', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0]);
    expect(del).toHaveBeenCalledWith('a');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/routes/YourLists.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `YourLists.tsx`**

Create `src/routes/YourLists.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCraftLists, useDeleteList } from '../features/craftLists/useCraftLists';
import { SectionHeader } from '../components/SectionHeader';
import { btnPrimary, btnDanger } from '../components/buttonStyles';

function modifiedAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function YourLists() {
  const { data, isLoading, isError } = useCraftLists();
  const del = useDeleteList();
  const [filter, setFilter] = useState('');

  const lists = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data ?? []).filter((l) => l.name.toLowerCase().includes(q));
  }, [data, filter]);

  return (
    <div className="max-w-[80rem] mx-auto px-4 space-y-4">
      <SectionHeader
        label="Your Lists"
        trailing={<Link to="/craft-lists" className={btnPrimary}>+ New list</Link>}
      />
      <p className="font-mono text-[11px] text-text-low max-w-prose">
        Every crafting list you've built. Open to edit, or export to pull into the in-game plugin.
      </p>

      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter lists…"
        className="w-full bg-bg-card border border-border-base text-text-cream font-mono text-xs px-3 py-2 focus:outline-none focus:border-aether"
      />

      {isLoading && <div className="p-8 text-center text-text-low font-mono text-xs">Loading…</div>}
      {isError && <div className="p-8 text-center text-crimson font-mono text-xs">Could not load lists.</div>}
      {!isLoading && !isError && lists.length === 0 && (
        <div className="p-8 text-center text-text-low font-mono text-xs italic">
          No lists yet. <Link to="/craft-lists" className="text-aether hover:underline">Build one →</Link>
        </div>
      )}

      <ul className="space-y-2">
        {lists.map((l) => (
          <li key={l.id} className="flex items-center gap-3 border border-border-base bg-bg-card px-3 py-2.5 hover:bg-bg-card-hi">
            <Link to={`/craft-lists/${l.id}`} className="grow">
              <div className="text-text-cream font-display italic">{l.name}</div>
              <div className="font-mono text-[10px] text-text-low">
                {l.itemCount} recipe{l.itemCount === 1 ? '' : 's'} · modified {modifiedAgo(l.updatedAt)}
              </div>
            </Link>
            <button
              onClick={() => { if (window.confirm(`Delete “${l.name}”?`)) del.mutate(l.id); }}
              className={btnDanger}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/routes/YourLists.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/YourLists.tsx src/routes/YourLists.test.tsx
git commit -m "feat(craft-lists): Your Lists overview page"
```

---

## Task 10: List detail page (`/craft-lists/:id`)

**Files:**
- Create: `src/routes/ListDetail.tsx`
- Test: `src/routes/ListDetail.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/routes/ListDetail.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ListDetail from './ListDetail';

vi.mock('../features/craftLists/useCraftLists', () => ({
  useCraftList: () => ({
    data: { id: 'a', ownerId: 'owner1', name: 'Set of Fending', createdAt: 0, updatedAt: 0,
      items: [{ itemId: 1, itemName: 'Sword', qty: 1, isHq: false }] },
    isLoading: false, isError: false,
  }),
}));
vi.mock('../features/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'authed', user: { sub: 'owner1', username: 'E', avatar: null, guilds: [] }, isAdmin: false }),
}));
vi.mock('../components/ItemNameLinks', () => ({
  ItemNameLinks: ({ name }: { name: string }) => <span>{name}</span>,
}));
// Provide a deterministic resolved list so we don't need real snapshots.
vi.mock('../features/craftLists/useResolvedList', () => ({
  useResolvedList: () => ({
    ready: true,
    resolved: {
      finalItems: [{ itemId: 1, itemName: 'Sword', qty: 1, isHq: false, job: 'BSM', recipeLevel: 90, stars: 4 }],
      subCraftsByDepth: new Map([[1, [{ itemId: 2, itemName: 'Ingot', requiredQty: 2, source: 'Crafted', depth: 1, usedToCraft: ['Sword'] }]]]),
      gathered: [{ itemId: 3, itemName: 'Ore', requiredQty: 6, source: 'Gathered', usedToCraft: ['Sword'] }],
      otherAcquired: [],
      crystals: [{ itemId: 7, itemName: 'Fire Shard', requiredQty: 1, source: 'Crystal', usedToCraft: ['Sword'] }],
      all: [
        { itemId: 2, itemName: 'Ingot', requiredQty: 2, source: 'Crafted', depth: 1, usedToCraft: ['Sword'] },
        { itemId: 3, itemName: 'Ore', requiredQty: 6, source: 'Gathered', usedToCraft: ['Sword'] },
        { itemId: 7, itemName: 'Fire Shard', requiredQty: 1, source: 'Crystal', usedToCraft: ['Sword'] },
      ],
    },
  }),
}));

function renderAt(id = 'a') {
  return render(
    <MemoryRouter initialEntries={[`/craft-lists/${id}`]}>
      <Routes><Route path="/craft-lists/:id" element={<ListDetail />} /></Routes>
    </MemoryRouter>,
  );
}

describe('ListDetail', () => {
  it('renders sections by default and toggles to table', () => {
    renderAt();
    expect(screen.getByText('Set of Fending')).toBeInTheDocument();
    expect(screen.getByText(/Final Items/i)).toBeInTheDocument();
    expect(screen.getByText('Ingot')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^table$/i }));
    // Table view shows the "Used to Craft" column header
    expect(screen.getByText(/used to craft/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Create the `useResolvedList` hook**

Create `src/features/craftLists/useResolvedList.ts` (keeps `ListDetail` thin and lets the test mock it):

```ts
import { useMemo } from 'react';
import { useItemSnapshot } from '../queries/useItemSnapshot';
import { useRecipeSnapshot } from '../queries/useRecipeSnapshot';
import { useGatheringCatalog } from '../queries/useGatheringCatalog';
import { useVendorShopSnapshot } from '../queries/useVendorShopSnapshot';
import { useSpecialShopSnapshot } from '../queries/useSpecialShopSnapshot';
import { resolveList, type ResolvedList, type ListInput } from './resolveList';

export function useResolvedList(inputs: ListInput[]): { ready: boolean; resolved: ResolvedList | null } {
  const snapshot = useItemSnapshot();
  const recipes = useRecipeSnapshot(true);
  const gathering = useGatheringCatalog();
  const vendor = useVendorShopSnapshot();
  const shop = useSpecialShopSnapshot();

  const itemsById = useMemo(() => {
    const m = new Map<number, import('../../lib/itemSnapshot').SnapshotItem>();
    if (snapshot.data) for (const it of snapshot.data.items) m.set(it.id, it);
    return m;
  }, [snapshot.data]);

  const ready = !!(snapshot.data && recipes.data && gathering.data);

  const resolved = useMemo(() => {
    if (!ready) return null;
    return resolveList(inputs, {
      recipes: recipes.data!,
      gathering: gathering.data!,
      vendorMap: vendor.data?.snapshot ?? new Map<number, number>(),
      specialShop: shop.data?.snapshot ?? { byCurrency: new Map() },
      itemsById,
    });
  }, [ready, inputs, recipes.data, gathering.data, vendor.data, shop.data, itemsById]);

  return { ready, resolved };
}
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npx vitest run src/routes/ListDetail.test.tsx`
Expected: FAIL — `./ListDetail` not found.

- [ ] **Step 4: Implement `ListDetail.tsx`**

Create `src/routes/ListDetail.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCraftList } from '../features/craftLists/useCraftLists';
import { useResolvedList } from '../features/craftLists/useResolvedList';
import { useAuth } from '../features/auth/AuthProvider';
import { resolvedToPlainText, encodeListCode } from '../features/craftLists/listCode';
import { SectionHeader } from '../components/SectionHeader';
import { ItemNameLinks } from '../components/ItemNameLinks';
import { HqStar } from '../components/HqStar';
import { SourceTag } from '../features/craftLists/SourceTag';
import { crafterBeadClass } from '../features/items/crafterColors';
import { btnSecondary, btnGhost } from '../components/buttonStyles';
import type { ListInput, ResolvedIngredient, ResolvedList } from '../features/craftLists/resolveList';
import type { ListSource } from '../features/craftLists/resolveList';

type View = 'sections' | 'table';
type SourceFilter = 'All' | 'Crafted' | 'Gathered' | 'Vendor' | 'Monster' | 'Crystal';

function copy(text: string) {
  void navigator.clipboard?.writeText(text);
}

function IngredientRow({ ing }: { ing: ResolvedIngredient }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border-base text-sm">
      <span className="grow"><ItemNameLinks id={ing.itemId} name={ing.itemName} suffix={ing.canHq ? <HqStar leading /> : undefined} /></span>
      <SourceTag source={ing.source} />
      {ing.recipeLevel != null && (
        <span className="font-mono text-[10px] text-text-low flex items-center gap-1">
          {ing.craftedByJob && <span className={crafterBeadClass(ing.craftedByJob)}>●</span>}Lv{ing.recipeLevel}
        </span>
      )}
      <span className="font-mono text-gold-hi tabular-nums w-12 text-right">×{ing.requiredQty}</span>
      {ing.usedToCraft.length > 0 && (
        <span className="font-mono text-[10px] text-text-low w-48 truncate" title={ing.usedToCraft.join(', ')}>
          feeds: {ing.usedToCraft.join(', ')}
        </span>
      )}
    </div>
  );
}

function Section({ title, count, defaultOpen = true, children }: { title: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border-base bg-bg-card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 text-left">
        <span className="font-mono text-[11px] tracking-[0.25em] uppercase text-gold">{open ? '▾' : '▸'} {title}</span>
        <span className="font-mono text-[10px] text-text-low">{count}</span>
      </button>
      {open && children}
    </div>
  );
}

function SectionsView({ resolved }: { resolved: ResolvedList }) {
  const depths = [...resolved.subCraftsByDepth.keys()].sort((a, b) => a - b);
  return (
    <div className="space-y-3">
      <Section title="Final Items" count={resolved.finalItems.length}>
        <div className="grid grid-cols-1 md:grid-cols-2">
          {resolved.finalItems.map((f) => (
            <div key={f.itemId} className="flex items-center gap-3 px-3 py-1.5 border-t border-border-base text-sm">
              {f.job && <span className={`${crafterBeadClass(f.job)} text-[10px]`}>●</span>}
              <span className="grow"><ItemNameLinks id={f.itemId} name={f.itemName} suffix={f.isHq ? <HqStar leading /> : undefined} /></span>
              {f.stars ? <span className="text-gold text-[10px]">{'★'.repeat(f.stars)}</span> : null}
              <span className="font-mono text-gold-hi tabular-nums">×{f.qty}</span>
            </div>
          ))}
        </div>
      </Section>

      {depths.map((d) => (
        <Section key={d} title={`Sub-crafts — Level ${d}`} count={resolved.subCraftsByDepth.get(d)!.length}>
          {resolved.subCraftsByDepth.get(d)!.map((ing) => <IngredientRow key={ing.itemId} ing={ing} />)}
        </Section>
      ))}

      {resolved.gathered.length > 0 && (
        <Section title="Gathered" count={resolved.gathered.length}>
          {resolved.gathered.map((ing) => <IngredientRow key={ing.itemId} ing={ing} />)}
        </Section>
      )}
      {resolved.otherAcquired.length > 0 && (
        <Section title="Vendor / Monster Drop / Other" count={resolved.otherAcquired.length}>
          {resolved.otherAcquired.map((ing) => <IngredientRow key={ing.itemId} ing={ing} />)}
        </Section>
      )}
      {resolved.crystals.length > 0 && (
        <Section title="Crystals" count={resolved.crystals.length} defaultOpen={false}>
          {resolved.crystals.map((ing) => <IngredientRow key={ing.itemId} ing={ing} />)}
        </Section>
      )}
    </div>
  );
}

const FILTER_MATCH: Record<Exclude<SourceFilter, 'All'>, (s: ListSource) => boolean> = {
  Crafted: (s) => s === 'Crafted',
  Gathered: (s) => s === 'Gathered' || s === 'TimedGather',
  Vendor: (s) => s === 'Vendor' || s === 'Tome',
  Monster: (s) => s === 'MonsterDrop',
  Crystal: (s) => s === 'Crystal',
};

function TableView({ resolved }: { resolved: ResolvedList }) {
  const [filter, setFilter] = useState<SourceFilter>('All');
  const rows = filter === 'All' ? resolved.all : resolved.all.filter((r) => FILTER_MATCH[filter](r.source));
  const filters: SourceFilter[] = ['All', 'Crafted', 'Gathered', 'Vendor', 'Monster', 'Crystal'];
  return (
    <div className="space-y-2">
      <div className="flex border border-border-base overflow-x-auto w-fit">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-[11px] px-3 py-1.5 border-r border-border-base last:border-r-0 ${
              filter === f ? 'bg-bg-card-hi text-aether' : 'text-text-dim hover:text-aether'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="font-mono text-[10px] tracking-widest uppercase text-text-low text-left">
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Recipe</th>
            <th className="px-3 py-2 text-right">Required</th>
            <th className="px-3 py-2">Used to Craft</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemId} className="border-t border-border-base hover:bg-bg-card-hi">
              <td className="px-3 py-1.5"><ItemNameLinks id={r.itemId} name={r.itemName} /></td>
              <td className="px-3 py-1.5"><SourceTag source={r.source} /></td>
              <td className="px-3 py-1.5 font-mono text-[10px] text-text-low">
                {r.recipeLevel != null ? (<span className="flex items-center gap-1">{r.craftedByJob && <span className={crafterBeadClass(r.craftedByJob)}>●</span>}Lv{r.recipeLevel}</span>) : '—'}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-gold-hi tabular-nums">×{r.requiredQty}</td>
              <td className="px-3 py-1.5 font-mono text-[10px] text-text-low">{r.usedToCraft.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const list = useCraftList(id);
  const inputs: ListInput[] = useMemo(
    () => (list.data?.items ?? []).map((it) => ({ itemId: it.itemId, qty: it.qty, isHq: it.isHq })),
    [list.data],
  );
  const { ready, resolved } = useResolvedList(inputs);
  const [view, setView] = useState<View>('sections');

  if (list.isLoading) return <div className="p-8 text-center text-text-low font-mono text-xs">Loading…</div>;
  if (list.isError || !list.data) {
    return (
      <div className="p-8 text-center text-text-low font-mono text-xs">
        List not found. <Link to="/craft-lists/saved" className="text-aether hover:underline">Your lists →</Link>
      </div>
    );
  }

  const isOwner = auth.user?.sub === list.data.ownerId;
  const ingredientCount = resolved
    ? resolved.all.filter((r) => r.source !== 'Crystal').length
    : 0;

  return (
    <div className="max-w-[100rem] mx-auto px-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl text-gold italic">{list.data.name}</h2>
          <p className="font-mono text-[10px] text-text-low">
            {list.data.items.length} recipes · {ingredientCount} ingredients · {resolved?.crystals.length ?? 0} crystal types
          </p>
        </div>
        <div className="flex gap-2">
          {isOwner && <Link to="/craft-lists" className={btnGhost}>+ Add items</Link>}
          <button
            disabled={!resolved}
            onClick={() => resolved && copy(resolvedToPlainText(list.data!.name, resolved))}
            className={btnSecondary}
          >
            Export plain text
          </button>
          <button
            onClick={() => copy(encodeListCode(list.data!.name, list.data!.items))}
            className={btnSecondary}
          >
            Send to plugin
          </button>
        </div>
      </div>

      <div className="flex gap-1.5">
        {(['sections', 'table'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setView(m)}
            className={`px-2.5 py-1 font-mono text-[10px] tracking-wide uppercase border transition-colors ${
              view === m ? 'bg-aether/20 border-aether text-aether' : 'border-border-base/40 text-text-low hover:border-aether/50 hover:text-text-cream'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {!ready || !resolved ? (
        <div className="p-8 text-center text-text-low font-mono text-xs">Resolving ingredients…</div>
      ) : view === 'sections' ? (
        <SectionsView resolved={resolved} />
      ) : (
        <TableView resolved={resolved} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/routes/ListDetail.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/routes/ListDetail.tsx src/features/craftLists/useResolvedList.ts src/routes/ListDetail.test.tsx
git commit -m "feat(craft-lists): list detail (sections + table) + resolution hook"
```

---

## Task 11: Wire routes + sidebar nav

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add imports to `App.tsx`**

In `src/App.tsx`, after the `import Project from './routes/Project';` line (line 45), add:

```tsx
import CraftLists from './routes/CraftLists';
import YourLists from './routes/YourLists';
import ListDetail from './routes/ListDetail';
```

- [ ] **Step 2: Add page titles**

In the `PAGE_TITLES` object, add:

```tsx
  '/craft-lists': 'Craft Lists',
  '/craft-lists/saved': 'Your Lists',
```

And in `DocumentTitle`, after the `/projects/` branch (line ~88), add:

```tsx
      else if (pathname.startsWith('/craft-lists/')) page = 'Craft List';
```

- [ ] **Step 3: Add routes**

In the inner `<Routes>` (after `<Route path="/projects/:id" element={<Project />} />`, line 158), add — **static `saved` route BEFORE the dynamic `:id` route**:

```tsx
                        <Route path="/craft-lists" element={<CraftLists />} />
                        <Route path="/craft-lists/saved" element={<YourLists />} />
                        <Route path="/craft-lists/:id" element={<ListDetail />} />
```

- [ ] **Step 4: Add the sidebar nav entry**

In `src/components/layout/Sidebar.tsx`, in the `Planning` group's `items` array, add `Craft Lists` after `Projects`:

```tsx
      { label: 'Projects', path: '/projects' },
      { label: 'Craft Lists', path: '/craft-lists' },
```

- [ ] **Step 5: Verify build + typecheck**

Run: `npm run build`
Expected: `tsc` passes, `vite build` succeeds, `build:api` bundles (no new entry needed — lists ride on `projects`).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(craft-lists): wire routes + sidebar nav entry"
```

---

## Task 12: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new craft-lists tests and the unchanged `projects.test.ts`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 warnings (the repo runs `--max-warnings 0`).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, then in the browser:
- Sidebar → **Craft Lists**: search "fending", check 3–4 items, adjust a qty, **Create list from selection**, name it.
- Land on the detail page: confirm **Final Items**, **Sub-crafts — Level 1/2**, **Gathered**, **Crystals** (collapsed) appear; toggle **Table**, filter by source chips.
- **Send to plugin** copies a `qq:list:v1:…` code; **Export plain text** copies a readable list (paste somewhere to verify).
- **Your Lists** (All lists →): the new list shows with its recipe count; filter by name; delete it (confirm dialog).

> Note: live API CRUD requires `TURSO_DATABASE_URL`, `AUTH_SESSION_SECRET`, and a valid `qiqirn_session` cookie. If the local env lacks Turso, verify the API paths via the automated tests (Tasks 1–3) and smoke-test only the client builder/resolution UI.

- [ ] **Step 5: Final commit (if any polish changes were made)**

```bash
git add -A
git commit -m "chore(craft-lists): verification polish"
```

---

## Spec coverage check

- Item search + live filter + qty + checkbox tray + select-all + clear → **Task 8**.
- Create list from selection (name prompt) → **Task 8** + **Task 6** + **Task 3**.
- Lists page (name, count, modified, open, delete) → **Task 9**.
- Server-stored lists keyed by Discord identity, shareable id URL → **Tasks 1–3** (owner = `session.sub`, short random id).
- List detail: collapsible Sections (Final Items, Sub-crafts by depth, Gathered incl. Timed, Vendor/Other, Crystals collapsed) + Table view with source filter + Used-to-Craft → **Tasks 5, 7, 10**.
- Source tags incl. Timed Gather, Tome/Token, Crystal → **Tasks 5, 7**.
- Exports: `qq:list:v1` plugin code + plain text → **Tasks 4, 10**.
- No new lambda (12-cap), client-side resolution → **Tasks 3, 5**.
- Out of scope (timers, autocraft, inventory/colors, live sync, premade) → not built; deferred to Part 2 per spec.
