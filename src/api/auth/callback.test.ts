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

beforeEach(async () => {
  process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'CSECRET';
  process.env.OAUTH_REDIRECT_URI = 'https://qiqirn.tools/api/auth/callback';
  process.env.GUILD_ALLOWLIST = '123';
  // Inject test store for callback's getStore() calls
  const { openCraftStore } = await import('../../bot/craftStore');
  const testStore = await openCraftStore(':memory:');
  (globalThis as any).__testCraftStore = testStore;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).__testCraftStore;
});

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

describe('callback access control', () => {
  let store: Awaited<ReturnType<typeof import('../_store').getStore>>;
  beforeEach(async () => {
    const { openCraftStore } = await import('../../bot/craftStore');
    store = await openCraftStore(':memory:');
    (globalThis as any).__testCraftStore = store;
    process.env.GUILD_ALLOWLIST = 'G1';
    process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
    process.env.DISCORD_CLIENT_ID = 'cid';
    process.env.DISCORD_CLIENT_SECRET = 'csecret';
    process.env.OAUTH_REDIRECT_URI = 'https://qiqirn.tools/api/auth/callback';
  });

  function stubDiscord(userId: string, guildIds: string[], discordFetch?: any) {
    const fetch = discordFetch || vi.fn();
    // Chain mocks for: token exchange, /users/@me, /users/@me/guilds
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: userId, username: 'Esther', global_name: 'Esther', avatar: 'av' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => guildIds.map((id) => ({ id })) });
    vi.stubGlobal('fetch', fetch);
  }

  it('records the login and admits a guild member (default access)', async () => {
    stubDiscord('U1', ['G1']);
    const { signState } = await import('../_auth');
    const state = await signState('/');
    const req = makeReq({ code: 'c', state });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(302);
    expect(res.headers['Set-Cookie']).toContain(`${SESSION_COOKIE}=`);
    const user = await store.getAppUser('U1');
    expect(user).toMatchObject({ username: 'Esther' });
  });

  it('blocks a user whose access is block, even if in an allowed guild', async () => {
    await store.upsertAppUser({ discordId: 'U2', username: 'X', avatar: null, guilds: ['G1'] });
    await store.setUserAccess('U2', 'block');
    stubDiscord('U2', ['G1']);
    const { signState } = await import('../_auth');
    const state = await signState('/');
    const req = makeReq({ code: 'c', state });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(302);
    expect(res.headers['Location']).toBe('/login?error=not_authorized');
  });

  it('admits an allow-override user with no allowed guild', async () => {
    await store.upsertAppUser({ discordId: 'U3', username: 'Y', avatar: null, guilds: [] });
    await store.setUserAccess('U3', 'allow');
    stubDiscord('U3', ['OTHER']);
    const { signState } = await import('../_auth');
    const state = await signState('/');
    const req = makeReq({ code: 'c', state });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(302);
    expect(res.headers['Set-Cookie']).toContain(`${SESSION_COOKIE}=`);
  });
});
