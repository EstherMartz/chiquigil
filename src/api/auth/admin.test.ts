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
