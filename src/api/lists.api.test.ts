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
