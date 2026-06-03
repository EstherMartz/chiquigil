import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import meHandler from './me';
import logoutHandler from './logout';
import { signSession, SESSION_COOKIE } from '../_auth';
import { openCraftStore, type CraftStore } from '../../bot/craftStore';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// @vitest-environment node

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

let store: CraftStore;

beforeEach(async () => {
  process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
  store = await openCraftStore(':memory:');
  (globalThis as any).__testCraftStore = store;
});

afterEach(() => {
  delete (globalThis as any).__testCraftStore;
  delete process.env.ADMIN_USER_IDS;
});

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

  it('records/refreshes the active user in app_users on a successful poll', async () => {
    const token = await signSession({ sub: '111', username: 'Esther', avatar: 'av', guilds: ['123'] });
    const res = makeRes();
    await meHandler(req('GET', `${SESSION_COOKIE}=${token}`), res);
    expect(res.statusCode).toBe(200);
    const rec = await store.getAppUser('111');
    expect(rec).toMatchObject({ discordId: '111', username: 'Esther', avatar: 'av', access: 'default' });
  });

  it('does NOT record a blocked user (denied before recording)', async () => {
    await store.upsertAppUser({ discordId: '222', username: 'Blocked', avatar: null, guilds: ['123'] });
    await store.setUserAccess('222', 'block');
    const before = (await store.getAppUser('222'))!;
    const token = await signSession({ sub: '222', username: 'Blocked', avatar: null, guilds: ['123'] });
    const res = makeRes();
    await meHandler(req('GET', `${SESSION_COOKIE}=${token}`), res);
    expect(res.statusCode).toBe(401);
    const after = (await store.getAppUser('222'))!;
    expect(after.lastSeen).toBe(before.lastSeen); // unchanged — not refreshed
    expect(after.access).toBe('block');
  });

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
