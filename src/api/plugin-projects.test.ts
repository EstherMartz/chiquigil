// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the heavy create-path dependencies so POST tests don't hit the network.
vi.mock('../bot/loadSnapshots', () => ({
  loadSnapshots: vi.fn(async () => ({ namesById: new Map<number, string>([[42, 'Test Item']]) })),
}));
vi.mock('../bot/craftCommands', () => ({
  handleCraftNew: vi.fn(async (opts: any) =>
    opts.itemId === 42
      ? { content: 'ok', flags: 64, projectId: 7, taskCount: 3 }
      : { content: 'No recipe', flags: 64 },
  ),
  handleCraftNewFromList: vi.fn(async (opts: any) =>
    opts.items?.length
      ? { content: 'ok', flags: 64, projectId: 9, taskCount: 5, unmatched: ['Ghost Item'] }
      : { content: 'No items matched', flags: 64, unmatched: [] },
  ),
}));

import handler from './plugin-projects';
import { handleCraftNew, handleCraftNewFromList } from '../bot/craftCommands';
import { openCraftStore, type CraftStore } from '../bot/craftStore';

let store: CraftStore;

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

async function seed(s: CraftStore, guildId = 'G1') {
  const id = await s.createProject({
    guildId, channelId: 'C1', name: 'Test', targetItemId: 42, targetQty: 3, createdBy: 'U1',
  });
  await s.addTasks(id, [
    { itemId: 10, itemName: 'Iron Ore', qtyNeeded: 5, source: 'gather', meta: {} },
    { itemId: 20, itemName: 'Iron Ingot', qtyNeeded: 2, source: 'craft', meta: {} },
  ]);
  return id;
}

beforeEach(async () => {
  store = await openCraftStore(':memory:');
  process.env.GUILD_ALLOWLIST = 'G1';
  process.env.TURSO_DATABASE_URL = ':memory:';
  delete process.env.DISCORD_BOT_TOKEN;
  delete process.env.VITE_CACHE_BLOB_URL; // loadMarketCache returns empty
  (globalThis as any).__testCraftStore = store;
  vi.clearAllMocks();
});

describe('GET /api/plugin/projects', () => {
  it('lists projects for an allowed guild (no session cookie needed)', async () => {
    await seed(store);
    const req = { method: 'GET', url: '/api/plugin/projects?guild=G1', query: { guild: 'G1' }, headers: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].projects).toHaveLength(1);
  });

  it('403s when guild not in allow-list', async () => {
    const req = { method: 'GET', url: '/api/plugin/projects?guild=OTHER', query: { guild: 'OTHER' }, headers: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('400s when guild missing', async () => {
    const req = { method: 'GET', url: '/api/plugin/projects', query: {}, headers: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('GET /api/plugin/projects/:id', () => {
  it('returns project + tasks', async () => {
    const id = await seed(store);
    const req = { method: 'GET', url: `/api/plugin/projects/${id}`, query: {}, headers: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].project.id).toBe(id);
    expect(res.json.mock.calls[0][0].tasks).toHaveLength(2);
  });

  it('404s for a disallowed guild', async () => {
    const id = await seed(store, 'OTHER');
    const req = { method: 'GET', url: `/api/plugin/projects/${id}`, query: {}, headers: {} } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('POST /api/plugin/projects', () => {
  it('403s when guild not in allow-list (before touching create deps)', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'OTHER', itemId: 42, qty: 1, characterName: 'Esther' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(handleCraftNew).not.toHaveBeenCalled();
  });

  it('400s on missing fields', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'G1', qty: 1 } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('400s on out-of-range qty', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'G1', itemId: 42, qty: 0, characterName: 'Esther' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('creates a project and returns projectId/taskCount', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: { host: 'qiqirn.tools' },
      body: { guildId: 'G1', itemId: 42, qty: 5, name: 'My Project', characterName: 'Esther Martz' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ ok: true, projectId: 7, taskCount: 3 });
    expect(handleCraftNew).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 42, qty: 5, name: 'My Project' }),
      'G1', '', 'Esther Martz', expect.anything(),
    );
  });

  it('returns ok:false when the breakdown yields no project', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: { host: 'qiqirn.tools' },
      body: { guildId: 'G1', itemId: 999, qty: 1, characterName: 'Esther' } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ ok: false });
  });
});

describe('POST /api/plugin/projects (items[] import)', () => {
  it('creates a project from a list and returns projectId/taskCount/unmatched', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: { host: 'qiqirn.tools' },
      body: { guildId: 'G1', name: 'My List', characterName: 'Esther', items: [{ name: 'Iron Ore', qty: 6 }, { name: 'Ghost Item', qty: 2 }] } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ ok: true, projectId: 9, taskCount: 5, unmatched: ['Ghost Item'] });
    expect(handleCraftNewFromList).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My List', items: [{ name: 'Iron Ore', qty: 6 }, { name: 'Ghost Item', qty: 2 }] }),
      'G1', '', 'Esther', expect.anything(),
    );
    expect(handleCraftNew).not.toHaveBeenCalled();
  });

  it('403s when guild not allow-listed (before deps)', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'OTHER', name: 'X', characterName: 'E', items: [{ name: 'Iron Ore', qty: 1 }] } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(handleCraftNewFromList).not.toHaveBeenCalled();
  });

  it('400s when items entries are all invalid', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'G1', name: 'X', characterName: 'E', items: [{ name: '', qty: 0 }] } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('400s when name missing for an items import', async () => {
    const req = { method: 'POST', url: '/api/plugin/projects', query: {}, headers: {},
      body: { guildId: 'G1', characterName: 'E', items: [{ name: 'Iron Ore', qty: 1 }] } } as any;
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
