# Access Roster + Per-User Access Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only roster of everyone who has logged in, with the ability to grant (`allow`) or revoke (`block`) individual Discord users beyond the existing guild allow-list.

**Architecture:** Record each login into a new `app_users` table (Turso/libSQL). A pure `decideAccess` function combines guild membership with a per-user `default | allow | block` override; it is enforced at login (callback) and on every `/api/auth/me` poll. Admin status comes from an `ADMIN_USER_IDS` env var. The admin API folds into the existing `api/auth` function (12-function Hobby cap), and a React `/admin` page renders the roster.

**Tech Stack:** TypeScript, Vercel serverless functions (`@vercel/node`), `@libsql/client` (Turso), `jose` (JWT sessions), React 18 + react-router-dom 7, Vitest + Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-03-user-management-design.md`

---

## File structure

**Create:**
- `src/api/_access.ts` — pure `decideAccess` + re-export of `AccessLevel`.
- `src/api/_access.test.ts` — table tests for `decideAccess`.
- `src/api/_store.ts` — shared memoized `getStore()` with test-injection.
- `src/api/auth/admin.ts` — admin-only GET roster / POST access endpoint.
- `src/api/auth/admin.test.ts` — handler tests (auth gate + behavior).
- `src/bot/craftStore.appUsers.test.ts` — store CRUD tests for `app_users`.
- `src/features/auth/RequireAdmin.tsx` — admin route guard.
- `src/features/auth/RequireAdmin.test.tsx` — guard tests.
- `src/routes/Admin.tsx` — roster page.
- `src/routes/Admin.test.tsx` — page render + access-change test.

**Modify:**
- `src/bot/craftTypes.ts` — add `AccessLevel` + `AppUser` types.
- `src/bot/craftStore.ts` — add `app_users` table + 4 store methods.
- `src/api/_auth.ts` — add `getAdminIds()` + `isAdmin()`.
- `src/api/auth/callback.ts` — record login + enforce access.
- `src/api/auth/me.ts` — enforce access + return `isAdmin`.
- `src/api/auth.ts` — dispatch `/auth/admin/*` to the admin handler.
- `vercel.json` — rewrite `/api/auth/admin/(.*)` → `/api/auth`.
- `src/features/auth/AuthProvider.tsx` — add `isAdmin` to auth state.
- `src/features/auth/UserMenu.tsx` — show **Admin** link when `isAdmin`.
- `src/App.tsx` — register `/admin` route + page title.

**Note on the build:** `npm run build:api` bundles `src/api/auth.ts` with esbuild. Because `auth.ts` imports `./auth/admin` (and `admin.ts` imports `_store`/`_access`), the new modules bundle automatically — **no change to the `build:api` script is required.**

**Test commands:** run a single file with `npx vitest run <path>`. API/handler tests carry `// @vitest-environment node`; component tests use the default jsdom env.

---

## Task 1: `decideAccess` pure function

**Files:**
- Modify: `src/bot/craftTypes.ts`
- Create: `src/api/_access.ts`
- Test: `src/api/_access.test.ts`

- [ ] **Step 1: Add the shared types**

In `src/bot/craftTypes.ts`, add near the top (after the existing `TaskSource` type):

```ts
export type AccessLevel = 'default' | 'allow' | 'block';

export interface AppUser {
  discordId: string;
  username: string;
  avatar: string | null;
  guilds: string[];
  access: AccessLevel;
  firstSeen: number;
  lastSeen: number;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/api/_access.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { decideAccess } from './_access';

describe('decideAccess', () => {
  it('block always denies', () => {
    expect(decideAccess({ guildAllowed: true, access: 'block' })).toBe(false);
    expect(decideAccess({ guildAllowed: false, access: 'block' })).toBe(false);
  });

  it('allow always admits', () => {
    expect(decideAccess({ guildAllowed: true, access: 'allow' })).toBe(true);
    expect(decideAccess({ guildAllowed: false, access: 'allow' })).toBe(true);
  });

  it('default and null follow the guild rule', () => {
    expect(decideAccess({ guildAllowed: true, access: 'default' })).toBe(true);
    expect(decideAccess({ guildAllowed: false, access: 'default' })).toBe(false);
    expect(decideAccess({ guildAllowed: true, access: null })).toBe(true);
    expect(decideAccess({ guildAllowed: false, access: null })).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npx vitest run src/api/_access.test.ts`
Expected: FAIL — `Failed to resolve import "./_access"`.

- [ ] **Step 4: Implement `_access.ts`**

Create `src/api/_access.ts`:

```ts
import type { AccessLevel } from '../bot/craftTypes';

export type { AccessLevel };

/**
 * Single source of truth for "is this user allowed in?".
 * - block   → never
 * - allow   → always
 * - default → follow the guild allow-list result
 * `access: null` means we have no record yet → treated as 'default'.
 */
export function decideAccess(input: { guildAllowed: boolean; access: AccessLevel | null }): boolean {
  if (input.access === 'block') return false;
  if (input.access === 'allow') return true;
  return input.guildAllowed;
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run src/api/_access.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/bot/craftTypes.ts src/api/_access.ts src/api/_access.test.ts
git commit -m "feat: decideAccess pure function + access types"
```

---

## Task 2: `app_users` table + store methods

**Files:**
- Modify: `src/bot/craftStore.ts`
- Test: `src/bot/craftStore.appUsers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/bot/craftStore.appUsers.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openCraftStore, type CraftStore } from './craftStore';

let store: CraftStore;

beforeEach(async () => {
  store = await openCraftStore(':memory:');
});

describe('app_users store', () => {
  it('upsert inserts a row and lists it', async () => {
    await store.upsertAppUser({ discordId: 'U1', username: 'Esther', avatar: 'av1', guilds: ['G1'] });
    const users = await store.listAppUsers();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      discordId: 'U1', username: 'Esther', avatar: 'av1', guilds: ['G1'], access: 'default',
    });
    expect(users[0].firstSeen).toBeGreaterThan(0);
    expect(users[0].lastSeen).toBeGreaterThan(0);
  });

  it('upsert preserves access and first_seen but refreshes name/last_seen', async () => {
    await store.upsertAppUser({ discordId: 'U1', username: 'Old', avatar: null, guilds: ['G1'] });
    const first = (await store.getAppUser('U1'))!;
    await store.setUserAccess('U1', 'block');
    await store.upsertAppUser({ discordId: 'U1', username: 'New', avatar: 'av2', guilds: ['G1', 'G2'] });
    const after = (await store.getAppUser('U1'))!;
    expect(after.username).toBe('New');
    expect(after.avatar).toBe('av2');
    expect(after.guilds).toEqual(['G1', 'G2']);
    expect(after.access).toBe('block');           // preserved
    expect(after.firstSeen).toBe(first.firstSeen); // preserved
    expect(after.lastSeen).toBeGreaterThanOrEqual(first.lastSeen);
  });

  it('getAppUser returns null for unknown user', async () => {
    expect(await store.getAppUser('nope')).toBeNull();
  });

  it('setUserAccess updates the access level', async () => {
    await store.upsertAppUser({ discordId: 'U1', username: 'E', avatar: null, guilds: [] });
    await store.setUserAccess('U1', 'allow');
    expect((await store.getAppUser('U1'))!.access).toBe('allow');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/bot/craftStore.appUsers.test.ts`
Expected: FAIL — `store.upsertAppUser is not a function`.

- [ ] **Step 3: Add the type import + interface methods**

In `src/bot/craftStore.ts`, update the top import to include the new types:

```ts
import type { CraftProject, StoredTask, CraftTask, ChannelState, AppUser, AccessLevel } from './craftTypes';
```

Add these to the `CraftStore` interface (anywhere inside it, e.g. after `setGuildConfig`):

```ts
  upsertAppUser(u: { discordId: string; username: string; avatar: string | null; guilds: string[] }): Promise<void>;
  listAppUsers(): Promise<AppUser[]>;
  getAppUser(discordId: string): Promise<AppUser | null>;
  setUserAccess(discordId: string, access: AccessLevel): Promise<void>;
```

- [ ] **Step 4: Add the table to the schema**

In the `SCHEMA` template string in `openCraftStore`, add this table (after the `guild_config` table, before the closing backtick):

```sql
    CREATE TABLE IF NOT EXISTS app_users (
      discord_id  TEXT PRIMARY KEY,
      username    TEXT NOT NULL,
      avatar      TEXT,
      guilds      TEXT NOT NULL DEFAULT '[]',
      access      TEXT NOT NULL DEFAULT 'default',
      first_seen  INTEGER NOT NULL,
      last_seen   INTEGER NOT NULL
    );
```

- [ ] **Step 5: Implement the methods**

Add a row mapper next to the existing `rowToProject` / `rowToTask` helpers in `openCraftStore`:

```ts
  function rowToAppUser(row: Record<string, any>): AppUser {
    return {
      discordId: String(row.discord_id),
      username: String(row.username),
      avatar: row.avatar ? String(row.avatar) : null,
      guilds: row.guilds ? JSON.parse(String(row.guilds)) : [],
      access: String(row.access) as AccessLevel,
      firstSeen: Number(row.first_seen),
      lastSeen: Number(row.last_seen),
    };
  }
```

Add these methods to the returned store object (alongside the existing methods):

```ts
    async upsertAppUser(u) {
      const now = Date.now();
      await client.execute({
        sql: `
          INSERT INTO app_users (discord_id, username, avatar, guilds, access, first_seen, last_seen)
          VALUES (?, ?, ?, ?, 'default', ?, ?)
          ON CONFLICT(discord_id) DO UPDATE SET
            username = excluded.username,
            avatar = excluded.avatar,
            guilds = excluded.guilds,
            last_seen = excluded.last_seen
        `,
        args: [u.discordId, u.username, u.avatar, JSON.stringify(u.guilds), now, now],
      });
    },

    async listAppUsers() {
      const result = await client.execute('SELECT * FROM app_users ORDER BY last_seen DESC');
      return result.rows.map(rowToAppUser);
    },

    async getAppUser(discordId) {
      const result = await client.execute({
        sql: 'SELECT * FROM app_users WHERE discord_id = ?',
        args: [discordId],
      });
      return result.rows.length ? rowToAppUser(result.rows[0] as Record<string, any>) : null;
    },

    async setUserAccess(discordId, access) {
      await client.execute({
        sql: 'UPDATE app_users SET access = ? WHERE discord_id = ?',
        args: [access, discordId],
      });
    },
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `npx vitest run src/bot/craftStore.appUsers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/bot/craftStore.ts src/bot/craftStore.appUsers.test.ts
git commit -m "feat: app_users table + store methods"
```

---

## Task 3: Shared `getStore()` helper

**Files:**
- Create: `src/api/_store.ts`
- Test: `src/api/_store.test.ts`

This DRYs the store-open + test-injection pattern that `callback`, `me`, and `admin` all need (today it is duplicated in `projects.ts` and `plugin-projects.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/api/_store.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { openCraftStore } from '../bot/craftStore';
import { getStore } from './_store';

afterEach(() => { delete (globalThis as any).__testCraftStore; });

describe('getStore', () => {
  it('returns the injected test store when present', async () => {
    const injected = await openCraftStore(':memory:');
    (globalThis as any).__testCraftStore = injected;
    expect(await getStore()).toBe(injected);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/api/_store.test.ts`
Expected: FAIL — `Failed to resolve import "./_store"`.

- [ ] **Step 3: Implement `_store.ts`**

Create `src/api/_store.ts`:

```ts
import { openCraftStore, type CraftStore } from '../bot/craftStore';

let storePromise: Promise<CraftStore> | null = null;

/** Shared Turso store accessor for the auth endpoints. Honors the
 *  `__testCraftStore` injection used by the handler tests. */
export function getStore(): Promise<CraftStore> {
  const injected = (globalThis as any).__testCraftStore as CraftStore | undefined;
  if (injected) return Promise.resolve(injected);
  if (!storePromise) {
    storePromise = openCraftStore(process.env.TURSO_DATABASE_URL!, process.env.TURSO_AUTH_TOKEN);
  }
  return storePromise;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/api/_store.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/api/_store.ts src/api/_store.test.ts
git commit -m "feat: shared getStore() helper for auth endpoints"
```

---

## Task 4: Record login + enforce access in the callback

**Files:**
- Modify: `src/api/auth/callback.ts`
- Test: `src/api/auth/callback.test.ts`

The callback currently rejects only when no allow-listed guild matched. New behavior: combine guild eligibility with the user's stored `access` via `decideAccess`, and record the login.

- [ ] **Step 1: Read the existing test to learn the fetch-mock pattern**

Open `src/api/auth/callback.test.ts` and note how `global.fetch` is stubbed for the token / `@me` / `@me/guilds` calls. Reuse that exact mocking style for the new tests below (do not change existing tests).

- [ ] **Step 2: Write the failing tests**

Append to `src/api/auth/callback.test.ts` (inside the existing top-level `describe`, or a new one). This assumes the file already has a helper that mocks the three Discord fetches given an identity + guild list; if it uses inline `vi.stubGlobal('fetch', ...)`, mirror that. The two new cases:

```ts
import { openCraftStore, type CraftStore } from '../../bot/craftStore';

describe('callback access control', () => {
  let store: CraftStore;
  beforeEach(async () => {
    store = await openCraftStore(':memory:');
    (globalThis as any).__testCraftStore = store;
    process.env.GUILD_ALLOWLIST = 'G1';
    process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
    process.env.DISCORD_CLIENT_ID = 'cid';
    process.env.DISCORD_CLIENT_SECRET = 'csecret';
  });
  afterEach(() => { delete (globalThis as any).__testCraftStore; });

  // Stubs the Discord token + identity + guilds calls. `guildIds` controls
  // which guilds the user belongs to.
  function stubDiscord(userId: string, guildIds: string[]) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      if (url.endsWith('/users/@me')) return new Response(JSON.stringify({ id: userId, username: 'Esther', avatar: 'av' }), { status: 200 });
      if (url.endsWith('/@me/guilds')) return new Response(JSON.stringify(guildIds.map((id) => ({ id }))), { status: 200 });
      return new Response('{}', { status: 404 });
    }));
  }

  function callbackReq() {
    return { method: 'GET', url: '/api/auth/callback', query: { code: 'c', state: 's' }, headers: { host: 'qiqirn.tools' } } as any;
  }
  function callbackRes() {
    const res: any = {};
    res.setHeader = vi.fn().mockReturnValue(res);
    res.status = vi.fn().mockReturnValue(res);
    res.end = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  it('records the login and admits a guild member (default access)', async () => {
    stubDiscord('U1', ['G1']);
    const { signState } = await import('../_auth');
    const req = callbackReq();
    req.query.state = await signState('/');
    const res = callbackRes();
    await handler(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('qiqirn_session='));
    const user = await store.getAppUser('U1');
    expect(user).toMatchObject({ username: 'Esther', access: 'default' });
  });

  it('blocks a user whose access is block, even if in an allowed guild', async () => {
    await store.upsertAppUser({ discordId: 'U2', username: 'X', avatar: null, guilds: ['G1'] });
    await store.setUserAccess('U2', 'block');
    stubDiscord('U2', ['G1']);
    const { signState } = await import('../_auth');
    const req = callbackReq();
    req.query.state = await signState('/');
    const res = callbackRes();
    await handler(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Location', '/login?error=not_authorized');
  });

  it('admits an allow-override user with no allowed guild', async () => {
    await store.upsertAppUser({ discordId: 'U3', username: 'Y', avatar: null, guilds: [] });
    await store.setUserAccess('U3', 'allow');
    stubDiscord('U3', ['OTHER']);
    const { signState } = await import('../_auth');
    const req = callbackReq();
    req.query.state = await signState('/');
    const res = callbackRes();
    await handler(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('qiqirn_session='));
  });
});
```

> If `vi` / `beforeEach` / `afterEach` aren't already imported at the top of the file, add them to the `vitest` import.

- [ ] **Step 3: Run the tests, verify they fail**

Run: `npx vitest run src/api/auth/callback.test.ts`
Expected: FAIL — the block case still sets a cookie (no access enforcement yet); the allow case redirects to `not_authorized`.

- [ ] **Step 4: Update the callback**

In `src/api/auth/callback.ts`, update the imports:

```ts
import {
  verifyState, signSession, serializeSessionCookie, allowedGuildsFor, oauthRedirectUri,
} from '../_auth';
import { decideAccess } from '../_access';
import { getStore } from '../_store';
```

Replace the authorization + cookie-minting block (current lines 54–66, "3. Authorize…" through the `setHeader`/redirect) with:

```ts
    // 3. Authorize: combine guild membership with any per-user override.
    const allowed = allowedGuildsFor(guilds.map((g) => g.id));
    const store = await getStore();
    const record = await store.getAppUser(me.id);
    if (!decideAccess({ guildAllowed: allowed.length > 0, access: record?.access ?? null })) {
      return redirect(res, '/login?error=not_authorized');
    }

    // 4. Record / refresh the login.
    await store.upsertAppUser({
      discordId: me.id,
      username: me.global_name ?? me.username ?? me.id,
      avatar: me.avatar ?? null,
      guilds: allowed,
    });

    // 5. Mint the session cookie.
    const token = await signSession({
      sub: me.id,
      username: me.global_name ?? me.username ?? me.id,
      avatar: me.avatar ?? null,
      guilds: allowed,
    });
    res.setHeader('Set-Cookie', serializeSessionCookie(token));
    return redirect(res, returnTo || '/');
```

- [ ] **Step 5: Run the tests, verify they pass**

Run: `npx vitest run src/api/auth/callback.test.ts`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/api/auth/callback.ts src/api/auth/callback.test.ts
git commit -m "feat: record login + enforce per-user access in callback"
```

---

## Task 5: Enforce access + return `isAdmin` from `/api/auth/me`

**Files:**
- Modify: `src/api/_auth.ts`
- Modify: `src/api/auth/me.ts`
- Test: `src/api/auth/me.test.ts`

- [ ] **Step 1: Write the failing tests**

Update `src/api/auth/me.test.ts`. Add the store-injection setup and three cases. Replace the existing `beforeEach` with one that also sets up the store, and add the imports:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openCraftStore, type CraftStore } from '../../bot/craftStore';
```

Add inside the `describe('auth/me', ...)` block (and set up the store in a `beforeEach`):

```ts
  let store: CraftStore;
  beforeEach(async () => {
    process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
    store = await openCraftStore(':memory:');
    (globalThis as any).__testCraftStore = store;
  });
  afterEach(() => { delete (globalThis as any).__testCraftStore; delete process.env.ADMIN_USER_IDS; });

  it('returns 401 when the user is blocked', async () => {
    await store.upsertAppUser({ discordId: '111', username: 'E', avatar: null, guilds: ['123'] });
    await store.setUserAccess('111', 'block');
    const token = await signSession({ sub: '111', username: 'E', avatar: null, guilds: ['123'] });
    const res = makeRes();
    await meHandler(req('GET', `${SESSION_COOKIE}=${token}`), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns isAdmin true when sub is in ADMIN_USER_IDS', async () => {
    process.env.ADMIN_USER_IDS = '111,222';
    const token = await signSession({ sub: '111', username: 'E', avatar: null, guilds: ['123'] });
    const res = makeRes();
    await meHandler(req('GET', `${SESSION_COOKIE}=${token}`), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.isAdmin).toBe(true);
  });

  it('returns isAdmin false for a non-admin', async () => {
    process.env.ADMIN_USER_IDS = '999';
    const token = await signSession({ sub: '111', username: 'E', avatar: null, guilds: ['123'] });
    const res = makeRes();
    await meHandler(req('GET', `${SESSION_COOKIE}=${token}`), res);
    expect(res.body.isAdmin).toBe(false);
  });
```

> The existing "returns the user for a valid cookie" test must keep passing — the store is now injected so the lookup returns `null` (→ access `default` → guild rule). That user has `guilds: ['123']`, so `guildAllowed` is true and it still returns 200.

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run src/api/auth/me.test.ts`
Expected: FAIL — `res.body.isAdmin` is undefined; the blocked case returns 200.

- [ ] **Step 3: Add admin helpers to `_auth.ts`**

In `src/api/_auth.ts`, add after `getAllowList`:

```ts
export function getAdminIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAdmin(sub: string): boolean {
  return getAdminIds().includes(sub);
}
```

- [ ] **Step 4: Update `me.ts`**

Replace the body of `src/api/auth/me.ts` with:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSession, isAdmin } from '../_auth';
import { decideAccess } from '../_access';
import { getStore } from '../_store';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const user = await requireSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  // Re-check access on every poll so a revoke (block) takes effect on the
  // user's next page load. `guilds` in the JWT are the allow-listed guilds at
  // login time — enough to honor a block/allow override set afterward.
  const store = await getStore();
  const record = await store.getAppUser(user.sub);
  if (!decideAccess({ guildAllowed: (user.guilds?.length ?? 0) > 0, access: record?.access ?? null })) {
    return res.status(401).json({ error: 'Access revoked' });
  }

  return res.status(200).json({ user, isAdmin: isAdmin(user.sub) });
}

export const config = { api: { bodyParser: false } };
```

- [ ] **Step 5: Run the tests, verify they pass**

Run: `npx vitest run src/api/auth/me.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/api/_auth.ts src/api/auth/me.ts src/api/auth/me.test.ts
git commit -m "feat: enforce access + expose isAdmin from auth/me"
```

---

## Task 6: Admin endpoint (GET roster / POST access)

**Files:**
- Create: `src/api/auth/admin.ts`
- Modify: `src/api/auth.ts`
- Test: `src/api/auth/admin.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/api/auth/admin.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import handler from './admin';
import { openCraftStore, type CraftStore } from '../../bot/craftStore';
import { signSession, SESSION_COOKIE } from '../_auth';

let store: CraftStore;

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

// admin POST reads the raw request stream; emulate Node's readable events.
function postReq(url: string, cookie: string | undefined, bodyObj: unknown) {
  const body = JSON.stringify(bodyObj);
  return {
    method: 'POST', url,
    headers: cookie ? { cookie } : {},
    on(event: string, cb: (chunk?: any) => void) {
      if (event === 'data') cb(body);
      if (event === 'end') cb();
      return this;
    },
  } as any;
}

beforeEach(async () => {
  store = await openCraftStore(':memory:');
  (globalThis as any).__testCraftStore = store;
  process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
  process.env.ADMIN_USER_IDS = 'ADMIN1';
  await store.upsertAppUser({ discordId: 'U1', username: 'Esther', avatar: null, guilds: ['G1'] });
});
afterEach(() => { delete (globalThis as any).__testCraftStore; delete process.env.ADMIN_USER_IDS; });

async function adminCookie() {
  return `${SESSION_COOKIE}=${await signSession({ sub: 'ADMIN1', username: 'A', avatar: null, guilds: ['G1'] })}`;
}
async function userCookie() {
  return `${SESSION_COOKIE}=${await signSession({ sub: 'U1', username: 'E', avatar: null, guilds: ['G1'] })}`;
}

describe('admin auth gate', () => {
  it('401 with no session', async () => {
    const res = mockRes();
    await handler({ method: 'GET', url: '/api/auth/admin/users', headers: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('403 for a non-admin session', async () => {
    const res = mockRes();
    await handler({ method: 'GET', url: '/api/auth/admin/users', headers: { cookie: await userCookie() } } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('GET /api/auth/admin/users', () => {
  it('returns the roster for an admin', async () => {
    const res = mockRes();
    await handler({ method: 'GET', url: '/api/auth/admin/users', headers: { cookie: await adminCookie() } } as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].users).toHaveLength(1);
    expect(res.json.mock.calls[0][0].users[0].discordId).toBe('U1');
  });
});

describe('POST /api/auth/admin/access', () => {
  it('updates a user access level', async () => {
    const res = mockRes();
    await handler(postReq('/api/auth/admin/access', await adminCookie(), { discordId: 'U1', access: 'block' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect((await store.getAppUser('U1'))!.access).toBe('block');
  });

  it('400 on an invalid access value', async () => {
    const res = mockRes();
    await handler(postReq('/api/auth/admin/access', await adminCookie(), { discordId: 'U1', access: 'bogus' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run src/api/auth/admin.test.ts`
Expected: FAIL — `Failed to resolve import "./admin"`.

- [ ] **Step 3: Implement `admin.ts`**

Create `src/api/auth/admin.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSession, isAdmin } from '../_auth';
import { getStore } from '../_store';
import type { AccessLevel } from '../_access';

const ACCESS_VALUES: AccessLevel[] = ['default', 'allow', 'block'];

function readBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: any) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  const user = await requireSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (!isAdmin(user.sub)) return res.status(403).json({ error: 'Forbidden' });

  const store = await getStore();
  const path = (req.url ?? '').split('?')[0];

  if (req.method === 'GET' && path.endsWith('/admin/users')) {
    return res.status(200).json({ users: await store.listAppUsers() });
  }

  if (req.method === 'POST' && path.endsWith('/admin/access')) {
    let body: { discordId?: unknown; access?: unknown };
    try { body = JSON.parse(await readBody(req)); }
    catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
    const discordId = typeof body.discordId === 'string' ? body.discordId : '';
    const access = body.access as AccessLevel;
    if (!discordId || !ACCESS_VALUES.includes(access)) {
      return res.status(400).json({ error: 'discordId and a valid access level are required' });
    }
    await store.setUserAccess(discordId, access);
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: 'Not found' });
}

export const config = { api: { bodyParser: false } };
```

- [ ] **Step 4: Wire the dispatcher**

In `src/api/auth.ts`, add the import and the dispatch line:

```ts
import admin from './auth/admin';
```

Add **before** the final `return res.status(404)...` in the handler:

```ts
  if (path.includes('/auth/admin/')) return admin(req, res);
```

- [ ] **Step 5: Run the tests, verify they pass**

Run: `npx vitest run src/api/auth/admin.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/auth/admin.ts src/api/auth.ts src/api/auth/admin.test.ts
git commit -m "feat: admin roster + access API folded into auth function"
```

---

## Task 7: `vercel.json` rewrite for admin paths

**Files:**
- Modify: `vercel.json`

The existing `/api/auth/:action` rewrite matches only one path segment, so `/api/auth/admin/users` would not reach the function. Add a broader rule **before** it.

- [ ] **Step 1: Add the rewrite**

In `vercel.json`, in the `rewrites` array, add this entry immediately **before** the `{ "source": "/api/auth/:action", ... }` line:

```json
    { "source": "/api/auth/admin/(.*)", "destination": "/api/auth" },
```

- [ ] **Step 2: Verify the JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore: route /api/auth/admin/* to the auth function"
```

---

## Task 8: Add `isAdmin` to the auth provider

**Files:**
- Modify: `src/features/auth/AuthProvider.tsx`
- Test: `src/features/auth/AuthProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/features/auth/AuthProvider.test.tsx` a case asserting `isAdmin` flows from the `me` response. Mirror the existing fetch-mock style in that file; the assertion is:

```ts
it('exposes isAdmin from the me response', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ user: { sub: '1', username: 'E', avatar: null, guilds: [] }, isAdmin: true }),
    { status: 200 },
  )));
  function Probe() {
    const { isAdmin } = useAuth();
    return <div>admin:{String(isAdmin)}</div>;
  }
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(await screen.findByText('admin:true')).toBeInTheDocument();
});
```

> Ensure `useAuth`, `render`, `screen`, `vi` are imported as the existing tests do.

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/features/auth/AuthProvider.test.tsx`
Expected: FAIL — `isAdmin` is `undefined` → renders `admin:undefined`.

- [ ] **Step 3: Update `AuthProvider.tsx`**

Add `isAdmin` to the state shape and populate it. Edit `src/features/auth/AuthProvider.tsx`:

Change the `AuthState` interface:

```ts
interface AuthState {
  status: Status;
  user: AuthUser | null;
  isAdmin: boolean;
}
```

Change the default context value:

```ts
const AuthContext = createContext<AuthState>({ status: 'loading', user: null, isAdmin: false });
```

Change the initial `useState`:

```ts
const [state, setState] = useState<AuthState>({ status: 'loading', user: null, isAdmin: false });
```

In the `fetch('/api/auth/me')` `.then`, update both branches:

```ts
        if (r.ok) {
          const data = (await r.json()) as { user: AuthUser; isAdmin?: boolean };
          setState({ status: 'authed', user: data.user, isAdmin: !!data.isAdmin });
        } else {
          setState({ status: 'anon', user: null, isAdmin: false });
        }
```

And the `.catch`:

```ts
      .catch(() => { if (!cancelled) setState({ status: 'anon', user: null, isAdmin: false }); });
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/features/auth/AuthProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/AuthProvider.tsx src/features/auth/AuthProvider.test.tsx
git commit -m "feat: expose isAdmin through AuthProvider"
```

---

## Task 9: `RequireAdmin` route guard

**Files:**
- Create: `src/features/auth/RequireAdmin.tsx`
- Test: `src/features/auth/RequireAdmin.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/auth/RequireAdmin.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAdmin } from './RequireAdmin';
import { __TestAuthProvider, type AuthUser } from './AuthProvider';

const user: AuthUser = { sub: '1', username: 'E', avatar: null, guilds: [] };

function renderAt(value: { status: 'loading' | 'authed' | 'anon'; user: AuthUser | null; isAdmin: boolean }) {
  return render(
    <__TestAuthProvider value={value}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<RequireAdmin><div>ADMIN PAGE</div></RequireAdmin>} />
          <Route path="/dashboard" element={<div>DASHBOARD</div>} />
          <Route path="/login" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </__TestAuthProvider>,
  );
}

describe('RequireAdmin', () => {
  it('renders children for an admin', () => {
    renderAt({ status: 'authed', user, isAdmin: true });
    expect(screen.getByText('ADMIN PAGE')).toBeInTheDocument();
  });

  it('redirects an authed non-admin to /dashboard', () => {
    renderAt({ status: 'authed', user, isAdmin: false });
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });

  it('redirects an anon user to /login', () => {
    renderAt({ status: 'anon', user: null, isAdmin: false });
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/features/auth/RequireAdmin.test.tsx`
Expected: FAIL — `Failed to resolve import "./RequireAdmin"`.

- [ ] **Step 3: Implement `RequireAdmin.tsx`**

Create `src/features/auth/RequireAdmin.tsx`:

```tsx
import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, isAdmin } = useAuth();

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-sm opacity-60">Loading…</div>;
  }
  if (status === 'anon') {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/features/auth/RequireAdmin.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/RequireAdmin.tsx src/features/auth/RequireAdmin.test.tsx
git commit -m "feat: RequireAdmin route guard"
```

---

## Task 10: Admin roster page

**Files:**
- Create: `src/routes/Admin.tsx`
- Test: `src/routes/Admin.test.tsx`

A focused, on-brand table (design tokens: `border-border-base`, `bg-bg-card`, `font-mono` uppercase headers — matching the toolbar style in `ResultTableScaffold`). Each row has a `default / allow / block` segmented control that POSTs the change and updates the row optimistically. A small roster does not need `ResultTableScaffold`'s load-more/CSV machinery, so it is intentionally not used here.

- [ ] **Step 1: Write the failing test**

Create `src/routes/Admin.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Admin from './Admin';

const ROSTER = {
  users: [
    { discordId: 'U1', username: 'Esther', avatar: null, guilds: ['G1'], access: 'default', firstSeen: 1, lastSeen: 2 },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    if (url.endsWith('/admin/users')) return new Response(JSON.stringify(ROSTER), { status: 200 });
    if (url.endsWith('/admin/access')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response('{}', { status: 404 });
  }));
});

describe('Admin page', () => {
  it('renders the roster', async () => {
    render(<Admin />);
    expect(await screen.findByText('Esther')).toBeInTheDocument();
    expect(screen.getByText('U1')).toBeInTheDocument();
  });

  it('POSTs an access change when a level is clicked', async () => {
    render(<Admin />);
    await screen.findByText('Esther');
    fireEvent.click(screen.getByRole('button', { name: 'block' }));
    await waitFor(() => {
      expect((globalThis.fetch as any).mock.calls.some(
        ([u, init]: [string, any]) => u.endsWith('/admin/access') && init?.method === 'POST'
          && JSON.parse(init.body).access === 'block' && JSON.parse(init.body).discordId === 'U1',
      )).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/routes/Admin.test.tsx`
Expected: FAIL — `Failed to resolve import "./Admin"`.

- [ ] **Step 3: Implement `Admin.tsx`**

Create `src/routes/Admin.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { AppUser, AccessLevel } from '../bot/craftTypes';

const LEVELS: AccessLevel[] = ['default', 'allow', 'block'];

function fmtDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toISOString().slice(0, 10);
}

export default function Admin() {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/admin/users', { credentials: 'same-origin' })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) setUsers(((await r.json()) as { users: AppUser[] }).users);
        else setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  async function setAccess(discordId: string, access: AccessLevel) {
    const prev = users;
    setUsers((u) => u?.map((x) => (x.discordId === discordId ? { ...x, access } : x)) ?? u);
    try {
      const r = await fetch('/api/auth/admin/access', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId, access }),
      });
      if (!r.ok) throw new Error('failed');
    } catch {
      setUsers(prev ?? null); // roll back on failure
    }
  }

  if (error) return <div className="border border-border-base bg-bg-card p-8 text-center text-crimson text-sm">Could not load the roster.</div>;
  if (!users) return <div className="text-sm opacity-60">Loading…</div>;

  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] text-text-low">{users.length} user(s) on record</div>
      <div className="border border-border-base bg-bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] tracking-widest uppercase text-text-dim border-b border-border-base">
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Discord ID</th>
              <th className="text-left px-3 py-2">Guilds</th>
              <th className="text-left px-3 py-2">First seen</th>
              <th className="text-left px-3 py-2">Last seen</th>
              <th className="text-left px-3 py-2">Access</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.discordId} className="border-b border-border-base last:border-b-0">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    {u.avatar && (
                      <img src={`https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png?size=32`} alt="" className="h-5 w-5 rounded-full" />
                    )}
                    {u.username}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-text-low">{u.discordId}</td>
                <td className="px-3 py-2 font-mono text-xs text-text-low">{u.guilds.join(', ') || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-text-low">{fmtDate(u.firstSeen)}</td>
                <td className="px-3 py-2 font-mono text-xs text-text-low">{fmtDate(u.lastSeen)}</td>
                <td className="px-3 py-2">
                  <div className="inline-flex border border-border-base" role="group" aria-label={`Access for ${u.username}`}>
                    {LEVELS.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setAccess(u.discordId, lvl)}
                        className={`font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 border-r border-border-base last:border-r-0 transition-colors ${
                          u.access === lvl ? 'bg-bg-card-hi text-gold' : 'text-text-dim hover:text-aether'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/routes/Admin.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/Admin.tsx src/routes/Admin.test.tsx
git commit -m "feat: admin roster page with access controls"
```

---

## Task 11: Wire the route + nav link

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/auth/UserMenu.tsx`

- [ ] **Step 1: Register the route + title in `App.tsx`**

Add the imports near the other route imports:

```ts
import Admin from './routes/Admin';
import { RequireAdmin } from './features/auth/RequireAdmin';
```

Add to the `PAGE_TITLES` map:

```ts
  '/admin': 'Admin',
```

Add this `<Route>` inside the inner `<Routes>` (e.g. just after the `/settings` route):

```tsx
                      <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
```

- [ ] **Step 2: Add the Admin link in `UserMenu.tsx`**

Replace the contents of `src/features/auth/UserMenu.tsx` with:

```tsx
import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function UserMenu() {
  const { status, user, isAdmin } = useAuth();
  if (status !== 'authed' || !user) return null;

  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.sub}/${user.avatar}.png?size=32`
    : undefined;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/login';
  }

  return (
    <div className="flex items-center gap-2">
      {avatarUrl && <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full" />}
      <span className="text-sm">{user.username}</span>
      {isAdmin && <Link to="/admin" className="text-xs underline opacity-70 hover:opacity-100">Admin</Link>}
      <button onClick={logout} className="text-xs underline opacity-70 hover:opacity-100">Log out</button>
    </div>
  );
}
```

- [ ] **Step 3: Verify the full suite + typecheck**

Run: `npx vitest run`
Expected: all tests pass.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/features/auth/UserMenu.tsx
git commit -m "feat: wire /admin route + admin nav link"
```

---

## Final verification

- [ ] **Run the whole test suite:** `npx vitest run` → all green.
- [ ] **Typecheck:** `npx tsc --noEmit` → clean.
- [ ] **Build (bundles the auth function incl. admin):** `npm run build` → succeeds.
- [ ] **Manual deploy checklist (post-merge):** set the `ADMIN_USER_IDS` env var in Vercel (your Discord ID); confirm `/admin` is reachable for you and redirects others to `/dashboard`; confirm blocking a test user denies them on their next reload.

## Notes / deferred

- A blocked user's already-open tab keeps working until its next `/api/auth/me` poll (reload). This is intentional (per the spec); no mid-session eviction.
- `ADMIN_USER_IDS` is read live, so promoting/demoting an admin is an env-var edit in Vercel (no code change, no re-login needed).
- No new serverless function is added — the admin API rides inside `api/auth`, preserving the 12-function Hobby cap.
