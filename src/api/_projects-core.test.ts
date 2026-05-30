// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { openCraftStore, type CraftStore } from '../bot/craftStore';
import { listProjectSummaries, getProjectDetail, isAllowed } from './_projects-core';

let store: CraftStore;

async function seed(s: CraftStore, guildId = 'G1') {
  const id = await s.createProject({
    guildId, channelId: 'C1', name: 'Test', targetItemId: 42, targetQty: 3, createdBy: 'U1',
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
  delete process.env.DISCORD_BOT_TOKEN; // skip Discord name lookups
});

describe('isAllowed', () => {
  it('honors the allow-list', () => {
    expect(isAllowed('G1')).toBe(true);
    expect(isAllowed('OTHER')).toBe(false);
  });
});

describe('listProjectSummaries', () => {
  it('returns summaries with task counts', async () => {
    await seed(store);
    const { projects } = await listProjectSummaries(store, 'G1', 'open');
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ name: 'Test', targetItemId: 42, targetQty: 3, status: 'open' });
    expect(projects[0].taskCounts.bySource.workshop).toBe(1);
  });

  it('returns nothing for status=closed', async () => {
    await seed(store);
    const { projects } = await listProjectSummaries(store, 'G1', 'closed');
    expect(projects).toHaveLength(0);
  });
});

describe('getProjectDetail', () => {
  it('returns project + tasks for an allowed guild', async () => {
    const id = await seed(store);
    const detail = await getProjectDetail(store, id);
    expect(detail).not.toBeNull();
    expect(detail!.project.id).toBe(id);
    expect(detail!.tasks).toHaveLength(3);
  });

  it('returns null for a disallowed guild', async () => {
    const id = await seed(store, 'OTHER');
    const detail = await getProjectDetail(store, id);
    expect(detail).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    expect(await getProjectDetail(store, 999999)).toBeNull();
  });
});
