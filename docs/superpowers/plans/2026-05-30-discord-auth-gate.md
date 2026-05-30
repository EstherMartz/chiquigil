# Discord Auth Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the whole web app behind Discord OAuth2, admitting only members of allow-listed Discord guilds, with a public `/login` page.

**Architecture:** Roll-your-own Discord OAuth in ~4 Vercel serverless functions plus a shared `_auth.ts` helper. The callback checks the user's guilds against `GUILD_ALLOWLIST` and sets a signed httpOnly cookie (stateless JWT). The API is the real security boundary (`/api/projects` requires a session); the SPA adds an `AuthProvider` + `<RequireAuth>` guard + `/login` page for UX. Non-browser endpoints (`/api/plugin/*`, `/api/discord`, `/api/refresh-cache`) stay ungated.

**Tech Stack:** TypeScript, `@vercel/node` serverless functions (esbuild-bundled to `api/*.mjs`), `jose` for HS256 JWT, React 18 + react-router-dom v7, Vitest + Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-30-discord-auth-gate-design.md`

---

## File Structure

**Create:**
- `src/api/_auth.ts` — shared helper: sign/verify session JWT, sign/verify OAuth state, cookie parse/serialize, `requireSession`, `getAllowList`/`isMemberOfAllowedGuild`.
- `src/api/_auth.test.ts` — unit tests for the helper.
- `src/api/auth/login.ts` — `GET /api/auth/login` → redirect to Discord authorize.
- `src/api/auth/callback.ts` — `GET /api/auth/callback` → exchange code, check guilds, set cookie.
- `src/api/auth/callback.test.ts` — endpoint tests (member / non-member / bad state).
- `src/api/auth/me.ts` — `GET /api/auth/me` → current user or 401.
- `src/api/auth/logout.ts` — `POST /api/auth/logout` → clear cookie.
- `src/api/auth/me.test.ts` — endpoint test (valid cookie / no cookie).
- `src/features/auth/AuthProvider.tsx` — React context + `useAuth` hook.
- `src/features/auth/AuthProvider.test.tsx` — provider state transitions.
- `src/features/auth/RequireAuth.tsx` — route guard.
- `src/features/auth/UserMenu.tsx` — header avatar + logout.
- `src/routes/Login.tsx` — public login page.

**Modify:**
- `package.json` — add `jose` dependency; add the four `src/api/auth/*.ts` files to the `build:api` esbuild entry list.
- `vercel.json` — add `maxDuration` entries for the four `api/auth/*.mjs` functions (catch-all rewrite stays last).
- `src/api/projects.ts` — require a valid session before serving.
- `src/App.tsx` — wrap routes in `AuthProvider`, add public `/login` route, wrap the app shell in `<RequireAuth>`, render `<UserMenu>`.

**Optional (final task):**
- `middleware.ts` (repo root) — redirect anonymous *navigations* to `/login` and block the shell. Not the security boundary.

---

## Task 1: Auth helper — session JWT sign/verify

**Files:**
- Create: `src/api/_auth.ts`
- Test: `src/api/_auth.test.ts`
- Modify: `package.json` (add `jose`)

- [ ] **Step 1: Add the `jose` dependency**

Run:
```bash
npm install jose@^5.9.6
```
Expected: `jose` appears under `dependencies` in `package.json`, `package-lock.json` updated.

- [ ] **Step 2: Write the failing test**

Create `src/api/_auth.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { signSession, verifySession, type SessionUser } from './_auth';

const USER: SessionUser = {
  sub: '111',
  username: 'Esther',
  avatar: 'abc',
  guilds: ['123'],
};

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
});

describe('session token', () => {
  it('round-trips a signed session', async () => {
    const token = await signSession(USER);
    const decoded = await verifySession(token);
    expect(decoded).toMatchObject(USER);
  });

  it('rejects a tampered token', async () => {
    const token = await signSession(USER);
    const tampered = token.slice(0, -3) + 'xxx';
    expect(await verifySession(tampered)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession(USER);
    process.env.AUTH_SESSION_SECRET = 'completely-different-secret-value-000';
    expect(await verifySession(token)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/api/_auth.test.ts`
Expected: FAIL — cannot find module `./_auth` / `signSession is not a function`.

- [ ] **Step 4: Write minimal implementation**

Create `src/api/_auth.ts`:
```ts
import { SignJWT, jwtVerify } from 'jose';

export interface SessionUser {
  sub: string;        // Discord user id
  username: string;   // display name
  avatar: string | null;
  guilds: string[];   // allow-listed guild ids the user belongs to
}

const SESSION_TTL = '7d';

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SESSION_SECRET;
  if (!s) throw new Error('AUTH_SESSION_SECRET is not set');
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ username: user.username, avatar: user.avatar, guilds: user.guilds })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      sub: String(payload.sub),
      username: String(payload.username ?? ''),
      avatar: (payload.avatar as string | null) ?? null,
      guilds: Array.isArray(payload.guilds) ? (payload.guilds as string[]) : [],
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/api/_auth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/api/_auth.ts src/api/_auth.test.ts
git commit -m "feat(auth): session JWT sign/verify helper"
```

---

## Task 2: Auth helper — OAuth state, cookies, guild allow-list

**Files:**
- Modify: `src/api/_auth.ts`
- Modify: `src/api/_auth.test.ts`

- [ ] **Step 1: Write the failing tests (append)**

Append to `src/api/_auth.test.ts`:
```ts
import {
  signState, verifyState,
  parseCookies, serializeSessionCookie, clearSessionCookie,
  SESSION_COOKIE,
  getAllowList, allowedGuildsFor,
} from './_auth';

describe('oauth state', () => {
  it('round-trips state with a return path', async () => {
    const token = await signState('/projects');
    expect(await verifyState(token)).toBe('/projects');
  });

  it('rejects tampered state', async () => {
    const token = await signState('/projects');
    expect(await verifyState(token.slice(0, -2) + 'zz')).toBeNull();
  });
});

describe('cookies', () => {
  it('parses a cookie header', () => {
    const jar = parseCookies(`${SESSION_COOKIE}=abc; other=1`);
    expect(jar[SESSION_COOKIE]).toBe('abc');
    expect(jar.other).toBe('1');
  });

  it('returns {} for no header', () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it('serializes an httpOnly session cookie', () => {
    const c = serializeSessionCookie('TOKEN');
    expect(c).toContain(`${SESSION_COOKIE}=TOKEN`);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
  });

  it('clear cookie has Max-Age=0', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});

describe('guild allow-list', () => {
  beforeEach(() => { process.env.GUILD_ALLOWLIST = '123, 456'; });

  it('parses the allow-list', () => {
    expect(getAllowList()).toEqual(['123', '456']);
  });

  it('returns the intersection of user guilds and the allow-list', () => {
    expect(allowedGuildsFor(['456', '789'])).toEqual(['456']);
  });

  it('returns [] when no overlap', () => {
    expect(allowedGuildsFor(['789'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/_auth.test.ts`
Expected: FAIL — `signState is not a function` (and other missing exports).

- [ ] **Step 3: Write minimal implementation (append)**

Append to `src/api/_auth.ts`:
```ts
export const SESSION_COOKIE = 'qiqirn_session';
const STATE_TTL = '10m';

export async function signState(returnTo: string): Promise<string> {
  return new SignJWT({ rt: returnTo })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(STATE_TTL)
    .sign(secretKey());
}

export async function verifyState(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const rt = typeof payload.rt === 'string' ? payload.rt : '/';
    // Only allow same-site relative return paths.
    return rt.startsWith('/') && !rt.startsWith('//') ? rt : '/';
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const jar: Record<string, string> = {};
  if (!header) return jar;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) jar[k] = decodeURIComponent(v);
  }
  return jar;
}

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // seconds

export function serializeSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function getAllowList(): string[] {
  return (process.env.GUILD_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function allowedGuildsFor(userGuildIds: string[]): string[] {
  const allow = new Set(getAllowList());
  return userGuildIds.filter((id) => allow.has(id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/_auth.test.ts`
Expected: PASS (all session + state + cookie + allow-list tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/_auth.ts src/api/_auth.test.ts
git commit -m "feat(auth): oauth state, cookie, and guild allow-list helpers"
```

---

## Task 3: `requireSession` request helper

**Files:**
- Modify: `src/api/_auth.ts`
- Modify: `src/api/_auth.test.ts`

- [ ] **Step 1: Write the failing test (append)**

Append to `src/api/_auth.test.ts`:
```ts
import { requireSession } from './_auth';
import type { VercelRequest } from '@vercel/node';

function reqWithCookie(cookie?: string): VercelRequest {
  return { headers: cookie ? { cookie } : {} } as unknown as VercelRequest;
}

describe('requireSession', () => {
  beforeEach(() => { process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123'; });

  it('returns the user for a valid session cookie', async () => {
    const token = await signSession(USER);
    const user = await requireSession(reqWithCookie(`${SESSION_COOKIE}=${token}`));
    expect(user?.sub).toBe('111');
  });

  it('returns null when no cookie present', async () => {
    expect(await requireSession(reqWithCookie())).toBeNull();
  });

  it('returns null for a garbage cookie', async () => {
    expect(await requireSession(reqWithCookie(`${SESSION_COOKIE}=garbage`))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/_auth.test.ts`
Expected: FAIL — `requireSession is not a function`.

- [ ] **Step 3: Write minimal implementation (append)**

Append to `src/api/_auth.ts`:
```ts
import type { VercelRequest } from '@vercel/node';

export async function requireSession(req: VercelRequest): Promise<SessionUser | null> {
  const jar = parseCookies(req.headers?.cookie);
  const token = jar[SESSION_COOKIE];
  if (!token) return null;
  return verifySession(token);
}
```
(Place the `import type` line with the other imports at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/_auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/_auth.ts src/api/_auth.test.ts
git commit -m "feat(auth): requireSession request helper"
```

---

## Task 4: `GET /api/auth/login`

**Files:**
- Create: `src/api/auth/login.ts`
- Test: `src/api/auth/login.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/auth/login.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import handler from './login';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function makeRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    end() { return this; },
    json(p: unknown) { this.body = p; return this; },
  };
  return res as VercelResponse & { statusCode: number; headers: Record<string, string> };
}

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
  process.env.DISCORD_CLIENT_ID = 'CLIENT123';
  process.env.OAUTH_REDIRECT_URI = 'https://qiqirn.tools/api/auth/callback';
});

describe('auth/login', () => {
  it('redirects to the Discord authorize URL', async () => {
    const req = { method: 'GET', url: '/api/auth/login?return=/projects', query: { return: '/projects' } } as unknown as VercelRequest;
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(302);
    const loc = res.headers['Location'];
    expect(loc).toContain('https://discord.com/oauth2/authorize');
    expect(loc).toContain('client_id=CLIENT123');
    expect(loc).toContain('scope=identify+guilds');
    expect(loc).toContain('state=');
    expect(loc).toContain('redirect_uri=https%3A%2F%2Fqiqirn.tools%2Fapi%2Fauth%2Fcallback');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/auth/login.test.ts`
Expected: FAIL — cannot find module `./login`.

- [ ] **Step 3: Write minimal implementation**

Create `src/api/auth/login.ts`:
```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signState } from '../_auth';

function redirectUri(req: VercelRequest): string {
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI;
  const host = req.headers?.host ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}/api/auth/callback`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const returnTo = (req.query?.return as string | undefined) ?? '/';
  const state = await signState(returnTo);

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? '',
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'identify guilds',
    state,
    prompt: 'none',
  });

  res.setHeader('Location', `https://discord.com/oauth2/authorize?${params.toString()}`);
  return res.status(302).end();
}

export const config = { api: { bodyParser: false } };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/auth/login.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/auth/login.ts src/api/auth/login.test.ts
git commit -m "feat(auth): GET /api/auth/login redirect to Discord"
```

---

## Task 5: `GET /api/auth/callback`

**Files:**
- Create: `src/api/auth/callback.ts`
- Test: `src/api/auth/callback.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/auth/callback.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import handler from './callback';
import { signState, SESSION_COOKIE } from '../_auth';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function makeRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    end() { return this; },
    json(p: unknown) { this.body = p; return this; },
  };
  return res as VercelResponse & { statusCode: number; headers: Record<string, string>; body: unknown };
}

function makeReq(query: Record<string, string>): VercelRequest {
  return { method: 'GET', url: '/api/auth/callback', query, headers: {} } as unknown as VercelRequest;
}

// Mock the three Discord calls in order: token, /users/@me, /users/@me/guilds
function mockDiscord(guilds: Array<{ id: string }>) {
  return vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'AT', token_type: 'Bearer' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '111', username: 'esther', global_name: 'Esther', avatar: 'av' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => guilds });
}

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'CSECRET';
  process.env.OAUTH_REDIRECT_URI = 'https://qiqirn.tools/api/auth/callback';
  process.env.GUILD_ALLOWLIST = '123';
});

afterEach(() => vi.restoreAllMocks());

describe('auth/callback', () => {
  it('sets a session cookie and redirects home for an allow-listed member', async () => {
    vi.stubGlobal('fetch', mockDiscord([{ id: '123' }, { id: '999' }]));
    const state = await signState('/projects');
    const res = makeRes();
    await handler(makeReq({ code: 'abc', state }), res);
    expect(res.statusCode).toBe(302);
    expect(res.headers['Location']).toBe('/projects');
    const setCookie = res.headers['Set-Cookie'];
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
  });

  it('redirects to not_authorized when user is in no allow-listed guild', async () => {
    vi.stubGlobal('fetch', mockDiscord([{ id: '999' }]));
    const state = await signState('/');
    const res = makeRes();
    await handler(makeReq({ code: 'abc', state }), res);
    expect(res.statusCode).toBe(302);
    expect(res.headers['Location']).toBe('/login?error=not_authorized');
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });

  it('rejects an invalid state with a redirect to login?error=expired', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = makeRes();
    await handler(makeReq({ code: 'abc', state: 'not-a-real-state' }), res);
    expect(res.statusCode).toBe(302);
    expect(res.headers['Location']).toBe('/login?error=expired');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/auth/callback.test.ts`
Expected: FAIL — cannot find module `./callback`.

- [ ] **Step 3: Write minimal implementation**

Create `src/api/auth/callback.ts`:
```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  verifyState, signSession, serializeSessionCookie, allowedGuildsFor,
} from '../_auth';

function redirectUri(req: VercelRequest): string {
  if (process.env.OAUTH_REDIRECT_URI) return process.env.OAUTH_REDIRECT_URI;
  const host = req.headers?.host ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}/api/auth/callback`;
}

function redirect(res: VercelResponse, location: string) {
  res.setHeader('Location', location);
  return res.status(302).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const code = req.query?.code as string | undefined;
  const stateToken = req.query?.state as string | undefined;
  if (!code || !stateToken) return redirect(res, '/login?error=expired');

  const returnTo = await verifyState(stateToken);
  if (returnTo === null) return redirect(res, '/login?error=expired');

  // 1. Exchange the code for an access token.
  let accessToken: string;
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID ?? '',
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(req),
      }),
    });
    if (!tokenRes.ok) return redirect(res, '/login?error=discord');
    const tok = (await tokenRes.json()) as { access_token?: string };
    if (!tok.access_token) return redirect(res, '/login?error=discord');
    accessToken = tok.access_token;
  } catch {
    return redirect(res, '/login?error=discord');
  }

  // 2. Fetch identity + guilds.
  try {
    const auth = { headers: { Authorization: `Bearer ${accessToken}` } };
    const [meRes, guildsRes] = [
      await fetch('https://discord.com/api/users/@me', auth),
      await fetch('https://discord.com/api/users/@me/guilds', auth),
    ];
    if (!meRes.ok || !guildsRes.ok) return redirect(res, '/login?error=discord');
    const me = (await meRes.json()) as { id: string; username?: string; global_name?: string | null; avatar?: string | null };
    const guilds = (await guildsRes.json()) as Array<{ id: string }>;

    // 3. Authorize against the allow-list.
    const allowed = allowedGuildsFor(guilds.map((g) => g.id));
    if (allowed.length === 0) return redirect(res, '/login?error=not_authorized');

    // 4. Mint the session cookie.
    const token = await signSession({
      sub: me.id,
      username: me.global_name ?? me.username ?? me.id,
      avatar: me.avatar ?? null,
      guilds: allowed,
    });
    res.setHeader('Set-Cookie', serializeSessionCookie(token));
    return redirect(res, returnTo || '/');
  } catch {
    return redirect(res, '/login?error=discord');
  }
}

export const config = { api: { bodyParser: false } };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/auth/callback.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/auth/callback.ts src/api/auth/callback.test.ts
git commit -m "feat(auth): GET /api/auth/callback — exchange, guild check, set cookie"
```

---

## Task 6: `GET /api/auth/me` and `POST /api/auth/logout`

**Files:**
- Create: `src/api/auth/me.ts`
- Create: `src/api/auth/logout.ts`
- Test: `src/api/auth/me.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/auth/me.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import meHandler from './me';
import logoutHandler from './logout';
import { signSession, SESSION_COOKIE } from '../_auth';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function makeRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    end() { return this; },
    json(p: unknown) { this.body = p; return this; },
  };
  return res as VercelResponse & { statusCode: number; headers: Record<string, string>; body: any };
}

function req(method: string, cookie?: string): VercelRequest {
  return { method, headers: cookie ? { cookie } : {} } as unknown as VercelRequest;
}

beforeEach(() => { process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123'; });

describe('auth/me', () => {
  it('returns the user for a valid cookie', async () => {
    const token = await signSession({ sub: '111', username: 'Esther', avatar: 'av', guilds: ['123'] });
    const res = makeRes();
    await meHandler(req('GET', `${SESSION_COOKIE}=${token}`), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.sub).toBe('111');
    expect(res.body.user.username).toBe('Esther');
  });

  it('returns 401 with no cookie', async () => {
    const res = makeRes();
    await meHandler(req('GET'), res);
    expect(res.statusCode).toBe(401);
  });
});

describe('auth/logout', () => {
  it('clears the cookie and 302s to /login', async () => {
    const res = makeRes();
    await logoutHandler(req('POST'), res);
    expect(res.statusCode).toBe(302);
    expect(res.headers['Set-Cookie']).toContain('Max-Age=0');
    expect(res.headers['Location']).toBe('/login');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/auth/me.test.ts`
Expected: FAIL — cannot find module `./me`.

- [ ] **Step 3: Write minimal implementations**

Create `src/api/auth/me.ts`:
```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSession } from '../_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  return res.status(200).json({ user });
}

export const config = { api: { bodyParser: false } };
```

Create `src/api/auth/logout.ts`:
```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSessionCookie } from '../_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.setHeader('Location', '/login');
  return res.status(302).end();
}

export const config = { api: { bodyParser: false } };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/auth/me.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/auth/me.ts src/api/auth/logout.ts src/api/auth/me.test.ts
git commit -m "feat(auth): GET /api/auth/me and POST /api/auth/logout"
```

---

## Task 7: Build & deploy wiring

**Files:**
- Modify: `package.json` (`build:api` script)
- Modify: `vercel.json` (function configs)

- [ ] **Step 1: Add the auth endpoints to the esbuild entry list**

In `package.json`, change the `build:api` script so the four auth files are bundled. Append these entries (before the `--bundle` flag) to the existing list:
```
src/api/auth/login.ts src/api/auth/callback.ts src/api/auth/me.ts src/api/auth/logout.ts
```
The full script becomes:
```json
"build:api": "esbuild src/api/discord.ts src/api/refresh-cache.ts src/api/projects.ts src/api/plugin-claim.ts src/api/plugin-craftable.ts src/api/plugin-items.ts src/api/plugin-item-sources.ts src/api/plugin-craft-breakdown.ts src/api/plugin-trading-query.ts src/api/plugin-cleanup.ts src/api/auth/login.ts src/api/auth/callback.ts src/api/auth/me.ts src/api/auth/logout.ts --bundle --platform=node --format=esm --outdir=api --out-extension:.js=.mjs --packages=external",
```

- [ ] **Step 2: Run the API build and verify the output paths**

Run: `npm run build:api`
Expected: SUCCESS, and these files now exist:
```
api/auth/login.mjs
api/auth/callback.mjs
api/auth/me.mjs
api/auth/logout.mjs
```
(esbuild preserves the `auth/` subdir because `src/api` stays the common ancestor of all entries. Path `/api/auth/login` maps directly to `api/auth/login.mjs` — no rewrite needed.)

Verify with: `ls api/auth/`

- [ ] **Step 3: Add function configs in `vercel.json`**

Add these entries to the `functions` object in `vercel.json` (keep the existing entries; the catch-all rewrite stays last and unchanged):
```json
    "api/auth/login.mjs": { "maxDuration": 10 },
    "api/auth/callback.mjs": { "maxDuration": 15 },
    "api/auth/me.mjs": { "maxDuration": 10 },
    "api/auth/logout.mjs": { "maxDuration": 10 }
```

- [ ] **Step 4: Confirm jose is bundled-external-safe**

Run: `npm run build:api`
Expected: SUCCESS with no "Could not resolve 'jose'" errors. (`jose` is in `dependencies`, and `--packages=external` leaves it to be installed at runtime by Vercel.)

- [ ] **Step 5: Commit**

```bash
git add package.json vercel.json api/auth/
git commit -m "build(auth): bundle and configure the /api/auth/* functions"
```

---

## Task 8: Require a session on `/api/projects`

**Files:**
- Modify: `src/api/projects.ts`
- Modify: `src/api/projects.test.ts`

- [ ] **Step 1: Write the failing test (append)**

Append to `src/api/projects.test.ts`. This reuses the file's existing helpers (`mockRes`, the `store` seeded by the top-level `beforeEach`, `seedProject`, and `GUILD_ALLOWLIST='G1'`); the only new setup is `AUTH_SESSION_SECRET`:
```ts
import { signSession, SESSION_COOKIE } from './_auth';

describe('projects API auth gate', () => {
  beforeEach(() => { process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123'; });

  it('returns 401 when there is no session cookie', async () => {
    const req = { method: 'GET', url: '/api/projects?guild=G1', query: { guild: 'G1' }, headers: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('proceeds past the gate (200) with a valid session cookie', async () => {
    await seedProject(store);
    const token = await signSession({ sub: '1', username: 'E', avatar: null, guilds: ['G1'] });
    const req = {
      method: 'GET', url: '/api/projects?guild=G1', query: { guild: 'G1' },
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/projects.test.ts`
Expected: FAIL — the no-cookie case returns 400/403/200 instead of 401 (no gate yet).

- [ ] **Step 3: Add the session gate**

In `src/api/projects.ts`, add the import near the top:
```ts
import { requireSession } from './_auth';
```
Then, inside `handler`, immediately after the method check (`if (req.method !== 'GET') ...`) and before `res.setHeader('Cache-Control', 'no-store')`, insert:
```ts
  const session = await requireSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/projects.test.ts`
Expected: PASS (existing tests + the two new gate tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/projects.ts src/api/projects.test.ts
git commit -m "feat(auth): require a valid session on /api/projects"
```

---

## Task 9: SPA `AuthProvider` + `useAuth`

**Files:**
- Create: `src/features/auth/AuthProvider.tsx`
- Test: `src/features/auth/AuthProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/auth/AuthProvider.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthProvider';

function Probe() {
  const { status, user } = useAuth();
  return <div>status:{status} user:{user?.username ?? 'none'}</div>;
}

afterEach(() => vi.restoreAllMocks());

describe('AuthProvider', () => {
  it('moves to authed and exposes the user when /api/auth/me returns 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { sub: '1', username: 'Esther', avatar: null, guilds: ['123'] } }),
    }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(/status:authed/)).toBeInTheDocument());
    expect(screen.getByText(/user:Esther/)).toBeInTheDocument();
  });

  it('moves to anon when /api/auth/me returns 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(/status:anon/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/auth/AuthProvider.test.tsx`
Expected: FAIL — cannot find module `./AuthProvider`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/auth/AuthProvider.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface AuthUser {
  sub: string;
  username: string;
  avatar: string | null;
  guilds: string[];
}

type Status = 'loading' | 'authed' | 'anon';

interface AuthState {
  status: Status;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthState>({ status: 'loading', user: null });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) {
          const data = (await r.json()) as { user: AuthUser };
          setState({ status: 'authed', user: data.user });
        } else {
          setState({ status: 'anon', user: null });
        }
      })
      .catch(() => { if (!cancelled) setState({ status: 'anon', user: null }); });
    return () => { cancelled = true; };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/auth/AuthProvider.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/AuthProvider.tsx src/features/auth/AuthProvider.test.tsx
git commit -m "feat(auth): SPA AuthProvider + useAuth hook"
```

---

## Task 10: `Login` page + `RequireAuth` guard

**Files:**
- Create: `src/routes/Login.tsx`
- Create: `src/features/auth/RequireAuth.tsx`
- Test: `src/features/auth/RequireAuth.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/auth/RequireAuth.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { AuthContextProvider } from './AuthProvider';

// Helper provider that injects a fixed auth state (no network).
import { __TestAuthProvider } from './AuthProvider';

function renderAt(status: 'loading' | 'authed' | 'anon') {
  return render(
    <__TestAuthProvider value={{ status, user: status === 'authed' ? { sub: '1', username: 'E', avatar: null, guilds: ['1'] } : null }}>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
          <Route path="/secret" element={<RequireAuth><div>SECRET</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    </__TestAuthProvider>,
  );
}

describe('RequireAuth', () => {
  it('renders children when authed', () => {
    renderAt('authed');
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });

  it('redirects to /login when anon', () => {
    renderAt('anon');
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('shows a loading state while resolving', () => {
    renderAt('loading');
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/auth/RequireAuth.test.tsx`
Expected: FAIL — `RequireAuth` / `__TestAuthProvider` not found.

- [ ] **Step 3: Add a test-only provider to `AuthProvider.tsx`**

Append to `src/features/auth/AuthProvider.tsx` (lets tests and `<RequireAuth>` share one context without a network call):
```tsx
/** Test/utility provider that injects a fixed auth state. */
export function __TestAuthProvider({ value, children }: { value: AuthState; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```
(Remove the unused `AuthContextProvider` import line from the test — it was a typo; only `__TestAuthProvider` is needed. The final test import line should be:
```tsx
import { RequireAuth } from './RequireAuth';
import { __TestAuthProvider } from './AuthProvider';
```
)

- [ ] **Step 4: Write the `RequireAuth` guard**

Create `src/features/auth/RequireAuth.tsx`:
```tsx
import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-sm opacity-60">Loading…</div>;
  }
  if (status === 'anon') {
    const ret = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?return=${ret}`} replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 5: Write the `Login` page**

Create `src/routes/Login.tsx`:
```tsx
import { useLocation } from 'react-router-dom';

const ERRORS: Record<string, string> = {
  not_authorized: 'That Discord account is not in an allow-listed server. Ask an admin to add your server.',
  expired: 'Your sign-in attempt expired. Please try again.',
  discord: 'Discord sign-in failed. Please try again.',
};

export default function Login() {
  const params = new URLSearchParams(useLocation().search);
  const error = params.get('error');
  const ret = params.get('return') ?? '/';
  const loginHref = `/api/auth/login?return=${encodeURIComponent(ret)}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-2xl font-semibold">qiqirn.tools</h1>
      <p className="max-w-sm text-sm opacity-70">Sign in with Discord to access the tools. Access is limited to members of allow-listed servers.</p>
      {error && <p className="max-w-sm rounded-md bg-red-500/10 px-4 py-2 text-sm text-red-400">{ERRORS[error] ?? 'Sign-in failed.'}</p>}
      <a
        href={loginHref}
        className="rounded-md bg-[#5865F2] px-5 py-2.5 font-medium text-white hover:bg-[#4752c4]"
      >
        Sign in with Discord
      </a>
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/features/auth/RequireAuth.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/routes/Login.tsx src/features/auth/RequireAuth.tsx src/features/auth/RequireAuth.test.tsx src/features/auth/AuthProvider.tsx
git commit -m "feat(auth): Login page and RequireAuth guard"
```

---

## Task 11: Wire auth into `App.tsx` + header user menu

**Files:**
- Create: `src/features/auth/UserMenu.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the `UserMenu` component**

Create `src/features/auth/UserMenu.tsx`:
```tsx
import { useAuth } from './AuthProvider';

export function UserMenu() {
  const { status, user } = useAuth();
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
      <button onClick={logout} className="text-xs underline opacity-70 hover:opacity-100">Log out</button>
    </div>
  );
}
```

- [ ] **Step 2: Wrap the app in `AuthProvider`, add the `/login` route, and gate the shell**

Modify `src/App.tsx`:

a) Add imports near the other imports:
```tsx
import { AuthProvider } from './features/auth/AuthProvider';
import { RequireAuth } from './features/auth/RequireAuth';
import { UserMenu } from './features/auth/UserMenu';
import Login from './routes/Login';
```

b) Replace the `return (...)` body of `App()` so the public `/login` route is OUTSIDE the guard and everything else is INSIDE it:
```tsx
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <RequireAuth>
              <div className="flex min-h-screen">
                <DocumentTitle />
                <Sidebar />
                {showOnboarding && (
                  <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
                )}
                <main className="flex-1 min-w-0 pt-16 md:pt-8 px-4 pb-[max(5rem,env(safe-area-inset-bottom))]">
                  <div className="flex justify-end"><UserMenu /></div>
                  <ContentBar />
                  <ErrorBoundary>
                    <Routes>
                      <Route path="/" element={<Navigate to="/trading" replace />} />
                      <Route path="/home" element={<Home />} />
                      <Route path="/watchlist" element={<Watchlist />} />
                      <Route path="/crafts" element={<Crafts />} />
                      <Route path="/trading" element={<Trading />} />
                      <Route path="/gathering" element={<Gathering />} />
                      <Route path="/gathering/plan" element={<GatheringPlan />} />
                      <Route path="/leves" element={<LevePlan />} />
                      <Route path="/shopping-list" element={<ShoppingList />} />
                      <Route path="/vendor-flip" element={<VendorFlip />} />
                      <Route path="/housing" element={<Housing />} />
                      <Route path="/currency-flip" element={<CurrencyFlip />} />
                      <Route path="/gc-seals" element={<GcSeals />} />
                      <Route path="/craft-batch" element={<CraftBatch />} />
                      <Route path="/batch-history" element={<BatchHistory />} />
                      <Route path="/cleanup" element={<Cleanup />} />
                      <Route path="/craft-from-inventory" element={<CraftFromInventory />} />
                      <Route path="/quest-items" element={<QuestItems />} />
                      <Route path="/heatmap" element={<Heatmap />} />
                      <Route path="/item/:id" element={<Item />} />
                      <Route path="/queries" element={<Navigate to="/crafts" replace />} />
                      <Route path="/insights" element={<Navigate to="/trading" replace />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/submarines" element={<Submarines />} />
                      <Route path="/planner" element={<Planner />} />
                      <Route path="/projects" element={<Projects />} />
                      <Route path="/projects/:id" element={<Project />} />
                    </Routes>
                  </ErrorBoundary>
                </main>
              </div>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
```

- [ ] **Step 3: Run the full test suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS — no failing tests, no type errors. (If `tsc` flags an unused import in `App.tsx`, remove it.)

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/features/auth/UserMenu.tsx
git commit -m "feat(auth): gate the app shell, add /login route and user menu"
```

---

## Task 12 (OPTIONAL): Edge middleware shell gate

> Only do this if you want anonymous visitors to be unable to load the app bundle at all. The API gate + SPA guard already protect data and UX; this is defense-in-depth for the static shell. **Verify it builds and runs on this pure-Vite Vercel project before relying on it** — if it misbehaves, delete the file; nothing else depends on it.

**Files:**
- Create: `middleware.ts` (repo root)

- [ ] **Step 1: Write the middleware**

Create `middleware.ts`:
```ts
import { next } from '@vercel/functions';
import { parseCookies, SESSION_COOKIE, verifySession } from './src/api/_auth';

// Paths that must stay reachable without a browser session.
const PUBLIC_PREFIXES = ['/login', '/api/auth/', '/api/plugin/', '/api/discord', '/api/refresh-cache', '/assets/', '/favicon', '/icons/', '/robots.txt'];

export const config = { matcher: '/((?!_next|.*\\.[a-zA-Z0-9]+$).*)' };

export default async function middleware(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;
  if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p))) return next();

  const jar = parseCookies(req.headers.get('cookie') ?? undefined);
  const token = jar[SESSION_COOKIE];
  const session = token ? await verifySession(token) : null;
  if (session) return next();

  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  const login = new URL('/login', url);
  login.searchParams.set('return', path + url.search);
  return Response.redirect(login, 302);
}
```

- [ ] **Step 2: Verify locally / on a preview deploy**

Run: `npm run build` then deploy a Vercel **preview** (do not promote to prod yet). Confirm:
- visiting `/` while logged out redirects to `/login`
- `/api/plugin/items?q=iron` still responds (ungated)
- after login, `/` loads normally

Expected: all three hold. If middleware breaks the build or routing, `rm middleware.ts` and rely on the API gate + SPA guard.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat(auth): optional edge middleware shell gate"
```

---

## Final: Manual setup & end-to-end verification (maintainer)

These steps require the maintainer's Discord app + Vercel access and **cannot be done by the implementing agent**.

- [ ] In the Discord Developer Portal → your application → **OAuth2**, add redirect URIs:
  - `https://qiqirn.tools/api/auth/callback`
  - `http://localhost:3000/api/auth/callback` (or whatever local API port you use)
- [ ] Copy the **Client ID** and **Client Secret**.
- [ ] Set Vercel env vars (Production + Preview): `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `AUTH_SESSION_SECRET` (≥32 random bytes, e.g. `openssl rand -base64 48`), `OAUTH_REDIRECT_URI=https://qiqirn.tools/api/auth/callback`. Confirm `GUILD_ALLOWLIST` and `DISCORD_BOT_TOKEN` are present.
- [ ] Deploy a **preview** first. End-to-end check: log out → load any page → redirected to `/login` → "Sign in with Discord" → consent → land back on the page; a non-member account hits `/login?error=not_authorized`; `/api/projects?guild=<id>` returns 401 when logged out and 200 when logged in.
- [ ] Decide the **local dev** API runner (`vercel dev` is the simplest way to exercise `/api/auth/*` locally) and document it in the README so the localhost redirect works.
- [ ] Promote to production.

---

## Self-Review

**Spec coverage:**
- Discord OAuth login → Tasks 4–6. ✅
- Guild-allow-list authorization → Tasks 2, 5. ✅
- Signed httpOnly cookie session (stateless JWT) → Tasks 1–3. ✅
- API as the security boundary (`/api/projects` gated) → Task 8. ✅
- SPA guard + public `/login` page → Tasks 9–11. ✅
- Non-browser endpoints stay ungated → Task 12 matcher + Task 8 only touches `projects.ts` (plugin/discord/refresh-cache untouched); regression noted in the final E2E check. ✅
- Optional middleware shell gate → Task 12. ✅
- Error handling (expired/invalid state, discord failure, not_authorized, missing env fail-closed) → Task 5 + helper throws on missing secret. ✅
- Build/deploy wiring (esbuild + vercel.json) → Task 7. ✅
- Local dev story → Final checklist. ✅

**Deferred per spec (not gaps):** Turso session table / revocation; role-based and per-guild write features; gating browser endpoints beyond `/api/projects` (none other serve private first-party data today).

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `SessionUser` (API, `_auth.ts`) and `AuthUser` (SPA) share the same shape `{ sub, username, avatar, guilds }`; `SESSION_COOKIE`, `signSession`/`verifySession`, `signState`/`verifyState`, `requireSession`, `allowedGuildsFor`, `serializeSessionCookie`/`clearSessionCookie`/`parseCookies` are defined in Tasks 1–3 and used consistently in Tasks 5, 6, 8, 12. ✅
