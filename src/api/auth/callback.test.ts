import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import handler from './callback';
import { signState, SESSION_COOKIE } from '../_auth';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// @vitest-environment node

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
