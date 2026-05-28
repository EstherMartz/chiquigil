import { describe, it, expect, beforeEach } from 'vitest';
import { openCraftStore, type CraftStore } from './craftStore';

let store: CraftStore;

beforeEach(async () => {
  store = await openCraftStore(':memory:');
});

describe('craftStore', () => {
  it('creates a project and retrieves it', async () => {
    const id = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Test', targetItemId: 100, targetQty: 5, createdBy: 'u1',
    });
    expect(id).toBeGreaterThan(0);
    const project = await store.getProject(id);
    expect(project).not.toBeNull();
    expect(project!.name).toBe('Test');
    expect(project!.status).toBe('open');
  });

  it('adds tasks and lists them', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'P', targetItemId: 1, targetQty: 1, createdBy: 'u1',
    });
    await store.addTasks(pid, [
      { itemId: 10, itemName: 'Iron Ore', qtyNeeded: 5, source: 'gather', meta: {} },
      { itemId: 20, itemName: 'Iron Ingot', qtyNeeded: 2, source: 'craft', meta: { job: 'BSM' } },
    ]);
    const tasks = await store.getTasks(pid);
    expect(tasks).toHaveLength(2);
  });

  it('claims and unclaims a task', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'P', targetItemId: 1, targetQty: 1, createdBy: 'u1',
    });
    await store.addTasks(pid, [
      { itemId: 10, itemName: 'Ore', qtyNeeded: 5, source: 'market', meta: {} },
    ]);
    const tasks = await store.getTasks(pid);
    const claimed = await store.claimTask(tasks[0].id, 'user1');
    expect(claimed).toBe(true);
    const unclaimed = await store.unclaimTask(tasks[0].id, 'user1');
    expect(unclaimed).toBe(true);
  });

  it('logs progress and marks task done when complete', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'P', targetItemId: 1, targetQty: 1, createdBy: 'u1',
    });
    await store.addTasks(pid, [
      { itemId: 10, itemName: 'Ore', qtyNeeded: 5, source: 'market', meta: {} },
    ]);
    const tasks = await store.getTasks(pid);
    await store.claimTask(tasks[0].id, 'user1');
    const result = await store.logProgress(tasks[0].id, 'user1', 5);
    expect(result).not.toBeNull();
    expect(result!.qtyDone).toBe(5);
    expect(result!.status).toBe('done');
  });

  it('closes a project', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'P', targetItemId: 1, targetQty: 1, createdBy: 'u1',
    });
    await store.closeProject(pid);
    const project = await store.getProject(pid);
    expect(project!.status).toBe('closed');
  });

  it('lists only open projects', async () => {
    await store.createProject({ guildId: 'g1', channelId: 'c1', name: 'Open', targetItemId: 1, targetQty: 1, createdBy: 'u1' });
    const p2 = await store.createProject({ guildId: 'g1', channelId: 'c1', name: 'Closed', targetItemId: 2, targetQty: 1, createdBy: 'u1' });
    await store.closeProject(p2);
    const open = await store.listOpenProjects('g1');
    expect(open).toHaveLength(1);
    expect(open[0].name).toBe('Open');
  });

  it('persists displayPartKey + displayPhaseIndex through create and update', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'House', targetItemId: 9, targetQty: 1, createdBy: 'u1',
      displayPartKey: 'Wall', displayPhaseIndex: 0,
    });
    let project = await store.getProject(pid);
    expect(project?.displayPartKey).toBe('Wall');
    expect(project?.displayPhaseIndex).toBe(0);

    // User clicks the phase dropdown — switches to Door · Fase 2 (index 1).
    await store.setProjectDisplayPhase(pid, 'Door', 1);
    project = await store.getProject(pid);
    expect(project?.displayPartKey).toBe('Door');
    expect(project?.displayPhaseIndex).toBe(1);
  });

  it('defaults displayPartKey/displayPhaseIndex to null when not provided', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'Plain', targetItemId: 1, targetQty: 1, createdBy: 'u1',
    });
    const project = await store.getProject(pid);
    expect(project?.displayPartKey).toBeNull();
    expect(project?.displayPhaseIndex).toBeNull();
  });

  it('addProjectItem stores and getProjectItems retrieves items', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'P', targetItemId: 0, targetQty: 0, createdBy: 'u1',
    });
    await store.addProjectItem(pid, 42, 'Iron Ingot', 3);
    await store.addProjectItem(pid, 99, 'Copper Ore', 10);
    const items = await store.getProjectItems(pid);
    expect(items).toHaveLength(2);
    expect(items[0].itemId).toBe(42);
    expect(items[0].itemName).toBe('Iron Ingot');
    expect(items[0].qty).toBe(3);
    expect(items[1].itemId).toBe(99);
    expect(items[1].itemName).toBe('Copper Ore');
    expect(items[1].qty).toBe(10);
  });

  it('replaceTasks deletes old tasks and inserts new ones', async () => {
    const pid = await store.createProject({
      guildId: 'g1', channelId: 'c1', name: 'P', targetItemId: 0, targetQty: 0, createdBy: 'u1',
    });
    await store.addTasks(pid, [
      { itemId: 10, itemName: 'Old Item', qtyNeeded: 5, source: 'market', meta: {} },
    ]);
    const before = await store.getTasks(pid);
    expect(before).toHaveLength(1);

    await store.replaceTasks(pid, [
      { itemId: 100, itemName: 'New Item A', qtyNeeded: 2, source: 'craft', meta: { job: 'BSM' } },
      { itemId: 200, itemName: 'New Item B', qtyNeeded: 4, source: 'gather', meta: {} },
    ]);
    const after = await store.getTasks(pid);
    expect(after).toHaveLength(2);
    expect(after.find((t) => t.itemId === 10)).toBeUndefined();
    expect(after.find((t) => t.itemId === 100)?.itemName).toBe('New Item A');
    expect(after.find((t) => t.itemId === 200)?.qtyNeeded).toBe(4);
  });
});
