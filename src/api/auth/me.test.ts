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
