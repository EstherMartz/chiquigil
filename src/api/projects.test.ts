import { describe, it, expect, beforeEach, vi } from 'vitest';
import handler from './projects';
import { openCraftStore, type CraftStore } from '../bot/craftStore';

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
  (globalThis as any).__testCraftStore = store;
});

describe('GET /api/projects', () => {
  it('lists open projects for an allowed guild with task counts', async () => {
    await seedProject(store);
    const req = { method: 'GET', url: '/api/projects?guild=G1', query: { guild: 'G1' } } as any;
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
    const req = { method: 'GET', url: '/api/projects?guild=OTHER', query: { guild: 'OTHER' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('400s when guild query param is missing', async () => {
    const req = { method: 'GET', url: '/api/projects', query: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('GET /api/projects/:id', () => {
  it('returns project + tasks for allowed guild', async () => {
    const id = await seedProject(store);
    const req = { method: 'GET', url: `/api/projects/${id}`, query: { id: String(id) } } as any;
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
    const req = { method: 'GET', url: `/api/projects/${id}`, query: { id: String(id) } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
