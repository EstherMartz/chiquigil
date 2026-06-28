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

async function seedProject(s: CraftStore) {
  const id = await s.createProject({
    guildId: 'G1', channelId: 'C1', name: 'Test', targetItemId: 42, targetQty: 3, createdBy: 'U1',
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
  process.env.TURSO_DATABASE_URL = ':memory:';
  process.env.AUTH_SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
  delete process.env.DISCORD_BOT_TOKEN; // skip Discord name lookups under test
  (globalThis as any).__testCraftStore = store;
});

describe('GET /api/projects', () => {
  it('lists open projects for an allowed guild with task counts', async () => {
    await seedProject(store);
    const token = await signSession({ sub: '1', username: 'E', avatar: null, guilds: ['G1'] });
    const req = {
      method: 'GET', url: '/api/projects?guild=G1', query: { guild: 'G1' },
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]).toMatchObject({
      name: 'Test',
      targetItemId: 42,
      targetQty: 3,
      status: 'open',
    });
    expect(body.projects[0].taskCounts.bySource.workshop).toBe(1);
  });

  it('403s when guild is not in the allow-list', async () => {
    const token = await signSession({ sub: '1', username: 'E', avatar: null, guilds: ['G1'] });
    const req = {
      method: 'GET', url: '/api/projects?guild=OTHER', query: { guild: 'OTHER' },
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('400s when guild query param is missing', async () => {
    const token = await signSession({ sub: '1', username: 'E', avatar: null, guilds: ['G1'] });
    const req = {
      method: 'GET', url: '/api/projects', query: {},
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('GET /api/projects/:id', () => {
  it('returns project + tasks for allowed guild', async () => {
    const id = await seedProject(store);
    const token = await signSession({ sub: '1', username: 'E', avatar: null, guilds: ['G1'] });
    const req = {
      method: 'GET', url: `/api/projects/${id}`, query: { id: String(id) },
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.project.id).toBe(id);
    expect(body.tasks).toHaveLength(3);
  });

  it('404s when project belongs to a disallowed guild', async () => {
    const id = await store.createProject({
      guildId: 'OTHER', channelId: 'C', name: 'X', targetItemId: 1, targetQty: 1, createdBy: 'U',
    });
    const token = await signSession({ sub: '1', username: 'E', avatar: null, guilds: ['G1'] });
    const req = {
      method: 'GET', url: `/api/projects/${id}`, query: { id: String(id) },
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('projects API auth gate', () => {
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

describe('POST /api/feedback', () => {
  beforeEach(() => {
    process.env.DISCORD_BOT_TOKEN = 'bot-token';
    process.env.FEEDBACK_CHANNEL_ID = 'feedback-channel';
  });

  it('401s without a session cookie', async () => {
    const req = { method: 'POST', url: '/api/feedback', headers: {}, body: { message: 'hi' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('400s on an empty message', async () => {
    const token = await signSession({ sub: '1', username: 'E', avatar: null, guilds: ['G1'] });
    const req = {
      method: 'POST', url: '/api/feedback',
      headers: { cookie: `${SESSION_COOKIE}=${token}` }, body: { message: '   ' },
    } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('405s on a non-POST method', async () => {
    const token = await signSession({ sub: '1', username: 'E', avatar: null, guilds: ['G1'] });
    const req = {
      method: 'PUT', url: '/api/feedback',
      headers: { cookie: `${SESSION_COOKIE}=${token}` }, body: {},
    } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('posts and returns 200 with a valid message', async () => {
    const post = vi.fn().mockResolvedValue({ id: 'thread1' });
    (globalThis as any).__testPostFeedback = post;
    const token = await signSession({ sub: '42', username: 'Esther', avatar: null, guilds: ['G1'] });
    const req = {
      method: 'POST', url: '/api/feedback',
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      body: { category: 'bug', message: 'Crafts page crashes', context: { path: '/crafts', build: '0.0.1' } },
    } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(post).toHaveBeenCalledOnce();
    const [deps, input] = post.mock.calls[0];
    expect(deps).toMatchObject({ botToken: 'bot-token', channelId: 'feedback-channel' });
    expect(input).toMatchObject({ category: 'bug', message: 'Crafts page crashes', reporter: { sub: '42', username: 'Esther' } });
    delete (globalThis as any).__testPostFeedback;
  });
});
